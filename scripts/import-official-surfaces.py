#!/usr/bin/env python3
"""Import bounded NASA visualization maps. Requires Pillow and NumPy.
No generative filling or color calibration is performed. UV atlases are resampled
through the original NASA mesh, preserving their mapping rather than cropping.
The downloaded originals are cached outside version control.
"""
from __future__ import annotations
import argparse, hashlib, io, json, math, struct, urllib.request
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/textures/official'
MANIFEST = ROOT / 'src/official-surfaces.json'
CACHE = ROOT / 'test-results/official-source-cache'
RETRIEVED = '2026-10-02'

def download(url, name):
    path = CACHE / name
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'UniverseVisualizer/1.0 (NASA asset importer)'})
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read(80 * 1024 * 1024 + 1)
        if len(data) > 80 * 1024 * 1024:
            raise ValueError('Asset exceeds bounded 80 MiB source limit')
        path.write_bytes(data)
    return path.read_bytes()

def glb(raw):
    if raw[:4] != b'glTF': raise ValueError('Expected GLB')
    length, kind = struct.unpack_from('<II', raw, 12)
    document = json.loads(raw[20:20 + length])
    binary = raw[28 + length:]
    return document, binary

def accessor(document, binary, index):
    a = document['accessors'][index]; view = document['bufferViews'][a['bufferView']]
    dtype = {5126: '<f4', 5123: '<u2', 5125: '<u4'}[a['componentType']]
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    if 'byteStride' in view: raise ValueError('Interleaved accessor unsupported')
    return np.frombuffer(binary, dtype=dtype, count=a['count'] * components, offset=offset).reshape(-1, components).copy()

def extract(document, binary, image_index):
    image = document['images'][image_index]
    view = document['bufferViews'][image['bufferView']]
    offset = view.get('byteOffset', 0)
    return Image.open(io.BytesIO(binary[offset:offset + view['byteLength']])).copy()

def reproject(document, binary, texture, width=2048):
    """Rasterize the source mesh's UVs in longitude/latitude, with seam wrapping.
    NASA planetary GLBs use Y up. Normalize ellipsoid axes first, then preserve
    their original UV sampling. The output is a rendering map, not a GIS product.
    """
    primitive = document['meshes'][0]['primitives'][0]
    position = accessor(document, binary, primitive['attributes']['POSITION']).astype(float)
    position /= np.max(np.abs(position), axis=0)
    position /= np.linalg.norm(position, axis=1)[:, None]
    uv = accessor(document, binary, primitive['attributes']['TEXCOORD_0']).astype(float)
    triangles = accessor(document, binary, primitive['indices']).reshape(-1, 3)
    longitude = np.arctan2(position[:, 2], position[:, 0]) / (2 * np.pi) + .5
    latitude = .5 - np.arcsin(np.clip(position[:, 1], -1, 1)) / np.pi
    height = width // 2
    coordinates = np.stack([longitude, latitude], axis=1)
    pixels = np.asarray(texture.convert('RGB'))
    result = np.zeros((height, width, 3), dtype=np.uint8)
    covered = np.zeros((height, width), dtype=bool)
    prepared = []
    for triangle in triangles:
        q = coordinates[triangle].copy(); tex = uv[triangle]
        nonpolar = np.abs(position[triangle, 1]) < .999999
        if np.ptp(q[nonpolar, 0]) > .5: q[q[:, 0] < .5, 0] += 1
        if np.sum(nonpolar) == 2:
            # A physical pole maps to the full interval between the two other
            # vertices' longitudes: rasterize that cap as a quadrilateral.
            a,b=np.where(nonpolar)[0]; pole=np.where(~nonpolar)[0][0]
            qa=q[pole].copy();qa[0]=q[a,0]
            qb=q[pole].copy();qb[0]=q[b,0]
            prepared.append((np.array([q[a],q[b],qa]),np.array([tex[a],tex[b],tex[pole]])))
            prepared.append((np.array([q[b],qb,qa]),np.array([tex[b],tex[pole],tex[pole]])))
        else:
            if np.ptp(q[:, 0]) > .5: q[q[:, 0] < .5, 0] += 1
            prepared.append((q,tex))
    for q,tex in prepared:
        for shift in (-1, 0, 1):
            c = q.copy(); c[:, 0] += shift; c *= [width, height]
            xmin=max(0,int(np.floor(c[:,0].min()))); xmax=min(width-1,int(np.ceil(c[:,0].max())))
            ymin=max(0,int(np.floor(c[:,1].min()))); ymax=min(height-1,int(np.ceil(c[:,1].max())))
            if xmin>xmax or ymin>ymax:continue
            xx,yy=np.meshgrid(np.arange(xmin,xmax+1)+.5,np.arange(ymin,ymax+1)+.5)
            denominator=(c[1,1]-c[2,1])*(c[0,0]-c[2,0])+(c[2,0]-c[1,0])*(c[0,1]-c[2,1])
            if abs(denominator)<1e-10:continue
            a=((c[1,1]-c[2,1])*(xx-c[2,0])+(c[2,0]-c[1,0])*(yy-c[2,1]))/denominator
            b=((c[2,1]-c[0,1])*(xx-c[2,0])+(c[0,0]-c[2,0])*(yy-c[2,1]))/denominator
            cc=1-a-b; inside=(a>=-1e-7)&(b>=-1e-7)&(cc>=-1e-7)
            if not np.any(inside):continue
            samples=a[...,None]*tex[0]+b[...,None]*tex[1]+cc[...,None]*tex[2]
            sx=np.clip(samples[...,0]*(pixels.shape[1]-1),0,pixels.shape[1]-1)
            sy=np.clip(samples[...,1]*(pixels.shape[0]-1),0,pixels.shape[0]-1)
            xi=sx.astype(int); yi=sy.astype(int); xf=(sx-xi)[...,None]; yf=(sy-yi)[...,None]
            xj=np.minimum(xi+1,pixels.shape[1]-1); yj=np.minimum(yi+1,pixels.shape[0]-1)
            rgb=(1-yf)*((1-xf)*pixels[yi,xi]+xf*pixels[yi,xj])+yf*((1-xf)*pixels[yj,xi]+xf*pixels[yj,xj])
            result[ymin:ymax+1,xmin:xmax+1][inside]=rgb[inside].astype(np.uint8)
            covered[ymin:ymax+1,xmin:xmax+1][inside]=True
    # Triangles meeting the pole have undefined longitude exactly at their pole.
    # Only rasterization cracks (<0.5%) are repaired from adjacent mapped pixels.
    missing = int(np.sum(~covered))
    if missing > width*height*.005: raise ValueError(f'UV reprojection left {missing} unmapped pixels')
    for _ in range(32):
        if covered.all():break
        for dy,dx in ((0,1),(0,-1),(1,0),(-1,0)):
            neighbour=np.roll(covered,(dy,dx),(0,1)); target=~covered & neighbour
            result[target]=np.roll(result,(dy,dx),(0,1))[target];covered[target]=True
    if not covered.all():raise ValueError('Unfilled rasterization cracks')
    return Image.fromarray(result), missing

