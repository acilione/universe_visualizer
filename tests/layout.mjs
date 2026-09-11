import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const sizes = [
  [390, 844], [390, 650], [768, 720], [1024, 650], [1280, 720],
  [1440, 900], [1920, 650], [1920, 1080], [2560, 720], [960, 540]
];
const base = process.env.TEST_URL || 'http://localhost:5173';
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('aether.preferences', JSON.stringify({ quality: 'low', autoRotate: false })));
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await expect(page.locator('.loading')).toBeHidden();
  if (process.env.LAYOUT_STYLE_FILE) await page.addStyleTag({ path: process.env.LAYOUT_STYLE_FILE });

  async function assertPanelLayout(label) {
    const layout = await page.evaluate(() => {
      const box = selector => {
        const element = document.querySelector(selector), rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return {
        left: box('.left-panel'), right: box('.right-panel'), bottom: box('.bottom-panel'), controls: box('.view-controls'),
        top: box('.topbar'), brand: box('.brand'), nav: box('.topnav'), actions: box('.top-actions'),
        overflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth
      };
    });
    assert.equal(layout.overflow, false, `${label}: no horizontal document overflow`);
    assert.ok(layout.controls.top >= layout.top.bottom + 4, `${label}: view controls remain below the header`);
    assert.ok(layout.left.bottom <= layout.bottom.top - 8, `${label}: sidebar and reference scale are separated`);
    assert.ok(layout.brand.right <= layout.actions.left - 8, `${label}: header actions stay clear of branding`);
    if (layout.width > 900) {
      assert.ok(layout.right.bottom <= layout.bottom.top - 8, `${label}: object details stay clear of the reference scale`);
      assert.ok(layout.nav.right <= layout.actions.left + 1, `${label}: header navigation and actions do not overlap`);
      await page.locator('[data-layer="particles"]').scrollIntoViewIfNeeded();
      const control = await page.locator('[data-layer="particles"]').boundingBox();
      assert.ok(control.y >= layout.left.top, `${label}: lower layer toggle is reachable by scrolling`);
      assert.ok(control.y + control.height <= layout.bottom.top - 8, `${label}: lower layer toggle remains above the scale bar`);
      await page.locator('.left-panel').evaluate(element => { element.scrollTop = 0; });
    }
  }

  async function assertModeLayout(label) {
    const buttons = await page.locator('.modal-constellation-mode button').evaluateAll(elements => elements.map(button => {
      const svg = button.querySelector('svg').getBoundingClientRect();
      const small = button.querySelector('small').getBoundingClientRect();
      const label = button.querySelector(':scope > span');
      let text;
      if (label) text = label.getBoundingClientRect();
      else {
        const node = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        const range = document.createRange(); range.selectNodeContents(node); text = range.getBoundingClientRect();
      }
      const bounds = button.getBoundingClientRect();
      return {
        iconRight: svg.right, textLeft: text.left, textBottom: text.bottom, smallLeft: small.left,
        smallTop: small.top, smallBottom: small.bottom, buttonBottom: bounds.bottom
      };
    }));
    assert.equal(buttons.length, 2);
    for (const button of buttons) {
      assert.ok(button.iconRight + 5 <= button.textLeft, `${label}: icon has its own column beside the mode label`);
      assert.ok(button.iconRight + 5 <= button.smallLeft, `${label}: icon stays clear of the explanatory text`);
      assert.ok(button.textBottom <= button.smallTop + 1, `${label}: mode title and explanation do not overlap`);
      assert.ok(button.smallBottom <= button.buttonBottom - 5, `${label}: text stays inside the mode button`);
    }
  }

  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await assertPanelLayout(`solar ${width}x${height}`); console.log(`Solar ${width}x${height}`);
    await page.locator('.top-actions [data-action="constellations"]').click();
    await expect(page.locator('#constellation-results [data-constellation]')).toHaveCount(88);
    await assertModeLayout(`modal ${width}x${height}`);
    if (width === 1920 && height === 650) await page.screenshot({ path: 'test-results/layout-constellation-modal-short.png' });
    await page.keyboard.press('Escape');
    if (width === 1920 && height === 650) await page.screenshot({ path: 'test-results/layout-solar-short.png' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.top-actions [data-action="constellations"]').click();
  await page.locator('#constellation-results [data-constellation="Ori"]').click();
  await expect(page.locator('#modal')).not.toBeVisible({ timeout: 60000 });
  await expect(page.locator('.app-shell')).toHaveClass(/constellation-view/);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await assertPanelLayout(`constellation ${width}x${height}`); console.log(`Constellation ${width}x${height}`);
    if (width === 390 && height === 650) await page.screenshot({ path: 'test-results/layout-constellation-mobile-short.png' });
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('[data-action="settings"]').click();
    await page.locator('#language-setting').focus();
    const spacing = await page.evaluate(() => {
      const label = document.querySelector('label[for="language-setting"]').getBoundingClientRect();
      const input = document.querySelector('#language-setting').getBoundingClientRect();
      return { labelBottom: label.bottom, inputTop: input.top, inputRight: input.right, viewportWidth: innerWidth };
    });
    assert.ok(spacing.labelBottom + 8 <= spacing.inputTop, `settings ${width}: language label remains clear of the focused control`);
    assert.ok(spacing.inputRight < spacing.viewportWidth, `settings ${width}: language setting stays within the viewport`);
    if (width === 390) await page.screenshot({ path: 'test-results/layout-settings-mobile.png' });
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  console.log(`Responsive geometry passed at ${sizes.length} viewport sizes for solar, constellations and mode selection.`);
} finally {
  await browser.close();
}



