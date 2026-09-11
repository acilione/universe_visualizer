import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoordinate, dateInputInZone, zonedDateInputToIso } from '../src/observer-input.js';

test('observer coordinates accept Italian decimal comma and exact supplied DMS location', () => {
  assert.equal(parseCoordinate('38,1144388889', 'latitude'), 38.1144388889);
  assert.equal(parseCoordinate('38\u00b006\u203251.98\u2033N', 'latitude'), 38 + 6 / 60 + 51.98 / 3600);
  assert.equal(parseCoordinate('15\u00b039\u203200\u2033E', 'longitude'), 15.65);
  assert.equal(parseCoordinate(`38\u00b0 06' 51,98" S`, 'latitude'), -(38 + 6 / 60 + 51.98 / 3600));
  assert.equal(parseCoordinate('15.65 O', 'longitude'), -15.65);
  assert.equal(parseCoordinate('-0\u00b030\u2032', 'latitude'), -0.5);
});

test('observer coordinate validation rejects invalid syntax, contradictory hemispheres and range errors', () => {
  for (const value of ['', '91', '90\u00b001\u2032', '38\u00b060\u2032', '38\u00b006\u203260\u2033', '38 E', '-38 N', '38junk', '38,1,4']) {
    assert.throws(() => parseCoordinate(value, 'latitude'), RangeError, value);
  }
  for (const value of ['181', '180\u00b001\u2032', '15 N', 'N15E']) assert.throws(() => parseCoordinate(value, 'longitude'), RangeError, value);
});

test('Italian winter and summer wall time use Rome timezone independently of the host device', () => {
  assert.equal(zonedDateInputToIso('2026-12-11T20:00', 'Europe/Rome'), '2026-12-11T19:00:00.000Z');
  assert.equal(zonedDateInputToIso('2026-07-11T20:00', 'Europe/Rome'), '2026-07-11T18:00:00.000Z');
  assert.equal(zonedDateInputToIso('2026-12-11T20:00', 'UTC'), '2026-12-11T20:00:00.000Z');
  assert.equal(dateInputInZone('2026-12-11T19:00:00.000Z', 'Europe/Rome'), '2026-12-11T20:00');
  assert.equal(dateInputInZone('2026-12-11T23:00:00.000Z', 'Europe/Rome'), '2026-12-12T00:00');
});

test('ambiguous daylight-saving hours, nonexistent hours and invalid calendar dates are rejected', () => {
  for (const value of ['2026-03-29T02:30', '2026-10-25T02:30', '2026-02-30T21:00', '2026-12-11T24:00', '1899-12-11T20:00']) {
    assert.throws(() => zonedDateInputToIso(value, 'Europe/Rome'), RangeError, value);
  }
  assert.equal(zonedDateInputToIso('2026-10-25T02:30', 'UTC'), '2026-10-25T02:30:00.000Z');
});
