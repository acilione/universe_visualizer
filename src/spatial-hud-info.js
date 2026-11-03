import { t, formatNumber } from './i18n.js';
import { BODY_SHAPES } from './body-shape-data.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const known = Number.isFinite;
const number = (value, digits = 3) => formatNumber(value, { maximumFractionDigits: digits });
const unavailable = () => t('Not available', 'Non disponibile');
const solarPlanets = new Set(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);

function sourceLabel(object) {
  const nasa = { hipparcos: 'Hipparcos', bsc5p: 'Bright Star', ngc2000: 'NGC2000' }[object.nasaCatalogue];
  // A matched Gaia record supplements a NASA row; its native observations must
  // not be silently substituted for the NASA measurements displayed here.
  if (nasa) return `NASA HEASARC · ${nasa}`;
  if (object.gaiaCatalogue || object.catalogue === 'gaia-dr3') return object.gaiaStreamed ? 'ESA Gaia DR3 · CDS' : 'ESA Gaia DR3';
  const source = text(object.source);
  if (/^https:\/\/exoplanetarchive\.ipac\.caltech\.edu(?:\/|$)/i.test(source)) return 'NASA Exoplanet Archive';
  if (/^https:\/\/ssd\.jpl\.nasa\.gov(?:\/|$)/i.test(source)) return 'NASA / JPL';
  if (/^https:\/\/(?:[^/]+\.)?nasa\.gov(?:\/|$)/i.test(source)) return 'NASA';
  if (/^https:\/\/simbad\.cds\.unistra\.fr(?:\/|$)/i.test(source)) return 'SIMBAD · CDS';
  if (/github\.com\/astronexus\/HYG-Database/i.test(source)) return 'HYG';
  if (source) {
    try { return new URL(source).hostname.replace(/^www\./, ''); } catch { /* No invented attribution. */ }
  }
  return text(object.catalogueProvider) || t('Source unavailable', 'Fonte non disponibile');
}

function objectKind(object) {
  if (text(object.type)) return text(object.type);
  switch (object.bodyKind) {
    case 'moon': return t('Natural satellite', 'Satellite naturale');
    case 'planet': return t('Planet', 'Pianeta');
    case 'exoplanet': return t('Confirmed exoplanet', 'Esopianeta confermato');
    case 'nebula': return t('Nebula', 'Nebulosa');
    case 'star': case 'catalog-star': return t('Star', 'Stella');
    case 'catalog-source': return t('Catalogue source', 'Sorgente di catalogo');
    default: return t('Celestial object', 'Oggetto celeste');
  }
}

/** Compact scientific data, never distances or sizes inferred from the drawing.
 * The caller resolves lightweight Gaia/environment hits before formatting.
 * No fetches, catalogue scans, DOM access or mutation of the source record.
 */
