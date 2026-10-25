import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base=process.env.TEST_URL||'http://localhost:5173';
await mkdir('test-results/desktop-startup',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
async function createPage(){
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce',locale:'it-IT'});
  page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{if(!localStorage.getItem('aether.preferences'))localStorage.setItem('aether.preferences',JSON.stringify({quality:'low',autoRotate:false}));});
  return page;
}
const ready=page=>expect(page.locator('.loading')).toBeHidden({timeout:90000});
const combined=page=>expect(page.locator('.app-shell')).toHaveClass(/combined-view/,{timeout:90000});
try{
  const page=await createPage(),requests=[];
  page.on('request',request=>{if(/\/catalog\/nasa-[^/]+\.json$/.test(request.url()))requests.push(request.url());});
  await page.goto(base,{waitUntil:'networkidle',timeout:90000});await ready(page);await combined(page);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('#modal')).not.toBeVisible();
  for(const name of ['planets','stars','nebulae'])await expect(page.locator(`#combined-desktop-layers [data-object-layer="${name}"]`)).toHaveAttribute('aria-pressed','true');
  assert.equal(requests.length,3,'Each of the three local NASA catalogues is requested once at startup');
  await page.locator('[data-action="vr"]').first().click();
  await expect(page.locator('[data-action="start-preview"]')).toBeEnabled();
  assert.equal(requests.length,3,'Opening immersive modes reuses the already loaded combined catalogue');
  await page.locator('[data-action="close"]').click();
  await page.screenshot({path:'test-results/desktop-startup/combined-default.png'});
  console.log('PASS: Normal desktop starts with every combined category, English and no dialog; immersive entry reuses catalogue data');

  await page.locator('#combined-desktop-layers [data-object-layer="nebulae"]').click();
  await page.reload({waitUntil:'networkidle'});await ready(page);await combined(page);
  await expect(page.locator('#combined-desktop-layers [data-object-layer="nebulae"]')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#combined-desktop-layers [data-object-layer="planets"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-action="cosmic-scales"]').click();
  await page.locator('[data-scale="2"]').click();
  await expect(page.locator('#scale-title')).toContainText('Milky Way');
  await page.locator('[data-action="settings"]').first().click();
  await Promise.all([page.waitForEvent('load'),page.locator('#language-setting').selectOption('it')]);await ready(page);
  await expect(page.locator('#scale-title')).toContainText('Via Lattea');
  await expect(page.locator('.app-shell')).not.toHaveClass(/combined-view/);
  await page.locator('a.brand').click();await combined(page);
  await expect(page.locator('#combined-desktop-layers [data-object-layer="nebulae"]')).toHaveAttribute('aria-pressed','false');
  await page.setViewportSize({width:380,height:844});
  await expect(page.locator('#combined-desktop-layers')).toBeInViewport();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('PASS: Layer preferences and explicit language-switch views are preserved; atlas title returns to combined view on desktop/mobile');
  await page.close();

  const delayed=await createPage();let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await delayed.route('**/catalog/nasa-hipparcos.json',async route=>{await gate;await route.continue();});
  await delayed.goto(base,{waitUntil:'domcontentloaded',timeout:90000});await ready(delayed);
  await expect(delayed.locator('#renderer-status')).toHaveText('LOADING COMBINED MAP');
  await delayed.locator('[data-scale="2"]').click();
  await expect(delayed.locator('#scale-title')).toContainText('Milky Way');
  release();
  await delayed.waitForFunction(()=>document.querySelector('#combined-preview-status')?.hidden===true,null,{timeout:90000});
  await expect(delayed.locator('#scale-title')).toContainText('Milky Way');
  await expect(delayed.locator('.app-shell')).not.toHaveClass(/combined-view/);
  console.log('PASS: A delayed initial catalogue cannot replace a reference view the user selected while loading');
  await delayed.close();

  const unavailable=await createPage();
  await unavailable.route('**/catalog/nasa-hipparcos.json',route=>route.fulfill({status:503,contentType:'text/plain',body:'Catalogue unavailable in test'}));
  await unavailable.goto(base,{waitUntil:'networkidle',timeout:90000});await ready(unavailable);
  await expect(unavailable.locator('#scale-title')).toContainText('Solar System');
  await expect(unavailable.locator('.toast')).toContainText('The Solar System remains available');
  await expect(unavailable.locator('#modal')).not.toBeVisible();
  await unavailable.unroute('**/catalog/nasa-hipparcos.json');
  await unavailable.locator('a.brand').click();await combined(unavailable);
  console.log('PASS: Failed combined loading preserves the usable Solar System and can be retried from the atlas title');
  await unavailable.close();
  assert.deepEqual(errors,[],'No unhandled browser errors');
}finally{await browser.close();}
