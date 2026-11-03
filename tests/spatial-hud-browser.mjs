import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.ENGINE_TEST_URL || process.env.TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, args: [
  '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
] });
const errors = [];
const frames = (page, count = 12) => page.evaluate(count => new Promise(resolve => {
  const step = () => --count > 0 ? requestAnimationFrame(step) : resolve();
  requestAnimationFrame(step);
}), count);
const pose = page => page.evaluate(() => ({
  camera: atlas.camera.position.toArray(), quaternion: atlas.camera.quaternion.toArray(),
  root: atlas.mapRoot.matrixWorld.toArray(), target: atlas.controls.target.toArray(),
}));
const watchErrors = page => page.on('pageerror', error => errors.push(error.message));
let releaseCatalogue;

try {
  await mkdir('test-results/spatial-hud', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(60000); watchErrors(page);
  await page.goto(`${base}/tests/fixtures/engine.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.atlas?.ready && atlas.hud);
  await page.evaluate(() => {
    atlas.setQuality('low'); atlas.setAutoRotate(false);
    atlas.focusObject(catalog.solar.find(object => object.id === 'earth'));
  });
  await page.waitForFunction(() => !atlas.cameraFlight);
  await page.mouse.move(640, 400);
  await page.waitForFunction(() => atlas.hud.object?.id === 'earth' && atlas.hud.group.visible);
  await page.evaluate(() => atlas.selectObject(catalog.solar.find(object => object.id === 'sun')));
  const beforeHover = await pose(page);
  const stable = await page.evaluate(() => ({
    version: atlas.hud.texture.version, paints: atlas.hud.diagnostics.paints,
    picks: atlas.hud.diagnostics.picks, at: performance.now(),
  }));
  await frames(page, 40);
  const afterHover = await pose(page);
  const after = await page.evaluate(() => ({
    version: atlas.hud.texture.version, paints: atlas.hud.diagnostics.paints,
    picks: atlas.hud.diagnostics.picks, at: performance.now(),
    target: atlas.hud.object?.id, selected: atlas.selected.id,
    parentIsScene: atlas.hud.group.parent === atlas.scene,
    hudIsTarget: atlas.spatialTargets().some(target => {
      for (let node = target; node; node = node.parent) if (node === atlas.hud.group) return true;
      return false;
    }),
  }));
  assert.equal(after.target, 'earth', 'HUD follows the body under the pointer, not the selected object');
  assert.equal(after.selected, 'sun', 'Inspection must not select or navigate');
  assert.deepEqual(afterHover, beforeHover, 'Passive inspection must preserve camera and map pose');
  assert.equal(after.version, stable.version, 'Stationary targets do not upload the same text every frame');
  assert.equal(after.paints, stable.paints);
  assert.ok(after.picks - stable.picks <= Math.ceil((after.at - stable.at) / 100) + 2,
    'Target checks are throttled to at most ten per second');
  assert.equal(after.parentIsScene, true, 'HUD has a fixed viewer scale independent of the atlas root');
  assert.equal(after.hudIsTarget, false, 'HUD must not intercept planet clicks or hand rays');

  await page.evaluate(() => atlas.setImmersive(true));
  await expect(page.locator('.labels')).toBeHidden();
  await page.waitForFunction(() => atlas.hud.object?.id === 'earth' && atlas.hud.group.visible);
  assert.match(await page.evaluate(() => atlas.hud.info.name), /Earth/i);
  const pixels = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const target = new THREE.WebGLRenderTarget(512, 320);
    const renderer = atlas.renderer, previous = renderer.getRenderTarget();
    const withHud = new Uint8Array(512 * 320 * 4), withoutHud = new Uint8Array(withHud.length);
    const visible = atlas.hud.group.visible;
    try {
      renderer.setRenderTarget(target); atlas.hud.group.visible = true;
      renderer.render(atlas.scene, atlas.camera); renderer.readRenderTargetPixels(target, 0, 0, 512, 320, withHud);
      atlas.hud.group.visible = false;
      renderer.render(atlas.scene, atlas.camera); renderer.readRenderTargetPixels(target, 0, 0, 512, 320, withoutHud);
    } finally {
      atlas.hud.group.visible = visible; renderer.setRenderTarget(previous); target.dispose();
    }
    let changed = 0;
    for (let i = 0; i < withHud.length; i += 4) {
      if (Math.abs(withHud[i] - withoutHud[i]) + Math.abs(withHud[i + 1] - withoutHud[i + 1])
        + Math.abs(withHud[i + 2] - withoutHud[i + 2]) > 12) changed++;
    }
    return changed;
  });
  assert.ok(pixels > 150, `Immersive HUD must produce real WebGL pixels; received ${pixels}`);
  await page.screenshot({ path: 'test-results/spatial-hud/earth-immersive.png' });
  const panelScale = await page.evaluate(() => atlas.hud.panel.scale.toArray());
  const cameraDistance = await page.evaluate(() => atlas.camera.position.distanceTo(atlas.controls.target));
  await page.mouse.wheel(0, -70);
  await frames(page, 35);
  assert.notEqual(await page.evaluate(() => atlas.camera.position.distanceTo(atlas.controls.target)), cameraDistance,
    'Wheel input still reaches map navigation while the HUD is visible');
  assert.deepEqual(await page.evaluate(() => atlas.hud.panel.scale.toArray()), panelScale,
    'Map zoom does not resize the information panel');

  // The indexed combined map must not retain a body after its category is hidden.
  await page.evaluate(async () => {
    atlas.buildCombinedMap({ stars: [], nebulae: [], byId: new Map() });
    await atlas.combinedView.ready;
    atlas.focusObject(atlas.combinedView.getObject('earth'));
  });
  await page.waitForFunction(() => !atlas.cameraFlight);
  await page.mouse.move(640, 400);
  await page.waitForFunction(() => atlas.hud.object?.id === 'earth');
  await page.evaluate(() => atlas.setObjectLayer('planets', false));
  await page.waitForFunction(() => atlas.hud.object?.id !== 'earth');
  await page.evaluate(() => atlas.setObjectLayer('planets', true));
  await page.waitForFunction(() => atlas.hud.object?.id === 'earth');

  // First-person preview uses gaze even with the mouse parked at a screen edge.
  await page.evaluate(() => {
    atlas.enterPreview({ layout: 'room', directTravel: true });
    atlas.travelToObject(atlas.combinedView.getObject('earth'));
  });
  await page.mouse.move(12, 12);
  await page.waitForFunction(() => atlas.preview.isActive && !atlas.preview.isTransitioning
    && atlas.hud.object?.id === 'earth' && atlas.hud.group.visible);
  await page.screenshot({ path: 'test-results/spatial-hud/earth-preview.png' });
  await page.evaluate(() => atlas.exitPreview());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => atlas.focusObject(atlas.combinedView.getObject('earth')));
  await page.waitForFunction(() => !atlas.cameraFlight);
  await page.mouse.move(195, 422);
  await page.waitForFunction(() => atlas.hud.object?.id === 'earth' && atlas.hud.panel.visible);
  const corners = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const panel = atlas.hud.panel;
    panel.geometry.computeBoundingBox(); panel.updateWorldMatrix(true, false);
    const box = panel.geometry.boundingBox;
    return [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].map(y =>
      new THREE.Vector3(x, y, 0).applyMatrix4(panel.matrixWorld).project(atlas.camera).toArray()));
  });
  assert.ok(corners.every(point => point.every(Number.isFinite) && Math.abs(point[0]) <= 1.01 && Math.abs(point[1]) <= 1.01),
    'The complete HUD panel must remain inside a narrow phone viewport');
  await page.screenshot({ path: 'test-results/spatial-hud/earth-mobile.png' });
  await page.evaluate(() => atlas.setScale(2));
  await page.waitForFunction(() => atlas.hud.object?.id !== 'earth');
  await page.evaluate(() => atlas.setHudEnabled(false));
  assert.equal(await page.evaluate(() => atlas.hud.enabled || atlas.hud.group.visible), false);
  const disabledPicks = await page.evaluate(() => atlas.hud.diagnostics.picks);
  await frames(page, 18);
  assert.equal(await page.evaluate(() => atlas.hud.diagnostics.picks), disabledPicks, 'Disabled HUD performs no picking');

  const disposed = await page.evaluate(() => {
    const hud = atlas.hud, result = { texture: 0, geometry: 0, material: 0 };
    hud.texture.addEventListener('dispose', () => result.texture++);
    hud.panel.geometry.addEventListener('dispose', () => result.geometry++);
    hud.panel.material.addEventListener('dispose', () => result.material++);
    atlas.dispose();
    return { ...result, detached: hud.group.parent === null };
  });
  assert.deepEqual(disposed, { texture: 1, geometry: 1, material: 1, detached: true });
  await page.close();
  console.log(`PASS: scene HUD renders ${pixels} changed pixels in immersive mode, follows gaze without selecting, respects layers, preserves zoom, throttles picking, avoids repeated uploads, and disposes resources`);

  // Preference and shortcut checks against the actual application UI. Keep the
  // unrelated large catalogue request pending so this is an input regression.
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 204, body: '' }));
  await context.route('**/src/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nObject.defineProperty(window,"testAtlas",{get:()=>universe});' });
  });
  const gate = new Promise(resolve => { releaseCatalogue = resolve; });
  await context.route('**/catalog/nasa-hipparcos.json', async route => { await gate; await route.abort().catch(() => {}); });
  await context.addInitScript(() => {
    if (!localStorage.getItem('aether.preferences')) localStorage.setItem('aether.preferences', JSON.stringify({ quality: 'low', autoRotate: false }));
  });
  const app = await context.newPage(); app.setDefaultTimeout(60000); watchErrors(app);
  await app.goto(base, { waitUntil: 'domcontentloaded' });
  await expect(app.locator('.loading')).toBeHidden();
  await app.waitForFunction(() => window.testAtlas?.hud);
  assert.equal(await app.evaluate(() => testAtlas.hud.enabled), true);
  await app.locator('#universe').focus(); await app.keyboard.press('h');
  assert.equal(await app.evaluate(() => testAtlas.hud.enabled), false);
  assert.equal(await app.evaluate(() => JSON.parse(localStorage.getItem('aether.preferences')).spatialHud), false);
  await app.reload({ waitUntil: 'domcontentloaded' });
  await expect(app.locator('.loading')).toBeHidden();
  await app.waitForFunction(() => window.testAtlas?.hud);
  assert.equal(await app.evaluate(() => testAtlas.hud.enabled), false, 'Explicit HUD preference survives reload');
  await app.locator('[data-action="settings"]').click();
  await expect(app.locator('[data-action="toggle-hud"]')).toHaveAttribute('aria-checked', 'false');
  await app.locator('[data-action="toggle-hud"]').click();
  await expect(app.locator('[data-action="toggle-hud"]')).toHaveAttribute('aria-checked', 'true');
  assert.equal(await app.evaluate(() => testAtlas.hud.enabled), true);
  await app.keyboard.press('Escape');
  await app.locator('[data-action="cinema"]').first().click();
  await expect(app.locator('.app-shell')).toHaveClass(/cinematic/);
  await app.keyboard.press('h');
  assert.equal(await app.evaluate(() => testAtlas.hud.enabled), false, 'HUD shortcut works with standard panels hidden');
  await context.close();
  assert.deepEqual(errors, []);
  console.log('PASS: HUD is enabled by default; H, settings, immersive mode and saved visibility preference work');
} finally {
  releaseCatalogue?.();
  await browser.close();
}
