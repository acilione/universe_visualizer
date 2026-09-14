import { t, locale } from './i18n.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const unavailable = () => t('Not available', 'Non disponibile');
const number = (value, precision = 3, unit = '') => Number.isFinite(value)
  ? value.toLocaleString(locale(), {maximumFractionDigits: precision, useGrouping: false}) + (unit ? ' ' + unit : '')
  : unavailable();
const text = value => value === null || value === undefined || value === '' ? unavailable() : String(value);
const row = (label, value) => `<div><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
const catalogueName = key => ({hipparcos: 'Hipparcos', bsc5p: 'Bright Star Catalogue', ngc2000: 'NGC 2000.0'}[key] || t('Catalogue', 'Catalogo'));
const epochLabel = info => Number.isFinite(info.positionEpoch) ? 'J' + number(info.positionEpoch, 2) : /HYG/i.test(info.source || '') ? 'J2000' : '';
const bandName = value => value === 'photographic-blue' ? t('photographic blue', 'blu fotografico') : value === 'visual' ? t('visual', 'visuale') : text(value);

/** Scientific measurements only; HYG scene objects may carry a NASA information record. */
export function celestialMeasurements(object, isModal = false) {
  if (!object) return '';
  const info = object.nasaInfo || object;
  const nebula = info.bodyKind === 'nebula';
  const nasa = Boolean(info.nasaCatalogue);
  const precision = nebula ? 3 : info.positionPrecision === 'rounded' ? 4 : 5;
  const epoch = epochLabel(info);
  const suffix = epoch ? ' · ' + epoch : '';
  const rows = [
    row(t('RIGHT ASCENSION', 'ASCENSIONE RETTA') + suffix, number(info.raDeg, precision, '°')),
    row(t('DECLINATION', 'DECLINAZIONE') + suffix, number(info.decDeg, precision, '°'))
  ];
  if (nebula) {
    const diameter = Number.isFinite(info.angularSizeArcmin)
      ? (info.angularSizeIsUpperLimit ? '≤ ' : '') + number(info.angularSizeArcmin, 2, 'arcmin')
      : unavailable();
    rows.push(row(t('ANGULAR DIAMETER', 'DIAMETRO ANGOLARE'), diameter));
    const magnitude = Number.isFinite(info.mag)
      ? number(info.mag, 2) + (info.magnitudeBand ? ' · ' + bandName(info.magnitudeBand) : '')
      : unavailable();
    rows.push(row(t('APPARENT MAGNITUDE', 'MAGNITUDINE APPARENTE'), magnitude));
  } else {
    const magnitudeLabel = t('APPARENT MAGNITUDE', 'MAGNITUDINE APPARENTE') + ' · ' + (info.magnitudeBand || 'V') + (info.magnitudeCatalogue === 'bsc5p' && info.nasaCatalogue !== 'bsc5p' ? ' (BSC)' : '');
    rows.push(row(magnitudeLabel, number(info.mag, 3)));
    rows.push(row(t('SPECTRAL CLASS', 'CLASSE SPETTRALE') + (info.spectralTypeCatalogue === 'bsc5p' && info.nasaCatalogue !== 'bsc5p' ? ' · BSC' : ''), text(info.spectralType)));
  }
  if (isModal) {
    if (!nebula) {
      if (Number.isFinite(info.parallaxMas)) {
        const uncertainty = Number.isFinite(info.parallaxErrorMas) ? info.parallaxErrorMas : info.errorMas;
        rows.push(row(info.parallaxKind === 'D' ? t('DYNAMICAL PARALLAX', 'PARALLASSE DINAMICA') : t('PARALLAX', 'PARALLASSE'), number(info.parallaxMas, 3) + (Number.isFinite(uncertainty) ? ' ± ' + number(uncertainty, 3) : '') + ' mas'));
      }
      if (Number.isFinite(info.colorIndex)) rows.push(row(t('COLOUR INDEX · B−V', 'INDICE DI COLORE · B−V'), number(info.colorIndex, 3)));
      if (Number.isFinite(info.pmRaMasYr)) rows.push(row(t('PROPER MOTION · RA', 'MOTO PROPRIO · AR'), number(info.pmRaMasYr, 3, t('mas/yr', 'mas/anno'))));
      if (Number.isFinite(info.pmDecMasYr)) rows.push(row(t('PROPER MOTION · DEC', 'MOTO PROPRIO · DEC'), number(info.pmDecMasYr, 3, t('mas/yr', 'mas/anno'))));
      if (Number.isFinite(info.radialVelocityKmS)) rows.push(row(t('RADIAL VELOCITY', 'VELOCIT\u00c0 RADIALE') + (info.radialVelocityCatalogue === 'gaia-dr3' ? ' \u00b7 Gaia DR3' : ' \u00b7 BSC'), number(info.radialVelocityKmS, 2, 'km/s')));
      if (info.radialVelocityNote) rows.push(row(t('RADIAL VELOCITY FLAG · BSC', 'INDICATORE VELOCITÀ RADIALE · BSC'), info.radialVelocityNote));
      if (info.magnitudeUncertainty) rows.push(row(t('MAGNITUDE UNCERTAINTY FLAG · BSC', 'INDICATORE INCERTEZZA MAGNITUDINE · BSC'), info.magnitudeUncertainty));
      if (info.bscData?.spectralType && info.spectralTypeCatalogue !== 'bsc5p' && info.bscData.spectralType !== info.spectralType) rows.push(row(t('SPECTRAL CLASS · BSC', 'CLASSE SPETTRALE · BSC'), info.bscData.spectralType));
      if (info.variableId) rows.push(row(t('VARIABLE-STAR IDENTIFIER', 'IDENTIFICATORE DI STELLA VARIABILE'), info.variableId));
      const identifiers = ['hip', 'hr', 'hd'].filter(key => Number.isFinite(info[key])).map(key => key.toUpperCase() + ' ' + info[key]);
      if (info.gaiaData?.sourceId) identifiers.push('Gaia DR3 ' + info.gaiaData.sourceId);
      rows.push(row(t('CATALOGUE IDENTIFIERS', 'IDENTIFICATORI DI CATALOGO'), identifiers.length ? identifiers.join(' · ') : unavailable()));
    } else {
      rows.push(row(t('CLASSIFICATION', 'CLASSIFICAZIONE'), text(info.type)));
      rows.push(row(t('PHOTOMETRIC BAND', 'BANDA FOTOMETRICA'), bandName(info.magnitudeBand)));
      if (info.catalogueName) rows.push(row(t('CATALOGUE IDENTIFIER', 'IDENTIFICATORE DI CATALOGO'), info.catalogueName));
    }
    rows.push(row(t('POSITION EPOCH', 'EPOCA DELLA POSIZIONE'), epoch || unavailable()));
    if (info.positionPrecision === 'rounded') rows.push(row(t('SOURCE POSITION PRECISION', 'PRECISIONE POSIZIONE ORIGINALE'), t('Rounded: 0.01 s in RA, 0.1 arcsec in Dec', 'Arrotondata: 0,01 s in AR, 0,1 arcsec in Dec')));
    rows.push(row(t('COORDINATE FRAME', 'SISTEMA DI COORDINATE'), text(info.coordinateFrame)));
    if (nasa) rows.push(row(t('MEASUREMENT CATALOGUE', 'CATALOGO DELLE MISURE'), 'NASA HEASARC · ' + catalogueName(info.nasaCatalogue) + (info.bscData && info.nasaCatalogue !== 'bsc5p' ? ' / Bright Star Catalogue (BSC)' : '')));
    // These are properties of the original local-sky view, not the NASA record.
    if (Number.isFinite(object.altitudeDeg)) rows.push(row(t('ALTITUDE ABOVE HORIZON', 'ALTEZZA SULL’ORIZZONTE'), number(object.altitudeDeg, 3, '°')));
    if (Number.isFinite(object.azimuthDeg)) rows.push(row(t('AZIMUTH', 'AZIMUT'), number(object.azimuthDeg, 3, '°')));
  }
  const provenance = object.nasaInfo
    ? `<p class="illustration-note">${escape(t('Measurements: NASA HEASARC · ', 'Misure: NASA HEASARC · ') + catalogueName(info.nasaCatalogue) + t('. Map coordinates: HYG.', '. Coordinate della mappa: HYG.'))}</p>`
    : '';
  return `<div class="planet-measurements star-measurements">${rows.join('')}</div>${provenance}${gaiaMeasurements(info, isModal)}`;
}

function gaiaMeasurements(info, isModal) {
  const gaia=info.gaiaData;
  if(!gaia)return '';
  const valueWithError=(value,error,unit)=>number(value,5)+(Number.isFinite(value)&&Number.isFinite(error)?' \u00b1 '+number(error,5):'')+(Number.isFinite(value)?' '+unit:'');
  const rows=[row('GAIA DR3 SOURCE_ID',gaia.sourceId),row(t('APPARENT MAGNITUDE \u00b7 G','MAGNITUDINE APPARENTE \u00b7 G'),number(gaia.gMag,5))];
  if(isModal){
    rows.push(row(t('RIGHT ASCENSION \u00b7 J2016.0','ASCENSIONE RETTA \u00b7 J2016.0'),number(gaia.raDeg,8,'\u00b0')),
      row(t('DECLINATION \u00b7 J2016.0','DECLINAZIONE \u00b7 J2016.0'),number(gaia.decDeg,8,'\u00b0')),
      row(t('POSITION UNCERTAINTY \u00b7 RA / DEC','INCERTEZZA POSIZIONE \u00b7 AR / DEC'),number(gaia.raErrorMas,5,'mas')+' / '+number(gaia.decErrorMas,5,'mas')),
      row(t('PARALLAX','PARALLASSE'),valueWithError(gaia.parallaxMas,gaia.parallaxErrorMas,'mas')),
      row(t('PROPER MOTION \u00b7 RA COS(DEC)','MOTO PROPRIO \u00b7 AR COS(DEC)'),valueWithError(gaia.pmRaMasYr,gaia.pmRaErrorMasYr,t('mas/yr','mas/anno'))),
      row(t('PROPER MOTION \u00b7 DEC','MOTO PROPRIO \u00b7 DEC'),valueWithError(gaia.pmDecMasYr,gaia.pmDecErrorMasYr,t('mas/yr','mas/anno'))),
      row(t('RADIAL VELOCITY','VELOCIT\u00c0 RADIALE'),valueWithError(gaia.radialVelocityKmS,gaia.radialVelocityErrorKmS,'km/s')),
      row(t('APPARENT MAGNITUDE \u00b7 BP / RP','MAGNITUDINE APPARENTE \u00b7 BP / RP'),number(gaia.bpMag,5)+' / '+number(gaia.rpMag,5)),
      row('BP\u2212RP',number(gaia.bpRp,5)),row('RUWE',number(gaia.ruwe,4)),
      row(t('DUPLICATED_SOURCE FLAG','INDICATORE DUPLICATED_SOURCE'),typeof gaia.duplicatedSource==='boolean'?String(gaia.duplicatedSource):unavailable()),
      row(t('COORDINATE FRAME','SISTEMA DI COORDINATE'),gaia.coordinateFrame),
      row(t('ASSOCIATION','ASSOCIAZIONE'),info.gaiaMatchStatus==='official-hipparcos-match'?t('Official Gaia\u2013Hipparcos-2 association','Associazione ufficiale Gaia\u2013Hipparcos-2'):t('Additional Gaia source','Sorgente Gaia aggiuntiva')));
    for(const match of gaia.hipMatches||[])rows.push(row('HIP '+match.hip,t('Separation: ','Separazione: ')+number(match.angularDistanceArcsec,5,'arcsec')+'; '+t('neighbours: ','vicini: ')+text(match.numberOfNeighbours)+'; xm_flag: '+text(match.xmFlag)));
  }
  return `<section class="gaia-measurements" aria-label="Gaia DR3"><h3>ESA GAIA DR3</h3><div class="planet-measurements">${rows.join('')}</div>${isModal?`<p class="illustration-note">${t('Native Gaia measurements at J2016.0. G/BP/RP photometry uses different passbands from V. RUWE and duplicated_source are processing-quality indicators.','Misure native Gaia a J2016.0. La fotometria G/BP/RP usa bande diverse da V. RUWE e duplicated_source sono indicatori di qualit\u00e0 del trattamento dei dati.')}</p>`:''}</section>`;
}

function sourceKey(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname === 'nasa.gov' || url.hostname.endsWith('.nasa.gov') || ['www.cosmos.esa.int','gea.esac.esa.int'].includes(url.hostname))) return null;
    const name = url.pathname.match(/\/(hipparcos|bsc5p|ngc2000)\.html$/)?.[1];
    return name ? 'heasarc:' + name : url.href;
  } catch {return null;}
}

/** Supplement the primary source link already rendered by the object card. */
export function celestialSourceLinks(object) {
  if (!object) return '';
  const info = object.nasaInfo || object;
  const primary = sourceKey(object.source);
  const seen = new Set(primary ? [primary] : []);
  const links = [];
  for (const source of [info.source, ...(Array.isArray(info.sources) ? info.sources : [])]) {
    const key = sourceKey(source);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const catalogue = key.startsWith('heasarc:') ? key.slice(8) : null;
    const label = new URL(source).hostname.endsWith('.esa.int') ? 'ESA Gaia DR3' : catalogue ? 'NASA HEASARC \u00b7 ' + catalogueName(catalogue) : t('NASA scientific source', 'Fonte scientifica NASA');
    links.push(`<a class="object-source" href="${escape(source)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`);
  }
  return links.join('');
}
