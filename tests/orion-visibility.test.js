import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSkyTransform } from '../src/sky-math.js';

const catalog = JSON.parse(readFileSync(new URL('../public/catalog/stars.json', import.meta.url), 'utf8'));
const figures = JSON.parse(readFileSync(new URL('../public/catalog/constellations.json', import.meta.url), 'utf8'));
const stars = catalog.stars.map(row => Object.fromEntries(catalog.columns.map((key, index) => [key, row[index]])));
const byHip = new Map(stars.filter(star => star.hip).map(star => [star.hip, star]));
const orion = figures.constellations.find(figure => figure.id === 'Ori');
const members = [...new Set(orion.segments.flat())].map(hip => byHip.get(hip));
const reggio = { latitude: 38 + 6 / 60 + 51.98 / 3600, longitude: 15 + 39 / 60 };
const directions = observer => {
  const sky = createSkyTransform(observer);
  return members.map(star => ({ name: star.name, ...sky.horizontal(star.raDeg, star.decDeg) }));
};

test('reported Reggio Calabria fixture shows all of Orion on 11 December 2026 at 20:00 CET', () => {
  // User coordinates: 38 degrees 06 minutes 51.98 seconds N, 15 degrees 39 minutes E.
  // Italy in December is UTC+01:00; explicit offsets make this independent of the host timezone.
  const local = directions({ ...reggio, dateIso: '2026-12-11T20:00:00+01:00' });
  const utc = directions({ ...reggio, dateIso: '2026-12-11T19:00:00Z' });
  assert.deepEqual(local, utc);
  assert.equal(local.length, 21);
  assert.ok(local.every(star => star.altitudeDeg > 12 && star.altitudeDeg < 36));
  assert.ok(local.every(star => star.azimuthDeg > 85 && star.azimuthDeg < 118));
  const rigel = local.find(star => star.name === 'Rigel');
  const betelgeuse = local.find(star => star.name === 'Betelgeuse');
  // Coarse observational constraints, deliberately wider than the omitted nutation/refraction.
  // USNO horizon convention: altitude above horizon; azimuth clockwise from north.
  // https://aa.usno.navy.mil/faq/alt_az
  assert.ok(rigel.altitudeDeg > 19 && rigel.altitudeDeg < 20);
  assert.ok(betelgeuse.altitudeDeg > 21 && betelgeuse.altitudeDeg < 23);
});

test('Orion remains visible from northern, central and southern Italy on winter evenings', () => {
  const cities = [
    { name: 'Milano', latitude: 45.4642, longitude: 9.19 },
    { name: 'Roma', latitude: 41.9028, longitude: 12.4964 },
    { name: 'Palermo', latitude: 38.1157, longitude: 13.3615 },
  ];
  for (const city of cities) {
    for (const dateIso of ['2026-12-11T20:00:00+01:00', '2026-01-15T21:00:00+01:00']) {
      const sky = directions({ ...city, dateIso });
      assert.ok(sky.every(star => star.altitudeDeg > 5), `${city.name}: Orion must be above the horizon at ${dateIso}`);
    }
  }
});

test('the same Orion fixture rises and sets instead of being forced above the horizon', () => {
  const beforeRising = directions({ ...reggio, dateIso: '2026-12-11T15:00:00Z' });
  const rising = directions({ ...reggio, dateIso: '2026-12-11T16:00:00Z' });
  const setting = directions({ ...reggio, dateIso: '2026-12-12T06:00:00Z' });
  const afterSetting = directions({ ...reggio, dateIso: '2026-12-12T07:00:00Z' });
  assert.ok(beforeRising.every(star => star.altitudeDeg < 0));
  assert.ok(rising.some(star => star.altitudeDeg >= 0) && rising.some(star => star.altitudeDeg < 0));
  assert.ok(setting.some(star => star.altitudeDeg >= 0) && setting.some(star => star.altitudeDeg < 0));
  assert.ok(afterSetting.every(star => star.altitudeDeg < 0));
});

test('the full HYG catalogue produces finite unit sky directions at the reported observation', () => {
  const sky = createSkyTransform({ ...reggio, dateIso: '2026-12-11T19:00:00Z' });
  for (const star of stars) {
    const vector = sky.vector(star.raDeg, star.decDeg);
    assert.ok(vector.every(Number.isFinite), star.name);
    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-12, star.name);
  }
});
