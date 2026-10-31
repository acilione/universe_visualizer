import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];let release;
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
 await context.route('https://fonts.gstatic.com/**',r=>r.fulfill({status:204,body:''}));
 await context.route('**/src/main.js*',async r=>{const response=await r.fetch();await r.fulfill({response,body:await response.text()+'\nObject.defineProperty(window,"testAtlas",{get:()=>universe});'});});
 const gate=new Promise(resolve=>{release=resolve;});
 await context.route('**/catalog/nasa-hipparcos.json',async r=>{await gate;await r.continue();});
 await context.addInitScript(()=>localStorage.setItem('aether.preferences',JSON.stringify({quality:'low',autoRotate:false})));
 const page=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_URL||'http://localhost:5173',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.loading')).toBeHidden({timeout:90000});
 await page.waitForFunction(()=>window.testAtlas?.ready);
 // A real drag and wheel input before the catalogue arrives used to cancel it.
 await page.mouse.move(760,460);await page.mouse.down();await page.mouse.move(850,500,{steps:8});await page.mouse.up();await page.mouse.wheel(0,-120);
 await expect(page.locator('#renderer-status')).toHaveText('LOADING COMBINED MAP');
 await page.locator('[data-action="zoom-out"]').click();
 await expect(page.locator('#renderer-status')).toHaveText('LOADING COMBINED MAP');
 await page.evaluate(()=>{
  const original=testAtlas.buildCombinedMap.bind(testAtlas);
  const pose=()=>({position:testAtlas.camera.position.toArray(),quaternion:testAtlas.camera.quaternion.toArray(),target:testAtlas.controls.target.toArray(),fov:testAtlas.camera.fov});
  testAtlas.buildCombinedMap=(...args)=>{window.poseBefore=pose();const result=original(...args);window.poseAfter=pose();return result;};
 });
 release();
 await page.waitForFunction(()=>testAtlas.index===9&&!testAtlas.combinedView.loading);
 assert.deepEqual(await page.evaluate(()=>poseAfter),await page.evaluate(()=>poseBefore),'Adding the sky must preserve the camera the user adjusted');
 const counts=await page.evaluate(()=>testAtlas.viewContext);
 assert.equal(counts.renderedStarCount,counts.catalogStarCount);assert.ok(counts.renderedStarCount>118000);
 // Test actual GPU pixels, not just CPU catalogue sizes or draw-range counts.
 const pixels=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const u=testAtlas,cloud=u.combinedView.group.getObjectByName('combined-star-points');
  u.scene.updateMatrixWorld(true);
  const scene=new THREE.Scene(),copy=cloud.clone();copy.matrixAutoUpdate=false;copy.matrix.copy(cloud.matrixWorld);scene.add(copy);
  const target=new THREE.WebGLRenderTarget(256,256),camera=u.camera.clone();camera.aspect=1;camera.updateProjectionMatrix();
  const saved=u.renderer.getRenderTarget(),color=u.renderer.getClearColor(new THREE.Color()),alpha=u.renderer.getClearAlpha();
  const data=new Uint8Array(256*256*4);
  try{u.renderer.setRenderTarget(target);u.renderer.setClearColor(0,1);u.renderer.render(scene,camera);u.renderer.readRenderTargetPixels(target,0,0,256,256,data);}
  finally{u.renderer.setRenderTarget(saved);u.renderer.setClearColor(color,alpha);target.dispose();}
  let lit=0;for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>12)lit++;
  return lit;
 });
 assert.ok(pixels>500,`The star cloud must produce visible pixels; received ${pixels}`);
 assert.deepEqual(errors,[]);
 console.log(`PASS: dragging, scrolling and zoom controls preserve progressive startup and camera pose; ${counts.renderedStarCount} stars produce ${pixels} visible GPU pixels`);
}finally{release?.();await browser.close();}
