import { t } from './i18n.js';

/** Accept decimal degrees and degrees/minutes/seconds without silently truncating input. */
export function parseCoordinate(value, axis) {
  const latitude = axis === 'latitude';
  if (!latitude && axis !== 'longitude') throw new TypeError(t("Invalid coordinate axis.","Asse della coordinata non valido."));
  const limit = latitude ? 90 : 180;
  const label = latitude ? t("latitude","latitudine") : t("longitude","longitudine");
  const invalid = () => new RangeError(t(`Enter a ${label} between ${-limit} and ${limit} degrees, as decimal degrees or degrees, minutes and seconds.`,`Inserisci una ${label} tra ${-limit} e ${limit} gradi, in decimale oppure in gradi, primi e secondi.`));
  let text = String(value).trim().toUpperCase().replace(/\u2212/g, '-').replace(/,/g, '.');
  let hemisphere = null;
  const prefix = text.match(/^([NSEWO])\s*/);
  const suffix = text.match(/\s*([NSEWO])$/);
  if (prefix && suffix) throw invalid();
  if (prefix) { hemisphere = prefix[1]; text = text.slice(prefix[0].length).trim(); }
  if (suffix) { hemisphere = suffix[1]; text = text.slice(0, -suffix[0].length).trim(); }
  if (hemisphere && !(latitude ? /^[NS]$/ : /^[EWO]$/).test(hemisphere)) throw invalid();
  const decimal = text.match(/^([+-]?\d+(?:\.\d+)?)\s*[\u00b0\u00ba]?$/);
  const dms = text.match(/^([+-]?\d+)\s*[\u00b0\u00ba]\s*(\d+(?:\.\d+)?)\s*['\u2032\u2019]\s*(?:(\d+(?:\.\d+)?)\s*(?:"|\u2033|\u201d|''))?$/);
  if (!decimal && !dms) throw invalid();
  let degrees = Number((decimal || dms)[1]);
  const explicitlyNegative = (decimal || dms)[1].startsWith('-');
  if (dms) {
    const minutes = Number(dms[2]);
    const seconds = Number(dms[3] || 0);
    if (minutes >= 60 || seconds >= 60 || dms[3] && !Number.isInteger(minutes)) throw invalid();
    degrees = (explicitlyNegative ? -1 : 1) * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
  }
  if (hemisphere) {
    const negative = /^[SWO]$/.test(hemisphere);
    if (explicitlyNegative && !negative) throw invalid();
    degrees = Math.abs(degrees) * (negative ? -1 : 1);
  }
  if (!Number.isFinite(degrees) || Math.abs(degrees) > limit) throw invalid();
  return degrees;
}

function dateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  return Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

/** Display the observer's wall clock in its chosen timezone, independently of the browser timezone. */
export function dateInputInZone(iso, timeZone) {
  const p = dateParts(new Date(iso), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Convert wall time to UTC, rejecting nonexistent or ambiguous daylight-saving times. */
export function zonedDateInputToIso(value, timeZone) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::00)?$/);
  if (!match) throw new RangeError(t("Enter a valid date and time.","Inserisci una data e un orario validi."));
  const [, year, month, day, hour, minute] = match.map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wallTime);
  if (year < 1900 || year > 2100 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) {
    throw new RangeError(t("Choose a valid date between 1900 and 2100.","Scegli una data valida compresa tra il 1900 e il 2100."));
  }
  const candidates = new Set();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = wallTime + delta;
    const p = dateParts(new Date(probe), timeZone);
    const offset = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - probe;
    const candidate = wallTime - offset;
    if (dateInputInZone(candidate, timeZone) === value.slice(0, 16)) candidates.add(candidate);
  }
  if (!candidates.size) throw new RangeError(t("This local time does not exist during the daylight-saving transition. Choose another time.","Questo orario non esiste nel fuso scelto durante il passaggio all’ora legale. Scegli un altro orario."));
  if (candidates.size > 1) throw new RangeError(t("This local time occurs twice during the daylight-saving transition. Select UTC to specify the exact instant.","Questo orario si ripete al cambio dell’ora. Seleziona UTC per indicare l’istante preciso."));
  return new Date([...candidates][0]).toISOString();
}
