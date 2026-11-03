import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { hudObjectInfo } from '../src/spatial-hud-info.js';
import { setLanguage } from '../src/i18n.js';
import { catalog } from '../src/data.js';
import { solarMoons } from '../src/moons.js';
import { streamedGaiaObject } from '../src/gaia-streamed-sky.js';

setLanguage('en');
afterEach(() => setLanguage('en'));
const values = info => Object.fromEntries(info.rows.map(row => [row.label, row.value]));

test('Solar System information never treats display sizes, orbits or positions as physical measurements', () => {
  const earth = catalog.solar.find(body => body.id === 'earth');
  const info = hudObjectInfo(earth);
  assert.equal(info.name, 'Earth');
  assert.equal(info.source, 'NASA / JPL');
  assert.deepEqual(values(info), {
    'Semimajor axis (approx.)': '1 AU', 'Equatorial radius': '6,378.1366 km',
    'Polar radius': '6,356.7519 km', 'Rotation (IAU)': '23.934 h',
  });
  const altered = hudObjectInfo({ ...earth, size: 10000, orbit: 90000, position: [1e9, 2e9, 3e9] });
  assert.deepEqual(altered, info);
  const sun = hudObjectInfo(catalog.solar.find(body => body.id === 'sun'));
  assert.equal(values(sun)['Distance / extent'], '0 AU from the Sun');
  assert.equal(values(sun)['Equatorial radius'], '695,700 km');
  assert.equal(values(sun)['Polar radius'], '695,700 km');
  assert.equal(values(sun)['Rotation (IAU)'], '609.12 h');
  assert.equal(sun.source, 'NASA / JPL');
  assert.equal(sun.rows.length, 4);
});

test('actual moon records provide four physical facts and JPL attribution', () => {
  const moon = solarMoons.find(body => body.id === 'moon');
  const before = JSON.stringify(moon);
  const info = hudObjectInfo(moon);
  assert.equal(info.source, 'NASA / JPL');
  assert.equal(info.rows.length, 4);
  assert.equal(values(info).Parent, 'Earth');
  assert.match(values(info)['Mean radius'], /km$/);
  assert.match(values(info)['Semimajor axis'], /km$/);
  assert.match(values(info)['Orbital period'], /days$/);
  assert.equal(JSON.stringify(moon), before);
});

test('a NASA/Gaia match retains top-level NASA photometry and astrometry', () => {
  const info = hudObjectInfo({
    id: 'hip-1', name: 'HIP 1', bodyKind: 'catalog-star', nasaCatalogue: 'hipparcos',
    distanceLy: 12.5, distanceEstimate: true, mag: 0, magnitudeBand: 'V',
    parallaxMas: 0, raDeg: 0, decDeg: 0, positionEpoch: 2000, coordinateFrame: 'ICRS',
    gaiaSourceId: '9007199254740993', gaiaData: { gMag: -1.2, raDeg: 12, decDeg: 13, referenceEpoch: 2016 },
  });
  assert.equal(info.source, 'NASA HEASARC · Hipparcos');
  assert.equal(values(info)['App. magnitude (V)'], '0');
  assert.equal(values(info)['Distance estimate'], '≈ 12.5 ly');
  assert.equal(values(info).Parallax, '0 mas');
  assert.equal(values(info)['RA / Dec · ICRS'], '0° / 0° · J2000.0');
  assert.ok(!JSON.stringify(info).includes('2016'));
});

test('resolved Gaia sources retain exact identifiers, G photometry and native epoch without inventing distance', () => {
  const object = streamedGaiaObject({ sourceId: '9007199254740993', raDeg: 83.8, decDeg: -5.4,
    refEpoch: 2016, gMag: -0.25, parallaxMas: -0.5, parallaxErrorMas: 0.1, ruwe: 1.1 });
  const info = hudObjectInfo(object);
  assert.equal(info.id, 'gaia-dr3-9007199254740993');
  assert.equal(info.name, 'Gaia DR3 9007199254740993');
  assert.equal(info.source, 'ESA Gaia DR3 · CDS');
  assert.equal(values(info)['App. magnitude (G)'], '-0.25');
  assert.equal(values(info).Parallax, '-0.5 mas');
  assert.equal(values(info)['Distance / extent'], 'Distance unavailable');
  assert.equal(values(info)['RA / Dec · ICRS / Gaia-CRF3'], '83.8° / -5.4° · J2016.0');
});

test('nebula angular extent remains angular and an unknown magnitude band is not called V', () => {
  const info = hudObjectInfo({ id: 'ngc-1', name: 'NGC 1', bodyKind: 'nebula', nasaCatalogue: 'ngc2000',
    distanceLy: null, angularSizeArcmin: 7.5, mag: 0, raDeg: 0, decDeg: 90,
    coordinateFrame: 'FK5 / J2000', positionEpoch: 2000 });
  assert.equal(info.source, 'NASA HEASARC · NGC2000');
  assert.equal(values(info)['Angular size'], '7.5 arcmin');
  assert.equal(values(info)['App. magnitude'], '0');
  assert.equal(values(info).Distance, 'Not available');
  assert.equal(info.rows.length, 4);
  assert.ok(!JSON.stringify(info).includes('(V)'));
});

