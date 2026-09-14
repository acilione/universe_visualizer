import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { starNames } from '../src/nasa-star-names.js';

const bsc = JSON.parse(readFileSync(new URL('../public/catalog/nasa-stars.json', import.meta.url), 'utf8'));
const hip = JSON.parse(readFileSync(new URL('../public/catalog/nasa-hipparcos.json', import.meta.url), 'utf8'));
const expand = (snapshot, row) => Object.fromEntries(snapshot.columns.map((key, index) => [key, row[index]]));
const bscByHr = new Map(bsc.stars.map(row => [row[0], expand(bsc, row)]));
const hipById = new Map(hip.stars.map(row => [row[0], expand(hip, row)]));

test('NASA BSC5P contains the entire stellar catalogue with documented nonstellar exclusions', () => {
  assert.equal(bsc.metadata.sourceCount, 9110);
  assert.equal(bsc.metadata.count, 9096);
  assert.equal(bsc.stars.length, 9096);
  assert.equal(bscByHr.size, bsc.stars.length);
  assert.deepEqual(bsc.metadata.excludedNonstellarHr, [92, 95, 182, 1057, 1841, 2472, 2496, 3515, 3671, 6309, 6515, 7189, 7539, 8296]);
  for (let id = 1; id <= 9110; id++) assert.equal(bscByHr.has(id), !bsc.metadata.excludedNonstellarHr.includes(id), `HR ${id}`);
  assert.equal(new URL(bsc.metadata.endpoint).hostname, 'heasarc.gsfc.nasa.gov');
  assert.match(bsc.metadata.sha256, /^[a-f0-9]{64}$/);
  for (const row of bsc.stars) {
    assert.equal(row.length, bsc.columns.length);
    const star = expand(bsc, row);
    assert.ok(star.raDeg >= 0 && star.raDeg < 360);
    assert.ok(star.decDeg >= -90 && star.decDeg <= 90);
  }
});

test('NASA Hipparcos includes every row with no overlap between archive pages', () => {
  assert.equal(hip.metadata.sourceCount, 118218);
  assert.equal(hip.metadata.count, 118218);
  assert.equal(hip.stars.length, 118218);
  assert.equal(hipById.size, hip.stars.length);
  assert.equal(hip.metadata.requests.length, 3);
  assert.equal(hip.metadata.requests.reduce((total, page) => total + page.count, 0), hip.stars.length);
  for (const page of hip.metadata.requests) {
    assert.equal(new URL(page.url).hostname, 'heasarc.gsfc.nasa.gov');
    assert.match(page.sha256, /^[a-f0-9]{64}$/);
  }
  const missing = [];
  for (const row of hip.stars) {
    assert.equal(row.length, hip.columns.length);
    const star = expand(hip, row);
    if (star.raDeg === null || star.decDeg === null) missing.push(star.hip);
    else {
      assert.ok(star.raDeg >= 0 && star.raDeg < 360);
      assert.ok(star.decDeg >= -90 && star.decDeg <= 90);
    }
  }
  assert.deepEqual(missing, hip.metadata.missingPositionHipIds);
  assert.deepEqual(missing, []);
  const rounded = [...hipById.values()].filter(star => star.positionPrecision === 'rounded').map(star => star.hip);
  assert.equal(rounded.length, 263);
  assert.deepEqual(rounded, hip.metadata.roundedPositionHipIds);
  assert.deepEqual(rounded, hip.metadata.missingPrecisePositionHipIds);
  assert.equal(hip.metadata.coordinateFallbackRequest.count, 263);
  assert.equal(new URL(hip.metadata.coordinateFallbackRequest.url).hostname, 'heasarc.gsfc.nasa.gov');
  assert.equal(hipById.get(32349).positionPrecision, 'precise');
  assert.equal(hipById.get(421).positionPrecision, 'rounded');
});

test('NASA astrometry preserves units, epoch, absent values and unreliable measured parallaxes', () => {
  assert.equal(bsc.units.parallaxArcsec, 'arcsec');
  assert.equal(hip.units.parallaxMas, 'mas');
  assert.equal(hip.units.parallaxErrorMas, 'mas');
  assert.equal(hip.metadata.coordinateEpoch, 1991.25);
  assert.match(hip.metadata.properMotionConvention, /mu_alpha\*cos\(delta\)/);
  assert.ok([...bscByHr.values()].some(star => star.parallaxArcsec === null));
  assert.ok([...hipById.values()].some(star => star.parallaxMas < 0));
  assert.ok([...hipById.values()].some(star => star.parallaxMas === 0));
  assert.ok([...hipById.values()].some(star => star.parallaxMas > 0 && star.parallaxErrorMas > star.parallaxMas));
  assert.equal(hipById.get(32349).parallaxMas, 379.21); // Sirius, NASA Hipparcos original reduction.
  assert.equal(hipById.get(32349).parallaxErrorMas, 1.58);
  assert.ok(!hip.columns.includes('distanceLy'));
});

test('Rho Cygni, Scheat and Sheliak resolve to distinct NASA records with searchable designations', () => {
  const rho = bscByHr.get(8252);
  assert.equal(rho.designation, '73Rho Cyg');
  assert.equal(starNames(rho).name, 'Rho Cygni');
  assert.ok(starNames(rho).aliases.includes('73 Cygni'));
  assert.ok(starNames(rho).aliases.includes('\u03c1 Cygni'));
  assert.ok(starNames(rho).aliases.includes('Rho Cigny'));
  assert.equal(starNames(bscByHr.get(8775)).name, 'Scheat');
  assert.ok(starNames(bscByHr.get(8775)).aliases.includes('Beta Pegasi'));
  assert.equal(starNames(bscByHr.get(7106)).name, 'Sheliak');
  assert.ok(starNames(bscByHr.get(7106)).aliases.includes('Beta Lyrae'));
});

test('name expansion preserves components and catalogue identities without inventing missing names', () => {
  assert.equal(starNames({hr: 24, designation: 'Kap1Scl'}).name, 'Kappa 1 Sculptoris');
  assert.equal(starNames({hr: 8449, designation: '27Pi 1Peg'}).name, 'Pi 1 Pegasi');
  assert.ok(starNames({hr: 8449, designation: '27Pi 1Peg'}).aliases.includes('27 Pegasi'));
  assert.equal(starNames({hr: 3, designation: '33    Psc'}).name, '33 Piscium');
  assert.equal(starNames({hip: 1, hd: 224700}).name, 'HIP 1');
  assert.ok(starNames({hip: 1, hd: 224700}).aliases.includes('HD 224700'));
  assert.equal(starNames({hr: 1}).name, 'HR 1');
});
