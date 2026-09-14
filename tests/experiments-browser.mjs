import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://localhost:5174';
const engineBase = process.env.ENGINE_TEST_URL || 'http://localhost:5173';
const audit = JSON.parse(await readFile(new URL('../public/catalog/gaia-match-audit.json', import.meta.url), 'utf8'));
const matched = audit.matched[0], added = audit.addedSourceIds[0];
assert.ok(matched && added);
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
let page, delayedResponse = null;
const checkpoint = label => { assert.deepEqual(errors, []); console.log('PASS: ' + label); };
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'it-IT', reducedMotion: 'reduce' });
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  if (process.env.EXPERIMENTS_UI_ONLY !== '1') {
    await page.goto(engineBase + '/tests/fixtures/engine.html', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.atlas?.ready);
    const counts = await page.evaluate(async ({ matched, added }) => {
      const { loadCelestialCatalog } = await import('/src/celestial-catalog.js');
      const data = await loadCelestialCatalog({ includeGaia: true });
      await atlas.showCombinedMap(data);
      atlas.enterPreview({ layout: 'room' });
      atlas.scene.updateMatrixWorld(true);
      const root = atlas.mapRoot.matrixWorld.elements.slice();
      atlas.focusObject(data.byId.get('gaia-dr3-' + added));
      atlas.scene.updateMatrixWorld(true);
      const stars = atlas.combinedView.group.getObjectByName('combined-star-points');
      return {
        context: atlas.viewContext.mode, preview: atlas.preview.isActive,
        stars: stars.geometry.attributes.position.count,
        expectedStars: data.stars.filter(star => Number.isFinite(star.raDeg) && Number.isFinite(star.decDeg)).length,
        added: atlas.combinedView.objects.filter(object => object.gaiaSourceId === added).length,
        matched: atlas.combinedView.objects.filter(object => object.gaiaSourceId === matched.sourceId).map(object => object.id),
        unchangedRoot: JSON.stringify(root) === JSON.stringify(atlas.mapRoot.matrixWorld.elements),
        allCategories: Object.values(atlas.combinedView.layers).every(layer => layer.visible),
      };
    }, { matched, added });
    assert.equal(counts.context, 'combined-map');
    assert.equal(counts.preview, true);
    assert.equal(counts.stars, counts.expectedStars);
    assert.equal(counts.added, 1);
    assert.deepEqual(counts.matched, [matched.nasaId]);
    assert.ok(counts.unchangedRoot && counts.allCategories);
    checkpoint('Combined PC preview renders the merged Gaia catalogue once per identity without moving map placement');
  }

  let nasaRequests = 0, imageRequests = 0, mode = 'success';
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64');
  await page.route('https://cdn.esahubble.org/**', async route => { imageRequests++; await route.fulfill({ contentType: 'image/png', body: pixel }); });
  await page.route('https://images-assets.nasa.gov/**', route => route.fulfill({ contentType: 'image/png', body: pixel }));
  const searchResponse = { collection: { items: [{
    data: [{ nasa_id: 'PIATEST', media_type: 'image', title: '<img src=x onerror=alert(1)> archive record', secondary_creator: 'NASA / Test credit' }],
    links: [{ href: 'https://images-assets.nasa.gov/image/PIATEST/test.jpg', rel: 'preview', render: 'image' }],
  }] } };
  await page.route('https://images-api.nasa.gov/search**', async route => {
    nasaRequests++;
    if (mode === 'fail') return route.fulfill({ status: 503, body: 'Unavailable' });
    if (mode === 'delay') return new Promise(resolve => {
      delayedResponse = async () => {
        try { await route.fulfill({ contentType: 'application/json', body: JSON.stringify(searchResponse) }); } catch { /* Aborted by gallery close. */ }
        resolve();
      };
    });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(searchResponse) });
  });
  const card = page.locator('#object-card'), modal = page.locator('#modal');
  async function ready() {
    await expect(page.locator('.loading')).toBeHidden({ timeout: 90000 });
    await expect(page.locator('.webgl-error')).toHaveCount(0);
  }
  async function close() { await modal.locator('[data-action=close]').click(); await expect(modal).not.toBeVisible(); }
  async function search(scope, query) {
    await page.locator('[data-action="' + (scope === 'nebulae' ? 'nasa-nebulae' : 'nasa-stars') + '"]').first().click();
    await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false', { timeout: 90000 });
    await page.locator('#search-input').fill(query);
    await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
  }
  async function select(id) {
    await page.locator('#search-results [data-object="' + id + '"]').click();
    await expect(modal).not.toBeVisible();
    await expect(page.locator('.app-shell')).toHaveClass(/nasa-sky-view/);
  }
  async function settings() {
    await page.locator('[data-action="settings"]').first().click();
    await expect(modal).toHaveAttribute('data-kind', 'settings');
  }
  async function toggleGaia() {
    await Promise.all([page.waitForEvent('load'), page.locator('[data-action="toggle-gaia"]').click()]);
    await ready();
  }
  async function openImages() {
    if (await card.isVisible()) await card.locator('[data-action="official-images"]').click();
    else {
      await page.locator('.mobile-info[data-action="object"]').click();
      await modal.locator('[data-action="official-images"]').click();
    }
    await expect(modal).toHaveAttribute('data-kind', 'images');
  }

  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await ready();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('aether.preferences') || '{}').gaiaDr3 === true), false);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await search('nebulae', 'M42');
  await select('ngc-1976');
  await expect(card.locator('h2')).toContainText('Orion');
  await expect(card.locator('img')).toHaveCount(0);
  assert.equal(imageRequests, 0);
  assert.equal(nasaRequests, 0);
  checkpoint('NASA-only default keeps object cards image-free and makes no image archive requests');

  await openImages();
  await expect(page.locator('.archive-image[data-verified="true"]')).toHaveCount(1);
  await expect(page.locator('.archive-credit')).toContainText('Treasury Project Team');
  await expect(page.locator('.archive-image a[href="https://esahubble.org/images/heic0601a/"]')).toHaveCount(2);
  const verifiedImage = page.locator('.archive-image img').first();
  await expect(verifiedImage).toHaveCSS('object-fit', 'contain');
  await expect(verifiedImage).toBeVisible();
  await expect.poll(() => verifiedImage.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  assert.ok(imageRequests > 0);
  assert.equal(nasaRequests, 0);
  mode = 'fail';
  await page.locator('[data-action="search-official-images"]').click();
  await expect(page.locator('.archive-status')).toContainText('unavailable');
  await expect(page.locator('[data-action="search-official-images"]')).toBeEnabled();
  mode = 'success';
  await page.locator('[data-action="search-official-images"]').click();
  await expect(page.locator('.archive-search-results .archive-image')).toHaveCount(1);
  await expect(page.locator('.archive-search-results .archive-image')).toHaveAttribute('data-verified', 'false');
  await expect(page.locator('.archive-search-results img')).toHaveCount(1);
  await expect(page.locator('.archive-search-results h3')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.archive-search-results .archive-image-type')).toHaveText('NASA search result');
  await page.screenshot({ path: 'test-results/experiments-images.png' });
  checkpoint('Opt-in gallery preserves full credits, image bounds, honest search classifications, escaped metadata, and retry');

  mode = 'delay';
  await page.locator('[data-action="search-official-images"]').click();
  await expect.poll(() => typeof delayedResponse).toBe('function');
  await close();
  await settings();
  await delayedResponse(); delayedResponse = null;
  await expect(modal).toHaveAttribute('data-kind', 'settings');
  await expect(page.locator('.archive-gallery')).toHaveCount(0);
  await page.locator('[data-action="gaia-info"]').click();
  await expect(page.locator('#gaia-summary')).toContainText(audit.counts.uniqueSourceCount.toLocaleString('en-US'));
  for (const key of ['matchedCount','addedCount','quarantinedCount','repeatedRowCount']) {
    await expect(page.locator('[data-gaia-count="' + key + '"]')).toHaveText(audit.counts[key].toLocaleString('en-US'));
  }
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('aether.preferences') || '{}').gaiaDr3 === true), false);
  await page.screenshot({ path: 'test-results/experiments-gaia-audit.png' });
  await toggleGaia();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('aether.preferences')).gaiaDr3), true);
  await expect(page.locator('.app-shell')).toHaveClass(/nasa-sky-view/, { timeout: 90000 });
  await expect(card.locator('h2')).toContainText('Orion');
  checkpoint('Closing an archive request prevents stale content; Gaia comparison matches the audit and enabling preserves the map selection');

  await search('stars', matched.sourceId);
  await expect(page.locator('#search-results [data-object]')).toHaveCount(1);
  await expect(page.locator('#search-results [data-object="' + matched.nasaId + '"]')).toHaveCount(1);
  await select(matched.nasaId);
  await expect(card.locator('.gaia-measurements')).toContainText(matched.sourceId);
  await card.locator('[data-action="object"]').first().click();
  await expect(page.locator('#modal-body .gaia-measurements')).toContainText('J2016.0');
  await expect(page.locator('#modal-body a[href*="cosmos.esa.int"]')).not.toHaveCount(0);
  await close();
  await search('stars', added);
  await expect(page.locator('#search-results [data-object]')).toHaveCount(1);
  await select('gaia-dr3-' + added);
  await expect(card.locator('h2')).toContainText(added);
  await expect(card.locator('.gaia-measurements')).toContainText('APPARENT MAGNITUDE');
  await card.locator('[data-action="object"]').first().click();
  await expect(page.locator('#modal-body')).toContainText('J2016.0');
  await expect(page.locator('#modal-body')).toContainText('RUWE');
  await expect(page.locator('#modal-body .planet-measurements > div').filter({ hasText: 'CATALOGUE IDENTIFIERS' }).locator('strong')).toContainText(added);
  await expect(page.locator('#modal-body a[href*="cosmos.esa.int"]')).not.toHaveCount(0);
  await close();
  checkpoint('Gaia source-ID search returns one canonical NASA association or one additional ESA record with native measurements');

  await search('stars', matched.sourceId);
  await select(matched.nasaId);
  const matchedTitle = await card.locator('h2').innerText();
  await settings();
  await toggleGaia();
  await expect(card.locator('h2')).toHaveText(matchedTitle, { timeout: 90000 });
  await expect(card.locator('.gaia-measurements')).toHaveCount(0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('aether.preferences')).gaiaDr3), false);
  await search('stars', added);
  await expect(page.locator('#search-results [data-object]')).toHaveCount(0);
  await close();
  checkpoint('Disabling Gaia keeps the base NASA object and removes additional Gaia search entries');

  await search('nebulae', 'M42');
  await select('ngc-1976');
  await page.setViewportSize({ width: 380, height: 800 });
  await settings();
  await Promise.all([page.waitForEvent('load'), page.locator('#language-setting').selectOption('it')]);
  await ready();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(card.locator('h2')).toContainText('Orione', { timeout: 90000 });
  await openImages();
  await expect(page.locator('.archive-image h3')).toContainText('Orione');
  await expect(page.locator('.archive-image-type')).toHaveText('Osservazione al telescopio');
  await expect(page.locator('.archive-credit')).toContainText('Crediti:');
  assert.equal(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  const rect = await page.locator('.archive-image').first().boundingBox();
  assert.ok(rect.x >= 0 && rect.x + rect.width <= 381);
  await page.screenshot({ path: 'test-results/experiments-images-mobile-it.png' });
  await close();
  await settings();
  await page.locator('[data-action="gaia-info"]').click();
  await expect(page.locator('#gaia-summary')).toContainText(audit.counts.uniqueSourceCount.toLocaleString('it-IT'));
  await expect(page.locator('#gaia-summary')).toContainText('sorgenti');
  assert.equal(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  checkpoint('Italian gallery and Gaia comparison fit a 380-pixel viewport without cropping or horizontal overflow');
} catch (error) {
  if (page) await page.screenshot({ path: 'test-results/experiments-failure.png' }).catch(() => {});
  throw error;
} finally {
  if (delayedResponse) await delayedResponse();
  await browser.close();
}
