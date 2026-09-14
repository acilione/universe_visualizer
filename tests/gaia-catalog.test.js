import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gaiaSourceId, propagateGaia, mergeGaiaCatalog, GAIA_DR3_SOURCE } from '../src/gaia-catalog.js';

const sourceId = index => '900719925474099' + index;
const row = (index = 1, changes = {}) => ({ sourceId: sourceId(index), designation: 'Gaia DR3 ' + sourceId(index),
  refEpoch: 2016, raDeg: 150, decDeg: 20, pmRaMasYr: 10, pmDecMasYr: -20,
  parallaxMas: 10, parallaxErrorMas: .1, gMag: 5.2, bpMag: 5.8, rpMag: 4.9, bpRp: .9,
  radialVelocityKmS: 17, ruwe: 1.1, duplicatedSource: false, hipMatches: [], ...changes });
const match = (hip, changes = {}) => ({ hip, angularDistanceArcsec: .015, numberOfNeighbours: 1, xmFlag: 8, ...changes });
const nasaStar = (hip = 1, changes = {}) => ({ id: 'hip-' + hip, hip, name: 'HIP ' + hip, bodyKind: 'catalog-star',
  raDeg: 50, decDeg: 10, positionEpoch: 2000, mag: 5.9, magnitudeBand: 'V', nasaCatalogue: 'hipparcos',
  pmRaMasYr: 1, pmDecMasYr: 2, parallaxMas: 9.8, source: 'https://heasarc.gsfc.nasa.gov/hipparcos',
  sources: ['https://heasarc.gsfc.nasa.gov/hipparcos'], aliases: ['HIP ' + hip], searchText: 'hip ' + hip, ...changes });
const nasa = (stars = []) => ({ stars, nebulae: [{ id: 'ngc-1976', bodyKind: 'nebula' }], metadata: { starCount: stars.length },
  objects: [...stars, { id: 'ngc-1976', bodyKind: 'nebula' }], byId: new Map(stars.map(star => [star.id, star])), byHip: new Map(stars.map(star => [star.hip, star])) });
const snapshot = stars => ({ metadata: { sourceTable: 'gaiadr3.gaia_source', crossmatchTable: 'gaiadr3.hipparcos2_best_neighbour',
  selection: 'phot_g_mean_mag <= 6' }, stars });

test('Gaia 64-bit source IDs stay exact, distinct strings', () => {
  assert.equal(gaiaSourceId('9007199254740992'), '9007199254740992');
  assert.equal(gaiaSourceId('9007199254740993'), '9007199254740993');
  for (const invalid of [9007199254740992, 12, null, '01', '-1', '0', '1.5', '9223372036854775808', '1e15']) {
    assert.throws(() => gaiaSourceId(invalid), TypeError);
  }
  const data = mergeGaiaCatalog(nasa(), snapshot([row(2), row(3)]));
  assert.equal(data.stars.length, 2);
  assert.notEqual(data.stars[0].id, data.stars[1].id);
  assert.equal(data.byId.get('gaia-dr3-9007199254740993').gaiaData.sourceId, '9007199254740993');
});

test('Gaia proper motion moves from J2016 to J2000 with the RA cosine already included', () => {
  const atEquator = propagateGaia(row(1, { raDeg: 0, decDeg: 0, pmRaMasYr: 1000, pmDecMasYr: 0 }));
  assert.ok(Math.abs(atEquator.raDeg - (360 - 16 / 3600)) < 1e-9);
  assert.equal(atEquator.decDeg, 0);
  assert.equal(atEquator.positionEpoch, 2000);
  assert.equal(atEquator.positionPropagated, true);
  const atSixty = propagateGaia(row(1, { raDeg: 10, decDeg: 60, pmRaMasYr: 1000, pmDecMasYr: 0 }));
  assert.ok(Math.abs(atSixty.raDeg - (10 - 32 / 3600)) < 1e-9);
  const declination = propagateGaia(row(1, { raDeg: 10, decDeg: 0, pmRaMasYr: 0, pmDecMasYr: 1000 }));
  assert.ok(Math.abs(declination.decDeg + 16 / 3600) < 1e-9);
  for (const decDeg of [-90, 90, -89.999999, 89.999999]) {
    const polar = propagateGaia(row(1, { decDeg, pmRaMasYr: 100000, pmDecMasYr: -150000 }));
    assert.ok(Number.isFinite(polar.raDeg) && polar.raDeg >= 0 && polar.raDeg < 360);
    assert.ok(Number.isFinite(polar.decDeg) && Math.abs(polar.decDeg) <= 90);
  }
});

