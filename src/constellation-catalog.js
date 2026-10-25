import { validateObserver } from './sky-math.js';
import { t } from './i18n.js';

let figuresPromise;
let starsPromise;
async function readCatalog(file) {
  const response = await fetch((import.meta.env?.BASE_URL || '/') + 'catalog/' + file);
  if (!response.ok) throw new Error(t('Star catalog unavailable. Please try again shortly.', 'Catalogo stellare non disponibile. Riprova tra poco.'));
  return response.json();
}
export function loadConstellations() {
  figuresPromise ||= readCatalog('constellations.json').catch(error => { figuresPromise = null; throw error; });
  // IAU Latin names are the scientific names used by the English interface.
  // Keep Italian aliases available to search in either interface language.
  return figuresPromise.then(data => ({
    ...data,
    constellations: data.constellations.map(figure => ({
      ...figure,
      name: t(figure.latinName, figure.name),
      englishName: figure.latinName,
      italianName: figure.name,
    })),
  }));
}
const italianStarNames = {
  Sirius: 'Sirio', Procyon: 'Procione', Polaris: 'Polare', Arcturus: 'Arturo',
  Regulus: 'Regolo', Castor: 'Castore', Pollux: 'Polluce',
  "Barnard's Star": 'Stella di Barnard', "Luyten's Star": 'Stella di Luyten',
  "Kapteyn's Star": 'Stella di Kapteyn', "Van Maanen's Star": 'Stella di Van Maanen',
};
export function loadStarCatalog() {
  return starsPromise ||= readCatalog('stars.json').then(data => {
    const stars = data.stars.map(row => {
      const star = Object.fromEntries(data.columns.map((key, i) => [key, row[i]]));
      star.englishName = star.name;
      star.italianName = italianStarNames[star.name] || star.name;
      star.name = t(star.englishName, star.italianName);
      return star;
    });
    return { metadata: data.metadata, stars, byHip: new Map(stars.filter(s => s.hip).map(s => [s.hip, s])) };
  }).catch(error => { starsPromise = null; throw error; });
}
export async function loadConstellationSelection(ids, options = {}) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.length)) throw new TypeError(t('Constellation identifiers must be an array of names.', 'Gli identificatori delle costellazioni devono essere un elenco di nomi.'));
  const uniqueIds = [...new Set(ids)];
  const mode = options.mode || 'space';
  if (!['space', 'earth'].includes(mode)) throw new RangeError(t('Invalid constellation view.', 'Vista della costellazione non valida.'));
  const observer = validateObserver(options.observer || { latitude: 41.9028, longitude: 12.4964, dateIso: new Date().toISOString() });
  const [available, catalog] = await Promise.all([loadConstellations(), loadStarCatalog()]);
  const byId = new Map(available.constellations.map(figure => [figure.id, figure]));
  const figures = uniqueIds.map(id => {
    const figure = byId.get(id);
    if (!figure) throw new RangeError(t('Constellation not found: ', 'Costellazione non trovata: ') + id);
    return figure;
  });
  return { catalog, figures, ids: uniqueIds, figure: figures[0] || null, mode, observer };
}

export function loadConstellation(id, options = {}) {
  return loadConstellationSelection([id], options);
}
