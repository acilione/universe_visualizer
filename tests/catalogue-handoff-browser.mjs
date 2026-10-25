import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect as playwrightExpect } from '@playwright/test';
const expect = playwrightExpect.configure({ timeout: 45000 });
import { GAIA_DR3_HIPS } from '../src/gaia-manifest.js';

const base = (process.env.TEST_URL || 'http://localhost:5173').replace(/\/$/, '');
const out = 'test-results/catalogue-handoff'; await mkdir(out, { recursive: true });
const service = GAIA_DR3_HIPS.baseUrl;
const properties = `creator_did = ivo://CDS/I/355/gaiadr3\ndataproduct_type = catalog\nhips_frame = equatorial\nhips_tile_format = tsv\nhips_cat_nrows = 1811709771\nhips_order_min = 1\nhips_order = 11\nhips_service_url = ${service}\n`;
const metadata = '<VOTABLE><COOSYS system="ICRS" epoch="2016.0"/><RESOURCE><TABLE><FIELD name="Source" datatype="long"/>' + [['RAdeg','deg'],['DEdeg','deg'],['Gmag','mag'],['Plx','mas'],['e_Plx','mas'],['pmRA','mas/yr'],['pmDE','mas/yr']].map(([name,unit]) => `<FIELD name="${name}" datatype="double" unit="${unit}"/>`).join('') + '</TABLE></RESOURCE></VOTABLE>';
let centre = { ra: 0, dec: 0 }, hold = false;
const held = [], errors = [], checkpoints = [], requests = [];
const tile = () => [['Source','RAdeg','DEdeg','Gmag','Plx','e_Plx','pmRA','pmDE','RUWE','BP-RP'], ['9007199254740993', centre.ra, centre.dec, 4.2, 10, .1, 0, 0, 1.1, .8], ['9007199254740992', centre.ra + .3, centre.dec, 5.2, 10, .1, 0, 0, 1.1, .3]].map(row => row.join('\t')).join('\n');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference', locale: 'en-US' });
const page = await context.newPage(); page.setDefaultTimeout(45000);
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && /THREE\.WebGL|GL_INVALID|Shader Error/i.test(message.text())) errors.push(message.text()); });
const pass = label => { assert.deepEqual(errors, [], label); checkpoints.push(label); console.log('PASS: ' + label); };
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 204, body: '' }));
await context.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 204, body: '' }));
// Test-only access to the real application's instance; production code exposes no global.
await context.route('**/src/main.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + '\nObject.defineProperty(window,"testAtlas",{get:()=>universe});\n' });
});
await context.addInitScript(() => {
  localStorage.setItem('aether.preferences', JSON.stringify({ quality: 'low', autoRotate: false, particles: false, labels: false }));
  window.testFades = []; const original = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    if (this.id === 'universe') window.testFades.push({ frames, duration: options?.duration });
    return original.call(this, frames, options);
  };
});
await context.route(service + '/**', async route => {
  const url = route.request().url(); requests.push(url);
  const headers = { 'access-control-allow-origin': '*' };
  if (url.endsWith('/properties')) return route.fulfill({ status: 200, headers, body: properties });
  if (url.endsWith('/metadata.xml')) return route.fulfill({ status: 200, headers, contentType: 'application/xml', body: metadata });
  if (hold) { held.push(route); return; }
  return route.fulfill({ status: 200, headers, contentType: 'text/tab-separated-values', body: tile() });
});
const mapButton = page.locator('.catalogue-view-switch [data-action="atlas-view"]');
const gaiaButton = page.locator('.catalogue-view-switch [data-action="gaia-stream"]');
const release = async () => { hold = false; for (const route of held.splice(0)) await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: tile() }).catch(() => {}); };
try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await expect(page.locator('.loading')).toBeHidden({ timeout: 90000 });
  await page.waitForFunction(() => window.testAtlas?.index === 9);
  const desktopSpacing = await page.evaluate(() => ({ intro: document.querySelector('.intro').getBoundingClientRect().bottom, sidebar: document.querySelector('.left-panel').getBoundingClientRect().top }));
  assert.ok(desktopSpacing.sidebar >= desktopSpacing.intro + 10, 'The reference panel must clear the Map/Gaia switch');
  centre = await page.evaluate(() => {
    const atlas = testAtlas; atlas.setAutoRotate(false); atlas.cameraFlight = null; atlas.skyFlight = null; atlas.skyEntry = null;
    atlas.selectObject(atlas.objects.find(object => object.id === 'earth') || atlas.objects[0]);
    const damping = atlas.controls.enableDamping; atlas.controls.enableDamping = false; atlas.controls.update(); atlas.controls.enableDamping = damping;
    atlas.camera.position.set(72, 32, 45); atlas.controls.target.set(0, 0, 0); atlas.camera.lookAt(atlas.controls.target);
    atlas.camera.fov = 41; atlas.camera.near = .035; atlas.camera.far = 1200; atlas.camera.updateProjectionMatrix(); atlas.controls.update();
    const serialize = saved => ({ index: saved.index, selected: saved.selected?.id, position: saved.camera.position.toArray(), quaternion: saved.camera.quaternion.toArray(), target: saved.camera.target.toArray(), fov: saved.camera.fov, near: saved.camera.near, far: saved.camera.far, zoom: saved.camera.zoom, mapPosition: saved.mapTransform.position.toArray(), mapQuaternion: saved.mapTransform.quaternion.toArray(), mapScale: saved.mapTransform.scale.toArray(), minDistance: saved.controls.minDistance, maxDistance: saved.controls.maxDistance });
    window.serializeAtlas = () => serialize(atlas.captureAtlasView());
    const capture = atlas.captureAtlasView.bind(atlas);
    atlas.captureAtlasView = () => { const saved = capture(); window.entrySnapshot = serialize(saved); window.entryDirection = atlas.directionToGaia().toArray(); return saved; };
    const enter = atlas.showGaiaSky.bind(atlas), restore = atlas.restoreAtlasView.bind(atlas);
    window.commitOpacities = [];
    atlas.showGaiaSky = options => { commitOpacities.push(Number(getComputedStyle(document.querySelector('#universe')).opacity)); return enter(options); };
    atlas.restoreAtlasView = saved => { commitOpacities.push(Number(getComputedStyle(document.querySelector('#universe')).opacity)); return restore(saved); };
    const direction = atlas.directionToGaia(); window.entryDirection = direction.toArray();
    return { ra: (Math.atan2(-direction.z, direction.x) * 180 / Math.PI + 360) % 360, dec: Math.asin(direction.y) * 180 / Math.PI };
  });
  hold = true; await gaiaButton.click();
  await expect.poll(() => held.length).toBeGreaterThan(0);
  assert.equal(await page.evaluate(() => testAtlas.index), 9, 'The old map must remain active while the initial Gaia region loads');
  await expect(page.locator('.catalogue-view-switch')).toHaveAttribute('aria-busy', 'true'); await expect(gaiaButton).toBeDisabled();
  await release();
  await expect(page.locator('.app-shell')).toHaveClass(/gaia-stream-view/);
  await expect(gaiaButton).toBeEnabled();
  await page.waitForFunction(() => testAtlas.gaiaSkyView?.diagnostics.renderedSources === 2);
  const entry = await page.evaluate(() => ({ expected: entryDirection, actual: testAtlas.directionToGaia().toArray(), fov: testAtlas.camera.fov, savedFov: entrySnapshot.fov, opacities: commitOpacities, fades: testFades, flights: Boolean(testAtlas.cameraFlight || testAtlas.skyFlight || testAtlas.skyEntry) }));
  assert.ok(Math.hypot(...entry.actual.map((value, index) => value - entry.expected[index])) < 1e-7, JSON.stringify(entry));
  assert.equal(entry.fov, entry.savedFov); assert.equal(entry.flights, false); assert.ok(entry.opacities[0] <= .01);
  assert.deepEqual(entry.fades.slice(0, 2).map(fade => fade.duration), [180, 240]);
  await expect(gaiaButton).toHaveAttribute('aria-pressed', 'true'); await expect(mapButton).toHaveAttribute('aria-pressed', 'false');
  pass('Initial tiles load over the existing map, then a full-canvas fade preserves the actual region and FOV without a camera flight');

  const expected = await page.evaluate(() => entrySnapshot);
  await mapButton.click(); await expect(mapButton).toBeEnabled();
  await expect(page.locator('.app-shell')).not.toHaveClass(/gaia-stream-view/);
  const restored = await page.evaluate(() => serializeAtlas());
  for (const key of ['index','selected','fov','near','far','zoom','minDistance','maxDistance']) assert.equal(restored[key], expected[key], key);
  for (const key of ['position','quaternion','target','mapPosition','mapQuaternion','mapScale']) assert.ok(Math.hypot(...restored[key].map((value,index) => value - expected[key][index])) < 1e-6, key);
  assert.equal(await page.evaluate(() => testAtlas.gaiaSkyView), null);
  assert.ok(await page.evaluate(() => commitOpacities[1] <= .01));
  pass('Map return restores the previous camera, target, FOV, map transform and selected object and disposes the streamed view');

  hold = true; await gaiaButton.click(); await expect.poll(() => held.length).toBeGreaterThan(0);
  await page.locator('a.brand').click(); await release();
  await expect(gaiaButton).toBeEnabled();
  assert.equal(await page.evaluate(() => testAtlas.index), 9); assert.equal(await page.evaluate(() => testAtlas.gaiaSkyView), null);
  await expect(page.locator('.app-shell')).not.toHaveClass(/gaia-stream-view/);
  pass('Choosing the main map during preparation cancels the pending handoff and cannot reopen Gaia');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(mapButton).toBeVisible(); await expect(gaiaButton).toBeVisible();
  const layout = await page.evaluate(() => {
    const group = document.querySelector('.catalogue-view-switch').getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll('.catalogue-view-switch button')).map(button => button.getBoundingClientRect());
    return { overflow: document.documentElement.scrollWidth > innerWidth, inViewport: group.left >= 0 && group.right <= innerWidth, disjoint: buttons[0].right <= buttons[1].left || buttons[1].right <= buttons[0].left };
  });
  assert.equal(layout.overflow, false); assert.equal(layout.inViewport, true); assert.equal(layout.disjoint, true);
  await page.screenshot({ path: out + '/mobile-map.png' });
  pass('Persistent Map and Gaia controls remain visible, separate and within a narrow viewport');
  await writeFile(out + '/report.json', JSON.stringify({ checkpoints, requests: requests.length, errors }, null, 2));
} catch (error) { console.error(error); console.error('Handoff diagnostics:', await page.evaluate(() => ({ index: window.testAtlas?.index, viewRequest: window.testAtlas?.viewRequest, busy: document.querySelector('.catalogue-view-switch')?.getAttribute('aria-busy'), opacity: getComputedStyle(document.querySelector('#universe')).opacity, animations: document.querySelector('#universe').getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime })), commits: window.commitOpacities, errors: document.querySelector('.toast')?.textContent })).catch(() => null)); await page.screenshot({ path: out + '/failure.png' }).catch(() => {}); throw error; }
finally { await release(); await browser.close(); }
