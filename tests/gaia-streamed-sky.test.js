import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGaiaStreamedSky, gaiaViewCone, streamedGaiaObject, GAIA_SURVEY } from '../src/gaia-streamed-sky.js';
import { equatorialVector } from '../src/sky-math.js';

const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const row=(index=0,extra={})=>({sourceId:(9007199254740992n+BigInt(index)).toString(),raDeg:83.8,decDeg:-5.4,refEpoch:2016,
  pmRaMasYr:null,pmDecMasYr:null,parallaxMas:10,parallaxErrorMas:.1,ruwe:1.1,gMag:14.2,bpRp:.9,
  inQsoCandidates:false,inGalaxyCandidates:false,...extra});
class MockWorker {
  messages=[];terminated=0;
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated++;}
  emit(update,extra={}){this.onmessage?.({data:{type:'update',update,...extra}});}
  error(message){this.onerror?.({message});}
}
function fixture(options={}) {
  const worker=new MockWorker(),statuses=[];
  const view=createGaiaStreamedSky({...options,onStatus:status=>statuses.push(status),workerFactory:()=>worker});
  const camera=new THREE.PerspectiveCamera(60,1.5,.01,1000),root=new THREE.Group();root.add(view.group);root.updateMatrixWorld(true);
  return {view,worker,statuses,camera,root,points:view.targets[0],tick(count=4,dt=.12){for(let i=0;i<count;i++)view.update(dt,camera,root);}};
}
function rayAt(f,position){f.root.updateMatrixWorld(true);const origin=f.root.localToWorld(new THREE.Vector3());const target=f.root.localToWorld(new THREE.Vector3(...position));return new THREE.Raycaster(origin,target.sub(origin).normalize(),0,1000);}

test('streamed Gaia retains exact 64-bit identities, native astrometry and honest distance quality',()=>{
  const first=streamedGaiaObject(row()),second=streamedGaiaObject(row(1));
  assert.notEqual(first.id,second.id);assert.equal(first.gaiaSourceId,'9007199254740992');assert.equal(second.gaiaSourceId,'9007199254740993');
  assert.equal(first.positionEpoch,2016);assert.equal(first.positionPropagated,false);assert.equal(first.raDeg,83.8);assert.equal(first.gaiaData.raDeg,83.8);
  assert.equal(first.magnitudeBand,'G');assert.equal(first.colorIndex,null);assert.equal(first.positionKind,'sky-projection');
  close(new THREE.Vector3(...first.position).length(),60);close(first.distanceLy,326.1563777);
  const moved=streamedGaiaObject(row(2,{raDeg:0,decDeg:0,pmRaMasYr:1000,pmDecMasYr:0}));
  close(moved.raDeg,0);assert.equal(moved.positionEpoch,2016);assert.equal(moved.positionPropagated,false);assert.equal(moved.gaiaData.raDeg,0);assert.equal(moved.gaiaData.referenceEpoch,2016);assert.equal(moved.pmRaMasYr,1000);
  for(const changes of [{parallaxMas:-2},{parallaxMas:0},{parallaxErrorMas:null},{ruwe:2},{ruwe:null}]){
    const object=streamedGaiaObject(row(3,changes));assert.equal(object.distanceLy,null);assert.equal(object.distanceEstimate,false);
  }
  assert.equal(streamedGaiaObject(row(3,{parallaxMas:-2})).gaiaData.parallaxMas,-2);
  assert.throws(()=>streamedGaiaObject(row(0,{sourceId:9007199254740992})),TypeError);
});

test('quasar and galaxy candidates remain Gaia sources without stellar classification or inverse-parallax distances',()=>{
  for(const [field,word] of [['inQsoCandidates','quasar'],['inGalaxyCandidates','galaxy']]){
    const object=streamedGaiaObject(row(0,{[field]:true}));
    assert.equal(object.bodyKind,'catalog-source');assert.match(object.type,new RegExp(word,'i'));
    assert.equal(object.distanceLy,null);assert.equal(object.gaiaData[field],true);
  }
});

