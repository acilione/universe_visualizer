import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect as playwrightExpect } from '@playwright/test';
import { GAIA_DR3_HIPS } from '../src/gaia-manifest.js';

const expect = playwrightExpect.configure({ timeout: 45000 });
const base = (process.env.TEST_URL || process.env.ENGINE_TEST_URL || 'http://localhost:5173').replace(/\/$/, '');
const output = 'test-results/multi-constellations'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: .75, locale: 'it-IT', timezoneId: 'UTC', reducedMotion: 'no-preference' });
const page = await context.newPage(); page.setDefaultTimeout(45000);
const errors = [], checkpoints = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && /THREE\.WebGL|GL_INVALID|Shader Error/i.test(message.text())) errors.push(message.text()); });
const pass = label => { assert.deepEqual(errors, [], label); checkpoints.push(label); console.log('PASS: ' + label); };
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 204, body: '' }));
await context.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 204, body: '' }));
// The test exposes the application's actual instance without a production global.
await context.route('**/src/main.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + '\nObject.defineProperty(window,"testAtlas",{get:()=>universe});\n' });
});
await context.addInitScript(() => localStorage.setItem('aether.preferences', JSON.stringify({ quality: 'low', autoRotate: false, particles: false, labels: false })));
const service = GAIA_DR3_HIPS.baseUrl;
const properties = `creator_did = ivo://CDS/I/355/gaiadr3\ndataproduct_type = catalog\nhips_frame = equatorial\nhips_tile_format = tsv\nhips_cat_nrows = 1811709771\nhips_order_min = 1\nhips_order = 11\nhips_service_url = ${service}\n`;
const metadata = '<VOTABLE><COOSYS system="ICRS" epoch="2016.0"/><RESOURCE><TABLE><FIELD name="Source" datatype="long"/>' + [['RAdeg','deg'],['DEdeg','deg'],['Gmag','mag'],['Plx','mas'],['e_Plx','mas'],['pmRA','mas/yr'],['pmDE','mas/yr']].map(([name,unit]) => `<FIELD name="${name}" datatype="double" unit="${unit}"/>`).join('') + '</TABLE></RESOURCE></VOTABLE>';
let centre = { ra: 0, dec: 0 };
await context.route(service + '/**', route => {
  const url = route.request().url(), headers = { 'access-control-allow-origin': '*' };
  if (url.endsWith('/properties')) return route.fulfill({ status: 200, headers, body: properties });
  if (url.endsWith('/metadata.xml')) return route.fulfill({ status: 200, headers, contentType: 'application/xml', body: metadata });
  const body = [['Source','RAdeg','DEdeg','Gmag','Plx','e_Plx','pmRA','pmDE'], ['9007199254740993',centre.ra,centre.dec,4.2,10,.1,0,0]].map(row => row.join('\t')).join('\n');
  return route.fulfill({ status: 200, headers, contentType: 'text/tab-separated-values', body });
});
const option = id => page.locator(`#modal [data-constellation="${id}"]`);
const remove = id => page.locator(`#modal #constellation-selection [data-remove-constellation="${id}"]`);
const waitSet = async ids => {
  await page.waitForFunction(expected => window.testAtlas?.index === 6 && JSON.stringify([...(testAtlas.viewContext.constellationIds || [])].sort()) === JSON.stringify([...expected].sort()), ids);
  await expect(page.locator('#constellation-controls')).not.toHaveAttribute('aria-busy', 'true');
};
const open = async () => { await page.locator('[data-action="constellations"]').first().click(); await expect(page.locator('#constellation-search')).toBeVisible(); };
const done = async () => { await page.locator('#modal [data-action="view-constellations"]').click(); await expect(page.locator('#modal')).not.toBeVisible(); };
const settle = async () => {
  await page.waitForFunction(() => window.testAtlas && !testAtlas.cameraFlight && !testAtlas.skyFlight && !testAtlas.skyEntry && !testAtlas.preview.isTransitioning);
  // Discard inertia left by the initial atlas camera flight before measuring
  // whether a selection edit changes an otherwise stationary viewpoint.
  await page.evaluate(() => {
    if (!testAtlas.controls.enabled || testAtlas.preview.isActive || testAtlas.isSkyNavigation()) return;
    const damping = testAtlas.controls.enableDamping;
    testAtlas.controls.enableDamping = false; testAtlas.controls.update(); testAtlas.controls.enableDamping = damping;
  });
};
const snapshot = () => page.evaluate(() => {
  const a = testAtlas; a.mapRoot.updateWorldMatrix(true, false);
  return { position: a.camera.position.toArray(), quaternion: a.camera.quaternion.toArray(), target: a.controls.target.toArray(), map: a.mapRoot.matrixWorld.toArray(), fov: a.camera.fov, earth: a.earthPerspective };
});
const samePose = (actual, expected, label) => {
  for (const key of ['position','quaternion','target','map']) assert.ok(Math.hypot(...actual[key].map((value, index) => value - expected[key][index])) < 1e-7, label + ': ' + key + ' ' + JSON.stringify({actual:actual[key],expected:expected[key]}));
  assert.equal(actual.fov, expected.fov, label + ': FOV'); assert.equal(actual.earth, expected.earth, label + ': perspective');
};
const changeLanguage = async language => {
  await page.locator('[data-action="settings"]').first().click();
  await Promise.all([page.waitForEvent('load', { timeout: 90000 }), page.locator('#language-setting').selectOption(language)]);
  await page.waitForLoadState('networkidle'); await expect(page.locator('.loading')).toBeHidden({ timeout: 90000 });
  await expect(page.locator('html')).toHaveAttribute('lang', language);
};
try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await expect(page.locator('.loading')).toBeHidden({ timeout: 90000 });
  await page.waitForFunction(() => window.testAtlas?.index === 9);
  await open();
  await expect(page.locator('#constellation-results [role="checkbox"]')).toHaveCount(88);
  await expect(page.locator('#constellation-results [aria-checked="true"]')).toHaveCount(0);
  await expect(page.locator('#modal [data-remove-constellation]')).toHaveCount(0);
  await expect(page.locator('[data-action="observer-orion-winter"], #constellation-apply, [data-action="apply-observer"]')).toHaveCount(0);
  await option('UMa').click(); await waitSet(['UMa']); await settle();
  await expect(option('UMa')).toHaveAttribute('aria-checked', 'true'); await expect(page.locator('#modal')).toBeVisible();
  const firstPose = await snapshot();
  await option('Cas').click(); await waitSet(['UMa','Cas']);
  await expect(page.locator('#modal #constellation-selection [data-remove-constellation]')).toHaveCount(2);
  samePose(await snapshot(), firstPose, 'Adding a figure');
  const union = await page.evaluate(() => ({ ids: testAtlas.viewContext.constellationIds, stars: testAtlas.viewContext.starCount, unique: new Set(testAtlas.objects.map(object => object.id)).size, objects: testAtlas.objects.length,
    clouds: testAtlas.content.getObjectsByProperty('name', 'catalog-stars').length, lines: testAtlas.content.getObjectsByProperty('name', 'constellation-lines').length }));
  assert.equal(union.objects, union.unique); assert.ok(union.stars > 20); assert.equal(union.clouds, 1); assert.equal(union.lines, 1);
  await page.locator('#constellation-search').fill('cass'); await expect(page.locator('#constellation-results [data-constellation]')).toHaveCount(1);
  await expect(page.locator('#modal #constellation-selection [data-remove-constellation]')).toHaveCount(2);
  await page.locator('#constellation-search').fill('');
  await remove('Cas').click(); await waitSet(['UMa']); samePose(await snapshot(), firstPose, 'Removing one figure');
  await remove('UMa').click(); await waitSet([]); samePose(await snapshot(), firstPose, 'Removing the last figure');
  assert.deepEqual(await page.evaluate(() => ({ objects: testAtlas.objects.length, count: testAtlas.viewContext.starCount, selected: testAtlas.selected?.id ?? null })), { objects: 0, count: 0, selected: null });
  await expect(option('Ori')).toHaveAttribute('aria-checked', 'false');
  const allIds = await page.locator('#constellation-results [data-constellation]').evaluateAll(elements => elements.map(element => element.dataset.constellation));
  await page.locator('#modal [data-action="all-constellations"]').click(); await waitSet(allIds);
  samePose(await snapshot(), firstPose, 'Adding all figures');
  assert.deepEqual(await page.evaluate(() => ({ count: testAtlas.viewContext.constellationCount, members: testAtlas.viewContext.starCount, segments: testAtlas.viewContext.segmentCount, clouds: testAtlas.content.getObjectsByProperty('name','catalog-stars').length })), { count:88, members:710, segments:695, clouds:1 });
  await page.locator('#modal [data-action="clear-constellations"]').click(); await waitSet([]);
  samePose(await snapshot(), firstPose, 'Clearing all figures');
  await expect(page.locator('#object-card')).toContainText('No figures selected');
  pass('Checklist adds/removes figures without closing or moving the map; an empty selection stays empty with one shared star field');

  await option('Ori').click(); await waitSet(['Ori']); await option('Cas').click(); await waitSet(['Ori','Cas']); await done();
  await page.locator('[data-action="earth-perspective"]').click(); await settle();
  const earthPose = await snapshot(); await open();
  await option('UMa').click(); await waitSet(['Ori','Cas','UMa']); samePose(await snapshot(), earthPose, 'Earth-origin addition');
  await remove('UMa').click(); await waitSet(['Ori','Cas']); samePose(await snapshot(), earthPose, 'Earth-origin removal'); await done();
  await page.locator('[data-action="constellation-observer"]').click();
  const originalObserver = await page.evaluate(() => ({ ...testAtlas.constellationData.observer }));
  await page.locator('#observer-latitude').fill('91'); await page.locator('#observer-latitude').dispatchEvent('change');
  assert.equal(await page.locator('#observer-latitude').evaluate(input => input.validity.valid), false);
  assert.deepEqual(await page.evaluate(() => testAtlas.constellationData.observer), originalObserver);
  await page.locator('#observer-latitude').fill('38\u00b006\u203251.98\u2033N');
  await page.locator('#observer-longitude').fill('15\u00b039\u203200\u2033E');
  await page.locator('#observer-timezone').selectOption('Europe/Rome');
  await page.locator('#observer-datetime').fill('2026-12-11T20:00'); await page.locator('#observer-datetime').dispatchEvent('change');
  await page.waitForFunction(() => testAtlas.constellationData.observer.dateIso === '2026-12-11T19:00:00.000Z' && Math.abs(testAtlas.constellationData.observer.latitude - 38.11443888888889) < 1e-10 && testAtlas.constellationData.observer.longitude === 15.65);
  await expect(page.locator('#observer-status')).not.toBeEmpty(); await expect(page.locator('#modal')).toBeVisible();
  assert.doesNotMatch(await page.locator('#observer-fields').innerText(), /Orion example|Esempio Orione|Update Orion|Aggiorna Orione/);
  await done(); await waitSet(['Ori','Cas']);
  pass('Earth-origin edits preserve the view and observer fields apply validated DMS/timezone changes automatically');

  await changeLanguage('it'); await waitSet(['Ori','Cas']);
  await expect(page.locator('.app-shell')).toHaveClass(/earth-perspective-view/);
  await expect(page.locator('#constellation-status time')).toHaveAttribute('datetime', '2026-12-11T19:00:00.000Z');
  await open(); await expect(option('Ori')).toHaveAttribute('aria-checked', 'true'); await expect(option('Cas')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#modal #constellation-selection')).toContainText('Orione');
  await expect(page.locator('#modal [data-action="view-constellations"]')).toHaveText('Mostra mappa'); await done(); await settle();
  const beforeGaia = await snapshot();
  centre = await page.evaluate(() => { const direction = testAtlas.directionToGaia(); return { ra: (Math.atan2(-direction.z, direction.x) * 180 / Math.PI + 360) % 360, dec: Math.asin(direction.y) * 180 / Math.PI }; });
  await page.locator('.catalogue-view-switch [data-action="gaia-stream"]').click();
  await expect(page.locator('.app-shell')).toHaveClass(/gaia-stream-view/);
  await expect(page.locator('.catalogue-view-switch [data-action="atlas-view"]')).toBeEnabled();
  await page.locator('.catalogue-view-switch [data-action="atlas-view"]').click(); await waitSet(['Ori','Cas']);
  await expect(page.locator('.catalogue-view-switch [data-action="atlas-view"]')).toBeEnabled(); await settle();
  samePose(await snapshot(), beforeGaia, 'Gaia round trip');
  await expect(page.locator('#constellation-status time')).toHaveAttribute('datetime', '2026-12-11T19:00:00.000Z');
  await changeLanguage('en'); await waitSet(['Ori','Cas']);
  await expect(page.locator('.app-shell')).toHaveClass(/earth-perspective-view/);
  pass('Both constellation IDs, observer time, Earth perspective and camera survive language changes and a Gaia round trip');

  await page.setViewportSize({ width: 390, height: 844 }); await open();
  await option('UMa').focus(); await page.keyboard.press('Space'); await waitSet(['Ori','Cas','UMa']);
  await expect(option('UMa')).toHaveAttribute('aria-checked', 'true'); await remove('UMa').click(); await waitSet(['Ori','Cas']);
  const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth, body: document.querySelector('#modal-body').scrollWidth, bodyClient: document.querySelector('#modal-body').clientWidth }));
  assert.ok(dimensions.document <= dimensions.viewport && dimensions.body <= dimensions.bodyClient + 1, JSON.stringify(dimensions));
  await page.locator('#constellation-search').fill('cass');
  await page.screenshot({ path: output + '/mobile-selection.png', timeout: 60000 }); await done();
  pass('Checkboxes support keyboard selection and selected chips remain usable on a narrow screen');

  await page.setViewportSize({ width: 1280, height: 900 }); await settle();
  await page.evaluate(() => testAtlas.enterPreview({ layout: 'room', directTravel: true })); await settle();
  const previewPose = await snapshot();
  for (const ids of [['Ori','Cas','UMa'], ['Cas'], [], ['Ori','Cas']]) {
    await page.evaluate(ids => testAtlas.showConstellations(ids), ids); await waitSet(ids);
    samePose(await snapshot(), previewPose, 'Preview collection edit ' + ids.join(','));
    assert.equal(await page.evaluate(() => testAtlas.preview.isTransitioning), false, 'A line selection edit must not create a camera/map jump');
  }
  await page.evaluate(() => testAtlas.exitPreview());
  pass('PC preview keeps viewer pose, field of view and world placement while adding, removing or clearing constellations');
  await writeFile(output + '/report.json', JSON.stringify({ checkpoints, errors }, null, 2));
} catch (error) {
  console.error(error);
  console.error('Multi-constellation diagnostics:', await page.evaluate(() => ({ index: window.testAtlas?.index, context: window.testAtlas?.viewContext, modal: document.querySelector('#modal')?.open, progress: document.querySelector('#constellation-progress')?.textContent, observer: document.querySelector('#observer-status')?.textContent })).catch(() => null));
  await page.screenshot({ path: output + '/failure.png', timeout: 15000 }).catch(() => {}); throw error;
} finally { await browser.close(); }
