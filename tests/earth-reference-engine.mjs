import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, args: [
  '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
] });
const observer = { latitude: 38 + 6 / 60 + 51.98 / 3600, longitude: 15 + 39 / 60, dateIso: '2026-12-11T19:00:00.000Z' };
const fixture = (process.env.ENGINE_TEST_URL || 'http://localhost:5173') + '/tests/fixtures/engine.html';
const errors = [];
const trackErrors = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
};
const openFixture = async (reducedMotion = 'reduce') => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion });
  trackErrors(page);
  await page.goto(fixture);
  await page.waitForFunction(() => window.atlas?.ready);
  return page;
};
const openOrion = async page => {
  await page.evaluate(observer => atlas.showConstellation('Ori', { mode: 'space', observer }), observer);
  await page.waitForFunction(() => !atlas.cameraFlight);
};
const snapshot = page => page.evaluate(() => {
  const earth = atlas.content.getObjectByName('earth-reference');
  const line = atlas.content.getObjectByName('constellation-lines');
  return { index: atlas.index, earthVisible: atlas.earthVisible, perspective: atlas.earthPerspective,
    earthShown: earth?.visible, linesShown: line.visible, controlsEnabled: atlas.controls.enabled,
    cameraRadius: atlas.camera.position.length(), fov: atlas.camera.fov };
});