test('view cones use equatorial directions under map rotation and contain every asymmetric canted-eye corner',()=>{
  const camera=new THREE.PerspectiveCamera(60,1.5,.1,1000),root=new THREE.Group();
  let cone=gaiaViewCone(camera,root);close(cone.raDeg,90);close(cone.decDeg,0);
  root.rotation.set(.2,.7,-.1);root.position.set(4,-2,6);camera.rotation.set(.3,-.4,.1);
  cone=gaiaViewCone(camera,root);
  const expected=camera.getWorldDirection(new THREE.Vector3()).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
  close(new THREE.Vector3(...equatorialVector(cone.raDeg,cone.decDeg)).angleTo(expected),0,1e-7);
  const eyes=[new THREE.PerspectiveCamera(),new THREE.PerspectiveCamera()];
  eyes.forEach((eye,index)=>{eye.rotation.y=index===0?.25:-.25;eye.projectionMatrix.makePerspective(-.8,1.2,.7,-.9,1,100);eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();eye.updateMatrixWorld(true);});
  const stereo=new THREE.ArrayCamera(eyes);root.rotation.set(0,.4,0);cone=gaiaViewCone(stereo,root);
  const axis=new THREE.Vector3(...equatorialVector(cone.raDeg,cone.decDeg));
  for(const eye of eyes)for(const x of [-1,1])for(const y of [-1,1]){
    const corner=new THREE.Vector3(x,y,.5).applyMatrix4(eye.projectionMatrixInverse).normalize().applyQuaternion(eye.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
    assert.ok(THREE.MathUtils.radToDeg(axis.angleTo(corner))<=cone.radiusDeg+1e-8,'the request cone must cover both eye frusta');
  }
});

test('GPU source count is bounded and one indexed batch resolves selected catalogue details',()=>{
  const f=fixture();
  try{
    const records=Array.from({length:12020},(_,index)=>row(index,{raDeg:index*137.507764%360,decDeg:Math.asin(2*(index+.5)/12020-1)*180/Math.PI}));
    f.worker.emit({records,loading:false,limited:false});
    assert.equal(f.points.geometry.drawRange.count,12000);assert.equal(f.view.diagnostics.renderedSources,12000);assert.equal(f.view.diagnostics.drawCalls,1);assert.equal(f.view.diagnostics.limited,true);assert.equal(f.view.diagnostics.totalSources,GAIA_SURVEY.totalSources);
    assert.ok(f.points.geometry.attributes.position.count<=12000);assert.equal(f.view.targets.length,1);
    const chosen=records[3456],position=equatorialVector(chosen.raDeg,chosen.decDeg,60);
    const hits=rayAt(f,position).intersectObjects(f.view.targets,false);
    assert.equal(hits.length,1);assert.equal(hits[0].dataObject.id,'gaia-dr3-'+chosen.sourceId);
    const object=f.view.resolve(hits[0].dataObject);assert.equal(object.gaiaData.sourceId,chosen.sourceId);assert.equal(object.mag,chosen.gMag);
    assert.ok(f.points.userData.pickStats.candidates<400,'selection examines nearby index buckets rather than the entire catalogue');
    const attributes={...f.points.geometry.attributes};f.worker.emit({records:[row(0)],loading:false});
    assert.equal(f.points.geometry.drawRange.count,1);for(const [name,attribute] of Object.entries(attributes))assert.equal(f.points.geometry.attributes[name],attribute);
    assert.equal(rayAt(f,position).intersectObjects(f.view.targets,false).length,0,'old GPU slots are not selectable');
  }finally{f.view.dispose();}
});

test('selection preserves the exact source after a tile update reorders or evicts its point proxy',()=>{
  const f=fixture();
  try{
    const source=row(4,{raDeg:0,decDeg:0}),other=row(5,{raDeg:90,decDeg:0});
    f.worker.emit({records:[source,other]});const proxy=rayAt(f,[60,0,0]).intersectObjects(f.view.targets,false)[0].dataObject;
    f.worker.emit({records:[other,source]});assert.equal(f.view.resolve(proxy).gaiaData.sourceId,source.sourceId);
    f.worker.emit({records:[other]});const selected=f.view.resolve(proxy);assert.equal(selected.gaiaData.sourceId,source.sourceId);assert.equal(selected.name,'Gaia DR3 '+source.sourceId);
  }finally{f.view.dispose();}
});

test('view requests wait for a stable field and avoid network work during continuous movement',()=>{
  const f=fixture();
  try{
    assert.equal(f.worker.messages[0].type,'init');assert.equal(f.worker.messages[0].options.maxCacheBytes,24*1024*1024);
    for(let i=0;i<10;i++){f.camera.rotation.y+=.3;f.view.update(.12,f.camera,f.root);}
    assert.equal(f.worker.messages.filter(message=>message.type==='view').length,0);
    f.tick();assert.equal(f.worker.messages.filter(message=>message.type==='view').length,1);
    f.tick(12);assert.equal(f.worker.messages.filter(message=>message.type==='view').length,1);
    f.camera.fov=3;f.camera.updateProjectionMatrix();f.tick();assert.equal(f.worker.messages.filter(message=>message.type==='view').length,2);
    assert.ok(f.view.diagnostics.lastCone.radiusDeg<4);
  }finally{f.view.dispose();}
});

test('changing quality keeps buffer capacity bounded and requests the smaller working set',()=>{
  const f=fixture();
  try{
    f.worker.emit({records:Array.from({length:9000},(_,index)=>row(index,{raDeg:index%360,decDeg:0}))});
    f.view.setQuality('low',1.25);
    assert.equal(f.view.diagnostics.maxSources,6000);assert.ok(f.points.geometry.drawRange.count<=6000);
    assert.equal(f.points.material.uniforms.uPixelRatio.value,1.25);
    assert.equal(f.worker.messages.filter(message=>message.type==='init').at(-1).options.maxSources,6000);
    f.view.setQuality('high',2);assert.equal(f.view.diagnostics.maxSources,12000);assert.ok(f.points.geometry.attributes.position.count<=12000);
  }finally{f.view.dispose();}
});

test('disposing the stream terminates work, releases GPU resources once and ignores late responses',()=>{
  const f=fixture();let geometryDisposals=0,materialDisposals=0;
  f.points.geometry.addEventListener('dispose',()=>geometryDisposals++);f.points.material.addEventListener('dispose',()=>materialDisposals++);
  f.worker.emit({records:[row()],loading:false});const count=f.statuses.length;
  f.view.dispose();f.view.dispose();f.worker.emit({records:[row(2)],loading:false});f.worker.error('late failure');f.view.retry();f.tick();
  assert.equal(f.worker.terminated,1);assert.equal(geometryDisposals,1);assert.equal(materialDisposals,1);assert.equal(f.view.group.parent,null);
  assert.equal(f.statuses.length,count);assert.equal(f.view.diagnostics.renderedSources,0);
});

test('Universe leaves and re-enters the streamed sky without retaining its worker or accepting stale async entry',async()=>{
  const {Universe}=await import('../src/universe.js');const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker'),workers=[];
  globalThis.Worker=class extends MockWorker{constructor(){super();workers.push(this);}};
  const statuses=[],scene=new THREE.Scene(),mapRoot=new THREE.Group();scene.add(mapRoot);
  const universe=Object.assign(Object.create(Universe.prototype),{
    scene,mapRoot,camera:new THREE.PerspectiveCamera(),renderer:{xr:{isPresenting:false},getPixelRatio:()=>1},xr:{isPresenting:false},
    controls:{target:new THREE.Vector3()},canvas:{clientWidth:1200},quality:'high',viewRequest:0,elapsed:0,index:0,disposed:false,
    gaiaSkyView:null,skyPointers:new Map(),retiring:[],bodyVisuals:new Map(),labels:[],layers:{grid:true,particles:true},sunLight:new THREE.PointLight(),
    onGaiaStreamStatus:status=>statuses.push(status),onScale:()=>{},selectObject:()=>{},setLayer:()=>{},resetView:()=>{},configureImmersiveEffects:()=>{},
    makeGrid:()=>new THREE.Group(),makeStars:()=>new THREE.Group(),makeMarker:()=>{},
  });
  try{
    assert.equal(await universe.showGaiaSky(),true);assert.equal(workers.length,1);assert.equal(universe.index,8);
    workers[0].emit({records:[row(7)],loading:false});mapRoot.updateMatrixWorld(true);
    const hit=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(...equatorialVector(row().raDeg,row().decDeg))).intersectObjects(universe.targets,false)[0];
    let selected,headsetInfo;universe.onSelect=object=>{selected=object;};universe.xr.setInfo=info=>{headsetInfo=info;};
    universe.updateMoonOrbits=()=>{};universe.ring=()=>new THREE.Mesh(new THREE.RingGeometry(.1,.2),new THREE.MeshBasicMaterial());
    Universe.prototype.selectObject.call(universe,hit.dataObject);
    assert.equal(selected.gaiaData.sourceId,row(7).sourceId);assert.equal(headsetInfo.name,selected.name);assert.equal(universe.gaiaSkyView.group.parent,universe.content);
    const first=universe.gaiaSkyView;universe.setScale(1);assert.equal(universe.gaiaSkyView,null);assert.equal(workers[0].terminated,1);assert.equal(first.group.parent,null);
    const count=statuses.length;workers[0].emit({records:[row()]});assert.equal(statuses.length,count);
    assert.equal(await universe.showGaiaSky(),true);assert.equal(workers.length,2);assert.notEqual(universe.gaiaSkyView,first);
    universe.setScale(1);const pending=universe.showGaiaSky();universe.cancelPendingView();assert.equal(await pending,false);assert.equal(workers.length,2);
  }finally{
    universe.gaiaSkyView?.dispose();if(previous)Object.defineProperty(globalThis,'Worker',previous);else delete globalThis.Worker;
  }
});


