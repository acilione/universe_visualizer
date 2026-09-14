import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const base = process.env.ENGINE_TEST_URL || process.env.TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir('test-results', { recursive: true });
const errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base + '/tests/fixtures/engine.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.atlas?.ready && atlas.effects);
  // Deterministic stepping prevents unrelated timer or planet rotation changes
  // from being mistaken for a working immersive effect.
  await page.evaluate(() => {
    atlas.renderer.setAnimationLoop(null);
    window.animationTime = performance.now();
  });
  const tick = async (seconds, engine = true) => page.evaluate(({ seconds, engine }) => {
    const steps = Math.max(1, Math.ceil(seconds * 60));
    for (let index = 0; index < steps; index++) {
      if (engine) atlas.animate(window.animationTime += seconds * 1000 / steps);
      else atlas.effects.update(seconds / steps);
    }
    atlas.scene.updateMatrixWorld(true);
    atlas.renderer.render(atlas.scene, atlas.camera);
  }, { seconds, engine });
  const frame = async () => createHash('sha256').update(await page.evaluate(() => {
    atlas.renderer.render(atlas.scene, atlas.camera);
    return atlas.canvas.toDataURL('image/png');
  })).digest('hex');
  const placement = () => page.evaluate(() => {
    atlas.mapRoot.updateMatrixWorld(true);
    return {
      map: atlas.mapRoot.matrixWorld.elements.slice(),
      camera: [...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()],
      objects: atlas.objects.map(object => [object.id, ...object.position]),
    };
  });
  const checkpoint = label => {
    assert.deepEqual(errors, [], label + ': no browser errors');
    console.log('PASS: ' + label);
  };

  assert.equal(await page.evaluate(() => atlas.effects.group.visible), false, 'Effects stay out of the desktop atlas');
  await page.evaluate(() => atlas.enterPreview({ layout: 'room' }));
  await tick(0.45);
  assert.equal(await page.evaluate(() => atlas.effects.group.visible), true);
  assert.equal(await page.evaluate(() => atlas.effects.group.parent === atlas.mapRoot), true);
  const entered = await placement(), opening = await frame();
  await page.screenshot({ path: 'test-results/immersive-effects-opening-solar.png' });
  await tick(3.3);
  assert.notEqual(await frame(), opening, 'The opening produces visibly different rendered pixels');
  assert.deepEqual(await placement(), entered, 'Opening keeps the viewer, map and astronomical coordinates fixed');
  const idleA = await frame();
  await tick(0.8, false);
  assert.notEqual(await frame(), idleA, 'Ambient effects keep moving after the opening has finished');
  await page.screenshot({ path: 'test-results/immersive-effects-solar.png' });
  const renderBudget = await page.evaluate(() => {
    atlas.renderer.render(atlas.scene, atlas.camera);
    const withEffects = atlas.renderer.info.render.calls;
    atlas.effects.group.visible = false;
    atlas.renderer.render(atlas.scene, atlas.camera);
    const withoutEffects = atlas.renderer.info.render.calls;
    atlas.effects.group.visible = true;
    return { withEffects, withoutEffects, additional: withEffects - withoutEffects };
  });
  assert.ok(renderBudget.additional > 0 && renderBudget.additional <= 8, 'Effects use a bounded number of render batches');
  console.log('Immersive render calls:', JSON.stringify(renderBudget));
  checkpoint('Animated opening and ambient field are visible, bounded and preserve spatial placement');

  const beforeReplay = await placement();
  await page.evaluate(() => atlas.replayImmersiveOpening());
  await tick(0.1);
  const replay = await frame();
  await tick(3.3);
  assert.notEqual(await frame(), replay, 'Replay restarts the visible opening');
  assert.deepEqual(await placement(), beforeReplay, 'Replay never recentres or moves the viewer');
  await page.evaluate(() => {
    const earth = catalog.solar.find(object => object.id === 'earth');
    atlas.preview.lookAtObject(earth);
    atlas.selectObject(earth);
  });
  await tick(0.05, false);
  const selected = await frame(), afterSelect = await placement();
  await tick(0.5, false);
  assert.notEqual(await frame(), selected, 'Selection produces animated feedback in the renderer');
  assert.deepEqual(await placement(), afterSelect, 'Selection feedback does not transform the map');
  await page.screenshot({ path: 'test-results/immersive-effects-selection.png' });
  checkpoint('Replay and object selection animate without moving the viewer or catalogue objects');

  // Feed a tracked world-space gesture through the engine's actual adapter.
  // This checks the coordinate boundary without pretending to track a headset.
  const gesture = await page.evaluate(() => {
    const direction = atlas.camera.position.clone();
    atlas.camera.getWorldDirection(direction);
    const world = atlas.camera.position.clone().add(direction.multiplyScalar(1.2));
    atlas.mapRoot.updateWorldMatrix(true, false);
    const expected = atlas.mapRoot.worldToLocal(world.clone()).toArray();
    const original = world.toArray();
    const uniforms = atlas.effects.group.children[0].material.uniforms;
    const before = uniforms.effectEventStarts.value.slice();
    atlas.spatialMapAction({ type: 'grab-start', points: [world] });
    const slot = uniforms.effectEventStarts.value.findIndex((value, index) => value !== before[index]);
    return { expected, original, received: world.toArray(), local: slot < 0 ? null : uniforms.effectEvents.value[slot].toArray().slice(0, 3) };
  });
  assert.deepEqual(gesture.received, gesture.original, 'Input world coordinates are not mutated');
  assert.deepEqual(gesture.local, gesture.expected, 'Tracked world position is converted into the map coordinate frame');
  const beforeGesture = await placement();
  await tick(0.08, false);
  const gestureA = await frame();
  await tick(0.6, false);
  assert.notEqual(await frame(), gestureA, 'Tracked-point feedback changes the rendered frame');
  assert.deepEqual(await placement(), beforeGesture, 'Gesture feedback does not transform the map itself');
  checkpoint('Tracked interaction feedback uses map-local coordinates without mutating tracking data');

  await page.evaluate(() => atlas.setScale(2, true));
  await tick(0.45);
  await page.screenshot({ path: 'test-results/immersive-effects-opening-galaxy.png' });
  await tick(3.3);
  const galaxy = await placement();
  await page.screenshot({ path: 'test-results/immersive-effects-galaxy.png' });
  await tick(0.7, false);
  assert.deepEqual(await placement(), galaxy);
  const highPoints = await page.evaluate(() => {
    let count = 0;
    atlas.effects.group.traverse(object => { if (object.isPoints) count += object.geometry.attributes.position.count; });
    return count;
  });
  await page.evaluate(() => atlas.setQuality('low'));
  await tick(3.3);
  const lowPoints = await page.evaluate(() => {
    let count = 0;
    atlas.effects.group.traverse(object => { if (object.isPoints) count += object.geometry.drawRange.count === Infinity ? object.geometry.attributes.position.count : object.geometry.drawRange.count; });
    return count;
  });
  assert.ok(highPoints > 0 && lowPoints < highPoints, 'Low quality renders fewer effect particles');
  await page.evaluate(() => atlas.setLayer('particles', false));
  await tick(0.1);
  assert.equal(await page.evaluate(() => atlas.effects.group.visible), false);
  await page.evaluate(() => atlas.setLayer('particles', true));
  await tick(0.1);
  assert.equal(await page.evaluate(() => atlas.effects.group.visible), true);
  checkpoint('Galaxy effects follow the view and respect quality and particle-layer controls');

  await page.evaluate(() => { atlas.reducedMotion = true; atlas.replayImmersiveOpening(); });
  await tick(0.1);
  const reducedA = await frame(), reducedPlacement = await placement();
  await tick(1.5);
  assert.equal(await frame(), reducedA, 'Reduced motion produces a stable rendered frame');
  assert.deepEqual(await placement(), reducedPlacement);
  checkpoint('Reduced motion freezes decorative animation while preserving the map');

  await page.evaluate(async () => atlas.showConstellation('Ori', {
    mode: 'earth', observer: { latitude: 41.9028, longitude: 12.4964, dateIso: '2026-01-15T21:00:00.000Z' },
  }));
  await tick(0.1);
  assert.equal(await page.evaluate(() => atlas.index), 7);
  assert.equal(await page.evaluate(() => atlas.preview.isActive), true);
  // Inspect the active effect state below after a real transition to an angular
  // sky, where surrounding dust would imply invented object distances.
  const skyEffects = await page.evaluate(() => {
    const children = atlas.effects.group.children;
    return {
      visible: children.filter(object => object.visible).map(object => object.name),
      particleVolume: children.some(object => object.isPoints && object.visible),
    };
  });
  assert.equal(skyEffects.particleVolume, false, 'Angular skies do not add dust at invented distances');
  assert.deepEqual(skyEffects.visible, ['immersive-reference-tracers'], 'Only angular tracers remain in the sky projection');
  await page.screenshot({ path: 'test-results/immersive-effects-angular-sky.png' });
  checkpoint('Angular sky transitions omit volumetric effects and preserve sky projection');

  await page.evaluate(() => atlas.exitPreview());
  await tick(0.1);
  assert.equal(await page.evaluate(() => atlas.effects.group.visible), false);
  const disposed = await page.evaluate(() => {
    const resources = new Set();
    atlas.effects.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) resources.add(material);
    });
    const released = new Set();
    for (const resource of resources) resource.addEventListener('dispose', () => released.add(resource));
    atlas.dispose();
    return { resources: resources.size, released: released.size, detached: atlas.effects.group.parent === null };
  });
  assert.ok(disposed.resources > 0);
  assert.equal(disposed.released, disposed.resources, 'Disposal releases every effect GPU resource');
  assert.equal(disposed.detached, true);
  checkpoint('Leaving preview removes the effects and renderer disposal releases their resources');

  await page.setViewportSize({ width: 380, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('aether.language', 'en');
    localStorage.setItem('aether.preferences', JSON.stringify({ quality: 'low', autoRotate: false }));
  });
  await page.goto(process.env.TEST_URL || base, { waitUntil: 'networkidle', timeout: 60000 });
  await expect(page.locator('.loading')).toBeHidden({ timeout: 60000 });
  await page.locator('[data-action="vr"]').first().click();
  await page.locator('[data-action="start-preview"]').click();
  await expect(page.locator('.app-shell')).toHaveClass(/preview-active/);
  const replayButton = page.getByRole('button', { name: 'Replay map opening', exact: true });
  await replayButton.scrollIntoViewIfNeeded();
  await expect(replayButton).toBeInViewport();
  await expect(replayButton).toBeEnabled();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#preview-hud').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  await replayButton.click();
  await expect(page.locator('.app-shell')).toHaveClass(/preview-active/);
  await page.screenshot({ path: 'test-results/immersive-effects-replay-mobile.png' });
  checkpoint('Replay opening remains accessible and usable in the 380px PC preview controls');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: 'test-results/immersive-effects-failure.png' }).catch(() => {});
  console.error('Runtime errors:', errors);
  throw error;
} finally {
  await browser.close();
}