export function hudObjectInfo(object) {
  if (!object || typeof object !== 'object') return null;
  const rows = [];
  const solarPlanet = object.bodyKind === 'planet' && solarPlanets.has(object.id);
  const shape = solarPlanet || object.id === 'sun' || object.id === 'sol' ? BODY_SHAPES[object.id === 'sol' ? 'sun' : object.id] : null;
  let shapeFacts = false;
  const add = (label, value) => { if (rows.length < 4 && value !== null && value !== undefined && value !== '') rows.push({label, value: String(value)}); };
  const scalar = (label, value, unit, digits) => { if (known(value)) add(label, `${number(value, digits)}${unit ? ' ' + unit : ''}`); };
  const distance = () => {
    if (known(object.distanceLy) && object.distanceLy >= 0) {
      const approximate = object.distanceEstimate || /^[≈~]/.test(text(object.distance));
      add(object.distanceEstimate ? t('Distance estimate', 'Distanza stimata') : t('Distance', 'Distanza'),
        `${approximate ? '≈ ' : ''}${number(object.distanceLy)} ${t('ly', 'a.l.')}`);
    } else if (known(object.distancePc) && object.distancePc >= 0) {
      scalar(t('Distance', 'Distanza'), object.distancePc, 'pc');
    } else if (text(object.distance)) {
      add(t('Distance / extent', 'Distanza / estensione'), text(object.distance));
    } else add(t('Distance', 'Distanza'), unavailable());
  };
  const magnitude = () => {
    if (!known(object.mag)) return;
    const band = text(object.magnitudeBand);
    add(t('App. magnitude', 'Magnitudine app.') + (band ? ` (${band})` : ''), number(object.mag, 2));
  };
  const coordinates = () => {
    if (!known(object.raDeg) || !known(object.decDeg) || object.raDeg < 0 || object.raDeg >= 360 || Math.abs(object.decDeg) > 90) return;
    const frame = text(object.coordinateFrame);
    const epoch = known(object.positionEpoch) ? ` · J${formatNumber(object.positionEpoch, {minimumFractionDigits: 1, maximumFractionDigits: 2, useGrouping: false})}` : '';
    // Never label a native Gaia direction as J2000 or mix it with gaiaData's
    // referenceEpoch when the top-level NASA coordinates were propagated.
    add(`RA / Dec${frame ? ' · ' + frame : ''}`, `${number(object.raDeg, 4)}° / ${number(object.decDeg, 4)}°${epoch}`);
  };

  if (object.bodyKind === 'moon' || object.isMoon) {
    add(t('Parent', 'Corpo principale'), text(object.parentName) || text(object.parentId));
    scalar(t('Mean radius', 'Raggio medio'), object.radiusKm, 'km');
    scalar(t('Semimajor axis', 'Semiasse maggiore'), object.semiMajorAxisKm, 'km');
    scalar(t('Orbital period', 'Periodo orbitale'), object.periodDays, t('days', 'giorni'), 4);
    if (!rows.length) distance();
  } else if (object.bodyKind === 'exoplanet') {
    add(t('Host star', 'Stella ospite'), text(object.host));
    scalar(t('Radius', 'Raggio'), object.radiusEarth, 'R⊕');
    scalar(t('Semimajor axis', 'Semiasse maggiore'), object.semiMajorAxisAu, t('AU', 'UA'));
    scalar(t('Orbital period', 'Periodo orbitale'), object.periodDays, t('days', 'giorni'), 4);
    if (rows.length < 4) distance();
  } else if (shape) {
    // Solar catalogue AU values describe approximate orbital semimajor axes,
    // never instantaneous heliocentric range. Parse only its authored format.
    const authoredAxis = text(object.distance).match(/^([0-9]+(?:[.,][0-9]+)?)\s+(?:AU from the Sun|UA dal Sole)$/i);
    if (solarPlanet && (known(object.semiMajorAxisAu) || authoredAxis)) {
      const axis = known(object.semiMajorAxisAu) ? object.semiMajorAxisAu : Number(authoredAxis[1].replace(',', '.'));
      scalar(t('Semimajor axis (approx.)', 'Semiasse maggiore (ca.)'), axis, t('AU', 'UA'));
    } else distance();
    // NAIF reference ellipsoid semiaxes are [equatorial x, equatorial y,
    // polar z]. Do not label either one as a mean or volumetric radius.
    scalar(t('Equatorial radius', 'Raggio equatoriale'), shape.radiiKm?.[0], 'km', 4);
    scalar(t('Polar radius', 'Raggio polare'), shape.radiiKm?.[2], 'km', 4);
    scalar(t('Rotation (IAU)', 'Rotazione (IAU)'), shape.rotationPeriodHours, 'h');
    shapeFacts = true;
  } else if (object.bodyKind === 'planet') {
    scalar(t('Mean radius', 'Raggio medio'), object.radiusKm, 'km');
    scalar(t('Semimajor axis', 'Semiasse maggiore'), object.semiMajorAxisAu, t('AU', 'UA'));
    scalar(t('Orbital period', 'Periodo orbitale'), object.periodDays, t('days', 'giorni'), 4);
    if (!known(object.semiMajorAxisAu)) distance();
  } else {
    distance();
    if (object.bodyKind === 'nebula') scalar(t('Angular size', 'Dimensione angolare'), object.angularSizeArcmin, 'arcmin');
    magnitude();
    add(t('Spectral class', 'Classe spettrale'), text(object.spectralType));
    // Preserve measured negative/zero parallaxes; never invert them here.
    scalar(t('Parallax', 'Parallasse'), object.parallaxMas, 'mas');
    coordinates();
  }

  return {
    id: object.id == null ? '' : String(object.id),
    name: text(t(object.englishName, object.italianName)) || text(object.name) || t('Unnamed object', 'Oggetto senza nome'),
    kind: objectKind(object), rows, source: shapeFacts ? 'NASA / JPL' : sourceLabel(object),
  };
}
