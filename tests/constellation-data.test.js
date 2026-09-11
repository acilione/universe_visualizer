import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../public/catalog/stars.json', import.meta.url), 'utf8'));
const figures = JSON.parse(readFileSync(new URL('../public/catalog/constellations.json', import.meta.url), 'utf8'));
const stars = catalog.stars.map(row => Object.fromEntries(catalog.columns.map((column, index) => [column, row[index]])));
const byHip = new Map(stars.filter(star => star.hip !== null).map(star => [star.hip, star]));

// Expected astronomical coverage, independent of the importer implementation.
const iauAbbreviations = 'And Ant Aps Aqr Aql Ara Ari Aur Boo Cae Cam Cnc CVn CMa CMi Cap Car Cas Cen Cep Cet Cha Cir Col Com CrA CrB Crv Crt Cru Cyg Del Dor Dra Equ Eri For Gem Gru Her Hor Hya Hyi Ind Lac Leo LMi Lep Lib Lup Lyn Lyr Men Mic Mon Mus Nor Oct Oph Ori Pav Peg Per Phe Pic Psc PsA Pup Pyx Ret Sge Sgr Sco Scl Sct Ser Sex Tau Tel Tri TrA Tuc UMa UMi Vel Vir Vol Vul'.split(' ');

test('full HYG catalog preserves all fixed stars and valid measured sky coordinates', () => {
  assert.deepEqual(catalog.columns, ['id', 'hip', 'name', 'raDeg', 'decDeg', 'distanceLy', 'mag', 'colorIndex', 'con']);
  assert.equal(stars.length, 119625);
  assert.equal(new Set(stars.map(star => star.id)).size, stars.length);
  assert.equal(byHip.size, stars.filter(star => star.hip !== null).length);
  assert.ok(!stars.some(star => star.id === 'hyg-0'));
  for (const star of stars) {
    assert.ok(star.name.length > 0, star.id);
    assert.ok(Number.isFinite(star.raDeg) && star.raDeg >= 0 && star.raDeg < 360, star.id);
    assert.ok(Number.isFinite(star.decDeg) && star.decDeg >= -90 && star.decDeg <= 90, star.id);
    assert.ok(Number.isFinite(star.mag), star.id);
    assert.ok(star.colorIndex === null || Number.isFinite(star.colorIndex), star.id);
    assert.ok(star.distanceLy === null || (Number.isFinite(star.distanceLy) && star.distanceLy > 0 && star.distanceLy < 326156.377717), star.id);
  }
});

test('unknown parallax is retained as null instead of a fictitious distant shell', () => {
  const unknown = stars.filter(star => star.distanceLy === null);
  assert.equal(unknown.length, 10225);
  assert.equal(catalog.metadata.unknownDistanceCount, unknown.length);
  assert.equal(catalog.metadata.withDistanceCount, 109400);
  assert.equal(byHip.get(89341).name, 'Polis');
  assert.equal(byHip.get(89341).distanceLy, null);
  assert.equal(byHip.get(89341).raDeg, 273.44088);
  assert.deepEqual(figures.metadata.unknownDistanceHipIds, [5165, 22783, 31216, 33165, 54463, 89341, 92202]);
});

test('bright reference stars retain J2000 direction and distance in light-years', () => {
  const sirius = byHip.get(32349);
  assert.equal(sirius.name, 'Sirius');
  assert.ok(Math.abs(sirius.raDeg - 101.2872) < 0.001);
  assert.ok(Math.abs(sirius.decDeg + 16.7161) < 0.001);
  assert.ok(Math.abs(sirius.distanceLy - 8.60) < 0.02);
  const polaris = byHip.get(11767);
  assert.equal(polaris.name, 'Polaris');
  assert.ok(polaris.decDeg > 89 && polaris.decDeg < 90);
  assert.equal(polaris.con, 'UMi');
  const vega = byHip.get(91262);
  assert.ok(Math.abs(vega.distanceLy - 25.04) < 0.02);
  assert.equal(catalog.metadata.epoch, 'J2000.0');
});

test('all 88 IAU constellations have named figures with resolvable exact HIP endpoints', () => {
  assert.equal(figures.constellations.length, 88);
  assert.deepEqual(figures.constellations.map(figure => figure.id).sort(), iauAbbreviations.sort());
  const endpoints = new Set();
  let segmentCount = 0;
  for (const figure of figures.constellations) {
    assert.equal(figure.id, figure.abbr);
    assert.ok(figure.name.length > 0 && figure.latinName.length > 0);
    assert.ok(figure.segments.length > 0, figure.id);
    const unique = new Set();
    for (const segment of figure.segments) {
      assert.equal(segment.length, 2);
      assert.notEqual(segment[0], segment[1]);
      for (const hip of segment) {
        assert.ok(byHip.has(hip), `${figure.id}: missing HIP ${hip}`);
        endpoints.add(hip);
      }
      const key = [...segment].sort((a, b) => a - b).join('-');
      assert.ok(!unique.has(key), `${figure.id}: repeated ${key}`);
      unique.add(key);
      segmentCount++;
    }
  }
  assert.equal(endpoints.size, 710);
  assert.equal(segmentCount, 695);
  assert.deepEqual(figures.metadata.missingHipIds, []);
  assert.equal(figures.metadata.endpointStarCount, endpoints.size);
});

test('Orion belt follows Alnitak, Alnilam and Mintaka rather than a synthetic shape', () => {
  const orion = figures.constellations.find(figure => figure.id === 'Ori');
  assert.equal(orion.name, 'Orione');
  assert.ok(orion.segments.some(([a, b]) => a === 26727 && b === 26311));
  assert.ok(orion.segments.some(([a, b]) => a === 26311 && b === 25930));
  assert.equal(byHip.get(26727).name, 'Alnitak');
  assert.equal(byHip.get(26311).name, 'Alnilam');
  assert.equal(byHip.get(25930).name, 'Mintaka');
});

test('redistributed astronomical datasets retain source, exact revision and share-alike license', () => {
  for (const { metadata } of [catalog, figures]) {
    assert.equal(metadata.license.id, 'CC-BY-SA-4.0');
    assert.equal(metadata.license.url, 'https://creativecommons.org/licenses/by-sa/4.0/');
    assert.match(metadata.revision, /^[0-9a-f]{40}$/);
    assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
    assert.ok(metadata.source.includes(metadata.revision));
    assert.ok(metadata.attribution.length > 10);
    assert.ok(metadata.adaptation.length > 20);
  }
});
