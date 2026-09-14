import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://localhost:5174';
const engineBase = process.env.ENGINE_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir('test-results', { recursive: true });
const errors = [], checkpoints = [];
let page;
const checkpoint = label => {
  assert.deepEqual(errors, [], label + ': no browser errors');
  checkpoints.push(label); console.log('PASS: ' + label);
};
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', locale: 'it-IT' });
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text()); });
  if (process.env.COMBINED_UI_ONLY !== '1') {
  await page.goto(engineBase + '/tests/fixtures/engine.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.atlas?.ready && atlas.showCombinedMap);
  assert.equal(await page.evaluate(async () => atlas.showCombinedMap()), true);
  await page.waitForFunction(() => atlas.index === 9 && atlas.combinedView);
  const counts = await page.evaluate(() => {
    atlas.renderer.setAnimationLoop(null);
    atlas.animate(performance.now() + 2000);
    atlas.scene.updateMatrixWorld(true); atlas.renderer.render(atlas.scene, atlas.camera);
    const layers = Object.fromEntries(Object.entries(atlas.combinedView.layers).map(([name, group]) => {
      let points = 0, meshes = 0;
      group.traverse(node => { if (node.isPoints) points += node.geometry.attributes.position.count; if (node.isMesh) meshes++; });
      return [name, { visible: group.visible, points, meshes, attached: !!group.parent }];
    }));
    return { index: atlas.index, mode: atlas.viewContext.mode, layers, objectCount: atlas.combinedView.objects.length, targets: atlas.targets.length };
  });
  assert.equal(counts.index, 9);
  assert.ok(counts.layers.planets.meshes >= 8, 'The eight Solar System planets have visible geometry');
  assert.ok(counts.layers.stars.points >= 118000, 'The full NASA star catalogue is rendered together');
  assert.ok(counts.layers.nebulae.points >= 485, 'All nebular centres are rendered together');
  assert.ok(counts.objectCount >= 118000, 'Combined object data retain the full catalogue');
  assert.ok(Object.values(counts.layers).every(layer => layer.visible && layer.attached));
  assert.ok(counts.targets > 0 && counts.targets <= 150, 'Interactive targets remain bounded');
  checkpoint('Real WebGL renders planets, full stellar catalogue and nebulae simultaneously');
  for (const [grid, clean, expected] of [[false, false, false], [true, false, true], [true, true, false], [true, false, true]]) {
    await page.evaluate(({ grid, clean }) => { atlas.setLayer('grid', grid); atlas.setImmersive(clean); }, { grid, clean });
    assert.equal(await page.evaluate(() => atlas.combinedView.group.getObjectByName('combined-solar-orbits').visible), expected, 'Combined orbital guides follow the reference-grid and clean-view settings');
  }


  await page.evaluate(() => {
    atlas.enterPreview({ layout: 'room' });
    atlas.mapRoot.position.x += .75; atlas.preview.rotateMap(.2); atlas.preview.scaleMap(1.1);
    atlas.scene.updateMatrixWorld(true);
    window.combinedSnapshot = {
      root: atlas.mapRoot.matrixWorld.elements.slice(),
      camera: [...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()],
      objects: atlas.combinedView.objects.map(object => [object.id, ...object.position]),
      geometry: [],
    };
    atlas.combinedView.group.traverse(node => { if (node.geometry) combinedSnapshot.geometry.push(node.geometry.uuid); });
  });
  const inspectStable = () => page.evaluate(() => {
    atlas.scene.updateMatrixWorld(true);
    const geometry = [];
    atlas.combinedView.group.traverse(node => { if (node.geometry) geometry.push(node.geometry.uuid); });
    return {
      root: JSON.stringify(atlas.mapRoot.matrixWorld.elements) === JSON.stringify(combinedSnapshot.root),
      camera: JSON.stringify([...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()]) === JSON.stringify(combinedSnapshot.camera),
      objects: JSON.stringify(atlas.combinedView.objects.map(object => [object.id, ...object.position])) === JSON.stringify(combinedSnapshot.objects),
      geometry: JSON.stringify(geometry) === JSON.stringify(combinedSnapshot.geometry),
    };
  });
  for (const name of ['planets', 'stars', 'nebulae']) {
    await page.evaluate(name => atlas.setObjectLayer(name, false), name);
    assert.equal(await page.evaluate(name => atlas.objectLayers[name], name), false);
    assert.equal(await page.evaluate(name => atlas.combinedView.layers[name].visible, name), false);
    assert.deepEqual(await inspectStable(), { root: true, camera: true, objects: true, geometry: true });
  }
  assert.equal(await page.evaluate(() => atlas.targets.filter(target => { for (let node = target; node; node = node.parent) if (!node.visible) return false; return true; }).length), 0, 'All layers off leaves no visible object hit targets');
  for (const name of ['planets', 'stars', 'nebulae']) await page.evaluate(name => atlas.setObjectLayer(name, true), name);
  assert.deepEqual(await inspectStable(), { root: true, camera: true, objects: true, geometry: true });
  assert.equal(await page.evaluate(() => atlas.preview.isPlanetarium), false, 'The combined map remains a walkable spatial presentation');
  checkpoint('Layer toggles preserve GPU geometry, object coordinates, explicit placement and viewer pose; all-off is valid');

  // A canvas click exercises the actual immersive raycast, including ancestor
  // visibility, rather than calling a selection callback with a hidden object.
  await page.evaluate(() => {
    atlas.renderer.setAnimationLoop(time => atlas.animate(time));
    const earth = atlas.combinedView.objects.find(object => object.id === 'earth');
    atlas.preview.lookAtObject(earth);
  });
  await page.locator('canvas').click({ position: { x: 720, y: 480 } });
  assert.equal(await page.evaluate(() => atlas.selected?.id), 'earth');
  await page.evaluate(() => { atlas.setObjectLayer('planets', false); atlas.selected = null; });
  await page.locator('canvas').click({ position: { x: 720, y: 480 } });
  assert.notEqual(await page.evaluate(() => atlas.selected?.id), 'earth', 'Hidden Earth cannot be selected by a canvas ray');
  await page.evaluate(() => atlas.setObjectLayer('planets', true));
  const beforeQuality = await page.evaluate(() => { atlas.scene.updateMatrixWorld(true); return { root: atlas.mapRoot.matrixWorld.elements.slice(), camera: [...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()] }; });
  await page.evaluate(() => atlas.setQuality('low'));
  assert.deepEqual(await page.evaluate(() => { atlas.scene.updateMatrixWorld(true); return { root: atlas.mapRoot.matrixWorld.elements.slice(), camera: [...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()] }; }), beforeQuality, 'Quality changes keep explicit map placement and viewer pose');
  assert.equal(await page.evaluate(() => atlas.index), 9);
  assert.equal(await page.evaluate(() => atlas.combinedView.objects.length), counts.objectCount, 'Low quality keeps catalogue coverage');
  await page.screenshot({ path: 'test-results/combined-map-engine.png' });
  await page.evaluate(() => atlas.exitPreview());
  assert.equal(await page.evaluate(() => atlas.controls.enabled), true);
  assert.equal(await page.evaluate(() => atlas.index), 9);
  checkpoint('Real canvas selection respects hidden layers, low quality keeps objects and preview exits into a usable atlas');

  // Begin a fresh load and change maps before it completes. A stale asynchronous
  // catalogue request must not overwrite the user's later navigation.
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.atlas?.ready && atlas.showCombinedMap);
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes('/catalog/nasa-')) await new Promise(resolve => setTimeout(resolve, 300));
      return original(...args);
    };
    window.pendingCombined = atlas.showCombinedMap();
    atlas.setScale(2, true);
  });
  await page.evaluate(() => window.pendingCombined);
  assert.equal(await page.evaluate(() => atlas.index), 2, 'Later map navigation wins over a pending combined load');
  await page.evaluate(() => atlas.dispose());
  checkpoint('Pending catalogue loading cannot replace a map chosen later');

  }
  if (process.env.COMBINED_ENGINE_ONLY !== '1') {
  await page.addInitScript(() => {
    if (!localStorage.getItem('combined-test-initialized')) {
      localStorage.setItem('aether.language', 'en');
      localStorage.setItem('aether.preferences', JSON.stringify({ quality: 'low', autoRotate: false }));
      localStorage.setItem('combined-test-initialized', 'true');
    }
    window.__xrRequests = [];
    const supported = new URL(location.href).searchParams.has('xr-denied');
    Object.defineProperty(navigator, 'xr', { configurable: true, value: supported ? {
      isSessionSupported: async mode => mode === 'immersive-ar' || mode === 'immersive-vr',
      requestSession: async (mode, options) => {
        window.__xrRequests.push({ mode, options, activation: navigator.userActivation.isActive });
        throw new DOMException('Denied by browser test', 'NotAllowedError');
      }, addEventListener() {}, removeEventListener() {},
    } : undefined });
  });
  const ready = async () => {
    await expect(page.locator('.loading')).toBeHidden({ timeout: 60000 });
    await expect(page.locator('.webgl-error')).toHaveCount(0);
  };
  const openChooser = async () => {
    await page.locator('[data-action="vr"]').first().click();
    await expect(page.locator('#xr-content')).toBeVisible();
  };
  const layers = () => page.locator('#combined-object-layers');
  const layer = name => layers().locator('[data-object-layer="' + name + '"]');
  const startPreview = async () => {
    await expect(page.locator('[data-action="start-preview"]')).toBeEnabled({ timeout: 90000 });
    await page.locator('[data-action="start-preview"]').click();
    await expect(page.locator('.app-shell')).toHaveClass(/preview-active/);
    await expect(page.locator('#preview-scale')).toHaveValue('9');
    await expect(layers()).toBeVisible();
  };
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await ready();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await openChooser();
  await page.locator('#xr-content').selectOption('combined');
  await expect(page.locator('[data-action="start-vr"]')).toBeDisabled();
  await expect(page.locator('[data-action="start-mr"]')).toBeDisabled();
  await startPreview();
  for (const name of ['planets', 'stars', 'nebulae']) await expect(layer(name)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/combined-map-preview-desktop.png' });
  for (const name of ['planets', 'stars', 'nebulae']) {
    await layer(name).click();
    await expect(layer(name)).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(page.locator('#preview-scale')).toHaveValue('9');
  checkpoint('Combined preview is available without WebXR and independently toggles all three default-enabled categories');

  for (const [query, id, name, category] of [
    ['Earth', 'earth', 'Earth', 'planets'],
    ['Rho Cygni', 'hip-106481', 'Rho Cygni', 'stars'],
    ['M42', 'ngc-1976', 'Orion Nebula', 'nebulae'],
  ]) {
    await page.locator('[data-action="preview-search"]').click();
    await page.locator('[data-search-scope="' + category + '"]').click();
    await page.locator('#search-input').fill(query);
    await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false', { timeout: 90000 });
    await page.locator('#search-results [data-object="' + id + '"]').first().click();
    await expect(page.locator('#modal')).not.toBeVisible();
    await expect(page.locator('#preview-scale')).toHaveValue('9');
    await expect(page.locator('#preview-selection')).toContainText(name);
    await expect(layer(category)).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-action="preview-object"]').click();
    await expect(page.locator('#modal-body')).toContainText(name);
    if (category !== 'planets') await expect(page.locator('#modal-body a[href*="heasarc.gsfc.nasa.gov"]')).not.toHaveCount(0);
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('#modal-body img,.compass,.compass-rose')).toHaveCount(0);
  checkpoint('Locating planets, stars and nebulae stays combined, enables hidden categories and retains scientific object data');

  await layer('stars').click();
  await expect(layer('stars')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-action="exit-preview"]').click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/preview-active/);
  await expect(page.locator('#scale-title')).toContainText('Combined');
  await expect(page.locator('#combined-desktop-layers [data-object-layer="stars"]')).toHaveAttribute('aria-pressed', 'false');
  for (const category of ['planets', 'stars', 'nebulae']) await expect(page.locator('#combined-desktop-layers [data-object-layer="' + category + '"]')).toBeVisible();
  await page.locator('[data-action="settings"]').first().click();
  await Promise.all([page.waitForEvent('load'), page.locator('#language-setting').selectOption('it')]);
  await ready();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await openChooser();
  await page.locator('#xr-content').selectOption('combined');
  await startPreview();
  await expect(layer('stars')).toHaveAttribute('aria-pressed', 'false');
  await expect(layer('planets')).toContainText('Pianeti');
  await expect(layer('stars')).toContainText('Stelle');
  await expect(layer('nebulae')).toContainText('Nebulose');
  await page.setViewportSize({ width: 380, height: 844 });
  for (const name of ['planets', 'stars', 'nebulae']) {
    await layer(name).scrollIntoViewIfNeeded();
    await expect(layer(name)).toBeInViewport();
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#preview-hud').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  await layer('stars').click();
  await expect(layer('stars')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/combined-map-preview-mobile-it.png' });
  await page.locator('[data-action="exit-preview"]').click();
  await expect(page.locator('.topbar')).toBeVisible();
  checkpoint('Explicit Italian reload preserves layers and 380px preview controls remain usable');

  await page.evaluate(() => localStorage.setItem('aether.language', 'en'));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(base + '/?xr-denied=1', { waitUntil: 'networkidle', timeout: 60000 });
  await ready();
  let releaseCatalogue;
  const catalogueGate = new Promise(resolve => { releaseCatalogue = resolve; });
  let pendingCatalogueRequests = 0;
  await page.route('**/catalog/nasa-*.json', async route => { pendingCatalogueRequests++; await catalogueGate; await route.continue(); });
  await openChooser();
  await page.locator('#xr-content').selectOption('combined');
  await expect.poll(() => pendingCatalogueRequests).toBeGreaterThan(0);
  for (const action of ['start-preview', 'start-mr', 'start-vr']) await expect(page.locator('[data-action="' + action + '"]')).toBeDisabled();
  assert.deepEqual(await page.evaluate(() => window.__xrRequests), [], 'No headset request occurs while content is loading');
  releaseCatalogue();
  for (const [action, mode] of [['start-mr', 'immersive-ar'], ['start-vr', 'immersive-vr']]) {
    await expect(page.locator('[data-action="' + action + '"]')).toBeEnabled({ timeout: 90000 });
    await page.locator('[data-action="' + action + '"]').click();
    await page.waitForFunction(mode => window.__xrRequests.some(request => request.mode === mode), mode);
    await expect(page.locator('#modal')).toBeVisible();
  }
  const requests = await page.evaluate(() => window.__xrRequests);
  assert.deepEqual(requests.map(request => request.mode), ['immersive-ar', 'immersive-vr']);
  assert.ok(requests.every(request => request.activation), 'Preloaded combined maps preserve the user activation for XR requests');
  await startPreview();
  await page.locator('[data-action="exit-preview"]').click();
  checkpoint('Preloaded combined content starts AR/VR requests with user activation; headset denial preserves desktop preview');
  }
  console.log('Combined map browser: ' + checkpoints.length + ' checkpoints passed.');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: 'test-results/combined-map-failure.png' }).catch(() => {});
  console.error('Runtime errors:', errors);
  throw error;
} finally {
  await browser.close();
}
