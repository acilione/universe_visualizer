import entries from './official-images-manifest.json' with { type: 'json' };

// Official telescope images are opt-in, separate from the schematic 3D map.
export const OFFICIAL_IMAGE_SOURCES = Object.freeze({
  nasa: 'https://images.nasa.gov/',
  nasaApi: 'https://images-api.nasa.gov',
  nasaApiDocs: 'https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf',
  hubble: 'https://esahubble.org/images/',
  hubbleLicense: 'https://esahubble.org/copyright/',
});
const SEARCH_NAMES = {
  sun: 'Sun', sol: 'Sun', earth: 'Earth', moon: 'Moon', mercury: 'Mercury', venus: 'Venus',
  mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune',
  milkyway: 'Milky Way', 'local-milkyway': 'Milky Way', 'solar-system': 'Solar System',
  lmc: 'Large Magellanic Cloud', smc: 'Small Magellanic Cloud', virgo: 'Virgo Cluster',
  coma: 'Coma Cluster', alpha: 'Alpha Centauri', procyon: 'Procyon', sagittarius: 'Sagittarius A*',
};
const ASSET_HOSTS = new Set(['images-assets.nasa.gov', 'cdn.esahubble.org']);
export function safeOfficialImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !ASSET_HOSTS.has(url.hostname) || !/\.(jpe?g|png|webp)$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
function clean(value, max = 240) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}
function identifier(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(messier|ngc|hip)\s*(\d+)\b/g, '$1 $2').replace(/\bm\s*(\d+)\b/g, 'm $1').replace(/\s+/g, ' ');
}
function identityValues(object) {
  if (!object || typeof object !== 'object') return [];
  return [object.name, object.englishName, object.italianName, object.catalogueName,
    ...(Array.isArray(object.aliases) ? object.aliases : []),
    Number.isSafeInteger(object.hip) ? 'HIP ' + object.hip : null].map(identifier).filter(Boolean);
}
function curatedEntry(object) {
  if (!object || typeof object !== 'object') return null;
  // Host-star aliases on a planet are not an image of that planet.
  if (['planet', 'moon', 'exoplanet'].includes(object.bodyKind) || object.isExoplanet) return null;
  const objects = [object, object.nasaInfo].filter(Boolean);
  const values = new Set(objects.flatMap(identityValues));
  return entries.find(entry => objects.some(item => entry.ids.includes(item.id)) ||
    entry.aliases.some(alias => values.has(identifier(alias)))) || null;
}
export function getOfficialImageSet(object) {
  const entry = curatedEntry(object);
  const query = clean(entry?.query || SEARCH_NAMES[object?.id] || object?.englishName || object?.catalogueName || object?.name || '', 160);
  const searchUrl = 'https://images.nasa.gov/search?q=' + encodeURIComponent(query) + '&media=image';
  const records = entry ? [{
    id: 'hubble-' + entry.image,
    provider: 'ESA/Hubble & NASA',
    title: entry.title, titleIt: entry.titleIt,
    url: safeOfficialImageUrl('https://cdn.esahubble.org/archives/images/screen/' + entry.image + '.jpg'),
    sourceUrl: 'https://esahubble.org/images/' + entry.image + '/',
    credit: entry.credit,
    licenseUrl: OFFICIAL_IMAGE_SOURCES.hubbleLicense,
    observationType: 'Telescope observation',
    observationTypeIt: 'Osservazione al telescopio',
    band: entry.band, bandIt: entry.bandIt,
    note: entry.note, noteIt: entry.noteIt,
    verified: true,
  }] : [];
  return { query, searchUrl, records };
}
function resultLimit(limit) {
  return Number.isFinite(limit) ? Math.min(12, Math.max(1, Math.trunc(limit))) : 8;
}
export function buildNasaImageSearchUrl(object, { limit = 8 } = {}) {
  const { query } = getOfficialImageSet(object);
  if (!query) return null;
  const url = new URL('/search', OFFICIAL_IMAGE_SOURCES.nasaApi);
  url.searchParams.set('q', query);
  url.searchParams.set('media_type', 'image');
  url.searchParams.set('page_size', String(resultLimit(limit)));
  return url.href;
}
// Free-text matches never acquire a verified identity or observational status.
// The NASA archive also contains diagrams, illustrations and related objects.
export function normalizeNasaImageResults(payload, { limit = 8 } = {}) {
  if (!Array.isArray(payload?.collection?.items)) throw new Error('Invalid NASA image search response');
  const records = [], ids = new Set();
  for (const item of payload.collection.items) {
    const data = Array.isArray(item?.data) ? item.data.find(row => row?.media_type === 'image') : null;
    const id = clean(data?.nasa_id, 180);
    if (!data || !/^[a-z0-9][a-z0-9 _().-]*$/i.test(id) || ids.has(id)) continue;
    const links = (Array.isArray(item.links) ? item.links : []).filter(link =>
      link?.render === 'image' && (link.rel === 'preview' || link.rel === 'alternate') &&
      safeOfficialImageUrl(link.href) && new URL(link.href).hostname === 'images-assets.nasa.gov');
    // Request only a provider preview, never a full-resolution scientific asset.
    links.sort((a,b) => (a.rel === 'preview' ? 0 : 1) - (b.rel === 'preview' ? 0 : 1));
    const image = links[0];
    if (!image) continue;
    ids.add(id);
    const creators = [...new Set([clean(data.secondary_creator, 1000), clean(data.photographer, 1000)].filter(Boolean))];
    records.push({
      id: 'nasa-' + id, provider: 'NASA Image and Video Library',
      title: clean(data.title, 300) || id,
      url: safeOfficialImageUrl(image.href),
      sourceUrl: 'https://images.nasa.gov/details/' + encodeURIComponent(id),
      credit: creators.join('; ') || 'See the NASA source record for the complete image credit.',
      creditIt: creators.join('; ') || 'Consultare la scheda NASA per i crediti completi.',
      creditComplete: false,
      licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
      observationType: 'NASA search result', observationTypeIt: 'Risultato di ricerca NASA',
      band: '', bandIt: '',
      note: 'Search result: object identity and image type have not been verified. Consult the source record.',
      noteIt: 'Risultato di ricerca: identit\u00e0 e tipo di immagine non verificati. Consultare la scheda originale.',
      description: clean(data.description_508 || data.description, 1600),
      date: clean(data.date_created, 60),
      verified: false,
    });
    if (records.length >= resultLimit(limit)) break;
  }
  return records;
}
export async function loadNasaImageSearch(object, { fetchImpl = globalThis.fetch, signal, limit = 8, timeoutMs = 12000 } = {}) {
  const set = getOfficialImageSet(object);
  const url = buildNasaImageSearchUrl(object, { limit });
  if (!url) return { ...set, records: [] };
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('NASA image search timed out', 'TimeoutError')),
    Number.isFinite(timeoutMs) ? Math.max(1, Math.min(30000, timeoutMs)) : 12000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('NASA image search failed (' + response.status + ')');
    const payload = await response.json();
    if (controller.signal.aborted) throw controller.signal.reason;
    return { ...set, records: normalizeNasaImageResults(payload, { limit }) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
