#!/usr/bin/env python3
"""Import bounded NASA imagery, native models and scientific PDS shape data.
Requires Pillow and NumPy.
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
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 UniverseVisualizer/1.0 (NASA PDS asset importer)'})
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

def measured_mesh(raw, record):
    """Read archived physical geometry, without adding synthetic terrain."""
    kind=record['format']
    lines=raw.decode('ascii').splitlines()
    if kind=='pds-plate':
        count,faces=map(int,lines[0].split())
        positions=np.array([list(map(float,line.split())) for line in lines[1:1+count]])
        indices=np.array([list(map(int,line.split())) for line in lines[1+count:]],dtype=int)
        assert indices.shape==(faces,3) and indices.min()==0 and indices.max()==count-1
    elif kind=='pds-radial':
        grid=np.loadtxt(io.BytesIO(raw))
        longitude=np.unique(grid[:,0]);latitude=np.unique(grid[:,1])
        assert len(longitude)==73 and len(latitude)==37
        # Published west-positive, planetocentric 5-degree samples. Keep one
        # longitude seam and one vertex per pole, so normals remain continuous.
        lookup={(int(lon),int(lat)):radius for lon,lat,radius in grid}
        positions=[];index={}
        for lon in longitude[:-1]:
            for lat in latitude:
                key=(0,int(lat)) if abs(lat)==90 else (int(lon),int(lat))
                if key not in index:
                    radius=lookup[key];east=-np.radians(key[0]);angle=np.radians(lat)
                    index[key]=len(positions)
                    positions.append([radius*np.cos(angle)*np.cos(east),radius*np.cos(angle)*np.sin(east),radius*np.sin(angle)])
        def vertex(lon,lat):return index[(0,int(lat)) if abs(lat)==90 else (int(lon)%360,int(lat))]
        indices=[]
        for lon in longitude[:-1]:
            for lat in latitude[:-1]:
                a,b,c,d=vertex(lon,lat),vertex(lon+5,lat),vertex(lon+5,lat+5),vertex(lon,lat+5)
                for triangle in ((a,b,c),(a,c,d)):
                    if len(set(triangle))==3:indices.append(triangle)
        positions=np.array(positions);indices=np.array(indices,dtype=int)
    elif kind=='pds-obj-grid':
        source=np.array([list(map(float,line.split()[1:])) for line in lines if line.startswith('v ')])
        source_faces=np.array([list(map(int,line.split()[1:])) for line in lines if line.startswith('f ')])-1
        # The archive OBJ consists of six 129x129 ICQ patches. Verify its exact
        # connectivity before selecting every second ORIGINAL measured vertex.
        assert source.shape==(6*129*129,3) and source_faces.shape==(6*128*128*2,3)
        _,canonical=np.unique(np.round(source,7),axis=0,return_inverse=True)
        expected=[]
        for face in range(6):
            offset=face*129*129
            for x in range(128):
                for y in range(128):
                    a=offset+x+y*129
                    expected.append(sorted(canonical[[a,a+1,a+129,a+130]]))
        actual=np.sort(np.array([list(set(canonical[pair.flatten()])) for pair in source_faces.reshape(-1,2,3)]),axis=1)
        # OBJ triangles alternate diagonals and reuse neighbouring patch edge
        # vertices; compare physical quad corners, not incidental index order.
        assert np.array_equal(actual,np.array(expected)), 'Unexpected ICQ topology'
        step=record.get('gridStride',2);q=128//step+1
        selected=np.array([face*129*129+x+y*129 for face in range(6) for y in range(0,129,step) for x in range(0,129,step)])
        positions=source[selected];indices=[]
        for face in range(6):
            for y in range(q-1):
                for x in range(q-1):
                    a=face*q*q+x+y*q;b=a+1;c=a+q+1;d=a+q
                    indices.extend([(a,c,b),(a,d,c)])
        indices=np.array(indices,dtype=int)
        # Weld exact shared patch edges, preserving the measured coordinates.
        positions,inverse=np.unique(np.round(positions,7),axis=0,return_inverse=True)
        indices=inverse[indices]
    else:raise ValueError('Unsupported measured mesh '+kind)
    assert np.isfinite(positions).all() and indices.min()>=0 and indices.max()<len(positions)
    # Proper rigid rotation (det=+1): original +Z north -> display +Y north.
    positions=positions[:,[0,2,1]]*np.array([1,1,-1])
    edges=positions[indices]
    normals_face=np.cross(edges[:,1]-edges[:,0],edges[:,2]-edges[:,0])
    if np.sum(np.einsum('ij,ij->i',normals_face,edges[:,0]))<0:
        indices=indices[:,[0,2,1]];normals_face=-normals_face
    normals=np.zeros_like(positions)
    for i in range(3):np.add.at(normals,indices[:,i],normals_face)
    lengths=np.linalg.norm(normals,axis=1)
    assert (lengths>0).all()
    normals/=lengths[:,None]
    return {'positions':np.round(positions,7).flatten().tolist(),'normals':np.round(normals,7).flatten().tolist(),'uvs':np.zeros((len(positions),2)).flatten().tolist(),'indices':indices.flatten().tolist(),'coordinateSystem':'Source body-fixed kilometres, +Z north; rigidly rotated [x,z,-y] to Y-up. Display pose illustrative.'}

def phoebe_albedo(mesh, record):
    """Registered relative-albedo product, with suspect coverage left uniform.
    The conservative mask follows the author-marked limits in the 2023 shape
    assessment p.7 (digitized longitude/latitude boundary, rounded inward).
    This is relative display shading, never calibrated absolute reflectance.
    """
    raw=download(record['albedoAssetUrl'],'phoebe_albedo_g.tif')
    values=np.array(Image.open(io.BytesIO(raw)),dtype=float)
    h,w=values.shape
    lon=(np.arange(w)+.5)*360/w;lat=90-(np.arange(h)+.5)*180/h
    upper=np.array([[0,55],[10,51],[60,52],[75,34],[105,31],[120,32],[135,57],[145,54],[155,31],[175,30],[185,35],[198,36],[204,14],[214,7],[222,8],[224,44],[247,43],[260,38],[280,37],[285,34],[300,37],[325,32],[349,32],[355,25],[360,27]])
    lower=np.array([[0,-69],[90,-70],[100,-69],[120,-54],[150,-61],[195,-63],[225,-47],[255,-41],[275,-44],[305,-28],[310,-28],[315,-47],[320,-49],[325,-68],[330,-68],[360,-68]])
    valid=(lat[:,None]<np.interp(lon,upper[:,0],upper[:,1]))&(lat[:,None]>np.interp(lon,lower[:,0],lower[:,1]))&np.isfinite(values)&(values>=0)&(values<=2)
    # A value of 1 is the source's nominal relative-albedo mean. 120 is only
    # an explicit display exposure; values remain proportional within coverage.
    gray=np.where(valid,np.clip(values*120,0,255),120).astype(np.uint8)
    result=save(Image.fromarray(gray),'phoebe-relative-albedo.png',png=True)
    record.update(result)
    record['albedoSourceSha256']=hashlib.sha256(raw).hexdigest()
    record['albedoCoverageFraction']=float(valid.mean())
    record['sourceDimensions']=[w,h]
    position=np.array(mesh['positions']).reshape(-1,3);normal=np.array(mesh['normals']).reshape(-1,3)
    # Source [x,y,z] -> renderer [x,z,-y]. The PDS raster begins at east=0,
    # north at its top; preserve this registration with flipY=false.
    uv=np.stack([(np.arctan2(-position[:,2],position[:,0])/(2*np.pi))%1,.5-np.arcsin(position[:,1]/np.linalg.norm(position,axis=1))/np.pi],axis=1)
    triangles=np.array(mesh['indices']).reshape(-1,3)
    out_p=position.tolist();out_n=normal.tolist();out_uv=uv.tolist();duplicates={}
    for triangle in triangles:
        if np.ptp(uv[triangle,0])>.5:
            for j,index in enumerate(triangle):
                if uv[index,0]<.5:
                    if index not in duplicates:
                        duplicates[index]=len(out_p);out_p.append(position[index].tolist());out_n.append(normal[index].tolist());out_uv.append([float(uv[index,0]+1),float(uv[index,1])])
                    triangle[j]=duplicates[index]
    mesh.update(positions=np.array(out_p).flatten().tolist(),normals=np.array(out_n).flatten().tolist(),uvs=np.round(out_uv,7).flatten().tolist(),indices=triangles.flatten().tolist())

def write_model(mesh, record):
    mesh['sourceUrl']=record['sourceUrl']
    target=ROOT/'public/models'/record['model'];target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(mesh,separators=(',',':'))+'\n')
    record['modelSha256']=hashlib.sha256(target.read_bytes()).hexdigest()
    record['vertexCount']=len(mesh['positions'])//3;record['triangleCount']=len(mesh['indices'])//3
    record['modelBytes']=target.stat().st_size

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--verify',action='store_true');parser.add_argument('--bodies',nargs='+',help='Only import selected body IDs');args=parser.parse_args()
    manifest=json.loads(MANIFEST.read_text())
    if args.bodies and set(args.bodies)-set(manifest):parser.error('Unknown body IDs: '+', '.join(sorted(set(args.bodies)-set(manifest))))
    if args.verify:
        for key,record in manifest.items():
            for field,hashfield in [('map','sha256'),('bumpMap','bumpSha256'),('cloudMap','cloudSha256'),('ringMap','ringSha256'),('model','modelSha256')]:
                if field not in record:continue
                target=ROOT/('public/models' if field=='model' else 'public/textures')/record[field]
                assert hashlib.sha256(target.read_bytes()).hexdigest()==record[hashfield],key+' '+field
                if field!='model':
                    with Image.open(target) as image:
                        assert max(image.size)<=2048,key+' oversized texture'
                        image.verify()
                else:
                    mesh=json.loads(target.read_text())
                    positions=np.array(mesh['positions']).reshape(-1,3)
                    normals=np.array(mesh['normals']).reshape(-1,3)
                    uvs=np.array(mesh['uvs']).reshape(-1,2)
                    indices=np.array(mesh['indices']).reshape(-1,3)
                    assert len(positions)==record['vertexCount'] and len(indices)==record['triangleCount'],key+' mesh counts'
                    assert len(normals)==len(positions)==len(uvs),key+' attribute lengths'
                    assert np.isfinite(positions).all() and np.isfinite(normals).all() and np.isfinite(uvs).all(),key+' non-finite geometry'
                    assert indices.min()>=0 and indices.max()<len(positions),key+' invalid index'
                    assert np.allclose(np.linalg.norm(normals,axis=1),1,atol=1e-4),key+' non-unit normals'
                    face=positions[indices]
                    assert (np.linalg.norm(np.cross(face[:,1]-face[:,0],face[:,2]-face[:,0]),axis=1)>1e-12).all(),key+' degenerate face'
        print(f'Verified {len(manifest)} official surface records');return
    OUT.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
    for key,record in manifest.items():
        if args.bodies and key not in args.bodies:continue
        raw=download(record['assetUrl'],record['cacheFile'])
        record['sourceSha256']=hashlib.sha256(raw).hexdigest()
        if record.get('format','').startswith('pds-'):
            mesh=measured_mesh(raw,record)
            if key=='phoebe':phoebe_albedo(mesh,record)
            write_model(mesh,record)
            record['retrievedOn']=RETRIEVED
            print(key,record['vertexCount'],'vertices',record['triangleCount'],'triangles',flush=True)
            continue
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
