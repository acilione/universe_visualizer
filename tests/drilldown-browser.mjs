import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://localhost:5174';
const engineBase = process.env.ENGINE_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir('test-results', { recursive: true });
const errors = [];
const checkpoint = label => { assert.deepEqual(errors, [], label + ': no browser errors'); console.log('PASS: ' + label); };
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text()); });
  if (process.env.DRILLDOWN_UI_ONLY !== '1') {
    await page.goto(engineBase + '/tests/fixtures/engine.html', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.atlas?.ready && atlas.activateObject);
    await page.evaluate(() => {
      window.drilldownChanges = [];
      atlas.onScale = index => drilldownChanges.push(index);
      atlas.setLayer('labels', false);
    });
    const setScale = async index => {
      await page.evaluate(index => { atlas.setScale(index, true); window.drilldownChanges = []; }, index);
      await page.waitForFunction(() => !atlas.cameraFlight);
    };
    const screenPoint = id => page.evaluate(id => {
      const target = atlas.targets.find(node => node.userData.object?.id === id);
      if (!target) throw new Error('Missing interactive map object: ' + id);
      atlas.scene.updateMatrixWorld(true); atlas.camera.updateMatrixWorld(true);
      const point = target.getWorldPosition(target.position.clone()).project(atlas.camera);
      return { x: (point.x + 1) * atlas.canvas.clientWidth / 2, y: (1 - point.y) * atlas.canvas.clientHeight / 2 };
    }, id);
    const clickMarker = async (id, twice = false) => {
      const point = await screenPoint(id);
      assert.ok(point.x > 0 && point.x < 1440 && point.y > 0 && point.y < 960, id + ' is in the viewport');
      await page.locator('canvas').click({ position: point, clickCount: twice ? 2 : 1, delay: twice ? 70 : 0 });
    };
    const solarBodies = () => page.evaluate(() => ({
      index: atlas.index,
      planets: atlas.objects.filter(object => object.bodyKind === 'planet').map(object => object.id).sort(),
      moon: atlas.objects.some(object => object.id === 'moon'),
      targets: atlas.targets.filter(target => target.userData.object?.bodyKind === 'planet').length,
    }));
    const expectedPlanets = ['earth', 'jupiter', 'mars', 'mercury', 'neptune', 'saturn', 'uranus', 'venus'];

    await setScale(2);
    await page.locator('canvas').click({ position: await screenPoint('solar-system'), button: 'right' });
    assert.equal(await page.evaluate(() => atlas.index), 2, 'Secondary-button input must not activate a map link');
    await setScale(2);
    const dragStart = await screenPoint('solar-system');
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 80, dragStart.y + 40, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => atlas.index), 2, 'Orbiting from a map marker must not activate its link');
    await setScale(2);
    await clickMarker('solar-system');
    await page.waitForFunction(() => atlas.index === 0);
    assert.deepEqual((await solarBodies()).planets, expectedPlanets);
    assert.equal((await solarBodies()).targets, 8);
    assert.equal((await solarBodies()).moon, true);
    assert.deepEqual(await page.evaluate(() => drilldownChanges), [0]);
    checkpoint('A real canvas click on the galactic Solar System marker opens all eight planets and the Moon');

    await setScale(2);
    await clickMarker('solar-system', true);
    await page.waitForFunction(() => atlas.index === 0);
    assert.deepEqual(await page.evaluate(() => drilldownChanges), [0], 'A double click enters the destination once');
    assert.deepEqual((await solarBodies()).planets, expectedPlanets);
    checkpoint('Double clicking the Solar System marker does not rebuild or leave its destination');

    await setScale(3);
    assert.equal(await page.evaluate(() => atlas.selected?.id), 'local-milkyway');
    assert.equal(await page.evaluate(() => atlas.index), 3, 'Initial informational selection does not auto-enter a linked object');
    await clickMarker('local-milkyway');
    await page.waitForFunction(() => atlas.index === 2 && !atlas.cameraFlight);
    await clickMarker('solar-system');
    await page.waitForFunction(() => atlas.index === 0);
    assert.deepEqual(await page.evaluate(() => drilldownChanges), [2, 0]);
    checkpoint('Nested canvas navigation enters the Milky Way from the Local Group and continues into the Solar System');

    await setScale(1);
    await clickMarker('sirius');
    assert.equal(await page.evaluate(() => atlas.index), 1);
    assert.equal(await page.evaluate(() => atlas.selected?.id), 'sirius');
    assert.deepEqual(await page.evaluate(() => drilldownChanges), []);
    checkpoint('Objects without an interior map still select their scientific information');

    // The pointer event goes through the first-person preview raycaster. Observe
    // its camera after the user has walked, so a hidden reset to the origin fails.
    await setScale(3);
    await page.evaluate(() => atlas.enterPreview({ layout: 'room' }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(180);
    await page.keyboard.up('KeyW');
    assert.ok(Math.abs(await page.evaluate(() => atlas.camera.position.z)) > .02, 'The viewer moved before changing scale');
    for (const [id, destination] of [['local-milkyway', 2], ['solar-system', 0]]) {
      await page.evaluate(id => { atlas.preview.lookAtObject(atlas.objects.find(object => object.id === id)); }, id);
      const pose = await page.evaluate(() => [...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()]);
      await page.locator('canvas').click({ position: { x: 720, y: 480 } });
      await page.waitForFunction(index => atlas.index === index, destination);
      assert.equal(await page.evaluate(() => atlas.preview.isActive), true);
      assert.deepEqual(await page.evaluate(() => [...atlas.camera.position.toArray(), ...atlas.camera.quaternion.toArray()]), pose, 'Changing maps preserves the walked viewer position and direction');
      assert.equal(await page.evaluate(() => atlas.controls.enabled), false);
    }
    assert.deepEqual((await solarBodies()).planets, expectedPlanets);
    await page.evaluate(() => atlas.preview.lookAtObject(atlas.objects.find(object => object.id === 'earth')));
    await page.locator('canvas').click({ position: { x: 720, y: 480 } });
    assert.equal(await page.evaluate(() => atlas.index), 0);
    assert.equal(await page.evaluate(() => atlas.selected?.id), 'earth');
    await page.screenshot({ path: 'test-results/drilldown-solar-preview.png' });
    await page.evaluate(() => atlas.exitPreview());
    assert.equal(await page.evaluate(() => atlas.controls.enabled), true);
    assert.equal(await page.evaluate(() => atlas.index), 0);
    await page.evaluate(() => atlas.dispose());
    checkpoint('PC immersive clicks enter nested maps without moving the viewer; Earth remains interactable and preview exits normally');
  }

  if (process.env.DRILLDOWN_ENGINE_ONLY !== '1') {
    await page.addInitScript(() => {
      localStorage.setItem('aether.language', 'en');
      localStorage.setItem('aether.preferences', JSON.stringify({ quality: 'low', autoRotate: false }));
    });
    await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
    await expect(page.locator('.loading')).toBeHidden({ timeout: 60000 });
    await expect(page.locator('.webgl-error')).toHaveCount(0);
    await page.locator('[data-scale="3"]').click();
    await expect(page.locator('[data-scale="3"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.map-label').filter({ hasText: /^Milky Way$/ }).click();
    await expect(page.locator('[data-scale="2"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.map-label').filter({ hasText: /^Solar System$/ }).click();
    await expect(page.locator('[data-scale="0"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.map-label').filter({ hasText: /^Earth$/ })).toBeVisible();
    await expect(page.locator('#scale-title')).toContainText('Solar');
    for (const action of ['zoom-in', 'zoom-out', 'reset']) await page.locator('[data-action="' + action + '"]').click();
    await expect(page.locator('[data-scale="0"]')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'test-results/drilldown-solar-ui.png' });
    checkpoint('Production map labels enter nested maps and synchronize the sidebar and displayed planet labels');

    await page.locator('[data-action="tour"]').click();
    await expect(page.locator('[data-action="tour"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-scale="2"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
    await page.locator('.map-label').filter({ hasText: /^Solar System$/ }).click();
    await expect(page.locator('[data-scale="0"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-action="tour"]')).toHaveAttribute('aria-pressed', 'false');
    checkpoint('Entering the Solar System manually stops the active automatic scale sequence');

    await page.locator('[data-scale="2"]').click();
    await page.locator('[data-action="vr"]').first().click();
    await expect(page.locator('[data-action="start-preview"]')).toBeEnabled();
    await page.locator('[data-action="start-preview"]').click();
    await expect(page.locator('.app-shell')).toHaveClass(/preview-active/);
    await expect(page.locator('#preview-scale')).toHaveValue('2');
    await page.locator('[data-action="preview-search"]').click();
    await page.locator('#search-input').fill('Solar System');
    await page.locator('#search-results [data-object="solar-system"]').click();
    await expect(page.locator('#modal')).not.toBeVisible();
    await expect(page.locator('#preview-scale')).toHaveValue('0');
    await expect(page.locator('.app-shell')).toHaveClass(/preview-active/);
    await page.locator('[data-action="exit-preview"]').click();
    await expect(page.locator('[data-scale="0"]')).toHaveAttribute('aria-pressed', 'true');
    checkpoint('Finding the galactic Solar System in PC preview enters its map and keeps immersive controls active');
  }
} catch (error) {
  if (page) await page.screenshot({ path: 'test-results/drilldown-failure.png' }).catch(() => {});
  throw error;
} finally { await browser.close(); }
