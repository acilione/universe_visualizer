import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://localhost:5173';
const nebulaSnapshot = JSON.parse(await readFile(new URL('../public/catalog/nasa-nebulae.json', import.meta.url), 'utf8'));
const nebulae = nebulaSnapshot.objects.map(row => Object.fromEntries(nebulaSnapshot.columns.map((name, index) => [name, row[index]])));
const unknownNebula = nebulae.find(object => object.distanceLy === null && object.angularSizeArcmin === null);
assert.ok(unknownNebula, 'An actual NASA record with unknown distance and angular diameter is available');
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const checkpoints = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, locale: 'it-IT', timezoneId: 'Europe/Rome', reducedMotion: 'reduce' });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text()); });
  const card = page.locator('#object-card');
  const modal = page.locator('#modal');
  const modalBody = page.locator('#modal-body');
  async function ready() {
    await expect(page.locator('.loading')).toBeHidden({ timeout: 60000 });
    await expect(page.locator('.webgl-error')).toHaveCount(0);
  }
  async function close() {
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  }
  async function search(scope = 'all') {
    const action = scope === 'stars' ? 'nasa-stars' : scope === 'nebulae' ? 'nasa-nebulae' : 'search';
    await page.locator('[data-action="' + action + '"]').first().click();
    await expect(modal).toBeVisible();
    await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false', { timeout: 90000 });
    await expect(page.locator('[data-action="retry-nasa"]')).toBeHidden();
    await expect(page.locator('[data-search-scope="' + scope + '"]')).toHaveAttribute('aria-pressed', 'true');
  }
  async function query(text) {
    await page.locator('#search-input').fill(text);
    await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
  }
  function result(id) { return page.locator('#search-results [data-object="' + id + '"]'); }
  async function select(id, expectedName) {
    await result(id).click();
    await expect(modal).not.toBeVisible({ timeout: 60000 });
    await expect(page.locator('.app-shell')).toHaveClass(/nasa-sky-view/);
    await expect(card.locator('h2')).toContainText(expectedName);
    await expect(card.locator('[data-action="focus"]')).toBeEnabled();
  }
  function field(container, label) {
    return container.locator('.planet-measurements > div').filter({ hasText: label }).locator('strong');
  }
  async function data() {
    await card.locator('[data-action="object"]').click();
    await expect(modal).toBeVisible();
  }
  async function nasaSources(container) {
    const sources = await container.locator('a.object-source').evaluateAll(links => links.map(link => link.href));
    assert.ok(sources.length > 0);
    for (const source of sources) {
      const url = new URL(source);
      assert.equal(url.protocol, 'https:');
      assert.ok(url.hostname === 'nasa.gov' || url.hostname.endsWith('.nasa.gov'), source);
    }
  }
  async function noDecorativeImages() {
    await expect(page.locator('#object-card img,#modal-body img,.galaxy-art,.planet-art,.compass,.compass-rose')).toHaveCount(0);
  }
  async function checkpoint(name) {
    await noDecorativeImages();
    assert.deepEqual(errors, [], name + ': no runtime or rendering errors');
    checkpoints.push(name);
    console.log('PASS: ' + name);
  }
  async function changeLanguage(language) {
    await page.locator('[data-action="settings"]').first().click();
    await expect(modal).toBeVisible();
    await Promise.all([page.waitForEvent('load'), page.locator('#language-setting').selectOption(language)]);
    await ready();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('.app-shell')).toHaveClass(/nasa-sky-view/, { timeout: 90000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('aether.language')), language);
  }

  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await ready();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await search('stars');
  await expect(page.locator('#search-status')).toContainText('NASA HEASARC');
  await query('Rho Cigny');
  await expect(result('hip-106481').locator('strong')).toHaveText('Rho Cygni');
  await select('hip-106481', 'Rho Cygni');
  await expect(field(card, 'SPECTRAL CLASS')).toHaveText('G8III');
  await nasaSources(card);
  await data();
  await expect(field(modalBody, 'PARALLAX')).toContainText('26.2');
  await expect(field(modalBody, 'CATALOGUE IDENTIFIERS')).toHaveText('HIP 106481 \u00b7 HR 8252 \u00b7 HD 205435');
  await expect(field(modalBody, 'COORDINATE FRAME')).toHaveText('ICRS');
  await expect(field(modalBody, 'POSITION EPOCH')).toHaveText('J2000');
  await nasaSources(modalBody);
  await page.screenshot({ path: 'test-results/nasa-star-info.png' });
  await close();
  await checkpoint('Rho Cigny alias opens Rho Cygni with NASA spectral class, parallax and identifiers');

  for (const alias of ['HIP106481', 'HD 205435', 'HR8252']) {
    await search();
    await query(alias);
    await expect(result('hip-106481')).toHaveCount(1);
    await select('hip-106481', 'Rho Cygni');
  }
  await search('stars');
  await query('sheab');
  await expect(result('hip-113881')).toContainText('Scheat');
  await expect(result('hip-92420')).toContainText('Sheliak');
  await select('hip-113881', 'Scheat');
  await expect(field(card, 'SPECTRAL CLASS')).toContainText('M2');
  await search('stars');
  await query('Sheliak');
  await select('hip-92420', 'Sheliak');
  await data();
  await expect(field(modalBody, 'CATALOGUE IDENTIFIERS')).toContainText('HIP 92420');
  await close();
  await checkpoint('HIP, HD and HR identifiers resolve one star; ambiguous sheab offers Scheat and Sheliak');

  await search('nebulae');
  await expect(page.locator('#search-count')).toHaveText('485 objects found');
  await page.locator('[data-search-scope="planets"]').click();
  await query('Earth');
  await expect(result('earth')).toBeVisible();
  await expect(page.locator('#search-results [data-object-scale="8"]')).toHaveCount(0);
  await page.locator('[data-search-scope="nebulae"]').click();
  await query('M42');
  await select('ngc-1976', 'Orion Nebula');
  await expect(field(card, 'ANGULAR DIAMETER')).toHaveText('66 arcmin');
  await expect(field(card, 'APPARENT MAGNITUDE')).toHaveText('4 \u00b7 visual');
  await expect(card).toContainText('1,300 ly');
  await nasaSources(card);
  await expect(page.locator('#map-labels .map-label:visible').first()).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/beautifulnasa-nebula-sky.png' });
  await checkpoint('Nebula catalogue, category filters and M42 coordinates, extent and photometry');

  await search('nebulae');
  await query('M57');
  await select('ngc-6720', 'Ring Nebula');
  await expect(field(card, 'ANGULAR DIAMETER')).toHaveText('2.5 arcmin');
  await data();
  await expect(field(modalBody, 'CATALOGUE IDENTIFIER')).toHaveText('NGC 6720');
  await expect(field(modalBody, 'MEASUREMENT CATALOGUE')).toContainText('NGC 2000.0');
  await close();
  await search('nebulae');
  await query(unknownNebula.name);
  await select(unknownNebula.id, unknownNebula.name);
  await expect(field(card, 'ANGULAR DIAMETER')).toHaveText('Not available');
  await expect(card).toContainText('Distance unavailable');
  await checkpoint('M57 angular extent and an actual NASA record with missing distance and size');

  await page.locator('[data-action="constellations"]').first().click();
  await page.locator('#constellation-search').fill('Orion');
  await page.locator('[data-constellation="Ori"]').click();
  await expect(modal).not.toBeVisible({ timeout: 60000 });
  await expect(card.locator('h2')).toHaveText('Rigel');
  await expect(field(card, 'SPECTRAL CLASS')).not.toHaveText('Not available', { timeout: 90000 });
  await expect(card.locator('a.object-source[href*="heasarc.gsfc.nasa.gov"]')).not.toHaveCount(0);
  await data();
  await expect(field(modalBody, 'CATALOGUE IDENTIFIERS')).toContainText('HIP 24436');
  await expect(modalBody).toContainText('Map coordinates: HYG');
  await close();
  await checkpoint('Existing Orion/Rigel cards asynchronously receive NASA measurements without changing the HYG view');

  await search('stars');
  await query('Rho Cygni');
  await select('hip-106481', 'Rho Cygni');
  await changeLanguage('it');
  await expect(card.locator('h2')).toHaveText('Rho Cygni');
  await expect(field(card, 'CLASSE SPETTRALE')).toHaveText('G8III');
  await data();
  await expect(field(modalBody, 'IDENTIFICATORI DI CATALOGO')).toContainText('HIP 106481');
  await expect(field(modalBody, 'PARALLASSE')).toContainText('26,2');
  await close();
  await search('nebulae');
  await query('M42');
  await select('ngc-1976', 'Nebulosa di Orione');
  await changeLanguage('en');
  await expect(card.locator('h2')).toContainText('Orion Nebula');
  await expect(field(card, 'ANGULAR DIAMETER')).toHaveText('66 arcmin');
  await data();
  await expect(field(modalBody, 'CATALOGUE IDENTIFIER')).toHaveText('NGC 1976');
  await close();
  await checkpoint('Explicit language changes restore the same NASA star and nebula, including localized measurements');

  await page.setViewportSize({ width: 380, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile document has no horizontal overflow');
  await expect(page.locator('.view-controls [data-action="object"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/nasa-nebula-mobile.png' });
  await page.locator('.view-controls [data-action="object"]').click();
  await expect(modalBody).toContainText('NGC 1976');
  await expect(field(modalBody, 'ANGULAR DIAMETER')).toHaveText('66 arcmin');
  assert.equal(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'Mobile object dialog has no horizontal overflow');
  await nasaSources(modalBody);
  await page.screenshot({ path: 'test-results/nasa-nebula-mobile-data.png' });
  await close();
  await page.keyboard.press('/');
  await expect(modal).toBeVisible();
  await page.locator('[data-search-scope="nebulae"]').click();
  await query('M57');
  await expect(result('ngc-6720')).toBeVisible();
  assert.equal(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'Mobile NASA search dialog has no horizontal overflow');
  await page.screenshot({ path: 'test-results/nasa-search-mobile.png' });
  await checkpoint('380px mobile sky, object data and catalogue search remain usable without decorative images');
  console.log('NASA UI: ' + checkpoints.length + ' end-to-end checkpoints passed. Screenshots saved in test-results.');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: 'test-results/nasa-ui-failure.png' }).catch(() => {});
  console.error('Runtime errors observed:', errors);
  throw error;
} finally {
  await browser.close();
}
