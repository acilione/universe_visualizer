import { pix2vec_nest, max_pixrad } from '@hscmap/healpix';

import { GAIA_DR3_HIPS } from './gaia-manifest.js';
export { GAIA_DR3_HIPS } from './gaia-manifest.js';

const RAD = Math.PI / 180;
const vector = (ra, dec) => [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const tileKey = (order, npix) => `${order}/${npix}`;
const tileUrl = tile => `${GAIA_DR3_HIPS.baseUrl}/Norder${tile.order}/Dir${Math.floor(tile.npix / 10000) * 10000}/Npix${tile.npix}.tsv`;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** Bounded conservative HEALPix coverage; parents contain additional sources. */
export function planGaiaTiles({ raDeg, decDeg, radiusDeg, order } = {}, { maxTiles = 80 } = {}) {
  if (![raDeg, decDeg, radiusDeg].every(Number.isFinite) || Math.abs(decDeg) > 90 || radiusDeg <= 0 || (order != null && !Number.isInteger(order))) throw new TypeError('A finite Gaia sky direction and positive angular radius are required.');
  maxTiles = Math.max(48, Math.min(256, Math.floor(maxTiles) || 80));
  raDeg = ((raDeg % 360) + 360) % 360; radiusDeg = clamp(radiusDeg, .00001, 180);
  const centre = vector(raDeg, decDeg);
  const requestedOrder = clamp(order ?? Math.ceil(Math.log2(58.63 / radiusDeg)) + 1, GAIA_DR3_HIPS.minOrder, GAIA_DR3_HIPS.maxOrder);
  let frontier = Array.from({ length: 12 }, (_, npix) => ({ order: 0, npix }));
  const tiles = []; let actualOrder = 1;
  for (let level = 1; level <= requestedOrder; level++) {
    const nside = 2 ** level, threshold = Math.cos(Math.min(Math.PI, radiusDeg * RAD + max_pixrad(nside)));
    const next = [];
    for (const parent of frontier) for (let child = 0; child < 4; child++) {
      const npix = parent.npix * 4 + child;
      if (dot(centre, pix2vec_nest(nside, npix)) >= threshold - 1e-12) next.push({ order: level, npix, key: tileKey(level, npix) });
    }
    if (tiles.length + next.length > maxTiles) break;
    next.sort((a, b) => dot(centre, pix2vec_nest(nside, b.npix)) - dot(centre, pix2vec_nest(nside, a.npix)));
    tiles.push(...next); frontier = next; actualOrder = level;
  }
  return { raDeg, decDeg, radiusDeg, centre, tiles, order: actualOrder, requestedOrder, limited: actualOrder < GAIA_DR3_HIPS.maxOrder };
}

function propertiesOf(text) {
  const properties = {};
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/); if (match) properties[match[1]] = match[2];
  }
  return properties;
}
function attributesOf(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(match => [match[1], match[2]]));
}
/** Fail closed on an incompatible survey or coordinate/identifier contract. */
export function validateGaiaMetadata(propertiesText, metadataText) {
  const p = propertiesOf(propertiesText), m = GAIA_DR3_HIPS;
  if (p.creator_did !== m.creatorDid || p.dataproduct_type !== 'catalog' || p.hips_frame !== 'equatorial' || !p.hips_tile_format?.split(/\s+/).includes('tsv') || Number(p.hips_cat_nrows) !== m.totalSources || Number(p.hips_order_min) !== m.minOrder || Number(p.hips_order) !== m.maxOrder || p.hips_service_url?.replace(/\/$/, '') !== m.baseUrl) throw new Error('The remote Gaia DR3 survey metadata does not match the supported release.');
  const coosys = [...metadataText.matchAll(/<COOSYS\b[^>]*>/gi)].map(match => attributesOf(match[0]));
  if (!coosys.some(value => value.system === 'ICRS' && Number(value.epoch) === m.referenceEpoch)) throw new Error('Gaia DR3 metadata must specify ICRS at epoch 2016.0.');
  const fields = new Map([...metadataText.matchAll(/<FIELD\b[^>]*>/gi)].map(match => { const a = attributesOf(match[0]); return [a.name, a]; }));
  if (fields.get('Source')?.datatype !== 'long') throw new Error('Gaia source identifiers must be declared as 64-bit integers.');
  for (const [name, unit] of [['RAdeg', 'deg'], ['DEdeg', 'deg'], ['Gmag', 'mag'], ['Plx', 'mas'], ['e_Plx', 'mas'], ['pmRA', 'mas/yr'], ['pmDE', 'mas/yr']]) {
    if (fields.get(name)?.unit !== unit) throw new Error(`Unsupported Gaia metadata unit for ${name}.`);
  }
  return { ...m, metadataValidated: true, catalogueReleaseDate: p.hips_release_date || null };
}

