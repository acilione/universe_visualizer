import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/data.js';
import { solarMoons, moonsForPlanet, findMoon, moonCatalogMetadata } from '../src/moons.js';

const parents = { earth: 1, mars: 2, jupiter: 5, saturn: 11, uranus: 5, neptune: 4 };

test('the curated moon catalogue covers six planetary systems with unambiguous selectable IDs', () => {
  const ids = solarMoons.map(moon => moon.id);
  const solarIds = new Set(catalog.solar.map(body => body.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(moonCatalogMetadata.moonCount, 28);
  assert.equal(moonCatalogMetadata.planetCount, 6);
  assert.equal(moonCatalogMetadata.complete, false);
  assert.deepEqual([...new Set(solarMoons.map(moon => moon.parentId))].sort(), Object.keys(parents).sort());
  for (const [parentId, count] of Object.entries(parents)) {
    const moons = moonsForPlanet(parentId);
    assert.equal(moons.length, count);
    assert.ok(moons.every(moon => findMoon(moon.id) === moon));
  }
  assert.ok(ids.every(id => !solarIds.has(id)), 'moon IDs cannot collide with solar planet IDs');
  assert.deepEqual(moonsForPlanet('mercury'), []);
  assert.deepEqual(moonsForPlanet('venus'), []);
  assert.deepEqual(moonsForPlanet('unknown'), []);
  assert.equal(findMoon('unknown'), undefined);
});

test('Earth has the Moon with verified physical measurements; retrograde periods remain positive', () => {
  const moon = findMoon('moon');
  assert.equal(moon.parentId, 'earth');
  assert.equal(moon.radiusKm, 1737.4);
  assert.equal(moon.semiMajorAxisKm, 384400);
  assert.equal(moon.periodDays, 27.322);
  assert.equal(moon.englishName, 'Moon');
  assert.equal(moon.italianName, 'Luna');
  assert.deepEqual(solarMoons.filter(body => body.retrograde).map(body => body.id).sort(), ['phoebe', 'triton']);
  for (const satellite of solarMoons) {
    for (const field of ['radiusKm', 'semiMajorAxisKm', 'periodDays', 'size', 'orbitRadius']) {
      assert.ok(Number.isFinite(satellite[field]) && satellite[field] > 0, `${satellite.id}: ${field}`);
    }
    assert.equal(satellite.isMoon, true);
    assert.equal(satellite.bodyKind, 'moon');
    assert.equal(satellite.periodKind, 'mean-orbital');
    assert.equal(satellite.positionKind, 'schematic');
    assert.match(satellite.radiusSource, /^https:\/\/ssd\.jpl\.nasa\.gov\/sats\/phys_par\//);
    assert.match(satellite.orbitSource, /^https:\/\/ssd\.jpl\.nasa\.gov\/sats\/elem\//);
  }
});

test('schematic moon positions are centered on their planets and clear the displayed planet and rings', () => {
  for (const satellite of solarMoons) {
    const parent = catalog.solar.find(body => body.id === satellite.parentId);
    const offset = satellite.position.map((coordinate, axis) => coordinate - parent.position[axis]);
    assert.ok(offset.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...offset) - satellite.orbitRadius) < 1e-10, satellite.id);
    assert.ok(Math.abs(offset[0] - Math.cos(satellite.phase) * satellite.orbitRadius) < 1e-10);
    assert.ok(Math.abs(offset[2] - Math.sin(satellite.phase) * satellite.orbitRadius) < 1e-10);
    assert.equal(offset[1], 0);
    assert.equal(satellite.orbitInclinationRad, 0);
    assert.ok(satellite.phase >= 0 && satellite.phase < Math.PI * 2);
    const planetExtent = parent.size * (parent.id === 'saturn' ? 2.5 : 1);
    assert.ok(satellite.orbitRadius > planetExtent + satellite.size + 0.2, satellite.id);
    assert.ok(satellite.orbitRadius < 6.5, 'moon systems must remain compact enough for navigation');
  }
});

test('neighboring display lanes prevent collisions even when moons pass each other', () => {
  for (const parentId of Object.keys(parents)) {
    const moons = moonsForPlanet(parentId);
    for (let i = 1; i < moons.length; i++) {
      const previous = moons[i - 1];
      const current = moons[i];
      assert.ok(current.semiMajorAxisKm >= previous.semiMajorAxisKm, parentId);
      assert.ok(current.orbitRadius - previous.orbitRadius > current.size + previous.size + 0.09, `${previous.id}/${current.id}`);
    }
  }
});
