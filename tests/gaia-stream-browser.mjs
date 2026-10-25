import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
import { GAIA_DR3_HIPS,validateGaiaMetadata,parseGaiaTile } from '../src/gaia-hips.js';

const base=(process.env.TEST_URL||'http://localhost:5173').replace(/\/$/,''),engineBase=(process.env.ENGINE_TEST_URL||base).replace(/\/$/,'');
const out='test-results/gaia-stream';await mkdir(out,{recursive:true});
const service=GAIA_DR3_HIPS.baseUrl;
const properties=`creator_did = ivo://CDS/I/355/gaiadr3
dataproduct_type = catalog
hips_frame = equatorial
hips_tile_format = tsv
hips_cat_nrows = 1811709771
hips_order_min = 1
hips_order = 11
hips_service_url = ${service}
`;
const metadata='<VOTABLE><COOSYS system="ICRS" epoch="2016.0"/><RESOURCE><TABLE><FIELD name="Source" datatype="long"/>'+[['RAdeg','deg'],['DEdeg','deg'],['Gmag','mag'],['Plx','mas'],['e_Plx','mas'],['pmRA','mas/yr'],['pmDE','mas/yr']].map(([name,unit])=>`<FIELD name="${name}" datatype="double" unit="${unit}"/>`).join('')+'</TABLE></RESOURCE></VOTABLE>';
const columns=['Source','RAdeg','DEdeg','Gmag','Plx','e_Plx','pmRA','pmDE','RUWE','BP-RP','Dup','QSO?','Gal?','RAJ2000','DEJ2000'];
const tsv=[columns,['9007199254740993',266.4051,-28.936175,4.2,-2,.1,10000,5000,1.1,.8,0,0,0,265,-29],['9007199254740992',266.8051,-28.936175,5.2,10,.1,0,0,1.1,.3,0,0,0,266.8051,-28.936175],['9007199254740994',266.1051,-28.636175,6.2,30,.1,0,0,1.1,1.4,0,1,0,266.1051,-28.636175]].map(row=>row.join('\t')).join('\n');
validateGaiaMetadata(properties,metadata);assert.equal(parseGaiaTile(tsv).length,3);
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce',locale:'en-US'}),page=await context.newPage();
page.setDefaultTimeout(45000);const errors=[],checkpoints=[],requests=[],held=[];let mode='normal',uiTsv=null;
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&/THREE\.WebGL|GL_INVALID|Shader Error/i.test(message.text()))errors.push(message.text());});
const pass=label=>{assert.deepEqual(errors,[],label);checkpoints.push(label);console.log('PASS: '+label);};
await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:204,body:''}));
await context.route('https://fonts.gstatic.com/**',route=>route.fulfill({status:204,body:''}));
await context.addInitScript(()=>{if(!localStorage.getItem('aether.preferences'))localStorage.setItem('aether.preferences',JSON.stringify({quality:'low',autoRotate:false,particles:false,labels:false}));});
const ready=()=>expect(page.locator('.loading')).toBeHidden({timeout:90000});
const openUI=async()=>{await page.locator('[data-action="collections"]').first().click();await page.locator('#modal [data-action="gaia-stream"]').click();await expect(page.locator('.app-shell')).toHaveClass(/gaia-stream-view/);};
const tick=()=>page.evaluate(()=>{for(let i=0;i<5;i++)atlas.gaiaSkyView?.update(.12,atlas.camera,atlas.mapRoot);});
const render=()=>page.evaluate(()=>{atlas.elapsed+=2;atlas.content.userData.born=-3;atlas.setOpacity(atlas.content,1);atlas.scene.updateMatrixWorld(true);atlas.renderer.render(atlas.scene,atlas.camera);});
try{
  if(process.env.LIVE_GAIA==='1'){
    await page.goto(engineBase+'/tests/fixtures/engine.html',{waitUntil:'networkidle',timeout:90000});await page.waitForFunction(()=>window.atlas?.ready);await page.evaluate(()=>atlas.renderer.setAnimationLoop(null));
    const live=await page.evaluate(async service=>{
      const results=[];
      for(const path of ['properties','metadata.xml','Norder1/Dir0/Npix0.tsv']){
        const response=await fetch(service+'/'+path,{mode:'cors',credentials:'omit',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error('Live Gaia HTTP '+response.status);
        const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
        try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2*1024*1024){await reader.cancel();throw new Error('Live smoke byte budget exceeded');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
        results.push({path,status:response.status,type:response.type,bytes,text});
      }
      return results;
    },service);
    validateGaiaMetadata(live[0].text,live[1].text);const rows=parseGaiaTile(live[2].text);assert.ok(rows.length>0);assert.equal(typeof rows[0].sourceId,'string');
    await writeFile(out+'/live-cds.json',JSON.stringify({requests:live.map(({text,...rest})=>rest),sourceId:rows[0].sourceId,rows:rows.length},null,2));
    pass('Three bounded live CDS requests pass actual browser CORS and release/schema validation');
  }
  await context.route(service+'/**',async route=>{
    const url=route.request().url();requests.push(url);const headers={'access-control-allow-origin':'*'};
    if(url.endsWith('/properties'))return route.fulfill({status:200,headers,contentType:'text/plain',body:properties});
    if(url.endsWith('/metadata.xml'))return route.fulfill({status:200,headers,contentType:'application/xml',body:mode==='error'?metadata.replace('epoch="2016.0"','epoch="2015.0"'):metadata});
    if(mode==='hold'){held.push(route);return;}
    return route.fulfill({status:200,headers,contentType:'text/tab-separated-values',body:uiTsv||tsv});
  });
  if(process.env.GAIA_UI_ONLY!=='1'){
    await page.goto(engineBase+'/tests/fixtures/engine.html',{waitUntil:'networkidle',timeout:90000});await page.waitForFunction(()=>window.atlas?.ready&&atlas.showGaiaSky);
    await page.evaluate(async()=>{atlas.renderer.setAnimationLoop(null);await atlas.showGaiaSky();});await tick();
    await page.waitForFunction(()=>atlas.gaiaSkyView?.diagnostics.renderedSources===3&&!atlas.gaiaSkyView.diagnostics.loading);await render();
    const state=await page.evaluate(()=>({diagnostics:atlas.gaiaSkyView.diagnostics,count:atlas.targets[0].geometry.drawRange.count,capacity:atlas.targets[0].geometry.attributes.position.count,targets:atlas.targets.length,index:atlas.index,workerUrl:atlas.gaiaSkyView.group.name}));
    assert.equal(state.index,8);assert.equal(state.count,3);assert.equal(state.targets,1);assert.ok(state.capacity<=12000);assert.equal(state.diagnostics.metadataValidated,true);assert.ok(state.diagnostics.cacheBytes<=24*1024*1024);
    await page.locator('canvas').click({position:{x:640,y:450}});
    const selected=await page.evaluate(()=>({id:atlas.selected.id,source:atlas.selected.gaiaSourceId,ra:atlas.selected.raDeg,epoch:atlas.selected.positionEpoch,parallax:atlas.selected.parallaxMas,distance:atlas.selected.distanceLy,native:atlas.selected.gaiaData.sourceId}));
    assert.equal(selected.source,'9007199254740993');assert.equal(selected.native,selected.source);assert.equal(selected.epoch,2016);assert.equal(selected.ra,266.4051);assert.equal(selected.parallax,-2);assert.equal(selected.distance,null);
    await page.screenshot({path:out+'/streamed-engine.png'});pass('Real worker tiles become one GPU batch and real canvas selection retains the exact native Gaia record');
    const initialRequests=new Set(requests),initialOrder=await page.evaluate(()=>atlas.gaiaSkyView.diagnostics.order);
    await page.evaluate(()=>{atlas.camera.fov=.03;atlas.camera.updateProjectionMatrix();});await tick();
    await page.waitForFunction(initialOrder=>atlas.gaiaSkyView.diagnostics.order>initialOrder&&atlas.gaiaSkyView.diagnostics.renderedSources===1&&!atlas.gaiaSkyView.diagnostics.loading,initialOrder);
    assert.ok(requests.some(url=>!initialRequests.has(url)&&/Norder/.test(url)));assert.ok(await page.evaluate(()=>atlas.gaiaSkyView.diagnostics.renderedSources<=atlas.gaiaSkyView.diagnostics.maxSources));
    const fineRequests=new Set(requests);
    await page.evaluate(async()=>{const {equatorialVector}=await import('/src/sky-math.js');atlas.camera.lookAt(atlas.camera.position.clone().fromArray(equatorialVector(90,5)));});await tick();
    await page.waitForFunction(()=>atlas.gaiaSkyView.diagnostics.lastCone.raDeg>89&&atlas.gaiaSkyView.diagnostics.lastCone.raDeg<91&&!atlas.gaiaSkyView.diagnostics.loading);
    assert.ok(requests.some(url=>!fineRequests.has(url)&&/Norder/.test(url)));pass('Fine zoom and rotation request new bounded sky tiles, preserving high-proper-motion sources at their native epoch');
    await page.evaluate(()=>atlas.setScale(1));mode='hold';await page.evaluate(()=>atlas.showGaiaSky());await tick();await expect.poll(()=>held.length).toBeGreaterThan(0);
    await page.evaluate(()=>atlas.setScale(1));mode='normal';for(const route of held.splice(0)){await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:tsv}).catch(()=>{});}
    await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>atlas.index),1);assert.equal(await page.evaluate(()=>atlas.gaiaSkyView),null);pass('Leaving while tile downloads are pending terminates the stream and cannot reopen the departed view');
    mode='error';await page.evaluate(()=>atlas.showGaiaSky());await tick();await page.waitForFunction(()=>Boolean(atlas.gaiaSkyView?.diagnostics.error));
    mode='normal';await page.evaluate(()=>atlas.retryGaiaStream());await page.waitForFunction(()=>atlas.gaiaSkyView.diagnostics.renderedSources===3&&!atlas.gaiaSkyView.diagnostics.error&&!atlas.gaiaSkyView.diagnostics.loading);pass('Invalid remote astrometry metadata is rejected and an explicit retry recovers the real worker');
    await page.evaluate(()=>atlas.dispose());
  }
  mode='error';await page.goto(base,{waitUntil:'networkidle',timeout:90000});await ready();
  // UI entry follows the actual atlas bearing; the engine fixture above still
  // verifies the explicit default Galactic-centre entry and native epoch data.
  await page.evaluate(async()=>{
    const {Universe}=await import('/src/universe.js'),capture=Universe.prototype.captureAtlasView;
    Universe.prototype.captureAtlasView=function(){window.testGaiaEntry=this.directionToGaia().toArray();return capture.call(this);};
  });
  await openUI();
  const uiDirection=await page.evaluate(()=>window.testGaiaEntry),uiRa=(Math.atan2(-uiDirection[2],uiDirection[0])*180/Math.PI+360)%360,uiDec=Math.asin(uiDirection[1])*180/Math.PI;
  uiTsv=tsv.split('\n').map((line,index)=>{if(!index)return line;const fields=line.split('\t');fields[1]=String(uiRa+Number(fields[1])-266.4051);fields[2]=String(uiDec+Number(fields[2])+28.936175);return fields.join('\t');}).join('\n');
  await expect(page.locator('#gaia-stream-retry')).toBeVisible();await expect(page.locator('#gaia-stream-status')).toContainText('could not be loaded');
  mode='normal';await page.locator('#gaia-stream-retry').click();
  await expect(page.locator('#gaia-stream-status')).toContainText('3 sources currently loaded.');await expect(page.locator('#gaia-stream-retry')).toBeHidden();
  await expect(page.locator('.coordinates')).toContainText('2016');
  await page.locator('#universe').click({position:{x:640,y:450}});await expect(page.locator('#object-card')).toContainText('9007199254740993');
  await page.locator('#object-card [data-action="object"]').click();await expect(page.locator('#modal-body')).toContainText('9007199254740993');await expect(page.locator('#modal-body')).toContainText('2016');
  await page.locator('#modal [data-action="close"]').click();await page.screenshot({path:out+'/streamed-ui.png'});pass('The normal UI recovers through its retry button, selects native-epoch Gaia details and discloses its current working set');
  await page.locator('[data-action="settings"]').first().click();await Promise.all([page.waitForEvent('load'),page.locator('#language-setting').selectOption('it')]);await ready();
  await expect(page.locator('.app-shell')).toHaveClass(/gaia-stream-view/);await expect(page.locator('#gaia-stream-status')).toContainText('sorgenti attualmente caricate');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const overlaps=await page.evaluate(()=>{
    const text=document.querySelector('#gaia-stream-status').firstChild,range=document.createRange();range.selectNodeContents(text);
    const lines=Array.from(range.getClientRects()),buttons=Array.from(document.querySelectorAll('.view-controls button')).filter(button=>button.getClientRects().length).map(button=>button.getBoundingClientRect());
    return lines.some(line=>buttons.some(button=>line.left<button.right&&line.right>button.left&&line.top<button.bottom&&line.bottom>button.top));
  });assert.equal(overlaps,false,'Gaia status text must not overlap floating controls');
  await page.screenshot({path:out+'/streamed-it-mobile.png'});
  pass('An explicit Italian language change restores the streamed survey and remains usable on a narrow screen');
  await writeFile(out+(process.env.GAIA_UI_ONLY==='1'?'/report-ui.json':'/report.json'),JSON.stringify({checkpoints,requests:requests.length,uniqueTiles:new Set(requests.filter(url=>/Norder/.test(url))).size,errors},null,2));
}catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();}
