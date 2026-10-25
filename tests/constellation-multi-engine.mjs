import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.ENGINE_TEST_URL||process.env.TEST_URL||'http://localhost:5173';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const observer={latitude:38.11443888888889,longitude:15.65,dateIso:'2026-12-11T19:00:00.000Z'};
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:.75,reducedMotion:'reduce'});
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto(base+'/tests/fixtures/engine.html');await page.waitForFunction(()=>window.atlas?.ready);
 await page.evaluate(async observer=>{
  atlas.renderer.setAnimationLoop(null);
  await atlas.showConstellations(['Ori'],{observer});atlas.resetView(true);
  atlas.camera.position.set(12,17,93);atlas.controls.target.set(2,3,-4);atlas.camera.lookAt(atlas.controls.target);atlas.camera.fov=53;atlas.camera.updateProjectionMatrix();atlas.camera.updateMatrixWorld(true);
  window.pose=()=>({position:atlas.camera.position.toArray(),quaternion:atlas.camera.quaternion.toArray(),up:atlas.camera.up.toArray(),fov:atlas.camera.fov,target:atlas.controls.target.toArray(),mapPosition:atlas.mapRoot.position.toArray(),mapQuaternion:atlas.mapRoot.quaternion.toArray(),mapScale:atlas.mapRoot.scale.toArray(),earth:atlas.earthPerspective,yaw:atlas.skyYaw,pitch:atlas.skyPitch});
  window.initialPose=pose();window.originalPositions=Object.fromEntries(atlas.objects.map(star=>[star.id,star.position.slice()]));window.initialFar=atlas.camera.far;
 },observer);
 const union=await page.evaluate(async()=>{
  await atlas.showConstellations(['Ori','UMa','Ori']);
  return{before:initialPose,after:pose(),ids:atlas.viewContext.constellationIds,distinct:new Set(atlas.objects.map(star=>star.id)).size,count:atlas.objects.length,samePositions:atlas.objects.filter(star=>originalPositions[star.id]).every(star=>star.position.every((value,i)=>value===originalPositions[star.id][i])),far:atlas.camera.far,initialFar,factor:atlas.constellationView.distanceFactor,background:atlas.content.getObjectByName('catalog-stars').geometry.attributes.position.count};
 });
 assert.deepEqual(union.after,union.before);assert.deepEqual(union.ids,['Ori','UMa']);assert.equal(union.distinct,union.count);assert.equal(union.samePositions,true);assert.equal(union.factor,.026);assert.ok(union.far>=union.initialFar);assert.equal(union.background,109400);
 const removed=await page.evaluate(async()=>{
  const rigel=atlas.objects.find(star=>star.hip===24436);atlas.selectObject(rigel);const before=pose();
  await atlas.showConstellations(['UMa']);return{before,after:pose(),removedId:rigel.id,selected:atlas.selected?.id,ids:atlas.viewContext.constellationIds};
 });
 assert.deepEqual(removed.after,removed.before);assert.notEqual(removed.selected,removed.removedId);assert.deepEqual(removed.ids,['UMa']);
 const empty=await page.evaluate(async()=>{
  const before=pose();window.selectionEvents=[];atlas.onSelect=object=>selectionEvents.push(object?.id??null);
  await atlas.showConstellations([]);return{before,after:pose(),ids:atlas.constellationData.ids,objects:atlas.objects.length,selected:atlas.selected,events:selectionEvents,segments:atlas.content.getObjectByName('constellation-lines').userData.segmentCount,background:atlas.content.getObjectByName('catalog-stars').geometry.attributes.position.count,earth:atlas.earthReference.visible,far:atlas.camera.far};
 });
 assert.deepEqual(empty.after,empty.before);assert.deepEqual(empty.ids,[]);assert.equal(empty.objects,0);assert.equal(empty.selected,null);assert.ok(empty.events.includes(null));assert.equal(empty.segments,0);assert.equal(empty.background,109400);assert.equal(empty.earth,true);assert.ok(empty.far>=union.far);
 console.log('PASS multi-constellation add/remove/empty, stable positions/background and unchanged ordinary camera/FOV/map.');

 const earth=await page.evaluate(async observer=>{
  await atlas.showConstellations(['Ori'],{observer});atlas.viewFromEarth({immediate:true});atlas.skyYaw+=.17;atlas.skyPitch-=.08;atlas.applySkyLook();atlas.camera.fov=49;atlas.camera.updateProjectionMatrix();
  const before=pose();await atlas.showConstellations(['Ori','Sgr']);const after=pose(),unknown=atlas.objects.find(star=>star.hip===89341);
  await atlas.showConstellations([]);return{before,after,empty:pose(),unknown:{distance:unknown?.distanceLy,angular:unknown?.earthAngularReference},selected:atlas.selected,count:atlas.viewContext.renderedStarCount,ids:atlas.viewContext.constellationIds};
 },observer);
 assert.deepEqual(earth.after,earth.before);assert.deepEqual(earth.empty,earth.before);assert.deepEqual(earth.unknown,{distance:null,angular:true});assert.equal(earth.selected,null);assert.equal(earth.count,119625);assert.deepEqual(earth.ids,[]);
 const observation=await page.evaluate(async observer=>{
  await atlas.showConstellations(['Ori'],{observer});const before=pose(),frame=atlas.earthSkyFrame.toArray();
  await atlas.showConstellations(['Ori'],{observer:{...observer,dateIso:'2026-12-12T01:00:00.000Z'}});
  return{before,after:pose(),frame,afterFrame:atlas.earthSkyFrame.toArray(),observer:atlas.constellationData.observer};
 },observer);
 assert.equal(observation.after.yaw,observation.before.yaw);assert.equal(observation.after.pitch,observation.before.pitch);assert.equal(observation.after.fov,observation.before.fov);assert.deepEqual(observation.after.position,observation.before.position);assert.notDeepEqual(observation.after.quaternion,observation.before.quaternion);assert.notDeepEqual(observation.afterFrame,observation.frame);
 const last=await page.evaluate(async observer=>{
  const values=await Promise.all([atlas.showConstellations(['Ori'],{observer}),atlas.showConstellations(['Cas','Sgr'],{observer:{...observer,dateIso:'2027-01-01T22:00:00.000Z'}})]);
  return{values,ids:atlas.constellationData.ids,observer:atlas.constellationData.observer};
 },observer);
 assert.deepEqual(last.values,[false,true]);assert.deepEqual(last.ids,['Cas','Sgr']);assert.equal(last.observer.dateIso,'2027-01-01T22:00:00.000Z');
 console.log('PASS Earth origin membership preservation, unknown-distance angular references, local observer rotation and latest-request wins.');

 const roundtrip=await page.evaluate(async()=>{
  const saved=atlas.captureAtlasView(),before=pose();atlas.setScale(0);await atlas.restoreAtlasView(saved);
  const multiple={before,after:pose(),ids:atlas.constellationData.ids,factor:atlas.constellationView.distanceFactor};
  await atlas.showConstellations([]);const blank=atlas.captureAtlasView(),emptyBefore=pose();atlas.setScale(0);await atlas.restoreAtlasView(blank);
  return{multiple,emptyBefore,emptyAfter:pose(),emptyIds:atlas.constellationData.ids,emptySelected:atlas.selected};
 });
 assert.deepEqual(roundtrip.multiple.after,roundtrip.multiple.before);assert.deepEqual(roundtrip.multiple.ids,['Cas','Sgr']);assert.equal(roundtrip.multiple.factor,.026);assert.deepEqual(roundtrip.emptyAfter,roundtrip.emptyBefore);assert.deepEqual(roundtrip.emptyIds,[]);assert.equal(roundtrip.emptySelected,null);
 const controller=await page.evaluate(async()=>{
  await atlas.showConstellations(['Ori','UMa']);const before=pose();await atlas.navigateFromXR(1);const afterAdd=atlas.constellationData.ids.slice();await atlas.navigateFromXR(-1);const afterBack=atlas.constellationData.ids.slice();
  const {loadConstellations}=await import('/src/constellation-catalog.js');const all=(await loadConstellations()).constellations.map(figure=>figure.id);await atlas.showConstellations(all);const request=atlas.viewRequest;await atlas.navigateFromXR(1);await atlas.navigateFromXR(-1);
  return{before,after:pose(),afterAdd,afterBack,allCount:atlas.constellationData.ids.length,noOp:atlas.viewRequest===request};
 });
 assert.deepEqual(controller.after,controller.before);assert.deepEqual(controller.afterAdd.slice(0,2),['Ori','UMa']);assert.equal(new Set(controller.afterAdd).size,3);assert.deepEqual(controller.afterBack.slice(0,3),controller.afterAdd);assert.equal(new Set(controller.afterBack).size,4);assert.equal(controller.allCount,88);assert.equal(controller.noOp,true);
 console.log('PASS multi/empty atlas snapshot roundtrip and additive controller cycling without destructive replacement.');

 const xr=await page.evaluate(async observer=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  await atlas.showConstellations(['Ori'],{observer});
  const tracked=new THREE.PerspectiveCamera(80,1,.01,20000);tracked.position.set(2,1.7,-3);tracked.rotation.set(.1,.8,-.05);
  const trackedBefore={position:tracked.position.toArray(),quaternion:tracked.quaternion.toArray()};
  const oldGetCamera=atlas.renderer.xr.getCamera,oldRecenter=atlas.xr.recenter;
  atlas.renderer.xr.isPresenting=true;atlas.renderer.xr.getCamera=()=>tracked;atlas.xr.recenter=()=>{throw new Error('Collection edits must not recenter XR');};
  atlas.mapRoot.position.copy(tracked.position);atlas.mapRoot.quaternion.copy(atlas.earthSkyFrame);atlas.mapRoot.scale.setScalar(1);
  try{
   const before=pose();await atlas.showConstellations(['Ori','Cas']);const after=pose();await atlas.showConstellations([]);const empty=pose();
   const oldFrame=atlas.earthSkyFrame.clone(),oldQuaternion=atlas.mapRoot.quaternion.clone();
   await atlas.showConstellations(['UMa'],{observer:{...observer,latitude:-25,longitude:30}});
   const expected=oldQuaternion.multiply(oldFrame.invert()).multiply(atlas.earthSkyFrame).normalize();
   return{before,after,empty,trackedBefore,trackedAfter:{position:tracked.position.toArray(),quaternion:tracked.quaternion.toArray()},observerRotationError:atlas.mapRoot.quaternion.angleTo(expected),observerPosition:atlas.mapRoot.position.toArray()};
  }finally{atlas.renderer.xr.isPresenting=false;atlas.renderer.xr.getCamera=oldGetCamera;atlas.xr.recenter=oldRecenter;atlas.dispose();}
 },observer);
 assert.deepEqual(xr.after,xr.before);assert.deepEqual(xr.empty,xr.before);assert.deepEqual(xr.trackedAfter,xr.trackedBefore);assert.ok(xr.observerRotationError<1e-7);assert.deepEqual(xr.observerPosition,xr.before.mapPosition);
 assert.deepEqual(errors,[]);console.log('PASS XR integration preserves tracked pose and placement on membership edits; observer updates change only sky orientation.');
 await page.close();
}finally{await browser.close();}
