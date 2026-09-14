import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfficialImageSet, buildNasaImageSearchUrl, normalizeNasaImageResults,
  safeOfficialImageUrl, loadNasaImageSearch } from '../src/official-images.js';

const nasaItem = (id = 'PIA123', extras = {}) => ({
  data: [{ nasa_id: id, media_type: 'image', title: 'Archive result', secondary_creator: 'NASA / Example team', ...extras }],
  links: [
    { href: 'https://images-assets.nasa.gov/image/' + id + '/large~orig.jpg', render: 'image', rel: 'canonical' },
    { href: 'https://images-assets.nasa.gov/image/' + id + '/small.jpg', render: 'image', rel: 'preview' },
  ],
});
const payload = items => ({ collection: { items } });

test('curated image identities match exact catalogue aliases and preserve provenance', () => {
  for (const name of ['M42', 'M 42', 'Messier42', 'NGC1976']) {
    const result = getOfficialImageSet({ catalogueName: name });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].id, 'hubble-heic0601a');
    assert.equal(result.records[0].verified, true);
    assert.ok(result.records[0].credit.includes('Treasury Project Team'));
    assert.equal(result.records[0].sourceUrl, 'https://esahubble.org/images/heic0601a/');
    assert.match(result.records[0].url, /\/screen\/heic0601a.jpg$/);
  }
});

test('nearby stars and their attached NASA metadata share the correct observed image', () => {
  assert.equal(getOfficialImageSet({ id: 'proxima' }).records[0].id, 'hubble-potw1343a');
  assert.equal(getOfficialImageSet({ id: 'hyg-example', nasaInfo: { hip: 32349 } }).records[0].id, 'hubble-heic0516a');
  assert.equal(getOfficialImageSet({ hip: 70890 }).records[0].id, 'hubble-potw1343a');
});

test('substring, neighbouring catalogue number and planet-host collisions do not match', () => {
  for (const object of [
    { name: 'M420' }, { name: 'NGC 19760' }, { name: 'Orion constellation' },
    { name: 'Crab Nebula pulsar' }, { name: 'Proxima Centauri b' },
    { bodyKind: 'exoplanet', name: 'Proxima Centauri b', aliases: ['Proxima Centauri'] },
    { bodyKind: 'planet', nasaInfo: { name: 'Sirius' } },
  ]) assert.equal(getOfficialImageSet(object).records.length, 0);
});

test('curated records distinguish partial mosaics and unresolved stars', () => {
  assert.match(getOfficialImageSet({ id: 'andromeda' }).records[0].note, /part of/);
  assert.match(getOfficialImageSet({ id: 'triangulum' }).records[0].note, /inner spiral/);
  assert.match(getOfficialImageSet({ id: 'proxima' }).records[0].note, /does not resolve/);
  for (const name of ['M1', 'M57']) assert.equal(getOfficialImageSet({ name }).records.length, 1);
  assert.equal(getOfficialImageSet({ id: 'milkyway' }).records.length, 0);
});

test('archive queries use English identities, encode text, and cap the response page', () => {
  assert.equal(getOfficialImageSet({ id: 'earth', name: 'Terra' }).query, 'Earth');
  assert.equal(getOfficialImageSet({ id: 'milkyway', name: 'Via Lattea' }).query, 'Milky Way');
  const url = new URL(buildNasaImageSearchUrl({ name: 'star & nebula? #test' }, { limit: 1000 }));
  assert.equal(url.origin, 'https://images-api.nasa.gov');
  assert.equal(url.searchParams.get('q'), 'star & nebula? #test');
  assert.equal(url.searchParams.get('media_type'), 'image');
  assert.equal(url.searchParams.get('page_size'), '12');
  assert.equal(buildNasaImageSearchUrl(null), null);
});

test('only explicit official HTTPS raster image hosts are accepted', () => {
  assert.ok(safeOfficialImageUrl('https://cdn.esahubble.org/archives/images/screen/a.jpg'));
  for (const url of [
    'javascript:alert(1)', 'data:image/png;base64,x', 'http://images-assets.nasa.gov/a.jpg',
    'https://images-assets.nasa.gov.evil.invalid/a.jpg', 'https://user@cdn.esahubble.org/a.jpg',
    'https://cdn.esahubble.org:123/a.jpg', 'https://cdn.esahubble.org/a.svg',
  ]) assert.equal(safeOfficialImageUrl(url), null);
});

test('NASA results retain distinct identity status, credits, and preview URLs', () => {
  const [record] = normalizeNasaImageResults(payload([nasaItem()]));
  assert.equal(record.verified, false);
  assert.equal(record.observationType, 'NASA search result');
  assert.equal(record.credit, 'NASA / Example team');
  assert.match(record.url, /small.jpg$/);
  assert.equal(record.sourceUrl, 'https://images.nasa.gov/details/PIA123');
  assert.match(record.note, /not been verified/);
});

test('malformed, non-image, duplicate and non-official NASA assets are discarded', () => {
  const badHost = nasaItem('badHost');
  badHost.links = [{ href: 'https://evil.invalid/a.jpg', render: 'image', rel: 'preview' }];
  const canonicalOnly = nasaItem('canonicalOnly');
  canonicalOnly.links = canonicalOnly.links.slice(0, 1);
  const unsafeId = nasaItem('../../evil');
  const records = normalizeNasaImageResults(payload([
    null, {}, nasaItem('video', { media_type: 'video' }), badHost, canonicalOnly, unsafeId, nasaItem(), nasaItem(),
    nasaItem('other'), nasaItem('more'),
  ]), { limit: 2 });
  assert.deepEqual(records.map(record => record.id), ['nasa-PIA123', 'nasa-other']);
  assert.throws(() => normalizeNasaImageResults({}), /Invalid NASA/);
});

test('NASA loader makes one bounded anonymous request and surfaces HTTP failures', async () => {
  const calls = [];
  const result = await loadNasaImageSearch({ name: 'M42' }, { limit: 2, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => payload([nasaItem()]) };
  } });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get('page_size'), '2');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(result.records[0].verified, false);
  await assert.rejects(loadNasaImageSearch({ name: 'M42' }, {
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }), /503/);
  const empty = await loadNasaImageSearch(null, { fetchImpl: async () => assert.fail('Unexpected request') });
  assert.equal(empty.records.length, 0);
});

test('closing the gallery or a request timeout aborts the NASA request', async () => {
  const mock = async (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const controller = new AbortController();
  const request = loadNasaImageSearch({ name: 'M42' }, { signal: controller.signal, fetchImpl: mock });
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  await assert.rejects(loadNasaImageSearch({ name: 'M42' }, { fetchImpl: mock, timeoutMs: 1 }), { name: 'TimeoutError' });
});
