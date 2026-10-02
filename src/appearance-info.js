import { t, locale } from './i18n.js';
import { getBodyAppearance } from './planet-visuals.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localized = (record, key) => t(record[key] || '', record[key + 'It'] || record[key] || '');
function link(url, label) {
  try { if (new URL(url).protocol !== 'https:') return ''; } catch { return ''; }
  return `<a class="object-source" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} \u2197</a>`;
}
export function appearanceInformation(object, isModal = false) {
  if (!['planet','moon','exoplanet','star'].includes(object.bodyKind) && !['sun','mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'].includes(object.id)) return '';
  const appearance = getBodyAppearance(object);
  const label = appearance.classification === 'observed' ? t('Observation-based map','Mappa da osservazioni')
    : appearance.classification === 'reconstructed' ? t('Spacecraft-derived visualization','Visualizzazione da dati spaziali')
    : t('Illustrative appearance','Aspetto illustrativo');
  if (!isModal) return `<p class="appearance-summary">${escape(label)}</p>`;
  const axes = appearance.radiiKm?.map(value => value.toLocaleString(locale(),{maximumFractionDigits:3})).join(' \u00d7 ');
  return `<section class="appearance-data"><h3>${t('APPEARANCE AND SHAPE','ASPETTO E FORMA')}</h3>
    <div class="planet-measurements"><div><span>${t('APPEARANCE','ASPETTO')}</span><strong>${escape(label)}</strong></div>
    ${appearance.band ? `<div><span>${t('WAVELENGTHS','LUNGHEZZE D\u2019ONDA')}</span><strong>${escape(localized(appearance,'band'))}</strong></div>` : ''}
    ${axes ? `<div><span>${t('REFERENCE SEMIAXES \u00b7 A / B / C','SEMIASSI DI RIFERIMENTO \u00b7 A / B / C')}</span><strong>${escape(axes)} km</strong></div>` : ''}</div>
    ${appearance.note ? `<p>${escape(localized(appearance,'note'))}</p>` : ''}
    ${appearance.ringNote ? `<p>${escape(localized(appearance,'ringNote'))}</p>` : ''}
    ${appearance.cloudNote ? `<p>${escape(localized(appearance,'cloudNote'))}</p>` : ''}
    ${appearance.shapeNote ? `<p>${escape(localized(appearance,'shapeNote'))}</p>` : ''}
    ${appearance.credit ? `<p class="appearance-credit">${t('Credit:','Crediti:')} ${escape(appearance.credit)}</p>` : ''}
    ${appearance.cloudCredit ? `<p class="appearance-credit">${t('Cloud map credit:','Crediti mappa delle nubi:')} ${escape(appearance.cloudCredit)}</p>` : ''}
    ${appearance.ringCredit ? `<p class="appearance-credit">${t('Ring map credit:','Crediti mappa degli anelli:')} ${escape(appearance.ringCredit)}</p>` : ''}
    ${link(appearance.ringSourceUrl,t('Ring map source','Fonte della mappa degli anelli'))}
    ${link(appearance.cloudSourceUrl,t('Cloud map source','Fonte della mappa delle nubi'))}
    ${link(appearance.sourceUrl,t('Appearance source','Fonte dell\u2019aspetto'))}${link(appearance.shapeSource,t('Shape measurements','Misure della forma'))}
  </section>`;
}
