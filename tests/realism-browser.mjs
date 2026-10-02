import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const officialSurfaces = JSON.parse(await readFile(new URL('../src/official-surfaces.json', import.meta.url), 'utf8'));

// Exercises actual WebGL textures/materials and navigation. This does not emulate
// a physical headset; the XR assertion checks the shared focus geometry contract.
const base = process.env.ENGINE_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir('test-results', { recursive: true });
const errors = [], failures = [], checkpoints = [];
let page;
const checkpoint = label => {
  assert.deepEqual(errors, [], label + ': no JavaScript or shader errors');
  assert.deepEqual(failures, [], label + ': all local visual assets loaded');
  checkpoints.push(label);
  console.log('PASS: ' + label);
};
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text()); });
  page.on('response', response => { if (/\/textures\//.test(response.url()) && response.status() >= 400) failures.push(response.url() + ': ' + response.status()); });
  await page.goto(base + '/tests/fixtures/engine.html', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => window.atlas?.ready);
  await page.evaluate(async () => {
    window.THREE = await import('/node_modules/three/build/three.module.js');
    atlas.setAutoRotate(false);
    atlas.setLayer('grid', false);
    atlas.setLayer('particles', false);
    atlas.setLayer('labels', false);
    await Promise.all([...atlas.bodyVisuals.values()].map(visual => visual.userData.modelReady));
  });
  await page.waitForFunction(() => {
    const maps = new Set();
    atlas.content.traverse(node => {
      const material = node.material;
      if (material) for (const value of Object.values(material)) if (value?.isTexture) maps.add(value);
      for (const uniform of Object.values(material?.uniforms || {})) if (uniform.value?.isTexture) maps.add(uniform.value);
    });
    return maps.size > 5 && [...maps].every(map => map.image instanceof HTMLImageElement ? map.image.complete && map.image.naturalWidth > 0 : map.image?.width > 0);
  });
  const bodies = await page.evaluate(() => [...catalog.solar, ...solarMoons].map(object => {
    const hit = atlas.targets.find(target => target.userData.object?.id === object.id);
    const visual = hit.parent.getObjectByName('planet-' + object.id);
    const mesh = visual.getObjectByName('planet-surface');
    mesh.geometry.computeBoundingBox();
    const dimensions = mesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(mesh.scale).toArray();
    const maps = [];
    visual.traverse(node => { if (node.material?.map) maps.push(node.material.map.image?.currentSrc || node.material.map.image?.src || ''); });
    return { id: object.id, kind: object.bodyKind, size: object.size, dimensions, hasSurface: !!mesh, maps, modelState: visual.userData.modelLoadStatus, vertexCount: mesh.geometry.attributes.position.count, flipY: mesh.material.map?.flipY, emissive: mesh.material.emissiveIntensity ?? null, bump: mesh.material.bumpMap?.image?.src || null, visualRadius: visual.userData.visualRadius };
  }));
  assert.equal(bodies.length, 37, 'All Solar System planets, the Sun and the existing 28 moons retain geometry');
  assert.ok(bodies.every(body => body.hasSurface && body.dimensions.every(value => Number.isFinite(value) && value > 0)));
  for (const body of bodies.filter(body => body.emissive !== null && body.id !== 'sun')) {
    assert.equal(body.emissive, 0, body.id + ' does not self-illuminate its daylight texture');
    if (body.bump) {
      assert.ok(officialSurfaces[body.id]?.bumpMap && body.bump.endsWith('/textures/' + officialSurfaces[body.id].bumpMap), body.id + ' relief uses a measured official elevation map');
      assert.ok(!body.maps.includes(body.bump), body.id + ' does not mistake daylight image brightness for measured height');
    }
  }
  for (const [id, definition] of Object.entries(officialSurfaces)) {
    if (!definition.map) continue;
    const body = bodies.find(body => body.id === id);
    assert.ok(body?.maps.some(url => url.endsWith('/textures/' + definition.map)), id + ' renders the archived official map');
    if (definition.model) {
      assert.equal(body.modelState, 'ready', id + ' loads the irregular official mesh');
      assert.equal(body.vertexCount, definition.vertexCount, id + ' retains source mesh topology');
      assert.equal(body.flipY, false, id + ' preserves the native glTF texture orientation');
    }
  }
  const phobos = bodies.find(body => body.id === 'phobos');
  assert.ok(Math.max(...phobos.dimensions) / Math.min(...phobos.dimensions) > 1.3, 'Phobos has a measured elongated silhouette');
  assert.ok(bodies.find(body => body.id === 'saturn').visualRadius > bodies.find(body => body.id === 'saturn').size * 2);
  assert.ok(bodies.find(body => body.id === 'uranus').visualRadius > bodies.find(body => body.id === 'uranus').size * 1.8);
  checkpoint('Official textures decode; all 37 bodies render; rocky surfaces do not emit light or invent relief');

  // Capture actual GPU pixels from opposite viewing phases. Compare the centre
  // of the sphere, excluding the background, rings and edge atmosphere.
  const phase = await page.evaluate(() => {
    atlas.renderer.setAnimationLoop(null);
    atlas.animate(performance.now() + 2000);
    const object = solarMoons.find(item => item.id === 'moon');
    const visual = atlas.content.getObjectByName('planet-moon');
    const center = visual.getWorldPosition(new THREE.Vector3());
    const star = atlas.mapRoot.localToWorld(new THREE.Vector3());
    const direction = star.sub(center).normalize();
    const saved = { position: atlas.camera.position.clone(), quaternion: atlas.camera.quaternion.clone(), fov: atlas.camera.fov, sky: atlas.sky.visible };
    atlas.sky.visible = false;
    const target = new THREE.WebGLRenderTarget(128, 128);
    const camera = new THREE.PerspectiveCamera(38, 1, .001, 1000);
    const pixels = new Uint8Array(128 * 128 * 4);
    const capture = sign => {
      camera.position.copy(center).addScaledVector(direction, object.size * 4 * sign);
      camera.lookAt(center); camera.updateMatrixWorld(true);
      atlas.renderer.setRenderTarget(target); atlas.renderer.render(atlas.scene, camera);
      atlas.renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
      let sum = 0, count = 0;
      for (let y = 48; y < 80; y++) for (let x = 48; x < 80; x++) {
        const at = (y * 128 + x) * 4;
        sum += pixels[at] * .2126 + pixels[at + 1] * .7152 + pixels[at + 2] * .0722; count++;
      }
      return sum / count;
    };
    const day = capture(1), night = capture(-1);
    atlas.renderer.setRenderTarget(null); target.dispose();
    atlas.sky.visible = saved.sky;
    atlas.camera.position.copy(saved.position); atlas.camera.quaternion.copy(saved.quaternion); atlas.camera.fov = saved.fov;
    atlas.renderer.setAnimationLoop(time => atlas.animate(time));
    return { day, night };
  });
  console.log('Moon phase GPU luminance:', phase);
  assert.ok(phase.day > 20 && phase.day > phase.night * 2.5, 'The observed lunar map has a bright illuminated side and a substantially dark night side');
  checkpoint('GPU phase contrast follows the Solar System light direction');

  for (const id of ['sun', 'earth', 'moon', 'io', 'saturn', 'uranus', 'titan', 'janus']) {
    await page.evaluate(id => atlas.focusObject([...catalog.solar, ...solarMoons].find(object => object.id === id)), id);
    await page.waitForFunction(() => !atlas.cameraFlight);
    await page.screenshot({ path: 'test-results/realism-' + id + '-desktop.png' });
  }
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const id of ['sun', 'saturn', 'uranus', 'janus', 'phobos']) {
      await page.evaluate(id => atlas.focusObject([...catalog.solar, ...solarMoons].find(object => object.id === id)), id);
      await page.waitForFunction(() => !atlas.cameraFlight);
      const framing = await page.evaluate(id => {
        atlas.scene.updateMatrixWorld(true);
        const visual = atlas.content.getObjectByName('planet-' + id);
        const projected = new THREE.Box3(), vertex = new THREE.Vector3();
        visual.traverse(node => {
          if (!node.isMesh) return;
          const positions = node.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) projected.expandByPoint(vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).project(atlas.camera));
        });
        const center = visual.getWorldPosition(new THREE.Vector3());
        return { min: projected.min.toArray(), max: projected.max.toArray(), distance: atlas.camera.position.distanceTo(center), extent: visual.userData.visualRadius, minimum: atlas.controls.minDistance };
      }, id);
      assert.ok(framing.distance > framing.extent, id + ' focus stays outside full geometry');
      assert.ok(framing.min.every(value => value > -1) && framing.max.every(value => value < 1), id + ' including rings fits viewport ' + viewport.width + ': ' + JSON.stringify(framing));
    }
  }
  await page.screenshot({ path: 'test-results/realism-phobos-mobile.png' });
  checkpoint('Sun, Saturn and Uranus rings, Janus and irregular moon geometry remain framed on desktop and mobile');

  const xr = await page.evaluate(() => {
    const pose = [...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()];
    const focus = atlas.xr.focusObject, calls = [];
    atlas.renderer.xr.isPresenting = true;
    atlas.xr.focusObject = (object, extent) => calls.push({ id: object.id, extent });
    for (const id of ['sun', 'saturn', 'uranus', 'janus', 'phobos']) atlas.focusFromXR([...catalog.solar, ...solarMoons].find(object => object.id === id));
    atlas.renderer.xr.isPresenting = false; atlas.xr.focusObject = focus;
    return { pose, after: [...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()], calls };
  });
  assert.deepEqual(xr.pose, xr.after, 'XR focus transforms the map without moving the tracked viewer');
  for (const id of ['saturn', 'uranus']) assert.ok(xr.calls.find(call => call.id === id).extent >= bodies.find(body => body.id === id).visualRadius, id + ' XR focus includes ring extent');
  checkpoint('Shared VR focus receives complete visual bounds without moving the viewer camera');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => atlas.showCombinedMap());
  await page.waitForFunction(() => atlas.index === 9 && atlas.combinedView);
  const preview = await page.evaluate(() => {
    atlas.enterPreview({ layout: 'room' });
    atlas.preview.rotateMap(.7); atlas.preview.scaleMap(1.2);
    atlas.scene.updateMatrixWorld(true);
    const before = { root: atlas.mapRoot.matrixWorld.elements.slice(), camera: [...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()] };
    const earth = atlas.combinedView.objects.find(object => object.id === 'earth');
    atlas.preview.lookAtObject(earth);
    const visual = atlas.combinedView.group.getObjectByName('planet-earth');
    atlas.updateBodyLighting();
    const light = atlas.sunLight.getWorldPosition(new THREE.Vector3());
    const matches = [];
    for (const id of ['earth', 'saturn', 'uranus']) {
      const body = atlas.bodyVisuals.get(id);
      const expected = light.clone().sub(body.getWorldPosition(new THREE.Vector3())).normalize();
      for (const material of body.userData.lightingMaterials) matches.push(material.uniforms.uLightDirection.value.dot(expected));
    }
    return { matches, before, visual: !!visual, maps: visual.getObjectByName('planet-surface').material.map?.image?.naturalWidth || 0, objectCount: atlas.combinedView.objects.length };
  });
  assert.equal(preview.visual, true);
  assert.ok(preview.matches.length > 5 && preview.matches.every(dot => dot > .999999), 'Rotating and resizing the immersive map preserves the Sun direction for atmospheres and rings');
  assert.ok(preview.maps > 512, 'Combined PC preview uses a decoded planetary map');
  assert.ok(preview.objectCount >= 118000, 'Realism changes preserve complete star catalogue coverage');
  await page.evaluate(() => { atlas.setObjectLayer('planets', false); atlas.setObjectLayer('planets', true); atlas.setQuality('low'); });
  const placed = await page.evaluate(() => { atlas.scene.updateMatrixWorld(true); return atlas.mapRoot.matrixWorld.elements.slice(); });
  assert.deepEqual(placed, preview.before.root, 'Quality and visibility do not recenter a placed immersive map');
  await page.screenshot({ path: 'test-results/realism-combined-preview.png' });
  await page.evaluate(() => atlas.exitPreview());
  assert.equal(await page.evaluate(() => atlas.controls.enabled), true);
  checkpoint('Combined PC immersive mode retains official textures, complete data and explicit map placement');
  await page.evaluate(() => atlas.dispose());

  let releaseModel;
  const modelGate = new Promise(resolve => { releaseModel = resolve; });
  await page.route('**/models/official/phobos.json', async route => { await modelGate; await route.continue(); });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.atlas?.ready && atlas.bodyVisuals.get('phobos')?.userData.modelLoadStatus === 'loading');
  const retiredGeometry = await page.evaluate(() => {
    window.retiredPhobos = atlas.bodyVisuals.get('phobos');
    const uuid = retiredPhobos.getObjectByName('planet-surface').geometry.uuid;
    atlas.setScale(1, true); atlas.animate(performance.now() + 2000);
    return uuid;
  });
  releaseModel();
  assert.equal(await page.evaluate(() => retiredPhobos.userData.modelReady), false, 'A late model does not attach to a disposed view');
  assert.equal(await page.evaluate(() => retiredPhobos.getObjectByName('planet-surface').geometry.uuid), retiredGeometry);
  assert.equal(await page.evaluate(() => atlas.index), 1, 'An asset response cannot reverse later navigation');
  await page.evaluate(() => atlas.dispose());
  checkpoint('Delayed official geometry cannot reattach to a disposed map or reverse navigation');
  console.log('Realism browser: ' + checkpoints.length + ' checkpoints passed.');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: 'test-results/realism-failure.png' }).catch(() => {});
  console.error('Runtime errors:', errors, 'Asset failures:', failures);
  throw error;
} finally {
  await browser.close();
}
