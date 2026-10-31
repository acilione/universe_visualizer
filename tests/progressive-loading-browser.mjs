import {chromium,expect as playwrightExpect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const expect=playwrightExpect.configure({timeout:90000});
const base=process.env.TEST_URL||'http://localhost:5173';
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],workers=[];let release,page;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
 await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:204,body:''}));
 await context.route('https://fonts.gstatic.com/**',r=>r.fulfill({status:204,body:''}));
 await context.route('**/src/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nObject.defineProperty(window,"testAtlas",{get:()=>universe});\n'});});
 const gate=new Promise(resolve=>{release=resolve;});
 await context.route('**/catalog/nasa-hipparcos.json',async route=>{await gate;await route.continue();});
 await context.addInitScript(()=>{
  localStorage.setItem('aether.preferences',JSON.stringify({quality:'low',autoRotate:false,particles:false}));
  window.longTasks=[];new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true});
 });
 page=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',error=>errors.push(error.message));page.on('worker',worker=>workers.push(worker.url()));
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});await expect(page.locator('.loading')).toBeHidden();
 await page.waitForFunction(()=>window.testAtlas?.ready);
 assert.equal(await page.evaluate(()=>testAtlas.index),0);
 await page.locator('[data-action="settings"]').click();await expect(page.locator('#language-setting')).toBeVisible();await page.keyboard.press('Escape');
 assert.ok(workers.some(url=>url.includes('celestial-catalog-worker')));
 await page.evaluate(()=>{
  window.partial=[];window.skyFrames=0;window.toggledDuringLoading=false;let queued=false;
  const original=testAtlas.onCatalogueProgress;
  testAtlas.onCatalogueProgress=progress=>{
   original(progress);
   if(progress?.loading){partial.push(progress.stars);if(progress.stars>0&&!queued){queued=true;
    requestAnimationFrame(function frame(){skyFrames++;if(testAtlas.combinedView.loading)requestAnimationFrame(frame);});
    setTimeout(()=>{toggledDuringLoading=testAtlas.combinedView.loading;document.querySelector('#combined-desktop-layers [data-object-layer="stars"]').click();},0);
   }}
  };
 });
 release();
 await page.waitForFunction(()=>testAtlas.index===9&&testAtlas.combinedView.loading);
 assert.equal(await page.evaluate(()=>testAtlas.environment.diagnostics.starCount),0,'Inactive VR must not duplicate the stellar geometry');
 await page.waitForFunction(()=>testAtlas.index===9&&!testAtlas.combinedView.loading);
 const partial=await page.evaluate(()=>window.partial);
 assert.equal(await page.evaluate(()=>toggledDuringLoading),true,'UI events must run before all geometry is ready');
 await expect(page.locator('#combined-desktop-layers [data-object-layer="stars"]')).toHaveAttribute('aria-pressed','false');
 const complete=await page.evaluate(()=>({context:testAtlas.viewContext,objects:testAtlas.objects.length,frames:skyFrames,clouds:testAtlas.combinedView.group.getObjectsByProperty('name','combined-star-points').length}));
 assert.equal(complete.context.renderedStarCount,complete.context.catalogStarCount);assert.ok(complete.context.renderedStarCount>118000);
 assert.equal(complete.context.nebulaCount,complete.context.catalogNebulaCount);assert.ok(complete.context.nebulaCount>=485);
 assert.ok(partial.some(count=>count>0&&count<complete.context.catalogStarCount));assert.ok(complete.frames>5);assert.equal(complete.clouds,1);
 await page.locator('#combined-desktop-layers [data-object-layer="stars"]').click();
 await expect(page.locator('#renderer-status')).toHaveText('3D RENDERER ACTIVE');
 console.log('PASS: phone-sized UI remains interactive while a real worker loads data and the complete sky appears in bounded batches');
 await page.evaluate(()=>{testAtlas.buildCombinedMap(testAtlas.catalogueData);testAtlas.setScale(2);});
 await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>testAtlas.index),2);
 assert.equal(await page.evaluate(()=>testAtlas.combinedView.loading),false);
 console.log('PASS: navigation cancels pending geometry without restoring the old map');
 await page.evaluate(async()=>{await testAtlas.showCombinedMap();testAtlas.enterPreview({layout:'room'});testAtlas.environment.configure({active:true,skyVisible:true});window.environmentPose=testAtlas.camera.position.toArray();await testAtlas.environment.ready;});
 assert.equal(await page.evaluate(()=>testAtlas.environment.diagnostics.starCount),complete.context.catalogStarCount);
 assert.deepEqual(await page.evaluate(()=>testAtlas.camera.position.toArray()),await page.evaluate(()=>environmentPose));
 await page.evaluate(()=>testAtlas.exitPreview());
 assert.deepEqual(errors,[]);console.log('PASS: immersive background loads only when needed and keeps the viewer stationary');
 await mkdir('test-results/progressive-loading',{recursive:true});
 await writeFile('test-results/progressive-loading/report.json',JSON.stringify({workers,partial,complete,errors,longTasks:await page.evaluate(()=>longTasks)},null,2));
}catch(error){
 console.error('Loading diagnostics:',await page?.evaluate(()=>({errors:[],index:window.testAtlas?.index,context:window.testAtlas?.viewContext,partial:window.partial?.slice(-8),frames:window.skyFrames,visibility:document.visibilityState,status:document.querySelector('#renderer-status')?.textContent})).catch(()=>null));
 console.error('Browser errors:',errors);throw error;
}finally{release?.();await browser.close();}
