import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const base = process.env.TEST_URL || 'http://localhost:5174';
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 0.75,
    hasTouch: true,
    locale: 'it-IT',
    timezoneId: 'UTC',
    reducedMotion: 'reduce'
  });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text());
  });
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await expect(page.locator('.loading')).toBeHidden();
  await expect(page.locator('.webgl-error')).toHaveCount(0);
  await page.locator('[data-action="constellations"]').first().click();
  await expect(page.locator('#constellation-results [data-constellation]')).toHaveCount(88);
  await expect(page.locator('#constellation-count')).toContainText('88 constellations');
  await expect(page.locator('[data-action="observer-orion-winter"], #constellation-apply, [data-action="apply-observer"]')).toHaveCount(0);
  await expect(page.locator('#observer-fields')).toBeHidden();
  await page.locator('#constellation-search').fill('orione');
  await expect(page.locator('#constellation-results [data-constellation]')).toHaveCount(1);
  await page.locator('[data-constellation="Ori"]').click();
  await expect(page.locator('[data-constellation="Ori"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#modal')).toBeVisible();
  await page.locator('[data-action="view-constellations"]').click();
  await expect(page.locator('#modal')).not.toBeVisible({ timeout: 60000 });
  await expect(page.locator('.app-shell')).toHaveClass(/constellation-view/);
  await expect(page.locator('.app-shell')).not.toHaveClass(/earth-sky-view/);
  await expect(page.locator('#scale-title')).toHaveText('Orion.');
  await expect(page.locator('#constellation-status')).toContainText('21 figure stars');
  await expect(page.locator('#object-card')).toContainText('J2000');
  await expect(page.locator('#scale-slider')).toBeHidden();
  await expect(page.locator('#scale-slider')).toBeDisabled();
  await expect(page.locator('#map-labels .map-label:visible').first()).toBeVisible();
  await page.screenshot({ timeout:60000, path: 'test-results/constellation-ui-space.png' });
  await expect(page.locator('[data-action="earth-visible"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-action="earth-visible"]').click();
  await expect(page.locator('[data-action="earth-visible"]')).toHaveAttribute('aria-checked', 'false');
  await page.locator('[data-action="earth-visible"]').click();
  await expect(page.locator('[data-action="earth-visible"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-action="earth-perspective"]').click();
  await expect(page.locator('.app-shell')).toHaveClass(/earth-perspective-view/);
  await expect(page.locator('.app-shell')).not.toHaveClass(/earth-sky-view/);
  await expect(page.locator('[data-action="earth-orbit"]')).toBeVisible();
  await expect(page.locator('#constellation-status')).toContainText('Earth origin');
  await page.screenshot({ timeout:60000, path: 'test-results/constellation-ui-earth-perspective.png' });
  await page.locator('[data-action="earth-orbit"]').click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/earth-perspective-view/);


  // One 3D scene owns both viewpoints; no alternate horizon-screen controls remain.
  await expect(page.locator('[data-constellation-mode]')).toHaveCount(0);
  await page.locator('[data-action="earth-perspective"]').click();
  await expect(page.locator('.app-shell')).toHaveClass(/earth-perspective-view/);
  await page.locator('[data-action="constellation-observer"]').click();
  await expect(page.locator('#observer-fields')).toBeVisible();
  await expect(page.locator('#observer-fields')).toContainText('Europe/Rome');
  await expect(page.locator('#observer-fields')).toContainText('not simulated');
  await page.locator('#observer-latitude').fill('91');
  await page.locator('#observer-datetime').fill('2026-01-15T21:00');
  await page.locator('[data-action="view-constellations"]').click();
  assert.equal(await page.locator('#observer-latitude').evaluate(input => input.validity.valid), false);
  await expect(page.locator('#modal')).toBeVisible();
  await page.locator('#observer-latitude').fill('41.9028');
  await page.locator('#observer-longitude').fill('181');
  await page.locator('[data-action="view-constellations"]').click();
  assert.equal(await page.locator('#observer-longitude').evaluate(input => input.validity.valid), false);
  await page.locator('#observer-longitude').fill('12.4964');
  await page.locator('#observer-datetime').fill('1800-01-15T21:00');
  await page.locator('[data-action="view-constellations"]').click();
  assert.equal(await page.locator('#observer-datetime').evaluate(input => input.validity.valid), false);
  await expect(page.locator('#modal')).toBeVisible();
  await page.locator('#observer-datetime').fill('2026-01-15T21:00');
  await page.locator('#observer-datetime').dispatchEvent('change');
  await expect(page.locator('#observer-status')).not.toBeEmpty();
  await expect(page.locator('#modal')).toBeVisible();
  await page.locator('[data-action="view-constellations"]').click();
  await expect(page.locator('#modal')).not.toBeVisible({ timeout: 60000 });
  await expect(page.locator('#constellation-status')).toContainText('21 figure stars above');
  await expect(page.locator('#constellation-status')).toContainText('Jan 15');
  await expect(page.locator('#constellation-status')).toContainText('21:00');
  await expect(page.locator('.coordinates')).toContainText('J2000');
  await expect(page.locator('#map-labels .map-label:visible').first()).toBeVisible();
  await page.screenshot({ timeout:60000, path: 'test-results/constellation-ui-earth.png' });

  // DMS and explicit timezone remain valid with a collapsed observer section.
  // The device runs in UTC while the observer timezone is Italian.
  await page.locator('[data-action="constellation-observer"]').click();
  await expect(page.locator('#observer-timezone')).toHaveValue('Europe/Rome');
  await page.locator('#observer-latitude').fill('91');
  await page.locator('#observer-settings > summary').click();
  await expect(page.locator('#observer-fields')).toBeHidden();
  await page.locator('[data-action="view-constellations"]').click();
  await expect(page.locator('#observer-fields')).toBeVisible();
  assert.equal(await page.locator('#observer-latitude').evaluate(input => input.validity.valid), false);
  await page.locator('#observer-latitude').fill('38\u00b006\u203251.98\u2033N');
  await page.locator('#observer-longitude').fill('15\u00b039\u203200\u2033E');
  await page.locator('#observer-datetime').fill('2026-12-11T20:00');
  await page.locator('#observer-datetime').dispatchEvent('change');
  await page.locator('#observer-settings > summary').click();
  await expect(page.locator('#observer-fields')).toBeHidden();
  await page.locator('[data-action="view-constellations"]').click();
  await expect(page.locator('#modal')).not.toBeVisible({ timeout: 60000 });
  await expect(page.locator('.app-shell')).toHaveClass(/earth-perspective-view/);
  await expect(page.locator('.app-shell')).not.toHaveClass(/earth-sky-view/);
  await expect(page.locator('#constellation-status')).toContainText('21 figure stars above');
  await expect(page.locator('#constellation-status')).toContainText('Dec 11');
  await expect(page.locator('#constellation-status')).toContainText('20:00');
  await expect(page.locator('#constellation-status time')).toHaveAttribute('datetime', '2026-12-11T19:00:00.000Z');
  await page.locator('[data-action="constellation-observer"]').click();
  const latitude = Number(await page.locator('#observer-latitude').inputValue());
  const longitude = Number(await page.locator('#observer-longitude').inputValue());
  assert.ok(Math.abs(latitude - 38.11443888888889) < 1e-10);
  assert.equal(longitude, 15.65);
  await expect(page.locator('#observer-datetime')).toHaveValue('2026-12-11T20:00');
  await page.keyboard.press('Escape');
  await page.screenshot({ timeout:60000, path: 'test-results/constellation-ui-orion-december.png' });


  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-action="earth-orbit"]')).toBeVisible();
  await expect(page.locator('[data-action="constellation-observer"]')).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ timeout:60000, path: 'test-results/constellation-ui-mobile.png' });
  await page.locator('.view-controls [data-action="object"]').click();
  await expect(page.locator('#modal-body')).toContainText('HIPPARCOS');
  await expect(page.locator('#modal-body')).toContainText('HORIZON');
  await page.keyboard.press('Escape');
  await page.locator('.immersion-button').click();
  await expect(page.locator('.app-shell')).toHaveClass(/cinematic/, { timeout: 10000 });
  assert.equal((await page.locator('body').innerText()).trim(), '', 'immersive sky must have no overlay writing');
  await expect(page.locator('#constellation-controls')).toBeHidden();
  await page.touchscreen.tap(190, 280);
  await expect(page.locator('.exit-cinema')).toHaveClass(/revealed/);
  await page.locator('.exit-cinema').click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/cinematic/);

  // Crux remains below the geometric horizon from Rome, even when selected.
  await page.locator('[data-action="constellations"]').first().click();
  await page.locator('#modal [data-remove-constellation="Ori"]').click();
  await page.locator('#constellation-search').fill('Croce del Sud');
  await expect(page.locator('#constellation-results [data-constellation]')).toHaveCount(1);
  await page.locator('[data-constellation="Cru"]').click();
  await expect(page.locator('[data-constellation="Cru"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-action="view-constellations"]').click();
  await expect(page.locator('#modal')).not.toBeVisible({ timeout: 60000 });
  await expect(page.locator('#constellation-status')).toContainText('0 figure stars above');
  await page.locator('[data-action="earth-orbit"]').click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/earth-sky-view/, { timeout: 60000 });
  await expect(page.locator('#constellation-status')).toContainText('4 figure stars');
  await expect(page.locator('[data-action="earth-visible"]')).toBeVisible();
  await expect(page.locator('[data-action="earth-perspective"]')).toBeVisible();
  await page.locator('[data-action="earth-perspective"]').click();
  await expect(page.locator('[data-action="earth-orbit"]')).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ timeout:60000, path: 'test-results/constellation-ui-mobile-space-earth.png' });
  await page.locator('[data-action="earth-orbit"]').click();

  await page.locator('.cosmic-return').click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/constellation-view/);
  await expect(page.locator('#scale-slider')).toBeVisible();
  await expect(page.locator('#scale-slider')).toBeEnabled();
  await expect(page.locator('#constellation-controls')).toBeHidden();
  await expect(page.locator('[data-scale="1"]')).toHaveAttribute('aria-pressed', 'true');
  assert.deepEqual(errors, []);
  console.log('Constellation UI verified: 88 figures, Earth reference and perspective, DMS winter input preserved in observer controls, automatic observer validation, explicit timezone, persistent checklist, horizon, mobile and immersion.');
} finally {
  await browser.close();
}
