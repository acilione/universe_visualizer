import { t, locale } from './i18n.js';

export const GAIA_DR3_SOURCE = 'https://www.cosmos.esa.int/web/gaia/dr3';
export const GAIA_DR3_DATA_MODEL = 'https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html';
export const GAIA_HIP_MATCH_SOURCE = 'https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_cross-matches/ssec_dm_hipparcos2_best_neighbour.html';
const RAD = Math.PI / 180;
const MAS_TO_RAD = RAD / 3600000;
const COLLISION_RADIUS_ARCSEC = 5;
const CROSSMATCH_TABLE = 'gaiadr3.hipparcos2_best_neighbour';
const SOURCE_TABLE = 'gaiadr3.gaia_source';
const validPosition = row => Number.isFinite(row.raDeg) && row.raDeg >= 0 && row.raDeg < 360 && Number.isFinite(row.decDeg) && Math.abs(row.decDeg) <= 90;
const finite = value => Number.isFinite(value) ? value : null;
const format = value => value.toLocaleString(locale(), { maximumFractionDigits: 3 });

// The archive uses 64-bit identifiers. Never coerce them to JavaScript Numbers.
export function gaiaSourceId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new TypeError('Gaia source_id must be a canonical positive 64-bit integer string.');
  }
  return value;
}

// ICRS stays ICRS: this propagates the observation epoch, not an equinox rotation.
// Gaia pmra is mu_alpha * cos(delta), so the tangent-vector update remains finite
// at the poles. It is a first-order angular propagation, without perspective
// acceleration or covariance propagation; the native J2016 values are retained.
export function propagateGaia(row, targetEpoch = 2000) {
  const nativeEpoch = Number.isFinite(row.refEpoch) ? row.refEpoch : 2016;
  if (!validPosition(row) || !Number.isFinite(targetEpoch) || !Number.isFinite(row.pmRaMasYr) || !Number.isFinite(row.pmDecMasYr)) {
    return { raDeg: row.raDeg, decDeg: row.decDeg, positionEpoch: nativeEpoch, positionPropagated: false };
  }
  const a = row.raDeg * RAD, d = row.decDeg * RAD, dt = (targetEpoch - nativeEpoch) * MAS_TO_RAD;
  const x = Math.cos(d) * Math.cos(a) + dt * (-row.pmRaMasYr * Math.sin(a) - row.pmDecMasYr * Math.sin(d) * Math.cos(a));
  const y = Math.cos(d) * Math.sin(a) + dt * (row.pmRaMasYr * Math.cos(a) - row.pmDecMasYr * Math.sin(d) * Math.sin(a));
  const z = Math.sin(d) + dt * row.pmDecMasYr * Math.cos(d);
  return { raDeg: (Math.atan2(y, x) / RAD + 360) % 360, decDeg: Math.atan2(z, Math.hypot(x, y)) / RAD,
    positionEpoch: targetEpoch, positionPropagated: targetEpoch !== nativeEpoch };
}

const vector = row => {
  const a = row.raDeg * RAD, d = row.decDeg * RAD;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};

// Proximity only detects unresolved identity questions. It never establishes an
// identity: binaries and line-of-sight neighbours are possible at any separation.
function collisionIndex(stars) {
  const chord = 2 * Math.sin(COLLISION_RADIUS_ARCSEC * RAD / 7200);
  const cells = new Map();
  const key = coordinates => coordinates.join(',');
  const cell = position => position.map(value => Math.floor(value / chord));
  for (const star of stars) {
    if (!validPosition(star)) continue;
    const position = vector(star), address = key(cell(position));
    const entries = cells.get(address) || [];
    entries.push({ star, position }); cells.set(address, entries);
  }
  return row => {
    if (!validPosition(row)) return [];
    const position = vector(row), address = cell(position), matches = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      for (const entry of cells.get(key([address[0] + x, address[1] + y, address[2] + z])) || []) {
        const separation = Math.hypot(...position.map((value, index) => value - entry.position[index]));
        if (separation <= chord) matches.push({ id: entry.star.id, separationArcsec: 2 * Math.asin(Math.min(1, separation / 2)) / RAD * 3600 });
      }
    }
    return matches.sort((a, b) => a.separationArcsec - b.separationArcsec || a.id.localeCompare(b.id));
  };
}

