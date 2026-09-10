import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=process.env.TEST_URL || 'http://localhost:5174';
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('fonts.googleapis'))errors.push(m.text());});
 await page.goto(base,{waitUntil:'networkidle'});
 await expect(page.locator('#universe')).toBeVisible(); await expect(page.locator('.loading')).toBeHidden();
 await expect(page.locator('.webgl-error')).toHaveCount(0);
 await expect(page).toHaveTitle(/THER/);
 await page.locator('[data-action="rotate"]').click();
 await page.waitForTimeout(1600);
 await page.screenshot({path:'test-results/desktop.png'});
 for(let i=0;i<5;i++){
   await page.locator(`[data-scale="${i}"]`).click();
   await expect(page.locator(`[data-scale="${i}"]`)).toHaveAttribute('aria-pressed','true');
   await expect(page.locator('#scale-slider')).toHaveValue(String(i));
   await page.waitForTimeout(1750);
   await page.screenshot({path:`test-results/scale-${i}.png`});
 }
 await page.locator('[data-action="search"]').click();
 await page.locator('#search-input').fill('Andromeda');
 await expect(page.locator('.search-result')).toHaveCount(1);
 await page.locator('.search-result').click();
 await expect(page.locator('#modal')).not.toBeVisible();
 await expect(page.locator('#object-card h2')).toContainText('Andromeda');
 await expect(page.locator('[data-scale="3"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#object-card [data-action="focus"]').click();
 await page.waitForTimeout(1750);
 await page.locator('[data-action="settings"]').click();
 await page.locator('[data-quality="low"]').click();
 await expect(page.locator('[data-quality="low"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#modal [data-layer="labels"]').click();
 await expect(page.locator('#map-labels')).toBeHidden();
 await page.keyboard.press('Escape');
 await page.locator('[data-action="cinema"]').first().click();
 await expect(page.locator('.app-shell')).toHaveClass(/cinematic/);
 await page.keyboard.press('Escape');
 await expect(page.locator('.app-shell')).not.toHaveClass(/cinematic/);
 await page.locator('[data-action="sound"]').click();
 await expect(page.locator('[data-action="sound"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-action="sound"]').click();
 await page.locator('[data-action="tour"]').click();
 await expect(page.locator('[data-action="tour"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-action="tour"]').click();
 await page.locator('[data-action="vr"]').first().click();
 await expect(page.locator('#xr-status')).not.toBeEmpty();
 await expect(page.locator('[data-action="start-vr"]')).toBeDisabled();
 await page.keyboard.press('Escape');
 await page.keyboard.press('3');
 await expect(page.locator('[data-scale="2"]')).toHaveAttribute('aria-pressed','true');
 // Mobile remains usable with touch layout, modal object information, and search.
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(1800);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
 await page.screenshot({path:'test-results/mobile.png'});
 await page.locator('[data-action="object"]').click();
 await expect(page.locator('#modal')).toBeVisible();
 await page.keyboard.press('Escape');
 await page.locator('[data-scale="0"]').click();
 await expect(page.locator('[data-scale="0"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-action="search"]').click();
 await page.locator('#search-input').fill('Terra');
 await page.locator('.search-result').click();
 await page.locator('[data-action="object"]').click();
 await expect(page.locator('#modal-body h2')).toHaveText('Terra');
 await page.keyboard.press('Escape');
 await page.locator('[data-scale="0"]').click();
 await expect(page.locator('#object-card h2')).toHaveText('Terra');
 await page.locator('[data-action="search"]').click();
 await page.locator('#search-input').fill('Wolf 359');
 await expect(page.locator('.search-result')).toHaveCount(1);
 await page.locator('.search-result').click();
 await expect(page.locator('[data-scale="1"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-action="object"]').click();
 await expect(page.locator('#modal-body h2')).toHaveText('Wolf 359');
 await expect(page.locator('#modal-body')).toContainText('HYG');
 await page.keyboard.press('Escape');
 // Confirm the graphics context survived navigation and resizing.
 const pixels=await page.evaluate(()=>{const c=document.querySelector('canvas');const gl=c.getContext('webgl2');return {width:c.width,height:c.height,renderer:gl?.getParameter(gl.VERSION)};});
 assert.ok(pixels.width>0&&pixels.height>0&&pixels.renderer,'WebGL2 renderer available');
 assert.deepEqual(errors,[],'no runtime or rendering errors');
 console.log('PASS: five scales, search and focus, settings, layers, sound, tour, cinematic, VR capability fallback, mobile object cards, WebGL2.');
 console.log('Screenshots: test-results/desktop.png, mobile.png, scale-0.png ... scale-4.png');
} finally {await browser.close();}



