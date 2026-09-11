import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { metadata, planets } = JSON.parse(readFileSync(
  new URL('../src/exoplanets.json', import.meta.url), 'utf8',
));

test('NASA snapshot is the complete unfiltered, independently counted table', () => {
  assert.equal(metadata.source, 'NASA Exoplanet Archive');
  assert.equal(metadata.table, 'pscomppars');
  assert.ok(planets.length >= 6000, 'a small/truncated sample must not replace the catalog');
  assert.equal(planets.length, metadata.planetCount);
  assert.equal(planets.length, metadata.archiveRowCount);
  assert.equal(new Set(planets.map(p => p.host)).size, metadata.hostCount);
  const source = new URL(metadata.sourceUrl);
  assert.equal(source.hostname, 'exoplanetarchive.ipac.caltech.edu');
  assert.equal(source.searchParams.get('query'), metadata.query);
  assert.ok(!/\b(where|top|limit)\b/i.test(metadata.query));
  assert.match(new URL(metadata.countUrl).searchParams.get('query'), /^select count\(\*\)/i);
  assert.ok(Number.isFinite(Date.parse(metadata.retrievedAt)));
  assert.match(metadata.rawResponseSha256, /^[a-f0-9]{64}$/);
});

test('each confirmed exoplanet has a unique stable ID and explicit nullable measurements', () => {
  const ids = new Set();
  const names = new Set();
  const numericFields = [
    'raDeg', 'decDeg', 'distancePc', 'semiMajorAxisAu', 'periodDays',
    'radiusEarth', 'massEarth', 'temperatureK', 'discoveryYear',
  ];
  for (const planet of planets) {
    assert.ok(planet.name && planet.host, 'every record must retain NASA names');
    assert.equal(decodeURIComponent(planet.id.slice(4)), planet.name);
    assert.ok(planet.id.startsWith('exo-'));
    assert.ok(!ids.has(planet.id), 'planet IDs must be unique');
    assert.ok(!names.has(planet.name), 'there must be one row per confirmed planet');
    ids.add(planet.id);
    names.add(planet.name);
    for (const field of numericFields) {
      assert.ok(Object.hasOwn(planet, field), planet.name + ' lacks ' + field);
      assert.ok(planet[field] === null || Number.isFinite(planet[field]));
    }
    assert.ok(planet.raDeg === null || (planet.raDeg >= 0 && planet.raDeg < 360));
    assert.ok(planet.decDeg === null || (planet.decDeg >= -90 && planet.decDeg <= 90));
    assert.ok(planet.massProvenance === null || typeof planet.massProvenance === 'string');
    assert.ok(planet.discoveryMethod === null || typeof planet.discoveryMethod === 'string');
  }
  for (const name of ['Proxima Cen b', '51 Peg b', 'TRAPPIST-1 e', 'Kepler-186 f']) {
    assert.ok(names.has(name), name + ' must remain in the complete catalog');
  }
});

test('planets without measured distances remain present and are counted as unpositioned', () => {
  const missingDistances = planets.filter(p => p.distancePc === null);
  const unpositioned = planets.filter(p =>
    p.distancePc === null || p.distancePc <= 0 || p.raDeg === null || p.decDeg === null);
  assert.ok(missingDistances.length > 0, 'unknown distances must not be filtered out');
  assert.equal(missingDistances.length, metadata.missingDistanceCount);
  assert.equal(unpositioned.length, metadata.unpositionedCount);
  assert.ok(missingDistances.every(p => p.id && p.name));
});