function aliasesFor(row) { return [`Gaia DR3 ${row.sourceId}`, row.sourceId]; }
const normalized = value => value.toLowerCase().replace(/([a-z])([0-9])/g, '$1 $2').replace(/([0-9])([a-z])/g, '$1 $2').replace(/[^a-z0-9.+-]+/g, ' ').trim().replace(/\s+/g, ' ');
function nativeData(row) {
  return { ...row, hipMatches: row.hipMatches.map(match => ({ ...match })), source: GAIA_DR3_SOURCE, sourceTable: SOURCE_TABLE,
    coordinateFrame: 'ICRS / Gaia-CRF3', referenceEpoch: row.refEpoch ?? 2016 };
}
function newGaiaStar(row, position) {
  const name = `Gaia DR3 ${row.sourceId}`, aliases = aliasesFor(row);
  const reliableParallax = row.parallaxMas > 0 && row.parallaxErrorMas > 0 && row.parallaxErrorMas / row.parallaxMas <= .2 && Number.isFinite(row.ruwe) && row.ruwe <= 1.4;
  const distanceLy = reliableParallax ? 3261.563777 / row.parallaxMas : null;
  return { id: 'gaia-dr3-' + row.sourceId, name, englishName: name, italianName: name, aliases,
    bodyKind: 'catalog-star', catalogue: 'gaia-dr3', catalogueProvider: 'ESA Gaia DR3', gaiaCatalogue: 'dr3', type: t('Star', 'Stella'), measured: true,
    hip: null, hd: null, hr: null, spectralType: null,
    ...position, coordinateFrame: 'ICRS / Gaia-CRF3', gaiaSourceId: row.sourceId, gaiaData: nativeData(row), gaiaMatchStatus: 'gaia-only',
    mag: finite(row.gMag), magnitudeBand: 'G', magnitudeCatalogue: 'gaia-dr3', colorIndex: null,
    parallaxMas: finite(row.parallaxMas), parallaxErrorMas: finite(row.parallaxErrorMas), parallaxKind: 'trigonometric',
    distanceLy, distanceEstimate: reliableParallax, distanceCatalogue: 'gaia-dr3',
    pmRaMasYr: finite(row.pmRaMasYr), pmDecMasYr: finite(row.pmDecMasYr),
    radialVelocityKmS: finite(row.radialVelocityKmS), radialVelocityCatalogue: 'gaia-dr3',
    source: GAIA_DR3_SOURCE, sources: [GAIA_DR3_SOURCE, GAIA_DR3_DATA_MODEL],
    distance: distanceLy === null ? t('Distance unavailable', 'Distanza non disponibile') : t(`~ ${format(distanceLy)} ly (inverse-parallax estimate)`, `~ ${format(distanceLy)} a.l. (stima da parallasse inversa)`),
    detail: t('ESA Gaia DR3 source from the experimental bright-source subset. G-band photometry; native astrometry at J2016.0.', 'Sorgente ESA Gaia DR3 dal sottoinsieme sperimentale di sorgenti luminose. Fotometria in banda G; astrometria originale a J2016.0.'),
    positionNote: position.positionPropagated
      ? t('ICRS direction propagated to J2000 with a first-order proper-motion model; radial distance is not represented.', 'Direzione ICRS propagata a J2000 con un modello del primo ordine del moto proprio; la distanza radiale non \u00e8 rappresentata.')
      : t('Native ICRS direction at J2016.0; proper motion is unavailable. Radial distance is not represented.', 'Direzione ICRS originale a J2016.0; moto proprio non disponibile. La distanza radiale non \u00e8 rappresentata.'),
    searchText: normalized([name, ...aliases, 'Gaia DR3 star'].join(' ')),
  };
}

/**
 * Add a bounded, explicitly sourced DR3 snapshot to the existing NASA catalogue.
 * NASA records keep their IDs, positions, magnitudes, epochs and measurements.
 * Only verified, reciprocal one-to-one official HIP matches enrich a NASA row.
 * Uncertain matches stay in gaiaAmbiguousRecords and are not rendered twice.
 */
