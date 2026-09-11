import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const base = process.env.TEST_URL || 'http://localhost:5174';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const snapshot = JSON.parse(await readFile(new URL('../src/exoplanets.json', import.meta.url), 'utf8'));
const planetCount = new Intl.NumberFormat('en-US').format(snapshot.metadata.planetCount + 8);
const errors = [], audit = [];
const slogans = /Il nostro angolo di cosmo|Le luci più vicine|Isole nell.oscurità|Un viaggio verso l.infinito|Ogni viaggio inizia|Lasciati trasportare|Le linee sono convenzioni visive|Our corner of|A journey to infinity|Let yourself be carried/i;
const italianLeak = /\b(?:pianeti|esopianeti|stelle|costellazioni|distanza|distanze|anni luce|sconosciuta|sconosciuto|latitudine|longitudine|orizzonte|griglia|etichette|particellari|rotazione|impostazioni|seleziona|chiudi|avvicina|allontana|cerca nel|trascina|terrestre|dalla Terra|Sistema Solare|Via Lattea|Gruppo Locale|scala di riferimento|magnitudine|ascensione|declinazione|orbite|illustrazione)\b/i;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, locale: 'it-IT', timezoneId: 'UTC', reducedMotion: 'reduce' });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text()); });
  async function ready() {
    await expect(page.locator('.loading')).toBeHidden({ timeout: 60000 });
    await expect(page.locator('.webgl-error')).toHaveCount(0);
  }
  async function capture(label, english = true) {
    const rendered = await page.evaluate(() => ({
      text: document.body.innerText,
      attributes: [...document.querySelectorAll('[aria-label],[title],[placeholder],[aria-valuetext]')].filter(element => element.getClientRects().length && !element.closest('[hidden]')).flatMap(element => ['aria-label','title','placeholder','aria-valuetext'].map(name => element.getAttribute(name)).filter(Boolean))
    }));
    audit.push({ label, ...rendered });
    const content = [rendered.text, ...rendered.attributes].join('\n');
    assert.doesNotMatch(content, /\$\{|\bt\(["'`]/, label + ': template code is not rendered as text');
    assert.doesNotMatch(content, slogans, label + ': no removed slogans');
    await writeFile('test-results/language-audit.json', JSON.stringify(audit, null, 2));
    if (english) assert.doesNotMatch(content, italianLeak, label + ': no Italian text in English UI');
  }
  async function open(action) {
    await page.locator('[data-action="' + action + '"]').first().click();
    await expect(page.locator('#modal')).toBeVisible();
  }
  async function close() { await page.keyboard.press('Escape'); await expect(page.locator('#modal')).not.toBeVisible(); }
  async function winterOrion() {
    await open('constellations');
    await expect(page.locator('#constellation-search')).toBeVisible();
    await page.locator('#modal [data-constellation-mode="earth"]').click();
    await page.locator('[data-action="observer-orion-winter"]').click();
    await expect(page.locator('#modal')).not.toBeVisible({ timeout: 60000 });
    await expect(page.locator('.app-shell')).toHaveClass(/earth-sky-view/);
    await expect(page.locator('#constellation-status time')).toHaveAttribute('datetime', '2026-12-11T19:00:00.000Z');
  }
  async function changeLanguage(language) {
    await open('settings');
    await page.locator('#language-setting').selectOption(language);
    await page.waitForLoadState('networkidle');
    await ready();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
  }

  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await ready();
  assert.equal(await page.evaluate(() => navigator.language), 'it-IT');
  assert.equal(await page.evaluate(() => localStorage.getItem('aether.language')), null);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#scale-title')).toContainText('Solar System');
  await expect(page.locator('#scale-readout')).toHaveText('60 AU');
  await capture('English default with Italian browser locale');
  await page.screenshot({ path: 'test-results/language-english-main.png' });

  for (const action of ['about', 'help', 'settings', 'collections', 'vr']) {
    await open(action);
    await capture('English ' + action + ' dialog');
    if (action === 'settings') await expect(page.locator('#language-setting')).toHaveValue('en');
    await close();
  }
  for (const scale of [1, 2, 3, 4, 0]) {
    await page.locator('[data-scale="' + scale + '"]').click();
    await capture('English reference scale ' + scale);
  }
  await open('search');
  await page.locator('#search-input').fill('Sirius');
  await expect(page.locator('.search-result')).not.toHaveCount(0);
  await capture('English named star search');
  await page.locator('.search-result').first().click();
  await expect(page.locator('#object-card h2')).toHaveText('Sirius');
  await capture('English stellar data');

  await open('planets');
  await expect(page.locator('#planet-count')).toContainText(planetCount);
  await capture('English planetary catalogue');
  await page.locator('#planet-search').fill('TRAPPIST-1');
  await expect(page.locator('#planet-results .planet-result')).toHaveCount(7);
  await capture('English exoplanet host search');
  await page.locator('#planet-results [data-object="exo-TRAPPIST-1%20e"]').click();
  await expect(page.locator('#object-card h2')).toHaveText('TRAPPIST-1 e');
  await capture('English exoplanet data');
  await page.locator('#object-card [data-action="object"]').click();
  await capture('English detailed exoplanet measurements');
  await close();

  await open('constellations');
  await expect(page.locator('#constellation-results [data-constellation]')).toHaveCount(88);
  await expect(page.locator('#constellation-count')).toContainText('88 constellations');
  await capture('English constellation catalogue');
  await page.screenshot({ path: 'test-results/language-english-constellations.png' });
  await page.locator('#constellation-search').fill('Orione');
  await expect(page.locator('#constellation-count')).toHaveText('1 constellation found');
  await expect(page.locator('#constellation-results [data-constellation]')).toHaveCount(1);
  await expect(page.locator('[data-constellation="Ori"] strong')).toHaveText('Orion');
  await page.locator('[data-constellation="Ori"]').click();
  await expect(page.locator('#modal')).not.toBeVisible({ timeout: 60000 });
  await capture('English constellation spatial view');
  await winterOrion();
  await expect(page.locator('#constellation-status')).toContainText('21 figure stars above the horizon');
  await capture('English Earth sky data');
  await open('constellation-observer');
  await capture('English observer controls');
  await expect(page.locator('#observer-datetime')).toHaveValue('2026-12-11T20:00');
  await expect(page.locator('#observer-timezone')).toHaveValue('Europe/Rome');
  await close();

  await changeLanguage('it');
  await expect(page.locator('#scale-title')).toHaveText('Orione.');
  await expect(page.locator('.app-shell')).toHaveClass(/earth-sky-view/);
  await expect(page.locator('#constellation-status time')).toHaveAttribute('datetime', '2026-12-11T19:00:00.000Z');
  await expect(page.locator('#constellation-status')).toContainText('21 stelle della figura');
  assert.equal(await page.evaluate(() => localStorage.getItem('aether.language')), 'it');
  await capture('Explicit Italian preserves Orion and observer time', false);
  await page.screenshot({ path: 'test-results/language-italian-orion.png' });
  await open('about');
  await capture('Italian project copy', false);
  await close();
  await page.reload({ waitUntil: 'networkidle' });
  await ready();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.locator('#scale-title')).toContainText('Sistema Solare');
  await capture('Italian preference persists after reload', false);
  await winterOrion();
  await changeLanguage('en');
  await expect(page.locator('#scale-title')).toHaveText('Orion.');
  await expect(page.locator('.app-shell')).toHaveClass(/earth-sky-view/);
  await expect(page.locator('#constellation-status time')).toHaveAttribute('datetime', '2026-12-11T19:00:00.000Z');
  await expect(page.locator('#constellation-status')).toContainText('21 figure stars above the horizon');
  await capture('Switch back to English preserves Orion and observer time');
  await open('constellation-observer');
  await expect(page.locator('#observer-datetime')).toHaveValue('2026-12-11T20:00');
  await expect(page.locator('#observer-timezone')).toHaveValue('Europe/Rome');
  await capture('Observer controls restored in English');
  await close();
  assert.deepEqual(errors, [], 'No runtime or shader errors');
  console.log('PASS: ' + audit.length + ' language audits; English default with Italian browser locale, localized catalogues/measurements/controls, explicit Italian persistence and observer-preserving language switches.');
  console.log('Screenshots and rendered text audit saved in test-results/language-*.');
} finally { await browser.close(); }

