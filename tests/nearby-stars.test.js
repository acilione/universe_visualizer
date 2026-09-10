import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const stars = JSON.parse(readFileSync(new URL('../src/nearby-stars.json', import.meta.url), 'utf8'));

test('HYG subset contains unique, traceable nearby stars with usable astrometry', () => {
  assert.equal(stars.length, 156);
  const ids = new Set();
  const excludedHip = new Set(['70890', '71683', '71681', '87937', '32349', '16537', '37279', '8102', '91262']);
  for (const star of stars) {
    assert.match(star.id, /^hyg-\d+$/);
    assert.ok(!ids.has(star.id));
    ids.add(star.id);
    assert.ok(star.name && star.sourceId);
    assert.ok(star.raDeg >= 0 && star.raDeg < 360);
    assert.ok(star.decDeg >= -90 && star.decDeg <= 90);
    assert.ok(star.distanceLy > 0 && star.distanceLy <= 25);
    assert.ok(Number.isFinite(star.mag));
    assert.ok(Math.abs(star.sourceDistancePc * 3.261563777167433 - star.distanceLy) < 1e-8);
    assert.ok(!excludedHip.has(star.hip));
    assert.match(star.source, /c7f7f883fe678cc7680169a50ccd7dcc49b060ce\/hyg\/CURRENT\/hygdata_v41\.csv$/);
  }
});
