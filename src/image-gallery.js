import { t } from './i18n.js';
import { getOfficialImageSet } from './official-images.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const translated = (record, name) => t(record[name] || '', record[name + 'It'] || record[name] || '');
function imageRecord(record) {
  return `<figure class="archive-image" data-verified="${record.verified === true}">
    <a href="${escape(record.sourceUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escape(record.url)}" alt="${escape(translated(record, 'title'))}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>
    <figcaption><h3>${escape(translated(record, 'title'))}</h3>
      <p>${escape(record.provider)}${record.band ? ' \u00b7 ' + escape(translated(record, 'band')) : ''}</p>
      <p class="archive-image-type">${escape(translated(record, 'observationType'))}</p>
      ${record.note ? `<p>${escape(translated(record, 'note'))}</p>` : ''}
      <p class="archive-credit">${t('Credit:','Crediti:')} ${escape(translated(record, 'credit') || t('See the archive record.','Consulta la scheda di archivio.'))}</p>
      <a href="${escape(record.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('Original archive record','Scheda originale di archivio')} \u2197</a>
      ${record.licenseUrl ? `<a href="${escape(record.licenseUrl)}" target="_blank" rel="noopener noreferrer">${t('Image usage terms','Condizioni di utilizzo')} \u2197</a>` : ''}
    </figcaption></figure>`;
}
export function imageGalleryMarkup(object, {records = null, loading = false, error = ''} = {}) {
  const set = getOfficialImageSet(object);
  return `<p class="archive-introduction">${t('Observations from official astronomy archives. Image credits, wavelengths and the original records accompany each image.','Osservazioni dagli archivi astronomici ufficiali. Crediti, lunghezze d\u2019onda e schede originali accompagnano ogni immagine.')}</p>
    <div class="archive-gallery">${set.records.map(imageRecord).join('')}</div>
    ${set.records.length ? '' : `<p>${t('No verified object image is linked yet. You can search the NASA archive below.','Nessuna immagine verificata \u00e8 ancora collegata a questo oggetto. Puoi cercare nell\u2019archivio NASA qui sotto.')}</p>`}
    <div class="archive-search-actions"><button class="focus-button" data-action="search-official-images" ${loading ? 'disabled' : ''}>${t('Search NASA Image Library','Cerca nella raccolta immagini NASA')}</button><a href="${escape(set.searchUrl)}" target="_blank" rel="noopener noreferrer">${t('Open archive search','Apri ricerca in archivio')} \u2197</a></div>
    <p class="archive-search-note">${t('Search results can include artwork, diagrams or unrelated objects. Check the original record before identifying an image as an observation of this object.','I risultati possono includere illustrazioni, diagrammi o oggetti diversi. Consulta la scheda originale prima di identificare un\u2019immagine come osservazione di questo oggetto.')}</p>
    <p class="archive-status" role="status">${escape(loading ? t('Searching NASA\u2026','Ricerca NASA\u2026') : error || (records && !records.length ? t('No archive results for this query.','Nessun risultato in archivio per questa ricerca.') : ''))}</p>
    ${records?.length ? `<h3>${t('NASA SEARCH RESULTS','RISULTATI DELLA RICERCA NASA')}</h3><div class="archive-gallery archive-search-results">${records.map(imageRecord).join('')}</div>` : ''}`;
}