try {
  const page = await openFixture();
  await openOrion(page);
  assert.deepEqual(await snapshot(page), { index: 6, earthVisible: true, perspective: false,
    earthShown: true, linesShown: true, controlsEnabled: true,
    cameraRadius: await page.evaluate(() => atlas.camera.position.length()), fov: 44 });
  assert.ok(await page.evaluate(() => {
    const earth = atlas.content.getObjectByName('earth-reference');
    return earth.position.length() === 0 && earth.userData.radius === .65;
  }), 'the visible Earth is centered at the stellar catalogue origin');
  await page.waitForFunction(() => {
    let loaded = false;
    atlas.content.getObjectByName('earth-reference').traverse(object => {
      for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
        const image = material.map?.image;
        if (image?.width > 0 && String(image.currentSrc || image.src).includes('earth_daymap')) loaded = true;
      }
    });
    return loaded;
  });
  await page.screenshot({ path: 'test-results/earth-reference-orbit.png' });
  await page.evaluate(() => atlas.setEarthVisible(false));
  assert.equal((await snapshot(page)).earthShown, false);
  assert.equal((await snapshot(page)).linesShown, true);
  await page.evaluate(observer => atlas.showConstellation('UMa', { mode: 'space', observer }), observer);
  await page.waitForFunction(() => !atlas.cameraFlight);
  assert.equal((await snapshot(page)).earthShown, false, 'visibility choice survives a new constellation');
  await openOrion(page);
  assert.equal((await snapshot(page)).earthShown, false);
  await page.evaluate(() => {
    atlas.setEarthVisible(true);
    const cloud = atlas.content.getObjectByName('catalog-stars');
    window.originalStarGeometry = cloud.geometry;
    window.originalStarPositions = cloud.geometry.attributes.position.array.slice();
    window.originalObjectPositions = atlas.objects.map(object => object.position.slice());
  });
  // Exercise the user-facing Earth label itself, even if label collision rules temporarily hide it.
  await page.getByRole('button', { name: 'View the constellation from Earth’s position in 3D space', exact: true, includeHidden: true }).evaluate(button => button.click());
  await page.waitForFunction(() => !atlas.skyEntry);
  assert.deepEqual(await snapshot(page), { index: 6, earthVisible: true, perspective: true,
    earthShown: false, linesShown: true, controlsEnabled: false, cameraRadius: 0, fov: 70 });
  const perspective = await page.evaluate(() => {
    const origin = atlas.camera.position.clone();
    const expected = origin.clone().set(0, 0, 0);
    for (const star of atlas.objects) expected.add(origin.clone().fromArray(star.position).normalize());
    expected.normalize();
    const forward = origin.clone().set(0, 0, -1).applyQuaternion(atlas.camera.quaternion);
    const cloud = atlas.content.getObjectByName('catalog-stars');
    const projected = atlas.objects.map(star => origin.clone().fromArray(star.position).project(atlas.camera).toArray());
    const distances = atlas.objects.map(star => Math.hypot(...star.position));
    return {
      directionError: forward.distanceTo(expected),
      sameGeometry: cloud.geometry === window.originalStarGeometry,
      sameVertices: cloud.geometry.attributes.position.array.every((value, index) => value === window.originalStarPositions[index]),
      sameObjects: atlas.objects.every((object, index) => object.position.every((value, axis) => value === window.originalObjectPositions[index][axis])),
      depthRange: Math.max(...distances) - Math.min(...distances),
      allInFrame: projected.every(([x, y, z]) => Math.abs(x) < 1 && Math.abs(y) < 1 && z > -1 && z < 1),
    };
  });
  assert.ok(perspective.directionError < 1e-9, 'Earth perspective aims at angular, not distance-weighted, star centroid');
  assert.ok(perspective.sameGeometry && perspective.sameVertices && perspective.sameObjects, 'entering Earth perspective preserves real 3D stellar depth');
  assert.ok(perspective.depthRange > 10);
  assert.ok(perspective.allInFrame);
  await page.screenshot({ path: 'test-results/earth-reference-perspective.png' });
  const beforeDrag = await page.evaluate(() => atlas.camera.quaternion.toArray());
  await page.mouse.move(600, 350); await page.mouse.down();
  await page.mouse.move(900, 420, { steps: 8 }); await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(() => atlas.camera.quaternion.toArray()), beforeDrag);
  assert.ok(await page.evaluate(() => atlas.camera.position.length() < 1e-10));
  await page.evaluate(() => atlas.zoom(.7));
  assert.equal(await page.evaluate(() => atlas.camera.fov), 49);
  await page.evaluate(() => atlas.returnToSpaceOrbit());
  await page.waitForFunction(() => !atlas.cameraFlight);
  const orbit = await snapshot(page);
  assert.equal(orbit.index, 6); assert.equal(orbit.perspective, false);
  assert.equal(orbit.controlsEnabled, true); assert.equal(orbit.earthShown, true);
  assert.ok(orbit.cameraRadius > 1); assert.equal(orbit.fov, 44);
  await page.evaluate(() => { atlas.setEarthVisible(false); atlas.viewFromEarth(); atlas.resetView(true); });
  assert.equal((await snapshot(page)).earthShown, false, 'returning to orbit respects a hidden Earth preference');
  await page.evaluate(observer => atlas.showConstellation('Ori', { mode: 'earth', observer }), observer);
  const surface = await page.evaluate(() => ({
    index: atlas.index, count: atlas.viewContext.visibleStarCount,
    observer: atlas.viewContext.observer, cameraRadius: atlas.camera.position.length(),
    controlsEnabled: atlas.controls.enabled,
    allInFrame: atlas.objects.every(star => {
      const point = atlas.camera.position.clone().fromArray(star.position).project(atlas.camera);
      return star.altitudeDeg > 12 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z > -1 && point.z < 1;
    }),
  }));
  assert.equal(surface.index, 7); assert.equal(surface.count, 21);
  assert.deepEqual(surface.observer, observer);
  assert.equal(surface.cameraRadius, 0); assert.equal(surface.controlsEnabled, false);
  assert.ok(surface.allInFrame, 'the reported winter observation keeps all of Orion visible above the horizon');
  await page.evaluate(() => atlas.setScale(0));
  await page.waitForFunction(() => !atlas.cameraFlight);
  assert.equal(await page.evaluate(() => atlas.index), 0);
  assert.equal(await page.evaluate(() => atlas.controls.enabled), true);
  assert.equal(await page.evaluate(() => atlas.targets.length), 9);
  assert.ok(await page.evaluate(() => atlas.camera.position.length() > 20));
  await page.evaluate(() => atlas.dispose());
  await page.close();

  const animated = await openFixture('no-preference');
  await openOrion(animated);
  await animated.waitForFunction(() => atlas.elapsed - atlas.content.userData.born > 1.5);
  const entry = await animated.evaluate(() => {
    const initialRadius = atlas.camera.position.length();
    atlas.viewFromEarth();
    window.earthTravelSamples = [];
    const capture = () => {
      window.earthTravelSamples.push({ distance: atlas.camera.position.length(), travelling: Boolean(atlas.skyEntry) });
      if (atlas.skyEntry) requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
    return { initialRadius, created: Boolean(atlas.skyEntry), fromRadius: atlas.skyEntry?.from.length() };
  });
  assert.ok(entry.created && entry.initialRadius > 1);
  assert.equal(entry.fromRadius, entry.initialRadius);
  await animated.waitForFunction(() => !atlas.skyEntry && atlas.camera.position.length() < 1e-8);
  assert.equal(await animated.evaluate(() => atlas.index), 6);
  assert.equal(await animated.evaluate(() => atlas.earthPerspective), true);
  const samples = await animated.evaluate(() => window.earthTravelSamples);
  assert.ok(samples.some(sample => sample.travelling && sample.distance > 0 && sample.distance < entry.initialRadius), 'the smooth flight actually moves between orbit and Earth');
  assert.ok(samples.every(sample => Number.isFinite(sample.distance)));
  await animated.evaluate(() => atlas.returnToSpaceOrbit());
  await animated.waitForFunction(() => !atlas.cameraFlight);
  assert.ok(await animated.evaluate(() => atlas.camera.position.length() > 1 && atlas.controls.enabled && !atlas.earthPerspective));
  await animated.evaluate(() => atlas.dispose());
  await animated.close();
  assert.deepEqual(errors, []);
  console.log('PASS Earth reference texture, visibility persistence, 3D origin perspective, retained depth, drag/FOV, orbit return, winter Orion surface, solar restoration and animated travel.');
} finally {
  await browser.close();
}
