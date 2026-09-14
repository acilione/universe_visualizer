import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://localhost:5173';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], checkpoints = [];
let page;
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', locale: 'it-IT' });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text()); });
  await page.addInitScript(() => {
    window.__xrRequests = [];
    const rejectHeadset = new URL(location.href).searchParams.has('xr-denied');
    Object.defineProperty(navigator, 'xr', { configurable: true, value: rejectHeadset ? {
      isSessionSupported: async mode => mode === 'immersive-ar' || mode === 'immersive-vr',
      requestSession: async (mode, options) => {
        window.__xrRequests.push({ mode, options });
        throw new DOMException('Denied by test', 'NotAllowedError');
      },
      addEventListener() {}, removeEventListener() {},
    } : undefined });
    localStorage.setItem('aether.preferences', JSON.stringify({ quality: 'low', autoRotate: false }));
  });
  async function checkpoint(label) {
    assert.deepEqual(errors, [], label + ': no runtime errors');
    checkpoints.push(label);
    console.log('PASS: ' + label);
  }
  async function ready() {
    await expect(page.locator('.loading')).toBeHidden({ timeout: 60000 });
    await expect(page.locator('.webgl-error')).toHaveCount(0);
  }
  async function openImmersive() {
    await page.locator('[data-action="vr"]').first().click();
    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('[data-action="start-preview"]')).toBeEnabled();
  }
  async function enterPreview() {
    await page.locator('[data-action="start-preview"]').click();
    await expect(page.locator('#modal')).not.toBeVisible();
    await expect(page.locator('.app-shell')).toHaveClass(/preview-active/);
    await expect(page.locator('#preview-hud')).toBeVisible();
  }
  async function exitPreview() {
    await page.locator('[data-action="exit-preview"]').click();
    await expect(page.locator('.app-shell')).not.toHaveClass(/preview-active/);
    await expect(page.locator('#preview-hud')).not.toBeVisible();
    await expect(page.locator('.topbar')).toBeVisible();
  }

  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await ready();
  assert.equal(await page.evaluate(() => navigator.xr), undefined);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await openImmersive();
  await expect(page.locator('[data-action="start-vr"]')).toBeDisabled();
  await expect(page.locator('[data-action="start-mr"]')).toBeDisabled();
  await page.screenshot({ path: 'test-results/immersive-chooser-desktop.png' });
  await enterPreview();
  await expect(page.locator('#preview-layout')).toHaveValue('room');
  await expect(page.locator('.left-panel')).not.toBeVisible();
  await expect(page.locator('.right-panel')).not.toBeVisible();
  await page.screenshot({ path: 'test-results/immersive-room-desktop.png' });
  await checkpoint('PC preview is available without WebXR; unsupported headset modes remain disabled');

  await page.locator('[data-action="preview-search"]').click();
  await expect(page.locator('#modal')).toBeVisible();
  await page.locator('#search-input').fill('Earth');
  await page.locator('#search-results [data-object="earth"]').first().click();
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(page.locator('.app-shell')).toHaveClass(/preview-active/);
  await expect(page.locator('#preview-selection')).toContainText('Earth');
  await page.locator('[data-action="preview-object"]').click();
  await expect(page.locator('#modal-body')).toContainText('Earth');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(page.locator('.app-shell')).toHaveClass(/preview-active/);
  await checkpoint('Catalogue selection and scientific object information remain usable inside PC preview');

  await page.locator('#preview-scale').selectOption('2');
  await expect(page.locator('#preview-scale')).toHaveValue('2');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/immersive-galaxy-desktop.png' });
  await page.locator('[data-action="recenter-preview"]').click();
  await page.locator('#preview-layout').selectOption('tabletop');
  await expect(page.locator('#preview-layout')).toHaveValue('tabletop');
  await page.locator('#preview-layout').selectOption('room');
  await page.locator('[data-action="preview-scale-up"]').click();
  await page.locator('[data-action="preview-scale-down"]').click();
  await page.locator('[data-action="preview-rotate-left"]').click();
  await page.locator('[data-action="preview-rotate-right"]').click();
  await page.locator('#preview-hud [data-action="preview-clean"]').click();
  await expect(page.locator('.app-shell')).toHaveClass(/preview-clean/);
  await expect(page.locator('#preview-restore')).toBeVisible();
  await page.locator('#preview-restore').click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/preview-clean/);
  await expect(page.locator('#preview-hud')).toBeVisible();
  await exitPreview();
  await expect(page.locator('#scale-title')).toContainText('Milky Way');
  await checkpoint('Preview reference levels, room/tabletop, transform controls and text-free mode restore the desktop');

  await openImmersive();
  await enterPreview();
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-shell')).not.toHaveClass(/preview-active/);
  await expect(page.locator('.topbar')).toBeVisible();
  await checkpoint('Escape exits an unlocked PC preview without leaving a stuck screen');

  await page.locator('[data-action="settings"]').first().click();
  await Promise.all([page.waitForEvent('load'), page.locator('#language-setting').selectOption('it')]);
  await ready();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await openImmersive();
  await expect(page.locator('[data-action="start-preview"]')).toContainText(/Anteprima/i);
  await enterPreview();
  await expect(page.locator('#preview-hud')).toContainText(/Mappa|Anteprima/);
  await exitPreview();
  await checkpoint('Explicit Italian localizes the immersive chooser and PC controls');

  await page.setViewportSize({ width: 380, height: 844 });
  await openImmersive();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#modal').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  await page.locator('[data-action="start-preview"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-action="start-preview"]')).toBeInViewport();
  await page.screenshot({ path: 'test-results/immersive-chooser-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toBeVisible();
  await checkpoint('380px immersive chooser has no horizontal overflow and PC preview remains reachable');

  // Exercise feature detection and rejected user permission without emulating a
  // successful physical headset session or claiming hardware verification.
  await page.evaluate(() => localStorage.setItem('aether.language', 'en'));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(base + '/?xr-denied=1', { waitUntil: 'networkidle', timeout: 60000 });
  await ready();
  await openImmersive();
  for (const [action, mode] of [['start-mr', 'immersive-ar'], ['start-vr', 'immersive-vr']]) {
    await expect(page.locator('[data-action="' + action + '"]')).toBeEnabled();
    await page.locator('[data-action="' + action + '"]').click();
    await page.waitForFunction(expected => window.__xrRequests.some(request => request.mode === expected), mode);
    await expect(page.locator('.app-shell')).not.toHaveClass(/preview-active/);
    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('[data-action="start-preview"]')).toBeEnabled();
  }
  const xrRequests = await page.evaluate(() => window.__xrRequests);
  assert.deepEqual(xrRequests.map(request => request.mode), ['immersive-ar', 'immersive-vr']);
  assert.ok(xrRequests.every(request => request.options.requiredFeatures.includes('local-floor')));
  await enterPreview();
  await exitPreview();
  await checkpoint('Supported headset modes request AR/VR with floor tracking; denied access leaves PC preview usable');

  // The existing development fixture exposes the real renderer and camera.
  // Use ENGINE_TEST_URL separately when TEST_URL points at the production build.
  const engineBase = process.env.ENGINE_TEST_URL || base;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(engineBase + '/tests/fixtures/engine.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.atlas?.ready && window.atlas.preview);
  const state = () => page.evaluate(() => ({
    camera: atlas.camera.position.toArray(), quaternion: atlas.camera.quaternion.toArray(),
    root: atlas.mapRoot.matrix.elements.slice(), controlsEnabled: atlas.controls.enabled,
    target: atlas.controls.target.toArray(), active: atlas.preview.isActive, index: atlas.index,
  }));
  const original = await state();
  await page.evaluate(() => atlas.enterPreview({ layout: 'room' }));
  await page.waitForFunction(() => atlas.preview.isActive);
  const entered = await state();
  assert.equal(entered.controlsEnabled, false);
  await page.locator('canvas').click({ position: { x: 20, y: 20 } });
  await page.keyboard.down('w');
  await page.waitForFunction(start => atlas.camera.position.distanceTo({ x: start[0], y: start[1], z: start[2] }) > 0.05, entered.camera);
  await page.keyboard.up('w');
  const walked = await state();
  assert.ok(distance(walked.camera, entered.camera) > 0.05, 'W changes viewer position');
  assert.deepEqual(walked.root, entered.root, 'Walking keeps the map fixed in room coordinates');
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(760, 460, { steps: 8 });
  await page.mouse.up();
  const looked = await state();
  assert.ok(distance(looked.quaternion, walked.quaternion) > 0.05, 'Dragging turns the viewer');
  assert.deepEqual(looked.root, entered.root, 'Looking around keeps the map transform fixed');
  await page.evaluate(() => atlas.preview.lookAtObject(catalog.solar.find(object => object.id === 'earth')));
  await page.locator('canvas').click({ position: { x: 640, y: 400 } });
  assert.equal(await page.evaluate(() => atlas.selected.id), 'earth', 'A real canvas ray selects Earth in preview');
  assert.deepEqual((await state()).root, entered.root, 'Selecting an object does not move the map');
  await page.evaluate(() => atlas.exitPreview());
  const restored = await state();
  assert.equal(restored.active, false);
  assert.ok(distance(restored.camera, original.camera) < 1e-7, 'Exit restores the original desktop camera');
  assert.ok(distance(restored.quaternion, original.quaternion) < 1e-7, 'Exit restores desktop orientation');
  assert.deepEqual(restored.root, original.root, 'Exit restores the original map transform');
  assert.deepEqual(restored.target, original.target, 'Exit restores the orbit target');
  assert.equal(restored.controlsEnabled, original.controlsEnabled);
  await checkpoint('Real WebGL preview moves and turns the viewer while keeping the map fixed, then restores desktop state');

  await page.evaluate(() => atlas.enterPreview({ layout: 'room' }));
  await page.evaluate(() => atlas.setScale(2, true));
  assert.equal((await state()).active, true);
  assert.equal((await state()).index, 2);
  const overviewGlows = () => page.evaluate(() => {
    const visible = [];
    atlas.content.traverse(object => { if (object.userData.overviewOnly) visible.push(object.visible); });
    return visible;
  });
  const hiddenGlows = await overviewGlows();
  assert.ok(hiddenGlows.length > 0, 'Galaxy overview glow is identifiable');
  assert.ok(hiddenGlows.every(visible => !visible), 'A surrounding galaxy does not obscure the view with an overview billboard');
  await page.evaluate(() => atlas.preview.recenter());
  assert.ok((await state()).camera.every(Number.isFinite));
  await page.evaluate(() => atlas.preview.setLayout('tabletop'));
  assert.equal(await page.evaluate(() => atlas.preview.layout), 'tabletop');
  await page.evaluate(() => atlas.exitPreview());
  assert.equal((await state()).index, 2);
  await expect.poll(overviewGlows, { message: 'Galaxy overview glow returns on the next desktop frame' }).toEqual(Array(hiddenGlows.length).fill(true));
  assert.equal((await state()).controlsEnabled, true);
  await page.evaluate(() => atlas.dispose());
  await checkpoint('Changing the reference level inside preview keeps the session active and exits into a usable desktop view');
  console.log('Immersive UI: ' + checkpoints.length + ' checkpoints passed. Screenshots saved in test-results.');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: 'test-results/immersive-ui-failure.png' }).catch(() => {});
  console.error('Runtime errors:', errors);
  throw error;
} finally {
  await browser.close();
}