test('high-proper-motion sources remain in their native HiPS cone at arcminute-scale zoom',()=>{
  const f=fixture();
  try{
    const source=row(17,{pmRaMasYr:10000,pmDecMasYr:5000});
    const native=new THREE.Vector3(...equatorialVector(source.raDeg,source.decDeg));
    f.camera.fov=.03;f.camera.aspect=1;f.camera.updateProjectionMatrix();f.camera.lookAt(native);f.tick();
    const cone=f.view.diagnostics.lastCone;assert.ok(cone.radiusDeg<.04);
    f.worker.emit({records:[source]});
    const hit=rayAt(f,native.clone().multiplyScalar(60).toArray()).intersectObjects(f.view.targets,false)[0];
    assert.ok(hit,'request and rendered direction share the native J2016 tile epoch');
    const object=f.view.resolve(hit.dataObject);assert.equal(object.positionEpoch,2016);assert.equal(object.pmRaMasYr,10000);
    const centre=new THREE.Vector3(...equatorialVector(cone.raDeg,cone.decDeg));
    assert.ok(THREE.MathUtils.radToDeg(centre.angleTo(new THREE.Vector3(...object.position).normalize()))<=cone.radiusDeg);
  }finally{f.view.dispose();}
});

test('late worker revisions cannot replace the working set after a quality change',()=>{
  const f=fixture();
  try{
    const oldRevision=f.worker.messages[0].revision;
    f.worker.emit({records:[row()]},{revision:oldRevision});f.view.setQuality('low');
    const revision=f.worker.messages.filter(message=>message.type==='init').at(-1).revision;
    f.worker.emit({records:[row(2)],loading:false},{revision});
    const count=f.statuses.length;
    f.worker.emit({records:[row(3)],loading:false},{revision:oldRevision});
    f.worker.onmessage({data:{type:'error',error:'stale failure',revision:oldRevision}});
    assert.equal(f.statuses.length,count);
    const position=equatorialVector(row().raDeg,row().decDeg,60),proxy=rayAt(f,position).intersectObjects(f.view.targets,false)[0].dataObject;
    assert.equal(f.view.resolve(proxy).gaiaSourceId,row(2).sourceId);
  }finally{f.view.dispose();}
});
