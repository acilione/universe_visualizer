import test from 'node:test';
import assert from 'node:assert/strict';
import {
  equatorialVector, validateObserver, greenwichMeanSiderealTime, precessJ2000,
  equatorialToHorizontalAtSiderealTime, createSkyTransform, equatorialToHorizontal,
} from '../src/sky-math.js';

const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} differs from ${expected} by more than ${tolerance}`);
const vectorClose = (actual, expected, tolerance) => actual.forEach((component, i) => close(component, expected[i], tolerance));
const epoch = '2000-01-01T12:00:00.000Z';
const observer = { latitude: 41.9028, longitude: 12.4964, dateIso: '2026-09-11T00:00:00.000Z' };

test('equatorial scene axes retain the existing right-handed catalogue convention', () => {
  vectorClose(equatorialVector(0, 0, 3), [3, 0, 0]);
  vectorClose(equatorialVector(90, 0, 2), [0, 0, -2]);
  vectorClose(equatorialVector(180, 90, 4), [0, 4, 0]);
  vectorClose(equatorialVector(360, 0), equatorialVector(0, 0));
  assert.throws(() => equatorialVector(0, 91), RangeError);
  assert.throws(() => equatorialVector(0, 0, -1), RangeError);
});

test('sidereal angle matches the J2000 reference and advances about four minutes per solar day', () => {
  close(greenwichMeanSiderealTime(epoch), 280.46061837, 0.0001);
  close(greenwichMeanSiderealTime('1987-04-10T19:21:00Z'), 128.7378734, 0.0002);
  const first = greenwichMeanSiderealTime('2026-09-11T00:00:00Z');
  const second = greenwichMeanSiderealTime('2026-09-12T00:00:00Z');
  close((second - first + 360) % 360, 0.985647366, 0.00001);
  const east = createSkyTransform({ ...observer, longitude: 30 });
  const west = createSkyTransform({ ...observer, longitude: -30 });
  close((east.siderealDeg - west.siderealDeg + 360) % 360, 60);
});

test('cardinal horizon directions and meridian altitude use true north and east correctly', () => {
  const at = (ra, dec = 0, latitude = 0) => equatorialToHorizontalAtSiderealTime(ra, dec, { latitude, siderealDeg: 0 });
  close(at(0).altitudeDeg, 90);
  close(at(180).altitudeDeg, -90);
  vectorClose(at(90).vector, [1, 0, 0]);
  close(at(90).azimuthDeg, 90);
  vectorClose(at(270).vector, [-1, 0, 0]);
  close(at(270).azimuthDeg, 270);
  vectorClose(at(0, 90).vector, [0, 0, -1]);
  close(at(0, 90).azimuthDeg, 0);
  vectorClose(at(0, -90).vector, [0, 0, 1]);
  close(at(0, -90).azimuthDeg, 180);
  close(at(0, 20, 45).altitudeDeg, 65);
  close(at(0, 20, 45).azimuthDeg, 180);
  close(at(0, 90, 45).altitudeDeg, 45);
  close(at(0, 90, -45).altitudeDeg, -45);
});

test('precession preserves J2000 and agrees with an independent SOFA IAU 1976 numerical fixture', () => {
  const original = { raDeg: 123.45, decDeg: -67.8 };
  const unchanged = precessJ2000(original.raDeg, original.decDeg, epoch);
  close(unchanged.raDeg, original.raDeg);
  close(unchanged.decDeg, original.decDeg);
  // Numerical reference from the SOFA validation dataset t_pmat76, JD 2450124.4999.
  // https://raw.githubusercontent.com/Starlink/sofa/master/src/t_sofa_c.c
  // The catalogue's RA=0, Dec=0 direction selects the first matrix column.
  const date = new Date((2450124.4999 - 2440587.5) * 86400000).toISOString();
  const precessed = precessJ2000(0, 0, date);
  const appVector = equatorialVector(precessed.raDeg, precessed.decDeg);
  vectorClose(appVector, [0.9999995504328350733, -0.0003779153474950335, 0.0008696632209485112], 1e-11);
  const today = precessJ2000(0, 0, observer.dateIso);
  assert.ok(today.raDeg > 0.3 && today.raDeg < 0.4);
  assert.ok(today.decDeg > 0.1 && today.decDeg < 0.2);
});

test('batched sky rotation agrees with sequential precession and horizontal conversion at both poles', () => {
  for (const latitude of [-90, -45, 0, 41.9028, 90]) {
    for (const dateIso of ['1900-01-01T00:00:00Z', epoch, observer.dateIso, '2100-12-31T23:59:59Z']) {
      const frame = createSkyTransform({ ...observer, latitude, dateIso });
      for (const [ra, dec] of [[0, 0], [90, 90], [270, -90], [359.99, -20.4], [88.79, 7.407]]) {
        const precessed = precessJ2000(ra, dec, dateIso);
        const expected = equatorialToHorizontalAtSiderealTime(precessed.raDeg, precessed.decDeg,
          { latitude, siderealDeg: frame.siderealDeg });
        const actual = frame.horizontal(ra, dec);
        vectorClose(actual.vector, expected.vector);
        close(Math.hypot(...actual.vector), 1);
        vectorClose(frame.vector(ra, dec, 50), actual.vector.map(n => n * 50), 1e-10);
        assert.ok(Number.isFinite(actual.altitudeDeg) && Number.isFinite(actual.azimuthDeg));
      }
    }
  }
  vectorClose(equatorialToHorizontal(88.79, 7.407, observer).vector, createSkyTransform(observer).vector(88.79, 7.407));
});

test('observer validation rejects impossible locations, ambiguous dates and nonexistent calendar dates', () => {
  assert.deepEqual(validateObserver({ ...observer, dateIso: '2026-09-11T02:00:00+02:00' }), observer);
  for (const latitude of [NaN, Infinity, 91, -91, '41.9', null]) {
    assert.throws(() => validateObserver({ ...observer, latitude }), RangeError);
  }
  for (const longitude of [NaN, Infinity, 181, -181, '12.5']) {
    assert.throws(() => validateObserver({ ...observer, longitude }), RangeError);
  }
  for (const dateIso of ['invalid', '', '2026-09-11T00:00', '2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z', '1800-01-01T00:00:00Z']) {
    assert.throws(() => validateObserver({ ...observer, dateIso }), RangeError);
  }
  assert.equal(validateObserver({ ...observer, dateIso: '2024-02-29T00:00:00Z' }).dateIso, '2024-02-29T00:00:00.000Z');
});