const optionalNumber = value => value == null || value.trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const optionalFlag = value => value === '1' ? true : value === '0' ? false : null;
/** Parse only the fields used by this application. Never round a source ID. */
export function parseGaiaTile(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#'));
  if (!lines.length) return [];
  const columns = lines.shift().split('\t'), indexes = new Map(columns.map((name, index) => [name.trim(), index]));
  for (const name of ['Source', 'RAdeg', 'DEdeg', 'Gmag']) if (!indexes.has(name)) throw new Error(`Gaia tile is missing ${name}.`);
  if (lines.length > 100000) throw new Error('Gaia tile contains too many rows.');
  const result = [], seen = new Map();
  for (const line of lines) {
    const cells = line.split('\t'); if (cells.length !== columns.length) throw new Error('Incomplete Gaia TSV row.');
    const value = name => cells[indexes.get(name)]?.trim();
    const number = name => optionalNumber(value(name));
    const sourceId = value('Source');
    if (!/^[1-9][0-9]{0,18}$/.test(sourceId || '') || BigInt(sourceId) > 9223372036854775807n) throw new Error('Invalid Gaia source identifier.');
    const raDeg = number('RAdeg'), decDeg = number('DEdeg');
    if (raDeg == null || raDeg < 0 || raDeg >= 360 || decDeg == null || Math.abs(decDeg) > 90) throw new Error('Invalid Gaia source coordinates.');
    const ra2000 = number('RAJ2000'), dec2000 = number('DEJ2000');
    const valid2000 = ra2000 != null && ra2000 >= 0 && ra2000 < 360 && dec2000 != null && Math.abs(dec2000) <= 90;
    const hip = number('HIP'), neighbours = number('nHIP'), flag = number('f_HIP');
    const row = { sourceId, raDeg, decDeg, refEpoch: GAIA_DR3_HIPS.referenceEpoch,
      raJ2000Deg: valid2000 ? ra2000 : null, decJ2000Deg: valid2000 ? dec2000 : null,
      gMag: number('Gmag'), bpMag: number('BPmag'), rpMag: number('RPmag'), bpRp: number('BP-RP'),
      parallaxMas: number('Plx'), parallaxErrorMas: number('e_Plx'), pmRaMasYr: number('pmRA'), pmDecMasYr: number('pmDE'),
      ruwe: number('RUWE'), duplicatedSource: optionalFlag(value('Dup')), inQsoCandidates: optionalFlag(value('QSO?')), inGalaxyCandidates: optionalFlag(value('Gal?')),
      // These are reported links, NOT an approved merge with NASA identities.
      // CDS ReadMe gives dHIP in arcsec; metadata.xml incorrectly labels it mas.
      hipMatches: Number.isInteger(hip) && hip > 0 ? [{ hip, angularDistanceArcsec: number('dHIP'), numberOfNeighbours: Number.isInteger(neighbours) ? neighbours : null, xmFlag: Number.isInteger(flag) ? flag : null }] : [],
    };
    const old = seen.get(sourceId);
    if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new Error('Conflicting measurements for one Gaia source identifier.');
    if (!old) { seen.set(sourceId, row); result.push(row); }
  }
  return result;
}