test('exoplanets use archive measurements with units and a bounded set of rows', () => {
  const info = hudObjectInfo({ id: 'planet', name: 'Planet b', bodyKind: 'exoplanet', host: 'Host',
    radiusEarth: 1.25, semiMajorAxisAu: 0.02, periodDays: 1.23456, distancePc: 10,
    source: 'https://exoplanetarchive.ipac.caltech.edu/overview/Planet%20b' });
  assert.equal(info.source, 'NASA Exoplanet Archive');
  assert.deepEqual(values(info), {
    'Host star': 'Host', Radius: '1.25 R⊕', 'Semimajor axis': '0.02 AU', 'Orbital period': '1.2346 days',
  });
  const missing = hudObjectInfo({ id: 'planet', bodyKind: 'exoplanet', host: 'Host', radiusEarth: null, periodDays: NaN, distancePc: 0 });
  assert.deepEqual(values(missing), { 'Host star': 'Host', Distance: '0 pc' });
});

test('galaxy extent text and source provenance remain intact', () => {
  const galaxy = catalog.galaxy.find(body => body.id === 'milkyway');
  const info = hudObjectInfo(galaxy);
  assert.equal(values(info)['Distance / extent'], galaxy.distance);
  assert.equal(info.source, 'NASA');
  assert.equal(hudObjectInfo({ source: 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=star' }).source, 'SIMBAD · CDS');
});

test('Italian names, labels and numbers follow the selected language without changing source data', () => {
  setLanguage('it');
  const object = { id: 'test-planet', englishName: 'Earth', italianName: 'Terra', bodyKind: 'planet', radiusKm: 6371.2, periodDays: 365.25, semiMajorAxisAu: 1 };
  const info = hudObjectInfo(object);
  assert.equal(info.name, 'Terra');
  assert.equal(info.kind, 'Pianeta');
  assert.equal(values(info)['Raggio medio'], '6371,2 km');
  assert.equal(values(info)['Semiasse maggiore'], '1 UA');
  assert.equal(values(info)['Periodo orbitale'], '365,25 giorni');
  assert.equal(info.source, 'Fonte non disponibile');
  setLanguage('en');
  assert.equal(hudObjectInfo(object).name, 'Earth');
});

test('missing, invalid and lightweight records do not invent physical facts or throw', () => {
  assert.equal(hudObjectInfo(null), null);
  assert.equal(hudObjectInfo(undefined), null);
  const info = hudObjectInfo({ id: 'unknown', size: 9, position: [100, 200, 300],
    distanceLy: NaN, mag: Infinity, radiusKm: null, raDeg: 400, decDeg: 91 });
  assert.equal(info.name, 'Unnamed object');
  assert.deepEqual(info.rows, [{ label: 'Distance', value: 'Not available' }]);
  assert.equal(info.source, 'Source unavailable');
  assert.equal(hudObjectInfo({ id: 'star', mag: 0, distanceLy: 0 }).rows[0].value, '0 ly');
});


test('all eight Solar planets use semimajor-axis references and measured ellipsoids with bounded rows', () => {
  for (const body of catalog.solar.filter(body => body.bodyKind === 'planet')) {
    const info = hudObjectInfo(body);
    assert.equal(info.rows.length, 4, body.id);
    assert.equal(info.source, 'NASA / JPL', body.id);
    assert.equal(info.rows[0].label, 'Semimajor axis (approx.)', body.id);
    assert.ok(!JSON.stringify(info.rows).includes('from the Sun'), body.id);
    assert.ok(!JSON.stringify(info.rows).includes('Mean radius'), body.id);
  }
  const jupiter = hudObjectInfo(catalog.solar.find(body => body.id === 'jupiter'));
  assert.equal(values(jupiter)['Equatorial radius'], '71,492 km');
  assert.equal(values(jupiter)['Polar radius'], '66,854 km');
  const sunReference = hudObjectInfo(catalog.stars.find(body => body.id === 'sol'));
  assert.equal(values(sunReference)['Equatorial radius'], '695,700 km');
});

test('Italian authored Solar distances retain their orbital meaning and measurements localize', () => {
  setLanguage('it');
  const info = hudObjectInfo({ id: 'mercury', bodyKind: 'planet', englishName: 'Mercury', italianName: 'Mercurio', distance: '0,39 UA dal Sole' });
  assert.equal(values(info)['Semiasse maggiore (ca.)'], '0,39 UA');
  assert.equal(values(info)['Raggio equatoriale'], '2440,53 km');
  assert.equal(values(info)['Raggio polare'], '2438,26 km');
  assert.equal(values(info)['Rotazione (IAU)'], '1407,508 h');
});