test('missing proper motion retains and labels the native epoch instead of inventing J2000 coordinates', () => {
  const native = row(1, { pmRaMasYr: null });
  assert.deepEqual(propagateGaia(native), { raDeg: native.raDeg, decDeg: native.decDeg, positionEpoch: 2016, positionPropagated: false });
  const star = mergeGaiaCatalog(nasa(), snapshot([native])).stars[0];
  assert.equal(star.positionEpoch, 2016);
  assert.match(star.positionNote, /proper motion is unavailable/);
});

test('official reciprocal HIP match enriches once while preserving NASA identity and measurements', () => {
  const original = nasaStar(), before = JSON.stringify(original);
  const gaia = row(1, { hipMatches: [match(1)] });
  const data = mergeGaiaCatalog(nasa([original]), snapshot([gaia]));
  const enriched = data.byHip.get(1);
  assert.equal(data.stars.length, 1);
  assert.equal(data.byId.get('gaia-dr3-' + gaia.sourceId), enriched);
  for (const field of ['id', 'raDeg', 'decDeg', 'positionEpoch', 'mag', 'magnitudeBand', 'pmRaMasYr', 'pmDecMasYr', 'parallaxMas', 'nasaCatalogue']) {
    assert.equal(enriched[field], original[field]);
  }
  assert.equal(enriched.gaiaData.raDeg, gaia.raDeg);
  assert.equal(enriched.gaiaData.gMag, 5.2);
  assert.equal(enriched.gaiaData.referenceEpoch, 2016);
  assert.ok(enriched.sources.includes(original.source) && enriched.sources.includes(GAIA_DR3_SOURCE));
  assert.ok(enriched.aliases.includes('Gaia DR3 ' + gaia.sourceId));
  assert.match(enriched.searchText, /gaia dr 3 9007199254740991/);
  assert.equal(enriched.gaiaMatchStatus, 'official-hipparcos-match');
  assert.equal(data.metadata.gaiaDr3.matching.matchedCount, 1);
  assert.equal(JSON.stringify(original), before);
  assert.notEqual(enriched.gaiaData.hipMatches, gaia.hipMatches);
});

test('Gaia-only stars use G photometry without pretending BP-RP is Johnson B-V', () => {
  const data = mergeGaiaCatalog(nasa(), snapshot([row()])), star = data.stars[0];
  assert.equal(star.catalogueProvider, 'ESA Gaia DR3');
  assert.equal(star.gaiaCatalogue, 'dr3');
  assert.equal(star.nasaCatalogue, undefined);
  assert.equal(star.mag, 5.2); assert.equal(star.magnitudeBand, 'G'); assert.equal(star.colorIndex, null);
  assert.equal(star.gaiaData.bpRp, .9);
  assert.equal(star.gaiaData.raDeg, 150); assert.notEqual(star.raDeg, 150);
  assert.equal(star.spectralType, null);
  assert.equal(star.gaiaMatchStatus, 'gaia-only');
  assert.equal(data.metadata.gaiaDr3.matching.addedCount, 1);
  assert.equal(data.byId.get('ngc-1976').bodyKind, 'nebula');
});

test('inverse-parallax estimates require positive quantified parallax and acceptable RUWE', () => {
  const stars = mergeGaiaCatalog(nasa(), snapshot([
    row(1), row(2, { parallaxMas: -1 }), row(3, { parallaxErrorMas: null }),
    row(4, { parallaxErrorMas: 3 }), row(5, { ruwe: 2 }), row(6, { ruwe: null }),
  ])).stars;
  assert.equal(stars[0].distanceLy, 3261.563777 / 10);
  for (const star of stars.slice(1)) { assert.equal(star.distanceLy, null); assert.equal(star.distanceEstimate, false); }
  assert.equal(stars[1].parallaxMas, -1);
});