async function boundedText(response, maxBytes) {
  const length = Number(response.headers?.get?.('content-length'));
  if (length > maxBytes) { await response.body?.cancel?.(); throw new Error('Gaia response exceeds the download budget.'); }
  if (!response.body?.getReader) {
    const text = await response.text(); if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('Gaia response exceeds the download budget.');
    return text;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, result = '';
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Gaia response exceeds the download budget.'); }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { reader.releaseLock(); }
}

/** View-driven catalogue access. No full-catalogue traversal or persistent mirror. */
export function createGaiaTileStream({ fetchImpl = globalThis.fetch, onUpdate = () => {}, maxSources = 12000,
  maxCacheBytes = 32 * 1024 * 1024, maxTileBytes = 2 * 1024 * 1024, maxConcurrent = 2,
  timeoutMs = 15000, updateIntervalMs = 250, maxTiles = 80 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Gaia streaming requires fetch.');
  maxSources = clamp(Math.floor(maxSources) || 12000, 1, 50000);
  maxConcurrent = clamp(Math.floor(maxConcurrent) || 2, 1, 2);
  maxCacheBytes = clamp(Math.floor(maxCacheBytes) || 32 * 1024 * 1024, 1024, 64 * 1024 * 1024);
  maxTileBytes = clamp(Math.floor(maxTileBytes) || 2 * 1024 * 1024, 1024, 4 * 1024 * 1024);
  const cache = new Map(), active = new Map(), failed = new Map(), skipped = new Set();
  let plan = null, wanted = new Set(), disposed = false, cacheBytes = 0, metadataReady = false, metadataLoading = false, metadataError = null, metadataController = null, updateTimer = null, sourceBudgetHit = false;
  let cooldownUntil = 0, cooldownMessage = null;
  const retryAfterMs = () => Math.max(0, cooldownUntil - Date.now());

  function collect() {
    if (!plan) return [];
    const records = new Map(), threshold = Math.cos(plan.radiusDeg * RAD);
    for (const tile of plan.tiles) for (const row of cache.get(tile.key)?.records || []) {
      const ra = row.raDeg, dec = row.decDeg;
      if (dot(plan.centre, vector(ra, dec)) >= threshold - 1e-12 && !records.has(row.sourceId)) records.set(row.sourceId, row);
    }
    return [...records.values()].sort((a, b) => (a.gMag ?? Infinity) - (b.gMag ?? Infinity) || a.sourceId.localeCompare(b.sourceId));
  }
  function queue() { return plan?.tiles.filter(tile => !cache.has(tile.key) && !active.has(tile.key) && !failed.has(tile.key) && !skipped.has(tile.key)) || []; }
  function snapshot() {
    const all = collect(), paused = retryAfterMs() > 0, waiting = !sourceBudgetHit && !paused ? queue().length : 0;
    const failure = (paused ? cooldownMessage : null) || metadataError || [...failed.entries()].find(([key]) => wanted.has(key))?.[1]?.message || null;
    return { records: all.slice(0, maxSources), loading: !disposed && !paused && (metadataLoading || active.size > 0 || metadataReady && waiting > 0), pending: disposed || paused ? 0 : active.size + waiting,
      loadedTiles: plan?.tiles.filter(tile => cache.has(tile.key)).length || 0, order: plan?.order ?? null,
      limited: Boolean(plan?.limited || sourceBudgetHit || all.length > maxSources || skipped.size),
      sourceLimited: sourceBudgetHit || all.length > maxSources, cacheLimited: skipped.size > 0, detailAvailable: plan != null && plan.order < GAIA_DR3_HIPS.maxOrder,
      error: failure, retryAfterMs: retryAfterMs(),
      totalSources: GAIA_DR3_HIPS.totalSources, cacheBytes, cacheTiles: cache.size, metadataValidated: metadataReady };
  }
  function notify() {
    if (disposed || updateTimer != null) return;
    updateTimer = setTimeout(() => { updateTimer = null; if (!disposed) onUpdate(snapshot()); }, Math.max(0, updateIntervalMs));
  }
  async function request(url, controller, limit, empty404 = false) {
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, timeoutMs));
    try {
      const response = await fetchImpl(url, { signal: controller.signal, mode: 'cors', credentials: 'omit' });
      if (empty404 && response.status === 404) { await response.body?.cancel?.(); return null; }
      if (!response.ok) {
        await response.body?.cancel?.();
        const error = new Error(`Gaia service returned HTTP ${response.status}.`);
        error.serviceFailure = true;
        const retry = response.headers?.get?.('retry-after');
        const seconds = retry && /^\d+(?:\.\d+)?$/.test(retry.trim()) ? Number(retry) : null;
        const delay = seconds == null ? Date.parse(retry || '') - Date.now() : seconds * 1000;
        error.retryAfterMs = clamp(Number.isFinite(delay) ? delay : 30000, 30000, 300000);
        throw error;
      }
      return await boundedText(response, limit);
    } catch (error) {
      if (timedOut) throw Object.assign(new Error('Gaia request timed out.'), { serviceFailure: true, retryAfterMs: 30000 });
      if (!controller.signal.aborted && error instanceof TypeError) error.serviceFailure = true;
      throw error;
    }
    finally { clearTimeout(timer); }
  }
  function store(tile, records, rawBytes) {
    // Conservative accounting includes UTF-16 text and parsed object overhead,
    // although raw TSV is released rather than retained after parsing.
    const bytes = rawBytes * 2 + records.length * 1024 + 256;
    while (cacheBytes + bytes > maxCacheBytes) {
      const candidate = [...cache.keys()].find(key => !wanted.has(key));
      if (candidate == null) { skipped.add(tile.key); return; }
      cacheBytes -= cache.get(candidate).bytes; cache.delete(candidate);
    }
    cache.set(tile.key, { records, bytes }); cacheBytes += bytes;
  }
  function pauseService(error) {
    if (!error.serviceFailure) return;
    cooldownUntil = Math.max(cooldownUntil, Date.now() + (error.retryAfterMs || 30000));
    cooldownMessage = error.message;
    for (const controller of active.values()) controller.abort();
    active.clear();
  }
  function rememberFailure(key, error) {
    failed.delete(key); failed.set(key, { message: error?.message || 'Unable to load Gaia data.', retryAt: Date.now() + 30000 });
    while (failed.size > 128) failed.delete(failed.keys().next().value);
  }
  async function load(tile) {
    const controller = new AbortController(); active.set(tile.key, controller);
    try {
      const text = await request(tileUrl(tile), controller, maxTileBytes, true);
      if (disposed || controller.signal.aborted || !wanted.has(tile.key)) return;
      const records = text == null ? [] : parseGaiaTile(text);
      store(tile, records, text == null ? 0 : new TextEncoder().encode(text).byteLength);
    } catch (error) {
      if (!disposed && wanted.has(tile.key) && (!controller.signal.aborted || error.message === 'Gaia request timed out.')) { rememberFailure(tile.key, error); pauseService(error); }
    } finally {
      if (active.get(tile.key) === controller) active.delete(tile.key);
      if (!disposed) { sourceBudgetHit = collect().length >= maxSources; notify(); pump(); }
    }
  }
  function pump() {
    if (disposed || !metadataReady || sourceBudgetHit || retryAfterMs() > 0) return;
    for (const tile of queue()) { if (active.size >= maxConcurrent) break; load(tile); }
    notify();
  }
  async function initialize() {
    if (disposed || metadataReady || metadataLoading || metadataError || retryAfterMs() > 0) return;
    metadataLoading = true; metadataController = new AbortController(); notify();
    try {
      const properties = await request(`${GAIA_DR3_HIPS.baseUrl}/properties`, metadataController, 65536);
      const xml = await request(`${GAIA_DR3_HIPS.baseUrl}/metadata.xml`, metadataController, 196608);
      if (disposed) return;
      validateGaiaMetadata(properties, xml); metadataReady = true;
    } catch (error) { if (!disposed) { metadataError = error.message || 'Unable to validate Gaia DR3 metadata.'; pauseService(error); } }
    finally { metadataLoading = false; metadataController = null; if (!disposed) { notify(); pump(); } }
  }
  return {
    setView(view) {
      if (disposed) return null;
      plan = planGaiaTiles(view, { maxTiles }); wanted = new Set(plan.tiles.map(tile => tile.key)); skipped.clear();
      for (const [key, controller] of active) if (!wanted.has(key)) { controller.abort(); active.delete(key); }
      for (const [key, failure] of failed) if (failure.retryAt <= Date.now()) failed.delete(key);
      for (const key of wanted) if (cache.has(key)) { const entry = cache.get(key); cache.delete(key); cache.set(key, entry); }
      sourceBudgetHit = collect().length >= maxSources;
      initialize(); pump(); notify(); return plan;
    },
    retry() {
      if (disposed) return;
      if (retryAfterMs() > 0) { notify(); return; }
      metadataError = null; for (const key of wanted) failed.delete(key); skipped.clear();
      sourceBudgetHit = collect().length >= maxSources; initialize(); pump(); notify();
    },
    snapshot,
    dispose() {
      if (disposed) return;
      disposed = true; clearTimeout(updateTimer); updateTimer = null; metadataController?.abort();
      for (const controller of active.values()) controller.abort();
      active.clear(); cache.clear(); failed.clear(); skipped.clear(); wanted.clear(); cacheBytes = 0; plan = null; cooldownUntil = 0; cooldownMessage = null;
    },
  };
}
