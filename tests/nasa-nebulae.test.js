import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const snapshot = JSON.parse(readFileSync(new URL('../public/catalog/nasa-nebulae.json', import.meta.url), 'utf8'));
const records = snapshot.objects.map(row => Object.fromEntries(snapshot.columns.map((column, index) => [column, row[index]])));
const byId = new Map(records.map(record => [record.id, record]));

function nasaUrl(value) {
  const url = new URL(value);
  return url.protocol === 'https:' && (url.hostname === 'nasa.gov' || url.hostname.endsWith('.nasa.gov'));
}

test('NASA nebula snapshot covers the complete selected source classifications', () => {
  assert.equal(records.length, 485);
  assert.equal(snapshot.metadata.count, records.length);
  assert.equal(byId.size, records.length);
  assert.equal(snapshot.metadata.coordinateEquinox, 'J2000.0');
  assert.match(snapshot.metadata.query, /source_type IN/);
  assert.ok(nasaUrl(snapshot.metadata.endpoint));
  assert.ok(nasaUrl(snapshot.metadata.sourceUrl));
  assert.match(snapshot.metadata.sourceResponseSha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isFinite(Date.parse(snapshot.metadata.retrievedAt)));
  const counts = records.reduce((result, record) => {
    result[record.sourceCode] = (result[record.sourceCode] ?? 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { Nb: 201, 'C+N': 136, Pl: 134, Kt: 14 });
  assert.deepEqual(counts, snapshot.metadata.sourceTypeCounts);
});

test('every nebula retains valid coordinates, scientific measurement flags and NASA provenance', () => {
  for (const record of records) {
    assert.match(record.id, /^(ngc|ic)-[0-9]+/);
    assert.ok(Number.isFinite(record.raDeg) && record.raDeg >= 0 && record.raDeg < 360, record.id);
    assert.ok(Number.isFinite(record.decDeg) && record.decDeg >= -90 && record.decDeg <= 90, record.id);
    assert.ok(record.mag === null || Number.isFinite(record.mag), record.id);
    assert.ok(record.angularSizeArcmin === null || (Number.isFinite(record.angularSizeArcmin) && record.angularSizeArcmin > 0), record.id);
    assert.equal(typeof record.angularSizeIsUpperLimit, 'boolean');
    assert.ok(record.mag === null ? record.magnitudeBand === null : ['visual', 'photographic-blue'].includes(record.magnitudeBand), record.id);
    assert.ok(nasaUrl(record.infoUrl), record.id);
    assert.ok(record.distanceLy === null || (Number.isFinite(record.distanceLy) && record.distanceLy > 0), record.id);
  }
  assert.ok(records.some(record => record.mag === null));
  assert.ok(records.some(record => record.angularSizeArcmin === null));
  assert.ok(records.some(record => record.angularSizeIsUpperLimit));
  assert.ok(records.some(record => record.magnitudeBand === 'photographic-blue'));
});

test('unknown nebular distances remain missing instead of acquiring synthetic physical depth', () => {
  const measured = records.filter(record => record.distanceLy !== null);
  assert.equal(measured.length, 11);
  assert.equal(records.filter(record => record.distanceLy === null).length, 474);
  for (const record of measured) {
    assert.ok(nasaUrl(snapshot.metadata.supplementSources[record.name].infoUrl));
    assert.ok(nasaUrl(snapshot.metadata.supplementSources[record.name].aliasSourceUrl));
    assert.equal(record.infoUrl, snapshot.metadata.supplementSources[record.name].infoUrl);
    assert.ok(record.detailEn && record.detailIt && record.commonNameEn && record.commonNameIt);
  }
});

test('familiar nebulae are searchable by their verified catalogue and common names', () => {
  const names = [['ngc-1976', 'M42'], ['ngc-6523', 'M8'], ['ngc-6611', 'M16'], ['ngc-6618', 'M17'], ['ngc-6514', 'M20'], ['ngc-6853', 'M27'], ['ngc-6720', 'M57'], ['ngc-1952', 'M1'], ['ngc-7293', 'Helix Nebula']];
  for (const [id, alias] of names) assert.ok(byId.get(id).aliases.includes(alias), `${id}: ${alias}`);
  const orion = byId.get('ngc-1976');
  assert.ok(Math.abs(orion.raDeg - 83.85) < 0.01);
  assert.ok(Math.abs(orion.decDeg + 5.45) < 0.01);
  assert.equal(orion.distanceLy, 1300);
  assert.equal(byId.get('ngc-7293').distanceLy, 650);
});

test('source classification and photometric bands are preserved when supplemental labels differ', () => {
  const crab = byId.get('ngc-1952');
  assert.equal(crab.type, 'supernova-remnant');
  assert.equal(crab.sourceCode, 'Nb');
  const eagle = byId.get('ngc-6611');
  assert.equal(eagle.type, 'cluster-nebula');
  assert.equal(eagle.sourceCode, 'C+N');
  assert.match(eagle.detailEn, /NGC 6611.*IC 4703/);
  assert.equal(byId.get('ngc-6543').magnitudeBand, 'photographic-blue');
  assert.equal(byId.get('ngc-6543').mag, 9);
  assert.equal(byId.get('ngc-3372').mag, null);
});