test('multiple Gaia sources for one HIP and one Gaia source for several HIPs stay quarantined', () => {
  const input = nasa([nasaStar(1), nasaStar(2)]);
  const data = mergeGaiaCatalog(input, snapshot([
    row(1, { hipMatches: [match(1)] }), row(2, { hipMatches: [match(1)] }),
    row(3, { hipMatches: [match(1), match(2)] }),
  ]));
  assert.equal(data.stars.length, 2);
  assert.equal(data.metadata.gaiaDr3.matching.matchedCount, 0);
  assert.equal(data.gaiaAmbiguousRecords.length, 3);
  assert.ok(data.gaiaAmbiguousRecords[0].reasons.includes('multiple-gaia-sources-for-hipparcos'));
  assert.ok(data.gaiaAmbiguousRecords[2].reasons.includes('multiple-hipparcos-matches'));
  assert.deepEqual(data.gaiaAmbiguousRecords[2].candidateNasaIds, ['hip-1', 'hip-2']);
  assert.equal(data.byId.has('gaia-dr3-' + sourceId(1)), false);
});

test('official multiplicity flags, unknown quality, duplicated-source flags and nonunique neighbours block enrichment', () => {
  const cases = [
    { duplicatedSource: true }, { duplicatedSource: null },
    { hipMatches: [match(1, { xmFlag: 9 })] }, { hipMatches: [match(1, { xmFlag: 10 })] },
    { hipMatches: [match(1, { xmFlag: 12 })] }, { hipMatches: [match(1, { xmFlag: null })] },
    { hipMatches: [match(1, { numberOfNeighbours: 2 })] }, { hipMatches: [match(1, { numberOfNeighbours: null })] },
  ];
  for (const changes of cases) {
    const data = mergeGaiaCatalog(nasa([nasaStar()]), snapshot([row(1, { hipMatches: [match(1)], ...changes })]));
    assert.equal(data.metadata.gaiaDr3.matching.matchedCount, 0);
    assert.equal(data.gaiaAmbiguousRecords.length, 1);
    assert.equal(data.byHip.get(1).gaiaData, undefined);
  }
});

test('positional overlap is evidence, never identity, including BSC-only and polar/wrapped directions', () => {
  for (const [raDeg, decDeg, gaiaRa, gaiaDec] of [[20, 30, 20.0001, 30], [359.9999, 0, .0001, 0], [0, 90, 180, 89.9999]]) {
    const bsc = nasaStar(null, { id: 'bsc-1', hip: null, nasaCatalogue: 'bsc5p', raDeg, decDeg });
    const gaia = row(1, { raDeg: gaiaRa, decDeg: gaiaDec, pmRaMasYr: 0, pmDecMasYr: 0 });
    const data = mergeGaiaCatalog(nasa([bsc]), snapshot([gaia]));
    assert.equal(data.stars.length, 1);
    assert.equal(data.gaiaAmbiguousRecords.length, 1);
    assert.deepEqual(data.gaiaAmbiguousRecords[0].candidateNasaIds, ['bsc-1']);
    assert.ok(data.gaiaAmbiguousRecords[0].reasons.includes('unresolved-nasa-positional-overlap'));
  }
});

test('positional collision audit uses propagated Gaia positions, not native J2016 directions', () => {
  const gaia = row(1, { raDeg: 10, decDeg: 0, pmRaMasYr: 5000, pmDecMasYr: 0 });
  const projected = propagateGaia(gaia);
  const data = mergeGaiaCatalog(nasa([nasaStar(1, projected)]), snapshot([gaia]));
  assert.equal(data.gaiaAmbiguousRecords.length, 1);
  assert.ok(data.gaiaAmbiguousRecords[0].proximityCandidates[0].separationArcsec < 1e-8);
});

test('repeated identical source rows collapse once; conflicting records never choose an arbitrary measurement', () => {
  const repeated = row(1, { hipMatches: [match(1)] });
  const data = mergeGaiaCatalog(nasa([nasaStar()]), snapshot([repeated, structuredClone(repeated)]));
  assert.equal(data.stars.length, 1);
  assert.equal(data.metadata.gaiaDr3.matching.repeatedRowCount, 1);
  assert.equal(data.metadata.gaiaDr3.matching.matchedCount, 1);
  const conflict = mergeGaiaCatalog(nasa([nasaStar(1), nasaStar(2)]), snapshot([repeated, { ...repeated, gMag: 9, hipMatches: [match(2)] }]));
  assert.equal(conflict.metadata.gaiaDr3.matching.matchedCount, 0);
  assert.equal(conflict.gaiaAmbiguousRecords[0].conflictingRecords.length, 2);
  assert.deepEqual(conflict.gaiaAmbiguousRecords[0].candidateNasaIds, ['hip-1', 'hip-2']);
  assert.ok(conflict.gaiaAmbiguousRecords[0].reasons.includes('conflicting-source-records'));
});

