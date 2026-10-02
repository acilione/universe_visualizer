import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.ENGINE_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir('test-results', { recursive: true });
const errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base + '/tests/fixtures/engine.html', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => window.atlas?.ready);
  await page.evaluate(async () => {
    window.THREE = await import('/node_modules/three/build/three.module.js');
    window.visuals = await import('/src/planet-visuals.js');
    atlas.renderer.setAnimationLoop(null);
    document.querySelector('.labels').style.display = 'none';
    const scene = new THREE.Scene();
    const saturn = visuals.createPlanetVisual({ ...catalog.solar.find(object => object.id === 'saturn'), size: 1 });
    saturn.getObjectByName('body-axis').rotation.set(0, 0, 0);
    const light = new THREE.Vector3(3, 2, 5).normalize();
    visuals.updatePlanetVisualLighting(saturn, light);
    const source = new THREE.DirectionalLight('#ffffff', 3.2);
    source.position.copy(light); scene.add(source, new THREE.AmbientLight('#ffffff', .07), saturn);
    const camera = new THREE.OrthographicCamera(-2.65, 2.65, 2.65, -2.65, .01, 100);
    camera.position.set(0, 8, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    window.probe = { scene, saturn, camera, light };
  });
  await page.waitForFunction(() => {
    const textures = [];
    probe.saturn.traverse(node => {
      if (node.material?.map) textures.push(node.material.map);
      for (const uniform of Object.values(node.material?.uniforms || {})) if (uniform.value?.isTexture) textures.push(uniform.value);
    });
    return textures.length > 1 && textures.every(texture => texture.image?.complete && texture.image.naturalWidth > 0);
  });
  const evidence = await page.evaluate(() => {
    const { scene, saturn, camera, light } = probe;
    const target = new THREE.WebGLRenderTarget(384, 384);
    const pixels = new Uint8Array(384 * 384 * 4);
    const render = () => { atlas.renderer.setRenderTarget(target); atlas.renderer.render(scene, camera); atlas.renderer.readRenderTargetPixels(target, 0, 0, 384, 384, pixels); };
    const sample = position => {
      const ndc = position.clone().project(camera), cx = Math.round((ndc.x * .5 + .5) * 384), cy = Math.round((ndc.y * .5 + .5) * 384);
      let sum = 0, count = 0;
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
        const at = (y * 384 + x) * 4;
        sum += pixels[at] * .2126 + pixels[at + 1] * .7152 + pixels[at + 2] * .0722; count++;
      }
      return sum / count;
    };
    render();
    const radial = new THREE.Vector3(light.x, 0, light.z).normalize().multiplyScalar(1.82);
    const litRing = sample(radial), planetShadowOnRing = sample(radial.clone().negate());
    const polarRatio = 54364 / 60268;
    const bodyPoint = new THREE.Vector3(0, -.35, Math.sqrt(1 - Math.pow(.35 / polarRatio, 2)));
    const ringShadowOnPlanet = sample(bodyPoint);
    // Reference image disables only the analytic ring intersection by making
    // its test ray polar. Real scene illumination and photographic albedo remain.
    const surface = saturn.getObjectByName('planet-surface');
    surface.material.uniforms.uLightDirection.value.set(0, 1, 0);
    render();
    const sameSurfaceWithoutRingShadow = sample(bodyPoint);
    visuals.updatePlanetVisualLighting(saturn, light);
    atlas.renderer.setRenderTarget(null); target.dispose();
    const ringTextures = [];
    saturn.getObjectByName('saturn-rings').traverse(node => {
      for (const value of Object.values(node.material?.uniforms || {})) if (value.value?.isTexture && !ringTextures.includes(value.value)) ringTextures.push(value.value);
      if (node.material?.map && !ringTextures.includes(node.material.map)) ringTextures.push(node.material.map);
    });
    const textureEvidence = ringTextures.map(texture => {
      const image = texture.image, canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data, colours = new Set();
      for (let i = 0; i < data.length; i += 4) colours.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ',' + data[i + 3]);
      return { width: canvas.width, height: canvas.height, uniqueColours: colours.size, source: image.src };
    });
    camera.left = -2.65 * 1280 / 900; camera.right = 2.65 * 1280 / 900; camera.updateProjectionMatrix();
    atlas.renderer.render(scene, camera);
    return { litRing, planetShadowOnRing, ringShadowOnPlanet, sameSurfaceWithoutRingShadow, textureEvidence };
  });
  console.log('Saturn GPU evidence:', evidence);
  assert.ok(evidence.textureEvidence.length > 0 && evidence.textureEvidence.some(texture => texture.uniqueColours > 64), 'Official ring imagery retains fine radial structure instead of flat bands');
  assert.ok(evidence.litRing > 10 && evidence.litRing > evidence.planetShadowOnRing * 2, 'The planet casts an actual rendered shadow across the rings');
  assert.ok(evidence.sameSurfaceWithoutRingShadow > evidence.ringShadowOnPlanet * 1.3, 'The rings cast an actual rendered shadow on the same photographed surface');
  await page.screenshot({ path: 'test-results/realistic-saturn-rings-desktop.png' });
  await page.evaluate(() => {
    atlas.renderer.setAnimationLoop(time => atlas.animate(time));
    atlas.setLayer('labels', false); atlas.setLayer('grid', false); atlas.setLayer('particles', false);
    atlas.focusObject(catalog.solar.find(object => object.id === 'neptune'));
  });
  await page.waitForFunction(() => !atlas.cameraFlight);
  await page.screenshot({ path: 'test-results/realistic-neptune-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => atlas.focusObject(catalog.solar.find(object => object.id === 'saturn')));
  await page.waitForFunction(() => !atlas.cameraFlight);
  const bounds = await page.evaluate(() => {
    atlas.scene.updateMatrixWorld(true);
    const visual = atlas.bodyVisuals.get('saturn'), projected = new THREE.Box3(), vertex = new THREE.Vector3();
    visual.traverse(node => { if (node.isMesh) for (let i = 0; i < node.geometry.attributes.position.count; i++) projected.expandByPoint(vertex.fromBufferAttribute(node.geometry.attributes.position, i).applyMatrix4(node.matrixWorld).project(atlas.camera)); });
    return { min: projected.min.toArray(), max: projected.max.toArray() };
  });
  assert.ok(bounds.min.every(value => value > -1) && bounds.max.every(value => value < 1), 'Full textured rings remain within the mobile viewport');
  await page.screenshot({ path: 'test-results/realistic-saturn-rings-mobile.png' });
  assert.deepEqual(errors, [], 'No JavaScript or shader compilation errors');
  await page.evaluate(() => { atlas.disposeGroup(probe.saturn); atlas.dispose(); });
  console.log('PASS: Official Saturn ring detail, both rendered shadow directions, mobile framing and Neptune shader.');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: 'test-results/realistic-rings-failure.png' }).catch(() => {});
  console.error('Runtime errors:', errors);
  throw error;
} finally {
  await browser.close();
}