def save(image, name, width=2048, png=False, native_uv=False):
    image.thumbnail((width,width if native_uv else width//2),Image.Resampling.LANCZOS)
    target=OUT/name
    if png:image.save(target,optimize=True)
    else:image.convert('RGB').save(target,quality=91,optimize=True,subsampling=0)
    return {'map':'official/'+name,'width':image.width,'height':image.height,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--verify',action='store_true');args=parser.parse_args()
    manifest=json.loads(MANIFEST.read_text())
    if args.verify:
        for key,record in manifest.items():
            for field,hashfield in [('map','sha256'),('bumpMap','bumpSha256'),('cloudMap','cloudSha256'),('ringMap','ringSha256'),('model','modelSha256')]:
                if field not in record:continue
                target=ROOT/('public/models' if field=='model' else 'public/textures')/record[field]
                assert hashlib.sha256(target.read_bytes()).hexdigest()==record[hashfield],key+' '+field
                if field!='model':
                    with Image.open(target) as image:image.verify()
        print(f'Verified {len(manifest)} official surface records');return
    OUT.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
    for key,record in manifest.items():
        raw=download(record['assetUrl'],record['cacheFile'])
        record['sourceSha256']=hashlib.sha256(raw).hexdigest()
        if record.get('format')=='glb':
            document,binary=glb(raw)
            image=extract(document,binary,record.get('imageIndex',0))
            record['originalImageName']=document['images'][record.get('imageIndex',0)].get('name','')
            record['sourceDimensions']=[image.width,image.height]
            if record.get('reproject'):
                image,cracks=reproject(document,binary,image)
                record['rasterizationCracksFilled']=cracks
            elif not record.get('model') and image.width != 2*image.height:
                raise ValueError(f'{key}: non-equirectangular image must be reprojected')
        else:
            image=Image.open(io.BytesIO(raw)).copy()
            record['sourceDimensions']=[image.width,image.height]
            # Published cylindrical grids may include one repeated boundary
            # sample (e.g. 3601x1801). Resample full bounds without cropping.
            if abs(image.width/image.height-2)<.005 and image.width!=2*image.height:
                image=image.resize((2048,1024),Image.Resampling.LANCZOS)
        record.update(save(image,key+'-nasa.jpg',native_uv=bool(record.get('model'))))
        if record.get('model'):
            primitive=document['meshes'][0]['primitives'][0]
            mesh={}
            for field,attribute in [('positions','POSITION'),('normals','NORMAL'),('uvs','TEXCOORD_0')]:
                mesh[field]=np.round(accessor(document,binary,primitive['attributes'][attribute]).astype(float),7).flatten().tolist()
            mesh['indices']=accessor(document,binary,primitive['indices']).flatten().tolist()
            mesh['sourceUrl']=record['sourceUrl'];mesh['coordinateSystem']='NASA glTF local coordinates, Y up; preserve original UVs; display orientation illustrative'
            target=ROOT/'public/models'/record['model'];target.parent.mkdir(parents=True,exist_ok=True)
            target.write_text(json.dumps(mesh,separators=(',',':'))+'\n')
            record['modelSha256']=hashlib.sha256(target.read_bytes()).hexdigest()
            record['vertexCount']=len(mesh['positions'])//3;record['triangleCount']=len(mesh['indices'])//3

        record['retrievedOn']=RETRIEVED
        print(key,record['width'],record['height'],record['bytes'],flush=True)
        if key=='saturn':
            # Recover radial texture registration from the original NASA ring
            # mesh instead of guessing the 1-D texture's geographic extents.
            ring_primitive=document['meshes'][1]['primitives'][0]
            ring_pos=accessor(document,binary,ring_primitive['attributes']['POSITION']).astype(float)
            ring_uv=accessor(document,binary,ring_primitive['attributes']['TEXCOORD_0']).astype(float)
            radius=np.linalg.norm(ring_pos[:,[0,2]],axis=1)
            inner=float(np.median(radius[ring_uv[:,0]<1e-6]));outer=float(np.median(radius[ring_uv[:,0]>1-1e-6]))
            assert np.max(np.abs((radius-inner)/(outer-inner)-ring_uv[:,0]))<1e-5
            planet_primitive=document['meshes'][0]['primitives'][0]
            planet_pos=accessor(document,binary,planet_primitive['attributes']['POSITION']).astype(float)
            equator=float(max(np.abs(planet_pos[:,0]).max(),np.abs(planet_pos[:,2]).max()))
            ring=save(extract(document,binary,1),'saturn-rings-nasa.png',png=True)
            record.update(ringMap=ring['map'],ringSha256=ring['sha256'],ringMapWidth=ring['width'],ringMapHeight=ring['height'],ringMapInnerKm=inner/equator*60268,ringMapOuterKm=outer/equator*60268,ringMapInnerRatio=inner/equator,ringMapOuterRatio=outer/equator,ringMapEquatorialRadiusKm=60268,ringMapFlipU=False,ringMapFlipY=False,ringMapSourceUrl=record['sourceUrl'],ringMapAssetUrl=record['assetUrl'],ringMapCredit=record['credit'],ringMapSourceImage=document['images'][1].get('name',''),ringMapRegistration='U = (radius - innerRadius) / (outerRadius - innerRadius), verified against original NASA ring mesh; V may use 0.5',ringMapNote='NASA 3D visualization radial color and transparency strip, registered from the original ring mesh. Fine bands and gaps are archival visualization data, not calibrated optical depth.',ringMapNoteIt='Profilo radiale NASA di colore e trasparenza, registrato tramite la geometria originale degli anelli. Fasce e lacune sono dati di visualizzazione, non spessore ottico calibrato.')
            record.update(ringCredit=record['ringMapCredit'],ringSourceUrl=record['ringMapSourceUrl'],ringNote=record['ringMapNote'],ringNoteIt=record['ringMapNoteIt'])
        if key=='moon':
            demraw=download(record['bumpAssetUrl'],'moon-dem.tif')
            dem=np.asarray(Image.open(io.BytesIO(demraw)),dtype=float)
            low=float(dem.min()); high=float(dem.max())
            heightmap=Image.fromarray(np.round((dem-low)/(high-low)*65535).astype(np.uint16))
            bump=save(heightmap,'moon-lola-height.png',png=True)
            record.update(bumpMap=bump['map'],bumpSha256=bump['sha256'],bumpSourceSha256=hashlib.sha256(demraw).hexdigest(),heightMinKm=low,heightMaxKm=high,heightRangeKm=high-low,bumpScaleKm=high-low,heightReferenceRadiusKm=1737.4,bumpEncoding='16-bit PNG; normalized 0-65535, height in km = min + sample * range')
        if key=='earth' and record.get('cloudAssetUrl'):
            clouds=download(record['cloudAssetUrl'],'earth-clouds.jpg')
            cloud=save(Image.open(io.BytesIO(clouds)),'earth-clouds-nasa.jpg')
            record.update(cloudMap=cloud['map'],cloudSha256=cloud['sha256'],cloudSourceSha256=hashlib.sha256(clouds).hexdigest())
    MANIFEST.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
if __name__=='__main__':main()
