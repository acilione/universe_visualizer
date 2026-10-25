import * as THREE from 'three';
import { t, locale } from './i18n.js';
import { GAIA_DR3_HIPS } from './gaia-manifest.js';
import { equatorialVector } from './sky-math.js';
import { indexedPicking } from './combined-map.js';
import { gaiaSourceId, GAIA_DR3_SOURCE, GAIA_DR3_DATA_MODEL } from './gaia-catalog.js';

export const GAIA_SURVEY = Object.freeze({release:'dr3',epoch:GAIA_DR3_HIPS.referenceEpoch,totalSources:GAIA_DR3_HIPS.totalSources,service:GAIA_DR3_HIPS.baseUrl});
const RADIUS=60;
const RAD=Math.PI/180;
const finite=value=>Number.isFinite(value)?value:null;

/** Native observations remain attached; sky placement does not imply a distance. */
export function streamedGaiaObject(row) {
  const sourceId=gaiaSourceId(row.sourceId);
  const position={raDeg:row.raDeg,decDeg:row.decDeg,positionEpoch:row.refEpoch??2016,positionPropagated:false};
  const candidate=row.inQsoCandidates||row.inGalaxyCandidates;
  const reliable=!candidate&&row.parallaxMas>0&&row.parallaxErrorMas>0&&row.parallaxErrorMas/row.parallaxMas<=.2&&Number.isFinite(row.ruwe)&&row.ruwe<=1.4;
  const distanceLy=reliable?3261.563777/row.parallaxMas:null;
  const name='Gaia DR3 '+sourceId;
  return {id:'gaia-dr3-'+sourceId,name,englishName:name,italianName:name,aliases:[sourceId,name],
    bodyKind:'catalog-source',gaiaCatalogue:'dr3',gaiaStreamed:true,gaiaSourceId:sourceId,catalogue:'gaia-dr3',catalogueProvider:'ESA Gaia DR3 / CDS',
    type:row.inQsoCandidates?t('Quasar candidate','Candidato quasar'):row.inGalaxyCandidates?t('Galaxy candidate','Candidata galassia'):t('Gaia source','Sorgente Gaia'),
    ...position,position:equatorialVector(position.raDeg,position.decDeg,RADIUS),positionKind:'sky-projection',coordinateFrame:'ICRS / Gaia-CRF3',
    measured:true,size:.15,mag:finite(row.gMag),magnitudeBand:'G',magnitudeCatalogue:'gaia-dr3',colorIndex:null,
    parallaxMas:finite(row.parallaxMas),parallaxErrorMas:finite(row.parallaxErrorMas),parallaxKind:'trigonometric',
    pmRaMasYr:finite(row.pmRaMasYr),pmDecMasYr:finite(row.pmDecMasYr),radialVelocityKmS:finite(row.radialVelocityKmS),radialVelocityCatalogue:'gaia-dr3',
    distanceLy,distanceEstimate:reliable,distanceCatalogue:'gaia-dr3',
    distance:distanceLy===null?t('Distance unavailable','Distanza non disponibile'):t('Inverse-parallax estimate: ','Stima da parallasse inversa: ')+distanceLy.toLocaleString(locale(),{maximumFractionDigits:2})+' ly',
    source:GAIA_DR3_SOURCE,sources:[GAIA_DR3_DATA_MODEL,'https://cdsarc.cds.unistra.fr/viz-bin/cat/I/355'],
    gaiaMatchStatus:'streamed-independent',gaiaData:{...row,hipMatches:row.hipMatches||[],coordinateFrame:'ICRS / Gaia-CRF3',referenceEpoch:2016,source:GAIA_DR3_SOURCE},
    detail:t('Gaia DR3 source streamed from the full CDS catalogue. G-band photometry; native astrometry at J2016.0.','Sorgente Gaia DR3 caricata dal catalogo completo CDS. Fotometria in banda G; astrometria originale a J2016.0.'),
    positionNote:t('Native ICRS direction at J2016.0, matching the streamed tile coverage. Angular sky projection; no radial distance is rendered.','Direzione ICRS originale a J2016.0, coerente con i tasselli caricati. Proiezione angolare; nessuna distanza radiale rappresentata.')};
}

