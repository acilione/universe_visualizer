import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, equatorial, scales, seededRandom } from '../src/data.js';

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}
function vectorClose(actual, expected) {
  actual.forEach((value, i) => close(value, expected[i]));
}

test('equatorial directions use right-handed Y-up scene axes', () => {
  vectorClose(equatorial(0, 0, 10), [10, 0, 0]);
  vectorClose(equatorial(90, 0, 10), [0, 0, -10]);
  vectorClose(equatorial(180, 0, 10), [-10, 0, 0]);
  vectorClose(equatorial(270, 0, 10), [0, 0, 10]);
  vectorClose(equatorial(123, 90, 10), [0, 10, 0]);
  vectorClose(equatorial(123, -90, 10), [0, -10, 0]);
  vectorClose(equatorial(217.43, -62.68, 0), [0, 0, 0]);
});

test('equatorial conversion preserves radial distances and angular separation', () => {
  for (const [ra, dec, distance, factor] of [[217.43, -62.68, 4.24, .7], [10.685, 41.269, 2.5, 6], [279.23, 38.78, 25.04, .7]]) {
    close(Math.hypot(...equatorial(ra, dec, distance, factor)), distance * factor);
    vectorClose(equatorial(ra + 360, dec, distance, factor), equatorial(ra, dec, distance, factor));
  }
  const first = equatorial(0, 0, 1);
  const second = equatorial(60, 0, 1);
  close(first.reduce((dot, component, i) => dot + component * second[i], 0), .5);
});

test('catalog entries can be picked and linked across all scales', () => {
  assert.deepEqual(Object.keys(catalog), scales.map(scale => scale.id));
  assert.equal(new Set(scales.map(scale => scale.id)).size, scales.length);
  const ids = new Set();
  for (const scale of scales) {
    assert.ok(catalog[scale.id].length > 0);
    for (const entry of catalog[scale.id]) {
      assert.ok(!ids.has(entry.id), `Duplicate picking id ${entry.id}`);
      ids.add(entry.id);
      assert.equal(entry.position.length, 3);
      assert.ok(entry.position.every(Number.isFinite), `Invalid position for ${entry.id}`);
      assert.ok(entry.name && entry.type && entry.distance && entry.detail);
      if (entry.size !== undefined) assert.ok(entry.size > 0);
      if (entry.targetScale !== undefined) {
        assert.ok(Number.isInteger(entry.targetScale));
        assert.ok(scales[entry.targetScale], `Broken navigation from ${entry.id}`);
      }
      if (entry.orbit !== undefined) close(Math.hypot(...entry.position), entry.orbit);
    }
  }
  assert.equal(catalog.solar.filter(entry => entry.orbit !== undefined).length, 8);
});

test('catalog exposes source and representation limits for each object', () => {
  for (const [scaleId, entries] of Object.entries(catalog)) {
    for (const entry of entries) {
      assert.equal(new URL(entry.source).protocol, 'https:');
      assert.ok(entry.positionNote);
      assert.ok(['reference', 'schematic', 'approximate-equatorial'].includes(entry.positionKind));
      if (['galaxy', 'cosmic'].includes(scaleId)) assert.equal(entry.positionKind, 'schematic');
    }
  }
  for (const star of catalog.stars.filter(entry => entry.positionKind !== 'reference')) {
    assert.ok(Number.isFinite(star.raDeg) && star.raDeg >= 0 && star.raDeg < 360);
    assert.ok(Number.isFinite(star.decDeg) && Math.abs(star.decDeg) <= 90);
    close(Math.hypot(...star.position), star.distanceLy * star.sceneUnitsPerLy);
  }
});

test('particle seeds reproduce scenes with finite values in [0, 1)', () => {
  const first = seededRandom(42), second = seededRandom(42), other = seededRandom(43);
  const a = Array.from({ length: 128 }, first);
  assert.deepEqual(a, Array.from({ length: 128 }, second));
  assert.notDeepEqual(a, Array.from({ length: 128 }, other));
  assert.ok(a.every(value => Number.isFinite(value) && value >= 0 && value < 1));
});
