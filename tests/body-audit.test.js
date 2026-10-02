import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalog } from '../src/data.js';
import { solarMoons } from '../src/moons.js';
import surfaces from '../src/official-surfaces.json' with { type: 'json' };

const audit = JSON.parse(readFileSync(new URL('../src/body-appearance-audit.json', import.meta.url), 'utf8'));
const bodies = [...catalog.solar, ...solarMoons];
const nonempty = (value, label) => assert.ok(typeof value === 'string' && value.trim().length > 0, label);
const officialObservationUrl = (value, label) => {
  nonempty(value, label);
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', label + ' is HTTPS');
  assert.ok(url.hostname === 'nasa.gov' || url.hostname.endsWith('.nasa.gov'), label + ' is an official NASA observation');
};

test('individual appearance audit covers the actual Sun, eight planets and every curated moon', () => {
  assert.equal(bodies.length, 37);
  assert.equal(new Set(bodies.map(body => body.id)).size, bodies.length);
  assert.deepEqual(Object.keys(audit).sort(), bodies.map(body => body.id).sort());
  for (const body of bodies) {
    const record = audit[body.id];
    for (const field of ['name', 'finding', 'action', 'limitations']) nonempty(record[field], body.id + ' ' + field);
    assert.ok(['verified', 'corrected', 'limited'].includes(record.status), body.id + ' states the review outcome');
    assert.ok(Array.isArray(record.features) && record.features.length > 0, body.id + ' identifies observed features');
    for (const feature of record.features) nonempty(feature, body.id + ' observed feature');
  }
});

test('each comparison pairs a specific official observation image with its archive record and spectral context', () => {
  for (const body of bodies) {
    const reference = audit[body.id].reference;
    assert.ok(reference, body.id + ' primary reference');
    for (const observation of [reference]) {
      for (const field of ['title', 'archiveId', 'credit', 'band']) nonempty(observation[field], body.id + ' reference ' + field);
      officialObservationUrl(observation.url, body.id + ' archive record');
      officialObservationUrl(observation.imageUrl, body.id + ' original observation image');
      assert.notEqual(observation.url, observation.imageUrl, body.id + ' links the record and its actual image separately');
    }
    for (const context of audit[body.id].references || []) {
      nonempty(context.title, body.id + ' supplementary context title');
      assert.equal(new URL(context.url).protocol, 'https:', body.id + ' supplementary context URL');
    }
  }
});

test('every resolved moon has observation-derived appearance or measured geometry; Nereid remains explicitly unresolved', () => {
  for (const body of solarMoons) {
    if (body.id === 'nereid') {
      assert.equal(audit.nereid.status, 'limited');
      assert.ok(!surfaces.nereid?.map && !surfaces.nereid?.model, 'No fictional resolved Nereid surface');
      continue;
    }
    const source = surfaces[body.id];
    assert.ok(source && (source.map || source.model), body.id + ' has a real appearance asset');
    if (source.map) assert.ok(readFileSync(new URL('../public/textures/' + source.map, import.meta.url)).byteLength > 0, body.id + ' texture is present');
    if (source.model) {
      const mesh = JSON.parse(readFileSync(new URL('../public/models/' + source.model, import.meta.url), 'utf8'));
      assert.ok(source.vertexCount > 100 && source.triangleCount > 100, body.id + ' has measured mesh detail');
      assert.equal(mesh.positions.length / 3, source.vertexCount, body.id + ' model retains the documented vertices');
      assert.equal(mesh.indices.length / 3, source.triangleCount, body.id + ' model retains the documented triangles');
    }
  }
});
