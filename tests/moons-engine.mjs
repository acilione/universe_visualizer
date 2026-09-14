import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto((process.env.ENGINE_TEST_URL||'http://localhost:5173')+'/tests/fixtures/engine.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.atlas?.ready);
  const rendered=await page.evaluate(()=>solarMoons.map(moon=>{
    const target=atlas.targets.find(hit=>hit.userData.object.id===moon.id);
    const mesh=target.parent.getObjectByName('planet-surface');
    return {id:moon.id,position:target.parent.position.toArray(),expected:moon.position,size:moon.size,hitRadius:target.geometry.parameters.radius,hasSurface:!!mesh,texture:mesh.material.map?.image?.src};
  }));
  assert.ok(rendered.length>=28);
  for(const moon of rendered){assert.deepEqual(moon.position,moon.expected);assert.ok(moon.hasSurface);assert.ok(moon.hitRadius>=moon.size&&moon.hitRadius<0.4);}
  assert.match(rendered.find(m=>m.id==='moon').texture,/2k_moon.jpg$/);
  await page.evaluate(()=>atlas.focusMoonSystem('earth'));
  await page.waitForFunction(()=>!atlas.cameraFlight);
  const system=await page.evaluate(()=>{
    const earth=catalog.solar.find(p=>p.id==='earth');
    const paths=atlas.content.getObjectByName('moon-orbits-earth');
    return {selected:atlas.selected.id,position:paths.position.toArray(),expected:earth.position,visible:paths.visible,otherVisible:atlas.content.getObjectByName('moon-orbits-jupiter').visible};
  });
  assert.equal(system.selected,'earth');assert.deepEqual(system.position,system.expected);assert.equal(system.visible,true);assert.equal(system.otherVisible,false);
  for(const [width,height] of [[1440,960],[390,844]]){
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>!atlas.cameraFlight);
    const positions=await page.evaluate(()=>['earth','moon'].map(id=>{
      const target=atlas.targets.find(hit=>hit.userData.object.id===id);
      return target.getWorldPosition(atlas.controls.target.clone()).project(atlas.camera).toArray();
    }));
    assert.ok(positions.every(([x,y,z])=>Math.abs(x)<.85&&Math.abs(y)<.8&&z>-1&&z<1),'Earth and Moon both fit the system view');
  }
  await page.screenshot({path:'test-results/moons-engine-earth-mobile.png'});
  await page.evaluate(()=>atlas.focusObject(solarMoons.find(m=>m.id==='moon')));
  await page.waitForFunction(()=>!atlas.cameraFlight);
  const focused=await page.evaluate(()=>({id:atlas.selected.id,target:atlas.controls.target.toArray(),position:atlas.selected.position,distance:atlas.camera.position.distanceTo(atlas.controls.target),size:atlas.selected.size}));
  assert.equal(await page.evaluate(()=>atlas.selectionRing.visible),false,'close lunar inspection clears the selection ring');
  assert.equal(await page.evaluate(()=>atlas.content.getObjectByName('moon-orbits-earth').visible),false,'close lunar inspection clears orbit guides');
  assert.equal(focused.id,'moon');assert.deepEqual(focused.target,focused.position);assert.ok(focused.distance>focused.size&&focused.distance<2);
  await page.evaluate(()=>{
    const hit=atlas.targets.find(target=>target.userData.object.id==='moon');
    const point=hit.getWorldPosition(atlas.controls.target.clone()).project(atlas.camera);
    const rect=atlas.canvas.getBoundingClientRect();
    atlas.pick({clientX:rect.left+(point.x+1)*rect.width/2,clientY:rect.top+(1-point.y)*rect.height/2},true);
  });
  assert.equal(await page.evaluate(()=>atlas.selected.id),'moon','a ray selects the Moon rather than its parent');
  await page.evaluate(()=>atlas.setLayer('grid',false));
  assert.equal(await page.evaluate(()=>atlas.content.getObjectByName('moon-orbits-earth').visible),false);
  await page.evaluate(()=>{atlas.setImmersive(true);atlas.setImmersive(false);});
  assert.equal(await page.evaluate(()=>atlas.content.getObjectByName('orbits').visible),false);
  await page.evaluate(()=>{atlas.setLayer('grid',true);atlas.focusMoonSystem('earth');});
  assert.equal(await page.evaluate(()=>atlas.content.getObjectByName('moon-orbits-earth').visible),true,'system view restores its orbit guides');
  await page.evaluate(()=>{atlas.focusObject(solarMoons.find(m=>m.id==='moon'));atlas.selectObject(catalog.solar[0]);atlas.setImmersive(true);atlas.setImmersive(false);});
  assert.equal(await page.evaluate(()=>atlas.selected.id),'sun','immersion does not restore a previously inspected moon after a different selection');
  assert.equal(await page.evaluate(()=>atlas.focusedPlanet),null);
  await page.evaluate(()=>atlas.setScale(1));
  await page.evaluate(()=>atlas.focusObject(solarMoons.find(m=>m.id==='titan')));
  await page.waitForFunction(()=>!atlas.cameraFlight);
  assert.deepEqual(await page.evaluate(()=>[atlas.index,atlas.selected.id]),[0,'titan']);
  assert.equal(await page.evaluate(()=>atlas.content.getObjectByName('moon-orbits-saturn').visible),false);
  const xr=await page.evaluate(()=>{
    const camera=atlas.camera.position.toArray(),calls=[];
    const original=atlas.xr.focusObject,originalRecenter=atlas.xr.recenter;let resetCount=0;
    atlas.xr.recenter=()=>{resetCount++;};
    atlas.renderer.xr.isPresenting=true;
    atlas.xr.focusObject=(object,extent)=>calls.push({id:object.id,extent});
    atlas.focusFromXR(solarMoons.find(m=>m.id==='moon'));
    atlas.focusMoonSystem('earth');
    atlas.resetView();
    const resetFocus=[atlas.focusedPlanet,atlas.focusedMoonSystem];
    atlas.renderer.xr.isPresenting=false;atlas.xr.focusObject=original;atlas.xr.recenter=originalRecenter;
    atlas.resize();
    return {calls,camera,after:atlas.camera.position.toArray(),resetCount,resetFocus,flightAfterReset:!!atlas.cameraFlight};
  });
  assert.deepEqual(xr.calls.map(call=>call.id),['moon','earth']);assert.ok(xr.calls[1].extent>xr.calls[0].extent);assert.deepEqual(xr.after,xr.camera,'VR focus transforms the atlas, not the viewer');
  assert.equal(xr.resetCount,1);assert.deepEqual(xr.resetFocus,[null,null]);assert.equal(xr.flightAfterReset,false,'leaving VR does not restore a reset moon-system focus');
  await page.evaluate(()=>atlas.dispose());
  assert.deepEqual(errors,[]);
  console.log('PASS: all moon meshes and lunar texture, host-centred orbits, mobile system framing, close inspection, picking, layer/immersion state, cross-scale selection and VR focus dispatch.');
} finally {await browser.close();}
