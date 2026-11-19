// VizieR serves the same DR3 table as HiPS, with an explicit row and area budget.
import {parseGaiaTile} from './gaia-tile-parser.js';

const columns = ['Source', 'RA_ICRS', 'DE_ICRS', 'Gmag', 'BP-RP', 'Plx', 'e_Plx', 'RUWE', 'pmRA', 'pmDE', 'QSO', 'Gal'];
const units = ['', 'deg', 'deg', 'mag', 'mag', 'mas', 'mas', '', 'mas/yr', 'mas/yr', '', ''];
export const MAX_CONE_ROWS = 1500;
export const MAX_CONE_RADIUS_DEG = 2;

export function vizierConeUrl(view) {
  const params = new URLSearchParams({
    '-source': 'I/355/gaiadr3',
    '-c': view.raDeg + ' ' + view.decDeg,
    '-c.rd': String(view.radiusDeg),
    '-sort': 'Gmag',
    '-out': columns.join(','),
    '-out.max': String(MAX_CONE_ROWS),
    '-out.meta': 'hu',
  });
  return 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?' + params;
}

export function parseVizierCone(text) {
  if (!text.includes('#Name: I/355/gaiadr3') || !/#Coosys\s+H_2016\.000:\s+ICRS/.test(text) || /#(?:ERROR|INFO\s+Error)/i.test(text)) {
    throw new Error('Unexpected Gaia DR3 cone response.');
  }
  const lines = text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#'));
  // An empty cone can contain just the table description.
  if (!lines.length) return [];
  const observedUnits = lines[1]?.split('\t').map(unit => unit.trim());
  if (lines[0] !== columns.join('\t') || observedUnits?.join('|') !== units.join('|') || !/^[-\t]+$/.test(lines[2])) {
    throw new Error('Unexpected Gaia DR3 cone columns.');
  }
  if (lines.length - 3 > MAX_CONE_ROWS) throw new Error('Gaia cone exceeds its row limit.');
  const tileHeader = 'Source\tRAdeg\tDEdeg\tGmag\tBP-RP\tPlx\te_Plx\tRUWE\tpmRA\tpmDE\tQSO?\tGal?';
  return parseGaiaTile([tileHeader, ...lines.slice(3)].join('\n'));
}
