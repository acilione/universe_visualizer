import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base=process.env.ENGINE_TEST_URL || process.env.TEST_URL || 'http://localhost:5173';
const output='test-results/immersive-surround';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];let page;
const checkpoint=name=>{assert.deepEqual(errors,[],name+': browser errors');console.log('PASS: '+name);};
try{
  page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});page.setDefaultTimeout(60000);
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+'/tests/fixtures/engine.html',{waitUntil:'networkidle',timeout:90000});
  await page.waitForFunction(()=>window.atlas?.ready&&atlas.environment&&atlas.travelToObject);
  await page.evaluate(async()=>{
    await atlas.showCombinedMap();await atlas.ensureSurroundingCatalogue();atlas.setLayer('labels',false);
    atlas.enterPreview({layout:'room',directTravel:true});atlas.renderer.setAnimationLoop(null);window.testClock=performance.now();
  });
  const tick=seconds=>page.evaluate(seconds=>{const render=atlas.renderer.render;atlas.renderer.render=()=>{};try{for(let i=0;i<Math.ceil(seconds*20);i++)atlas.animate(window.testClock+=50);}finally{atlas.renderer.render=render;}atlas.scene.updateMatrixWorld(true);atlas.renderer.render(atlas.scene,atlas.camera);},seconds);
  const snapshot=()=>page.evaluate(()=>{atlas.scene.updateMatrixWorld(true);return {camera:[...atlas.camera.position.toArray(),...atlas.camera.quaternion.toArray()],map:atlas.mapRoot.matrixWorld.toArray(),scale:atlas.mapRoot.scale.x};});
  const aim=async id=>{await page.evaluate(id=>{const object=atlas.objects.find(object=>object.id===id);if(!object)throw new Error('Missing object '+id);atlas.preview.lookAtObject(object);atlas.scene.updateMatrixWorld(true);},id);await tick(.4);};
  const click=()=>page.locator('canvas').click({position:{x:720,y:450}});
  await tick(3.3);
  assert.equal(await page.evaluate(()=>atlas.index),9);
  assert.equal(await page.evaluate(()=>atlas.preview.directTravel),true);
  const counts=await page.evaluate(()=>({stars:atlas.catalogueData.stars.length,nebulae:atlas.catalogueData.nebulae.length,planets:atlas.objects.filter(object=>object.bodyKind==='planet').length}));
  assert.ok(counts.stars>=118000&&counts.nebulae>=485&&counts.planets===8);
  await page.screenshot({path:output+'/combined-entry.png'});
  checkpoint('The room map includes all planets, stars and nebulae on entry');

  const hiddenJump = await page.evaluate(() => {
    const frames = [], oldRoot = atlas.mapRoot.matrixWorld.toArray(), oldCamera = atlas.camera.quaternion.toArray();
    const render = atlas.renderer.render;
    atlas.renderer.render = (scene, camera) => {
      scene.updateMatrixWorld(true);
      frames.push({ opacity: Number(atlas.canvas.style.opacity || 1), root: atlas.mapRoot.matrixWorld.toArray(), camera: camera.quaternion.toArray() });
    };
    try {
      atlas.preview.focusObject(atlas.objects.find(object => object.id === 'earth'), atlas.spatialExtent(atlas.objects.find(object => object.id === 'earth')));
      for (let frame = 0; frame < 10; frame++) atlas.animate(window.testClock += 40);
      const placed = atlas.mapRoot.matrixWorld.toArray();
      atlas.preview.lookAtObject(atlas.objects.find(object => object.id === 'jupiter'));
      for (let frame = 0; frame < 10; frame++) atlas.animate(window.testClock += 40);
      return { frames, oldRoot, oldCamera, placed };
    } finally { atlas.renderer.render = render; }
  });
  let previousRoot=hiddenJump.oldRoot,previousCamera=hiddenJump.oldCamera,relocations=0,turns=0;
  for(const frame of hiddenJump.frames){
    if(JSON.stringify(frame.root)!==JSON.stringify(previousRoot)){assert.equal(frame.opacity,0,'Rendered map relocation must be completely hidden');relocations++;}
    if(JSON.stringify(frame.camera)!==JSON.stringify(previousCamera)){assert.equal(frame.opacity,0,'Automatic gaze changes must hide the whole sky canvas');turns++;}
    previousRoot=frame.root;previousCamera=frame.camera;
  }
  assert.equal(relocations,1);assert.equal(turns,1);
  await page.evaluate(()=>atlas.preview.navigateBack());await tick(.4);
  checkpoint('Actual renderer frames contain no visible automatic map sweep or camera whip');

  await aim('earth');const before=await snapshot();await click();await tick(.7);
  assert.equal(await page.evaluate(()=>atlas.selected?.id),'earth');assert.equal(await page.evaluate(()=>atlas.preview.isInspecting),true);
  assert.deepEqual((await snapshot()).camera,before.camera,'Travel changes the map, not the viewer pose');
  assert.ok((await snapshot()).scale>before.scale*5,'One direct click rapidly brings Earth to inspection size');
  const body=await page.evaluate(()=>{const node=atlas.bodyVisuals.get('earth');return node.getWorldPosition(node.position.clone()).distanceTo(atlas.camera.position);});
  assert.ok(Math.abs(body-1.35)<.05,'The selected planet arrives within reach');
  assert.equal(await page.evaluate(()=>atlas.environment.diagnostics.skyVisible),true,'Surrounding stars remain when the map is enlarged');
  await tick(1.5);await page.screenshot({path:output+'/earth-closeup.png'});
  checkpoint('Direct selection travels to Earth within reach while the observer remains stationary and surrounded by stars');

  const anchor=()=>page.evaluate(()=>{atlas.mapRoot.updateMatrixWorld(true);const body=atlas.bodyVisuals.get('earth');return body.getWorldPosition(body.position.clone()).toArray();});
  const position=await anchor(),scale=(await snapshot()).scale;
  await page.mouse.move(720,450);await page.mouse.wheel(0,-250);await tick(.05);
  assert.ok((await snapshot()).scale>scale && (await snapshot()).scale<scale*1.14,'Wheel input is bounded per frame instead of snapping to the new size');
  await tick(1.3);
  assert.ok((await snapshot()).scale>scale*2,'Sustained zoom reaches the requested inspection scale');
  const enlarged=await anchor();assert.ok(position.every((v,i)=>Math.abs(v-enlarged[i])<1e-8),'Zoom stays centred on the inspected object');
  await page.mouse.wheel(0,250);await tick(1.4);
  assert.ok(Math.abs((await snapshot()).scale/scale-1)<1e-6);
  assert.deepEqual((await snapshot()).camera,before.camera);
  checkpoint('Damped zoom is reversible and keeps the inspected body anchored');
  const localField=await page.evaluate(()=>atlas.environment.diagnostics);
  assert.equal(localField.nearFieldActive,true);
  const fixedNearMap=(await snapshot()).map;
  await page.keyboard.down('KeyA');await tick(.2);await page.keyboard.up('KeyA');
  assert.deepEqual(await page.evaluate(()=>atlas.environment.diagnostics.nearFieldPosition),localField.nearFieldPosition);
  assert.deepEqual((await snapshot()).map,fixedNearMap);
  await page.screenshot({path:output+'/earth-closeup-walked.png'});
  checkpoint('The close-up particle field remains fixed in the room while walking');
  for(const id of ['jupiter','earth']){
    await aim(id);const pose=(await snapshot()).camera;await click();await tick(.7);
    assert.equal(await page.evaluate(()=>atlas.selected?.id),id);
    assert.deepEqual((await snapshot()).camera,pose);
    assert.equal(await page.evaluate(()=>atlas.preview.isInspecting),true);
  }
  checkpoint('Direct planet-to-planet hops require no overview menu');
  // The new approach direction can place the Moon behind Earth. Return to the
  // room overview before aiming at the Moon; occluded targets must not win rays.
  await page.keyboard.press('KeyB');await tick(.7);


  await aim('moon');const moonPose=(await snapshot()).camera;await click();await tick(.7);
  assert.equal(await page.evaluate(()=>atlas.selected?.id),'moon');assert.deepEqual((await snapshot()).camera,moonPose);
  await page.screenshot({path:output+'/moon-closeup.png'});
  await page.keyboard.press('KeyB');await tick(.7);
  assert.equal(await page.evaluate(()=>atlas.preview.isInspecting),false);assert.equal(await page.evaluate(()=>atlas.index),9);
  assert.deepEqual((await snapshot()).camera,moonPose);
  await page.keyboard.press('KeyB');await tick(.7);
  assert.equal(await page.evaluate(()=>atlas.index),1,'A second back input moves to the next astronomical level');
  await page.keyboard.press('KeyB');await tick(.7);assert.equal(await page.evaluate(()=>atlas.index),2);
  await aim('solar-system');const galacticPose=(await snapshot()).camera;await click();await tick(.7);
  assert.equal(await page.evaluate(()=>atlas.index),0);assert.deepEqual((await snapshot()).camera,galacticPose);
  checkpoint('Moon-to-overview-to-galaxy-to-Solar-System navigation works entirely from scene input');

  const fixed=(await snapshot()).map;await page.keyboard.down('KeyW');await tick(.3);await page.keyboard.up('KeyW');
  assert.deepEqual((await snapshot()).map,fixed,'Walking through the scene preserves world placement');
  assert.notDeepEqual((await snapshot()).camera,galacticPose,'Walking still moves the observer independently');
  await tick(1);await page.screenshot({path:output+'/solar-surround.png'});
  checkpoint('After travelling between levels the map stays fixed while the observer walks');

  await page.evaluate(()=>{
    const object=atlas.environment.objects.find(object=>object.id==='hip-32349');
    if(!object)throw new Error('Sirius is missing from the surrounding sky');
    const world=atlas.camera.position.clone().add(atlas.camera.position.clone().fromArray(object.position));
    atlas.preview.lookAtObject({id:'test-aim-background',position:atlas.mapRoot.worldToLocal(world).toArray()});
    atlas.scene.updateMatrixWorld(true);
  });
  await tick(.4);const starPose=(await snapshot()).camera;await click();await tick(.7);
  assert.equal(await page.evaluate(()=>atlas.index),9,'Selecting a sky reference opens its combined catalogue context');
  assert.equal(await page.evaluate(()=>atlas.selected?.id),'hip-32349');
  assert.deepEqual((await snapshot()).camera,starPose);
  checkpoint('A surrounding catalogue star is directly selectable and travel preserves the tracked viewpoint');
  const beforeHost=(await snapshot()).camera;
  const host=await page.evaluate(()=>{const object=exoplanets.find(object=>object.name==='TRAPPIST-1 e');if(!object)throw new Error('Missing host example');atlas.travelToObject(object);return object.host;});
  await tick(.8);assert.equal(await page.evaluate(()=>atlas.index),5);
  assert.equal(await page.evaluate(()=>atlas.systemHost),host);
  assert.equal(await page.evaluate(()=>atlas.selected.name),'TRAPPIST-1 e');
  assert.deepEqual((await snapshot()).camera,beforeHost);
  assert.equal(await page.evaluate(()=>atlas.preview.isInspecting),true);
  checkpoint('Travelling to an exoplanet opens its host system without moving the observer');
  await page.evaluate(()=>atlas.showConstellation('Ori',{mode:'space',earthPerspective:true,observer:{latitude:38+6/60+51.98/3600,longitude:15+39/60,dateIso:'2026-12-11T19:00:00.000Z'}}));
  await tick(.4);
  const earthReturn=await page.evaluate(()=>{
    const camera=[...atlas.camera.position.toArray(),...atlas.camera.quaternion.toArray()],fov=atlas.camera.fov;
    atlas.resetView(true);
    return {beforeFov:fov,afterFov:atlas.camera.fov,opacity:Number(atlas.canvas.style.opacity||1),earthPerspective:atlas.earthPerspective,beforeCamera:camera,afterCamera:[...atlas.camera.position.toArray(),...atlas.camera.quaternion.toArray()]};
  });
  assert.equal(earthReturn.beforeFov,72);assert.equal(earthReturn.afterFov,72);
  assert.equal(earthReturn.opacity,0,'Earth-to-orbit root change must be concealed before the next renderer frame');
  assert.equal(earthReturn.earthPerspective,false);assert.deepEqual(earthReturn.afterCamera,earthReturn.beforeCamera);
  await tick(.4);assert.equal(await page.evaluate(()=>atlas.camera.fov),72);
  checkpoint('Returning from Earth perspective preserves preview field of view and hides the map relocation');

  await page.evaluate(()=>atlas.exitPreview());
  assert.equal(await page.evaluate(()=>atlas.preview.isActive),false);assert.equal(await page.evaluate(()=>atlas.controls.enabled),true);
  await page.evaluate(()=>atlas.dispose());checkpoint('Leaving immersive navigation restores ordinary map interaction');
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:output+'/navigation-failure.png'}).catch(()=>{});console.error('Browser errors:',errors);throw error;}
finally{await browser.close();}