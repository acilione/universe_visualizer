import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function snapshot(preference = null, blockedStorage = false) {
  const setup = blockedStorage
    ? `Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('Storage blocked'); } });`
    : `globalThis.localStorage = { getItem: () => ${JSON.stringify(preference)}, setItem: (key, value) => { globalThis.saved = { key, value }; } };`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', `
    ${setup}
    Object.defineProperty(globalThis, 'navigator', { value: { language: 'it-IT' }, configurable: true });
    const { readFile } = await import('node:fs/promises');
    globalThis.fetch = async path => ({ ok: true, json: async () => JSON.parse(await readFile('./public' + path, 'utf8')) });
    const { getLanguage, setLanguage, t, locale, formatNumber } = await import('./src/i18n.js');
    const { catalog, scales } = await import('./src/data.js');
    const { exoplanets, hostView } = await import('./src/planets.js');
    const { loadConstellations, loadStarCatalog, loadConstellation } = await import('./src/constellation-catalog.js');
    const figures = (await loadConstellations()).constellations;
    const stars = await loadStarCatalog();
    const figure = await loadConstellation('Ori', { observer: { latitude: 38.1144389, longitude: 15.65, dateIso: '2026-12-11T19:00:00Z' } });
    const result = {
      language: getLanguage(), locale: locale(), number: formatNumber(12345.5), translated: t('Settings', 'Impostazioni'),
      scales: scales.map(({id, name, title, subtitle, description, positionNote}) => ({id, name, title, subtitle, description, positionNote})),
      objects: Object.values(catalog).flat().map(({id,name,englishName,italianName,type,position,distance,detail,source}) => ({id,name,englishName,italianName,type,position,distance,detail,source})),
      exoplanets: exoplanets.map(({id,type,detail,position,distance,source,discoveryMethod,discoveryMethodOriginal}) => ({id,type,detail,position,distance,source,discoveryMethod,discoveryMethodOriginal})),
      host: hostView(exoplanets[0]).context,
      figures: figures.map(({id,name,latinName,italianName,englishName,segments}) => ({id,name,latinName,italianName,englishName,segments})),
      sirius: stars.byHip.get(32349),
      resolved: { id: figure.figure.id, name: figure.figure.name, observer: figure.observer },
    };
    setLanguage('it'); result.afterChange = { language: getLanguage(), translated: t('Settings', 'Impostazioni'), saved: globalThis.saved };
    let rejected = false; try { setLanguage('fr'); } catch { rejected = true; }
    result.invalidLanguageRejected = rejected;
    console.log(JSON.stringify(result));
  `], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
}

// Isolated module graphs model a page reload after the Settings language change.
const english = snapshot();
const italian = snapshot('it');

test('English is the default even when the browser language is Italian', () => {
  assert.equal(english.language, 'en');
  assert.equal(english.locale, 'en-US');
  assert.equal(english.number, '12,345.5');
  assert.equal(english.translated, 'Settings');
  assert.equal(english.objects.find(o => o.id === 'earth').name, 'Earth');
  assert.equal(english.objects.find(o => o.id === 'earth').distance, '1 AU from the Sun');
  assert.ok(english.exoplanets.every(planet => planet.type === 'Confirmed exoplanet' && planet.detail.startsWith('Confirmed planet in the ')));
  assert.ok(english.exoplanets.some(planet => planet.distance === 'Distance from Earth unknown'));
  assert.equal(english.host.metric, 'CONFIRMED PLANETS');
  assert.ok(english.exoplanets.every(planet => planet.discoveryMethod === planet.discoveryMethodOriginal));
});

test('Italian requires an explicit preference and localizes catalog text and numbers', () => {
  assert.equal(italian.language, 'it');
  assert.equal(italian.locale, 'it-IT');
  assert.equal(italian.number, '12.345,5');
  assert.equal(italian.translated, 'Impostazioni');
  assert.equal(italian.objects.find(o => o.id === 'earth').name, 'Terra');
  assert.equal(italian.objects.find(o => o.id === 'earth').distance, '1 UA dal Sole');
  assert.ok(italian.exoplanets.every(planet => planet.type === 'Esopianeta confermato' && planet.detail.startsWith('Pianeta confermato del sistema ')));
  assert.ok(italian.exoplanets.some(planet => planet.distance === 'Distanza dalla Terra sconosciuta'));
  assert.equal(italian.host.metric, 'PIANETI CONFERMATI');
  assert.ok(italian.exoplanets.every(planet => planet.discoveryMethod !== planet.discoveryMethodOriginal));
  assert.equal(italian.exoplanets[0].discoveryMethod, 'Velocità radiale');
  assert.deepEqual(english.afterChange.saved, { key: 'aether.language', value: 'it' });
  assert.equal(english.afterChange.translated, 'Impostazioni');
  assert.ok(english.invalidLanguageRejected);
});

test('localization preserves catalog IDs, astronomical coordinates and source references', () => {
  const coordinates = data => data.objects.map(({ id, position, source }) => ({ id, position, source }));
  assert.deepEqual(coordinates(english), coordinates(italian));
  const planets = data => data.exoplanets.map(({ id, position, source }) => ({ id, position, source }));
  assert.deepEqual(planets(english), planets(italian));
  assert.deepEqual(english.resolved.observer, italian.resolved.observer);
  assert.equal(english.resolved.id, italian.resolved.id);
  for (const entry of english.objects) assert.equal(entry.name, entry.englishName, entry.id);
  for (const entry of italian.objects) assert.equal(entry.name, entry.italianName, entry.id);
});

test('all 88 constellations use IAU names in English and retain Italian search aliases', () => {
  assert.equal(english.figures.length, 88);
  assert.equal(italian.figures.length, 88);
  for (let index = 0; index < 88; index++) {
    const en = english.figures[index], it = italian.figures[index];
    assert.equal(en.name, en.latinName);
    assert.equal(it.name, en.italianName);
    assert.equal(en.englishName, it.englishName);
    assert.deepEqual(en.segments, it.segments);
  }
  assert.equal(english.resolved.name, 'Orion');
  assert.equal(italian.resolved.name, 'Orione');
  assert.equal(english.sirius.name, 'Sirius');
  assert.equal(italian.sirius.name, 'Sirio');
  assert.equal(english.sirius.raDeg, italian.sirius.raDeg);
  assert.equal(english.sirius.distanceLy, italian.sirius.distanceLy);
});

test('scale titles and descriptions are scientific in both interface languages', () => {
  assert.deepEqual(english.scales.map(scale => scale.title), ['Solar System', 'Stellar neighborhood', 'Milky Way', 'Local Group', 'Observable universe']);
  assert.deepEqual(italian.scales.map(scale => scale.title), ['Sistema Solare', 'Vicino stellare', 'Via Lattea', 'Gruppo Locale', 'Universo osservabile']);
  for (const data of [english, italian]) {
    assert.doesNotMatch(JSON.stringify(data.scales), /possibilit|frammento dell.infinito|senza confini|Dove tutto|oceano|arcipelago|angolo di cosmo/i);
    assert.ok(data.scales.every(scale => scale.description && scale.positionNote));
  }
});

test('blocked or unsupported stored preferences safely fall back to English', () => {
  const blocked = snapshot(null, true);
  assert.equal(blocked.language, 'en');
  assert.equal(blocked.afterChange.language, 'it');
  assert.equal(snapshot('fr').language, 'en');
});
