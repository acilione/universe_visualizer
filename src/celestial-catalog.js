import { t, locale } from './i18n.js';
import { starNames } from './nasa-star-names.js';

const HIP_SOURCE = 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/hipparcos.html';
const BSC_SOURCE = 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html';
const NEBULA_SOURCE = 'https://heasarc.gsfc.nasa.gov/W3Browse/all/ngc2000.html';
const MAS_TO_RAD = Math.PI / (180 * 3600000);
const RAD = Math.PI / 180;
let cataloguePromise;
export const nasaCatalogueSources = { hipparcos: HIP_SOURCE, bsc5p: BSC_SOURCE, ngc2000: NEBULA_SOURCE };
const number = value => Number.isFinite(value) ? value.toLocaleString(locale(), { maximumFractionDigits: 3 }) : t('Not available', 'Non disponibile');
const expand = (snapshot, key) => snapshot[key].map(row => Object.fromEntries(snapshot.columns.map((column, i) => [column, row[i]])));
const validPosition = object => Number.isFinite(object.raDeg) && Number.isFinite(object.decDeg);

// Hipparcos positions are ICRS at J1991.25; mu_alpha* already contains cos(delta).
// A tangent-vector update avoids dividing by cos(delta) near the celestial poles.
export function propagateHipparcos(row) {
  if (!validPosition(row) || !Number.isFinite(row.pmRaMasYr) || !Number.isFinite(row.pmDecMasYr)) return { raDeg: row.raDeg, decDeg: row.decDeg, positionEpoch: 1991.25 };
  const a = row.raDeg * RAD, d = row.decDeg * RAD, dt = 8.75 * MAS_TO_RAD;
  let x = Math.cos(d) * Math.cos(a) + dt * (-row.pmRaMasYr * Math.sin(a) - row.pmDecMasYr * Math.sin(d) * Math.cos(a));
  let y = Math.cos(d) * Math.sin(a) + dt * (row.pmRaMasYr * Math.cos(a) - row.pmDecMasYr * Math.sin(d) * Math.sin(a));
  let z = Math.sin(d) + dt * row.pmDecMasYr * Math.cos(d);
  const length = Math.hypot(x, y, z); x /= length; y /= length; z /= length;
  return { raDeg: (Math.atan2(y, x) / RAD + 360) % 360, decDeg: Math.asin(Math.max(-1, Math.min(1, z))) / RAD, positionEpoch: 2000 };
}
export function angularSeparationArcsec(a, b) {
  if (!validPosition(a) || !validPosition(b)) return Infinity;
  const delta = (a.decDeg - b.decDeg) * RAD, alpha = (a.raDeg - b.raDeg) * RAD;
  const hav = Math.sin(delta / 2) ** 2 + Math.cos(a.decDeg * RAD) * Math.cos(b.decDeg * RAD) * Math.sin(alpha / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, hav)))) / RAD * 3600;
}
export function normalizeCelestialSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bcigny\b/g, 'cygni').replace(/\bsheat\b/g, 'scheat')
    .replace(/[\u03c1]/g, 'rho').replace(/[\u03b1]/g, 'alpha').replace(/[\u03b2]/g, 'beta').replace(/[\u03b3]/g, 'gamma').replace(/[\u03b4]/g, 'delta')
    .replace(/([a-z])([0-9])/g, '$1 $2').replace(/([0-9])([a-z])/g, '$1 $2').replace(/[^a-z0-9.+-]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function indexText(object) {
  return normalizeCelestialSearch([object.name, object.englishName, object.italianName, ...(object.aliases || []), object.type, object.constellation, object.spectralType].filter(Boolean).join(' '));
}
function stellarObject(row, bsc = null) {
  const hip = Number.isFinite(row.hip) ? row.hip : null;
  const names = bsc ? starNames(bsc) : hip ? { name: 'HIP ' + hip, aliases: [], englishName: 'HIP ' + hip, italianName: 'HIP ' + hip } : starNames(row);
  const rawBsc = bsc || (!hip ? row : null);
  const position = hip ? propagateHipparcos(row) : { raDeg: row.raDeg, decDeg: row.decDeg, positionEpoch: 2000 };
  const hd = row.hd || rawBsc?.hd || null, hr = rawBsc?.hr || null;
  const spectralType = row.spectralType?.trim() || rawBsc?.spectralType?.trim() || null;
  const source = hip ? HIP_SOURCE : BSC_SOURCE;
  const sources = hip && rawBsc ? [HIP_SOURCE, BSC_SOURCE] : [source];
  const aliases = [...new Set([...(names.aliases || []), hip ? 'HIP ' + hip : '', hd ? 'HD ' + hd : '', hr ? 'HR ' + hr : '', rawBsc?.sao ? 'SAO ' + rawBsc.sao : '', rawBsc?.designation].filter(Boolean))];
  const parallaxMas = hip ? row.parallaxMas : Number.isFinite(row.parallaxArcsec) ? row.parallaxArcsec * 1000 : null;
  const parallaxErrorMas = hip ? row.parallaxErrorMas : null;
  const reliableParallax = parallaxMas > 0 && Number.isFinite(parallaxErrorMas) && parallaxErrorMas > 0 && parallaxErrorMas / parallaxMas <= .2;
  const distanceLy = reliableParallax ? 3261.563777 / parallaxMas : null;
  const object = {
    ...row, ...position, ...names, aliases, id: hip ? 'hip-' + hip : 'bsc-' + hr, hip, hd, hr,
    bodyKind: 'catalog-star', nasaCatalogue: hip ? 'hipparcos' : 'bsc5p', type: t('Star', 'Stella'), measured: true,
    spectralType, mag: Number.isFinite(row.vmag) ? row.vmag : rawBsc?.vmag ?? null,
    colorIndex: Number.isFinite(row.bv) ? row.bv : rawBsc?.bv ?? null,
    parallaxMas, parallaxErrorMas, distanceLy, distanceEstimate: reliableParallax,
    pmRaMasYr: hip ? row.pmRaMasYr : Number.isFinite(row.pmRaArcsecYr) ? row.pmRaArcsecYr * 1000 : null,
    pmDecMasYr: hip ? row.pmDecMasYr : Number.isFinite(row.pmDecArcsecYr) ? row.pmDecArcsecYr * 1000 : null,
    variableId: rawBsc?.variableId || null, radialVelocityKmS: rawBsc?.radialVelocityKmS ?? null,
    radialVelocityNote: rawBsc?.radialVelocityNote || null, radialVelocityCatalogue: rawBsc ? 'bsc5p' : null,
    magnitudeCatalogue: hip && Number.isFinite(row.vmag) ? 'hipparcos' : 'bsc5p',
    magnitudeBand: !hip || !Number.isFinite(row.vmag) ? rawBsc?.vmagCode === 'H' ? 'HR' : 'V' : 'V',
    magnitudeUncertainty: !hip || !Number.isFinite(row.vmag) ? rawBsc?.vmagUncertainty || null : null,
    spectralTypeCatalogue: hip && row.spectralType?.trim() ? 'hipparcos' : 'bsc5p',
    parallaxKind: hip ? 'trigonometric' : rawBsc?.parallaxKind || null,
    bscData: rawBsc,
    source, sources, coordinateFrame: hip ? 'ICRS' : 'FK5 / J2000',
    distance: distanceLy === null ? t('Distance unavailable', 'Distanza non disponibile') : t(`\u2248 ${number(distanceLy)} ly (parallax estimate)`, `\u2248 ${number(distanceLy)} a.l. (stima da parallasse)`),
    detail: t(`NASA HEASARC ${hip ? 'Hipparcos' : 'Bright Star'} catalogue entry.${spectralType ? ' Spectral class: ' + spectralType + '.' : ''}`, `Voce del catalogo ${hip ? 'Hipparcos' : 'Bright Star'} presso NASA HEASARC.${spectralType ? ' Classe spettrale: ' + spectralType + '.' : ''}`),
    positionNote: t('Sky direction on a reference sphere. Radial distance is not represented.', 'Direzione celeste su una sfera di riferimento. La distanza radiale non \u00e8 rappresentata.'),
  };
  object.name = t(names.englishName || names.name, names.italianName || names.name);
  object.searchText = indexText(object);
  return object;
}
const nebulaTypes = {
  nebula: ['Nebula', 'Nebulosa'], planetary: ['Planetary nebula', 'Nebulosa planetaria'],
  'cluster-nebula': ['Cluster with nebulosity', 'Ammasso con nebulosit\u00e0'],
  'extragalactic-nebula': ['Extragalactic nebular region', 'Regione nebulare extragalattica'],
  'supernova-remnant': ['Supernova remnant', 'Resto di supernova'],
};
export function buildCelestialCatalogue(hipSnapshot, bscSnapshot, nebulaSnapshot) {
  const hips = expand(hipSnapshot, 'stars'), bscs = expand(bscSnapshot, 'stars');
  const hipByHd = new Map();
  for (const hip of hips) if (hip.hd) { const entries = hipByHd.get(hip.hd) || []; entries.push({ row: hip, position: propagateHipparcos(hip) }); hipByHd.set(hip.hd, entries); }
  const bscByHip = new Map(), matched = new Set();
  for (const bsc of bscs) {
    const matches = (hipByHd.get(bsc.hd) || []).filter(hip => angularSeparationArcsec(hip.position, bsc) <= 5);
    if (matches.length === 1 && !bscByHip.has(matches[0].row.hip)) { bscByHip.set(matches[0].row.hip, bsc); matched.add(bsc.hr); }
  }
  const stars = [...hips.map(row => stellarObject(row, bscByHip.get(row.hip))), ...bscs.filter(row => !matched.has(row.hr)).map(row => stellarObject(row))];
  stars.sort((a, b) => (a.mag ?? Infinity) - (b.mag ?? Infinity));
  const nebulae = expand(nebulaSnapshot, 'objects').map(row => {
    const [en, it] = nebulaTypes[row.type] || nebulaTypes.nebula;
    const englishName = row.commonNameEn ? row.commonNameEn + ' \u00b7 ' + row.name : row.name;
    const italianName = row.commonNameIt ? row.commonNameIt + ' \u00b7 ' + row.name : row.name;
    const object = { ...row, name: t(englishName, italianName), englishName, italianName, type: t(en, it),
      bodyKind: 'nebula', nasaCatalogue: 'ngc2000', measured: true, catalogueName: row.name,
      source: row.infoUrl || NEBULA_SOURCE, sources: [...new Set([row.infoUrl, NEBULA_SOURCE].filter(Boolean))],
      detail: t(row.detailEn || `NASA HEASARC NGC2000 catalogue entry. Classification: ${en}.`, row.detailIt || `Voce del catalogo NGC2000 presso NASA HEASARC. Classificazione: ${it}.`),
      coordinateFrame: 'FK5 / J2000', positionEpoch: 2000,
      distance: Number.isFinite(row.distanceLy) ? t(`\u2248 ${number(row.distanceLy)} ly`, `\u2248 ${number(row.distanceLy)} a.l.`) : t('Distance unavailable', 'Distanza non disponibile'),
      positionNote: t('Catalogue sky position. The particle cloud illustrates the angular extent; it is not an observed image or a depth measurement.', 'Posizione celeste di catalogo. Le particelle illustrano l\u2019estensione angolare; non sono un\u2019immagine osservativa o una misura di profondit\u00e0.'),
    };
    object.aliases = [...new Set([row.name, ...(row.aliases || []), row.commonNameEn, row.commonNameIt].filter(Boolean))];
    object.searchText = indexText(object); return object;
  });
  const objects = [...stars, ...nebulae];
  return { stars, nebulae, objects, byId: new Map(objects.map(object => [object.id, object])), byHip: new Map(stars.filter(star => star.hip).map(star => [star.hip, star])),
    metadata: { hipparcos: hipSnapshot.metadata, bsc5p: bscSnapshot.metadata, ngc2000: nebulaSnapshot.metadata, matchedBrightStars: matched.size, starCount: stars.length, nebulaCount: nebulae.length } };
}
export function loadCelestialCatalog() {
  return cataloguePromise ||= Promise.all(['nasa-hipparcos.json','nasa-stars.json','nasa-nebulae.json'].map(async file => {
    const response = await fetch((import.meta.env?.BASE_URL || '/') + 'catalog/' + file);
    if (!response.ok) throw new Error(t('NASA catalogue unavailable. Retry loading the catalogue.', 'Catalogo NASA non disponibile. Riprova a caricare il catalogo.'));
    return response.json();
  })).then(snapshots => buildCelestialCatalogue(...snapshots)).catch(error => { cataloguePromise = null; throw error; });
}
export function findNasaStarForObject(catalogue, object) {
  if (Number.isFinite(object.hip)) return catalogue.byHip.get(object.hip) || null;
  if (!validPosition(object)) return null;
  const matches = catalogue.stars.filter(star => angularSeparationArcsec(star, object) <= 3);
  return matches.length === 1 ? matches[0] : null;
}