export function gaiaViewCone(camera, mapRoot) {
  camera.updateWorldMatrix(true,false);mapRoot.updateWorldMatrix(true,false);
  const direction=camera.getWorldDirection(new THREE.Vector3()).applyQuaternion(mapRoot.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  const eyes=camera.cameras?.length?camera.cameras:[camera];
  const inverseMap=mapRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
  let radius=0;
  for(const eye of eyes){
    eye.updateWorldMatrix(true,false);
    const rotation=eye.getWorldQuaternion(new THREE.Quaternion());
    const inverseProjection=new THREE.Matrix4().copy(eye.projectionMatrix).invert();
    for(const x of [-1,1])for(const y of [-1,1]){
      const corner=new THREE.Vector3(x,y,.5).applyMatrix4(inverseProjection).normalize().applyQuaternion(rotation).applyQuaternion(inverseMap);
      radius=Math.max(radius,direction.angleTo(corner)/RAD);
    }
  }
  return {raDeg:(Math.atan2(-direction.z,direction.x)/RAD+360)%360,decDeg:Math.asin(THREE.MathUtils.clamp(direction.y,-1,1))/RAD,radiusDeg:Math.max(.025,Math.min(179,radius*1.12))};
}

/** Bounded one-batch sky; all remote I/O, parsing and tile planning run in a worker. */
export function createGaiaStreamedSky({pixelRatio=1,quality='high',onStatus=()=>{},workerFactory=()=>new Worker(new URL('./gaia-stream-worker.js',import.meta.url),{type:'module'})}={}) {
  const group=new THREE.Group();group.name='gaia-streamed-sky';
  const capacity=12000;let maxSources=quality==='low'?6000:12000,workerRevision=0;
  const geometry=new THREE.BufferGeometry();
  const positions=new Float32Array(capacity*3),colors=new Float32Array(capacity*3),sizes=new Float32Array(capacity);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  const material=new THREE.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uOpacity:{value:1},uPixelRatio:{value:pixelRatio}},
    vertexShader:'attribute float aSize;varying vec3 vColor;uniform float uPixelRatio;void main(){vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uPixelRatio;}',
    fragmentShader:'varying vec3 vColor;uniform float uOpacity;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float glow=exp(-d*d*5.)*.7+exp(-d*d*35.)*.3;gl_FragColor=vec4(vColor,glow*.8*uOpacity);}'});
  material.userData.baseOpacity=1;
  const points=new THREE.Points(geometry,material);points.name='gaia-streamed-sources';points.frustumCulled=false;points.userData.particles=false;group.add(points);
  let records=[],objects=[],disposed=false,elapsed=0,lastCone=null,pendingCone=null,stableAge=0,lastStatus={};
  const readyWaiters=new Set();
  const worker=workerFactory();
  const status=values=>{lastStatus={...lastStatus,...values,release:'dr3',totalSources:GAIA_SURVEY.totalSources};onStatus(lastStatus);if(lastStatus.error||lastStatus.loadedSources>0||lastStatus.metadataValidated&&!lastStatus.loading)for(const resolve of [...readyWaiters])resolve();};
  worker.onmessage=({data})=>{
    if(disposed||data.revision!==undefined&&data.revision!==workerRevision)return;
    if(data.type==='error'){status({loading:false,error:data.error});return;}
    if(data.type!=='update')return;
    const update=data.update;
    if(Array.isArray(update.records)){
      records=update.records.slice(0,maxSources);
      objects=records.map((row,index)=>{
        const p=equatorialVector(row.raDeg,row.decDeg,RADIUS);
        positions.set(p,index*3);
        const bp=Number.isFinite(row.bpRp)?row.bpRp:.8;
        const color=new THREE.Color(bp<0?'#b6ceff':bp<.6?'#dce9ff':bp<1.2?'#fff4df':bp<2?'#ffdaa8':'#ffb57e');
        colors.set([color.r,color.g,color.b],index*3);
        sizes[index]=Math.max(1.6,Math.min(7,6-(row.gMag??16)*.2));
        return {id:'gaia-dr3-'+row.sourceId,gaiaStreamed:true,streamIndex:index,streamRecord:row,position:p};
      });
      for(const attribute of Object.values(geometry.attributes))attribute.needsUpdate=true;
      geometry.setDrawRange(0,objects.length);
      // A small angular target scales with the viewport rather than swallowing a dense field.
      indexedPicking(points,objects,Math.max(.00025,Math.min(.12,(lastCone?.radiusDeg??30)*RAD*RADIUS/180)));
      geometry.computeBoundingSphere();
    }
    const {records:ignored,...stats}=update;
    status({...stats,loadedSources:records.length,limited:Boolean(update.limited)||((update.records?.length||0)>maxSources)});
  };
  worker.onerror=event=>{if(!disposed)status({loading:false,error:event.message||'Gaia streaming worker unavailable.'});};
  worker.postMessage({type:'init',revision:workerRevision,options:{maxSources,maxCacheBytes:24*1024*1024}});
  const region={id:'gaia-survey-centre',name:t('Gaia DR3 survey','Rilievo Gaia DR3'),type:t('Sky region','Regione celeste'),bodyKind:'sky-region',position:equatorialVector(266.4051,-28.936175,RADIUS),raDeg:266.4051,decDeg:-28.936175,source:GAIA_DR3_SOURCE,
    detail:t('Full Gaia DR3 catalogue access through progressive sky tiles. Zoom to retrieve additional sources; only a bounded working set is rendered.','Accesso al catalogo completo Gaia DR3 tramite tasselli progressivi. Ingrandisci per caricare altre sorgenti; viene rappresentato solo un insieme limitato di dati.')};
  return {group,targets:[points],objects:[region],radius:RADIUS,fov:60,lookDirection:new THREE.Vector3(...region.position).normalize(),
    context:{id:'gaia-stream',mode:'catalogue-sky',name:t('Gaia DR3 streamed sky','Cielo Gaia DR3 in streaming'),short:'Gaia DR3',extent:t('Equatorial sky','Cielo equatoriale'),metric:t('ARCHIVE SOURCES','SORGENTI IN ARCHIVIO'),count:GAIA_SURVEY.totalSources.toLocaleString(locale()),source:GAIA_DR3_SOURCE,description:region.detail,overview:t('Progressive catalogue','Catalogo progressivo'),positionNote:t('Angular sky view. Detail loads on demand; this is not a complete 3D distance model.','Vista angolare del cielo. I dettagli si caricano su richiesta; non rappresenta un modello completo delle distanze 3D.')},
    prepare(direction,fov=60,aspect=1,timeoutMs=3500){
      const camera=new THREE.PerspectiveCamera(fov,aspect,.01,1000);camera.lookAt(direction);
      lastCone=gaiaViewCone(camera,new THREE.Group());pendingCone=lastCone;stableAge=.24;
      worker.postMessage({type:'view',view:lastCone});
      return new Promise(resolve=>{
        let timer;const finish=()=>{clearTimeout(timer);readyWaiters.delete(finish);resolve();};
        readyWaiters.add(finish);timer=setTimeout(finish,timeoutMs);
        if(disposed||lastStatus.error||lastStatus.loadedSources>0)finish();
      });
    },
    resolve(object){const row=object?.streamRecord||records[object?.streamIndex];return row&&'gaia-dr3-'+row.sourceId===object.id?streamedGaiaObject(row):object;},
    update(dt,camera,mapRoot){
      if(disposed)return;elapsed+=Math.max(0,dt);if(elapsed<.12)return;elapsed=0;
      const cone=gaiaViewCone(camera,mapRoot);
      const changed=(a,b)=>!b||Math.abs(a.radiusDeg-b.radiusDeg)>Math.max(.001,b.radiusDeg*.08)||new THREE.Vector3(...equatorialVector(a.raDeg,a.decDeg)).angleTo(new THREE.Vector3(...equatorialVector(b.raDeg,b.decDeg)))/RAD>Math.max(.005,a.radiusDeg*.12);
      if(changed(cone,pendingCone)){pendingCone=cone;stableAge=0;}else stableAge+=.12;
      if(stableAge>=.24&&changed(cone,lastCone)){lastCone=cone;worker.postMessage({type:'view',view:cone});}
    },
    retry(){if(!disposed)worker.postMessage({type:'retry'});},
    setQuality(value,ratio=pixelRatio){
      material.uniforms.uPixelRatio.value=ratio;
      const budget=value==='low'?6000:12000;if(disposed||budget===maxSources)return;
      maxSources=budget;records=records.slice(0,budget);objects=objects.slice(0,budget);geometry.setDrawRange(0,objects.length);
      indexedPicking(points,objects,Math.max(.00025,Math.min(.12,(lastCone?.radiusDeg??30)*RAD*RADIUS/180)));
      worker.postMessage({type:'init',revision:++workerRevision,options:{maxSources,maxCacheBytes:24*1024*1024}});
      if(lastCone)worker.postMessage({type:'view',view:lastCone});
    },
    get diagnostics(){return {...lastStatus,renderedSources:objects.length,maxSources,drawCalls:objects.length?1:0,lastCone};},
    dispose(){if(disposed)return;disposed=true;for(const resolve of [...readyWaiters])resolve();worker.terminate();geometry.dispose();material.dispose();group.removeFromParent();records=[];objects=[];}
  };
}