export function mergeGaiaCatalog(nasaData, snapshot) {
  if (snapshot?.metadata?.sourceTable !== SOURCE_TABLE || snapshot?.metadata?.crossmatchTable !== CROSSMATCH_TABLE || !Array.isArray(snapshot.stars)) {
    throw new TypeError('A Gaia DR3 snapshot with official source and Hipparcos-2 crossmatch provenance is required.');
  }
  const sourceRows = new Map(), reverseHip = new Map();
  let repeatedRowCount = 0;
  for (const row of snapshot.stars) {
    const id = gaiaSourceId(row.sourceId);
    if (!Array.isArray(row.hipMatches)) throw new TypeError('Gaia hipMatches must preserve the official crossmatch array.');
    const rows = sourceRows.get(id) || [];
    if (rows.some(previous => JSON.stringify(previous) === JSON.stringify(row))) repeatedRowCount++;
    else rows.push(row);
    sourceRows.set(id, rows);
    for (const match of row.hipMatches) {
      if (!Number.isInteger(match.hip) || match.hip <= 0) throw new TypeError('Hipparcos crossmatch identifiers must be positive integers.');
      const ids = reverseHip.get(match.hip) || new Set(); ids.add(id); reverseHip.set(match.hip, ids);
    }
  }
  const nasaStars = nasaData.stars.filter(star => star.catalogue !== 'gaia-dr3');
  const starsById = new Map(nasaStars.map(star => [star.id, star]));
  const nasaByHip = new Map();
  for (const star of nasaStars) if (Number.isInteger(star.hip)) {
    const matches = nasaByHip.get(star.hip) || []; matches.push(star); nasaByHip.set(star.hip, matches);
  }
  const nearbyNasa = collisionIndex(nasaStars), added = [], quarantined = [], gaiaBySourceId = new Map();
  let matchedCount = 0;
  const reasonCounts = {};
  for (const [sourceId, rows] of sourceRows) {
    const row = rows[0], reasons = [], candidateNasaIds = new Set();
    const hipMatches = row.hipMatches;
    if (rows.length > 1) reasons.push('conflicting-source-records');
    if (row.inQsoCandidates === true || row.inGalaxyCandidates === true) reasons.push('extragalactic-candidate');
    if (row.duplicatedSource === true) reasons.push('duplicated-source-quality-flag');
    else if (row.duplicatedSource !== false) reasons.push('missing-duplicated-source-quality');
    if (row.refEpoch !== 2016) reasons.push('unexpected-native-epoch');
    if (hipMatches.length > 1) reasons.push('multiple-hipparcos-matches');
    for (const match of rows.flatMap(record => record.hipMatches)) {
      for (const star of nasaByHip.get(match.hip) || []) candidateNasaIds.add(star.id);
      if (reverseHip.get(match.hip).size > 1) reasons.push('multiple-gaia-sources-for-hipparcos');
      if (match.numberOfNeighbours !== 1) reasons.push('ambiguous-neighbour-count');
      if (!Number.isInteger(match.xmFlag) || match.xmFlag < 0) reasons.push('missing-crossmatch-quality');
      else if ((match.xmFlag & 7) !== 0) reasons.push('crossmatch-multiplicity-flag');
      if ((nasaByHip.get(match.hip) || []).length > 1) reasons.push('multiple-nasa-records-for-hipparcos');
    }
    const position = propagateGaia(row);
    if (!validPosition(row)) reasons.push('invalid-position');
    const nasaMatch = hipMatches.length === 1 ? nasaByHip.get(hipMatches[0].hip)?.[0] : null;
    let proximityCandidates = [];
    if (!nasaMatch && validPosition(position)) {
      proximityCandidates = nearbyNasa(position);
      if (proximityCandidates.length) {
        reasons.push('unresolved-nasa-positional-overlap');
        for (const candidate of proximityCandidates) candidateNasaIds.add(candidate.id);
      }
    }
    if (reasons.length) {
      const uniqueReasons = [...new Set(reasons)];
      for (const reason of uniqueReasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      quarantined.push({ sourceId, reasons: uniqueReasons, candidateNasaIds: [...candidateNasaIds], proximityCandidates,
        gaiaData: nativeData(row), conflictingRecords: rows.length > 1 ? rows.map(nativeData) : undefined });
      continue;
    }
    if (nasaMatch) {
      const aliases = [...new Set([...(nasaMatch.aliases || []), ...aliasesFor(row)])];
      const enriched = { ...nasaMatch, aliases, gaiaSourceId: sourceId, gaiaData: nativeData(row), gaiaMatchStatus: 'official-hipparcos-match',
        sources: [...new Set([...(nasaMatch.sources || [nasaMatch.source]).filter(Boolean), GAIA_DR3_SOURCE, GAIA_HIP_MATCH_SOURCE])],
        searchText: [nasaMatch.searchText || normalized(nasaMatch.name || ''), normalized(aliasesFor(row).join(' '))].join(' ') };
      starsById.set(nasaMatch.id, enriched); gaiaBySourceId.set(sourceId, enriched); matchedCount++;
    } else {
      const star = newGaiaStar(row, position); added.push(star); gaiaBySourceId.set(sourceId, star);
    }
  }
  const stars = [...starsById.values(), ...added].sort((a, b) => (a.mag ?? Infinity) - (b.mag ?? Infinity));
  const nebulae = nasaData.nebulae || [], objects = [...stars, ...nebulae];
  const byId = new Map(objects.map(object => [object.id, object]));
  for (const [sourceId, object] of gaiaBySourceId) byId.set('gaia-dr3-' + sourceId, object);
  return { ...nasaData, stars, nebulae, objects, byId,
    byHip: new Map(stars.filter(star => star.hip).map(star => [star.hip, star])), gaiaBySourceId, gaiaAmbiguousRecords: quarantined,
    metadata: { ...nasaData.metadata, starCount: stars.length, gaiaDr3: { ...snapshot.metadata, matching: {
      snapshotRowCount: snapshot.stars.length, uniqueSourceCount: sourceRows.size, matchedCount, addedCount: added.length,
      quarantinedCount: quarantined.length, repeatedRowCount, reasonCounts, collisionRadiusArcsec: COLLISION_RADIUS_ARCSEC,
      policy: 'Official reciprocal one-to-one Hipparcos-2 associations only; uncertain matches and positional overlaps are retained as evidence but omitted from rendering.',
    } } } };
}
