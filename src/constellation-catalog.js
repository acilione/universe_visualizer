import { validateObserver } from './sky-math.js';

let figuresPromise;
let starsPromise;
async function readCatalog(file) {
  const response = await fetch(import.meta.env.BASE_URL + 'catalog/' + file);
  if (!response.ok) throw new Error('Catalogo stellare non disponibile. Riprova tra poco.');
  return response.json();
}
export function loadConstellations() {
  return figuresPromise ||= readCatalog('constellations.json').catch(error => { figuresPromise = null; throw error; });
}
export function loadStarCatalog() {
  return starsPromise ||= readCatalog('stars.json').then(data => {
    const stars = data.stars.map(row => Object.fromEntries(data.columns.map((key, i) => [key, row[i]])));
    return { metadata: data.metadata, stars, byHip: new Map(stars.filter(s => s.hip).map(s => [s.hip, s])) };
  }).catch(error => { starsPromise = null; throw error; });
}
export async function loadConstellation(id, options = {}) {
  const mode = options.mode || 'space';
  if (!['space', 'earth'].includes(mode)) throw new RangeError('Vista della costellazione non valida.');
  const observer = validateObserver(options.observer || { latitude: 41.9028, longitude: 12.4964, dateIso: new Date().toISOString() });
  const [figures, catalog] = await Promise.all([loadConstellations(), loadStarCatalog()]);
  const figure = figures.constellations.find(item => item.id === id);
  if (!figure) throw new RangeError('Costellazione non trovata.');
  return { catalog, figure, mode, observer };
}