test('unverified provenance, numeric Gaia IDs and corrupt HIP associations fail rather than silently deduplicate', () => {
  assert.throws(() => mergeGaiaCatalog(nasa(), { stars: [row()], metadata: {} }), TypeError);
  assert.throws(() => mergeGaiaCatalog(nasa(), snapshot([row(1, { sourceId: 9007199254740992 })])), TypeError);
  assert.throws(() => mergeGaiaCatalog(nasa(), snapshot([row(1, { hipMatches: null })])), TypeError);
  assert.throws(() => mergeGaiaCatalog(nasa(), snapshot([row(1, { hipMatches: [match('1')] })])), TypeError);
});

test('invalid positions and an unexpected reference epoch are reported and cannot enter the renderer', () => {
  const data = mergeGaiaCatalog(nasa(), snapshot([row(1, { raDeg: null }), row(2, { decDeg: 91 }), row(3, { refEpoch: 2015.5 })]));
  assert.equal(data.stars.length, 0);
  assert.equal(data.gaiaAmbiguousRecords.length, 3);
  assert.equal(data.metadata.gaiaDr3.matching.reasonCounts['invalid-position'], 2);
  assert.equal(data.metadata.gaiaDr3.matching.reasonCounts['unexpected-native-epoch'], 1);
});


test('explicit extragalactic candidate flags do not silently classify a Gaia source as a star', () => {
  const data = mergeGaiaCatalog(nasa(), snapshot([row(1, { inQsoCandidates: true }), row(2, { inGalaxyCandidates: true })]));
  assert.equal(data.stars.length, 0);
  assert.equal(data.gaiaAmbiguousRecords.length, 2);
  assert.equal(data.metadata.gaiaDr3.matching.reasonCounts['extragalactic-candidate'], 2);
});


test('the committed real snapshot accounts for every Gaia row and preserves every NASA object', async () => {
  const { buildCelestialCatalogue } = await import('../src/celestial-catalog.js');
  const read = async file => JSON.parse(await readFile(new URL('../public/catalog/' + file, import.meta.url), 'utf8'));
  const [hip, bsc, nebula, gaia, audit] = await Promise.all(['nasa-hipparcos.json', 'nasa-stars.json', 'nasa-nebulae.json', 'gaia-dr3.json', 'gaia-match-audit.json'].map(read));
  const original = buildCelestialCatalogue(hip, bsc, nebula);
  const data = mergeGaiaCatalog(original, gaia), counts = data.metadata.gaiaDr3.matching;
  assert.equal(gaia.metadata.selection.completeGaiaCatalogue, false);
  assert.equal(gaia.metadata.selection.maxGMag, 6);
  assert.equal(gaia.stars.length, gaia.metadata.officialCount);
  assert.equal(counts.uniqueSourceCount, counts.matchedCount + counts.addedCount + counts.quarantinedCount);
  assert.equal(data.stars.length, original.stars.length + counts.addedCount);
  assert.equal(new Set(data.stars.map(star => star.id)).size, data.stars.length);
  for (const before of original.stars) {
    const after = data.byId.get(before.id);
    assert.ok(after, before.id);
    for (const field of ['id', 'name', 'raDeg', 'decDeg', 'positionEpoch', 'mag', 'magnitudeBand', 'parallaxMas', 'pmRaMasYr', 'pmDecMasYr', 'source']) assert.equal(after[field], before[field], before.id + ' ' + field);
  }
  const excluded = new Map(data.gaiaAmbiguousRecords.map(record => [record.sourceId, record]));
  for (const source of gaia.stars) {
    const object = data.gaiaBySourceId.get(source.sourceId);
    assert.ok(Boolean(object) !== excluded.has(source.sourceId), source.sourceId + ' must have exactly one outcome');
    if (object) {
      assert.equal(data.byId.get('gaia-dr3-' + source.sourceId), object);
      assert.equal(object.gaiaData.sourceId, source.sourceId);
      assert.equal(object.gaiaData.gMag, source.gMag);
    } else assert.equal(data.byId.has('gaia-dr3-' + source.sourceId), false);
  }
  assert.deepEqual(counts.reasonCounts, audit.counts.reasonCounts);
  for (const name of ['uniqueSourceCount', 'matchedCount', 'addedCount', 'quarantinedCount']) assert.equal(counts[name], audit.counts[name]);
  for (const input of audit.inputs) {
    const bytes = await readFile(new URL('../' + input.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), input.sha256, input.file + ' audit hash');
  }
});
