import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const base = process.env.TEST_URL || process.env.ENGINE_TEST_URL || 'http://localhost:5173';
const audit = JSON.parse(await readFile(new URL('../src/body-appearance-audit.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir('test-results', { recursive: true });
const errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', reducedMotion: 'reduce' });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text()); });
  // Expose the existing private app instance only in the served test response.
  // Selection, details, focus and rendering still run through the production UI.
  await page.route('**/src/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__appearanceSmoke = { universe };\n' });
  });
  await page.addInitScript(() => localStorage.setItem('aether.preferences', JSON.stringify({ autoRotate: false, grid: false, labels: false, particles: false })));
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await expect(page.locator('.loading')).toBeHidden();
  await page.waitForFunction(() => window.__appearanceSmoke?.universe?.ready);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const selectThroughSearch = async (query, id) => {
    await page.locator('[data-action="search"]').first().click();
    await page.locator('#search-input').fill(query);
    await page.locator(`.search-result[data-object="${id}"]`).click();
    await expect(page.locator('#object-card h2')).toHaveText(query);
  };
  await selectThroughSearch('Sun', 'sun');
  await page.evaluate(() => {
    const visual = window.__appearanceSmoke.universe.bodyVisuals.get('sun');
    visual.userData.surface.rotation.y = Math.PI * .8;
    visual.userData.surface.userData.staticOrientation = true;
  });
  await page.locator('#object-card [data-action="focus"]').click();
  await page.waitForFunction(() => !window.__appearanceSmoke.universe.cameraFlight);
  const solar = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const engine = window.__appearanceSmoke.universe;
    const visual = engine.bodyVisuals.get('sun');
    engine.scene.updateMatrixWorld(true);
    const surface = visual.getObjectByName('planet-surface');
    const center = visual.getWorldPosition(new THREE.Vector3());
    const direction = engine.camera.position.clone().sub(center).normalize();
    const observed = new THREE.Vector3(0, 0, 1).transformDirection(surface.matrixWorld);
    return { focused: engine.focusedPlanet?.id, facing: direction.dot(observed), radius: visual.userData.bodyRadius,
      distance: engine.camera.position.distanceTo(center), minDistance: engine.controls.minDistance,
      selectionRingVisible: engine.selectionRing.visible,
      observationReady: surface.material.uniforms.uObservationReady.value,
      observation: surface.material.userData.observationDateUtc };
  });
  assert.equal(solar.focused, 'sun');
  assert.ok(solar.facing > .99999, 'actual Focus button selects the rotated photographed hemisphere');
  assert.ok(solar.minDistance > solar.radius && solar.distance > solar.minDistance);
  assert.equal(solar.selectionRingVisible, false, 'focused Sun is not crossed by the selection guide');
  assert.equal(solar.observationReady, 1, 'the dated observation is decoded and bound for rendering');
  assert.match(solar.observation, /^2026-09-21/);
  await page.screenshot({ path: 'test-results/body-appearance-ui-sun.png' });
  await expect(page.locator('#object-card [data-action="object"]')).toHaveText('Sun data');
  await page.locator('#object-card [data-action="object"]').click();
  await expect(page.locator('#modal-body h2')).toHaveText('Sun');
  await expect(page.locator('.appearance-data')).toContainText('21 September 2026');
  await expect(page.locator('.appearance-data')).toContainText('not live solar activity');
  await expect(page.locator('.appearance-data')).toContainText('NASA/SDO and the HMI science team');
  await expect(page.locator('.appearance-data a').filter({ hasText: 'NASA reference photograph' })).toHaveAttribute('href', audit.sun.reference.url);
  await page.locator('.appearance-data').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/body-appearance-ui-sun-details.png' });
  await page.keyboard.press('Escape');

  await selectThroughSearch('Janus', 'janus');
  await page.waitForFunction(() => window.__appearanceSmoke.universe.bodyVisuals.get('janus')?.userData.modelLoadStatus === 'ready');
  await page.locator('#object-card [data-action="focus"]').click();
  await page.waitForFunction(() => !window.__appearanceSmoke.universe.cameraFlight);
  const janus = await page.evaluate(() => {
    const engine = window.__appearanceSmoke.universe;
    const visual = engine.bodyVisuals.get('janus');
    const mesh = visual.getObjectByName('planet-surface');
    return { focused: engine.focusedPlanet?.id, classification: visual.userData.appearance.shape, vertices: mesh.geometry.attributes.position.count, triangles: mesh.geometry.index.count / 3, color: mesh.material.color.getHexString(), map: mesh.material.map?.name || null };
  });
  assert.equal(janus.focused, 'janus');
  assert.equal(janus.classification, 'measured-3d-model');
  assert.equal(janus.triangles, 26758);
  assert.equal(janus.vertices, 13381);
  assert.equal(janus.color, 'a7a6a2');
  assert.equal(janus.map, null, 'no global photographic albedo map is fabricated');
  await page.screenshot({ path: 'test-results/body-appearance-ui-janus.png' });
  await page.locator('#object-card [data-action="object"]').click();
  await expect(page.locator('#modal-body h2')).toHaveText('Janus');
  await expect(page.locator('.appearance-data')).toContainText('Cassini ISS scientific shape model');
  await expect(page.locator('.appearance-data')).toContainText('0.3-1.3 km');
  await expect(page.locator('.appearance-data')).toContainText('Uniform approximate visible color');
  const photo = page.locator('.appearance-data a').filter({ hasText: 'NASA reference photograph' });
  await expect(photo).toHaveAttribute('href', audit.janus.reference.url);
  await expect(photo).toHaveAttribute('target', '_blank');
  await expect(photo).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(photo).toContainText(audit.janus.reference.archiveId);
  await expect(page.locator('.appearance-data img,.planet-art,.planet-preview,.compass')).toHaveCount(0);
  await photo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/body-appearance-ui-janus-details.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: actual UI Sun focus follows dated observation after rotation, hides the selection guide and exposes source details; Janus uses measured PDS shape and exposes the NASA photograph with coverage/uncertainty notes.');
  console.log(JSON.stringify({ solar, janus, photograph: audit.janus.reference.url }));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: 'test-results/body-appearance-ui-failure.png' }).catch(() => {});
  console.error('Runtime errors:', errors);
  throw error;
} finally { await browser.close(); }
