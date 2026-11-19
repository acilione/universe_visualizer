import { GAIA_DR3_HIPS } from './gaia-manifest.js';
const optionalNumber = value => value == null || value.trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const optionalFlag = value => value === '1' ? true : value === '0' ? false : null;
/** Parse only the fields used by this application. Never round a source ID. */
export function parseGaiaTile(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#'));
  if (!lines.length) return [];
  const columns = lines.shift().split('\t'), indexes = new Map(columns.map((name, index) => [name.trim(), index]));
  for (const name of ['Source', 'RAdeg', 'DEdeg', 'Gmag']) if (!indexes.has(name)) throw new Error(`Gaia tile is missing ${name}.`);
  if (lines.length > 100000) throw new Error('Gaia tile contains too many rows.');
  const result = [], seen = new Map();
  for (const line of lines) {
    const cells = line.split('\t'); if (cells.length !== columns.length) throw new Error('Incomplete Gaia TSV row.');
    const value = name => cells[indexes.get(name)]?.trim();
    const number = name => optionalNumber(value(name));
    const sourceId = value('Source');
    if (!/^[1-9][0-9]{0,18}$/.test(sourceId || '') || BigInt(sourceId) > 9223372036854775807n) throw new Error('Invalid Gaia source identifier.');
    const raDeg = number('RAdeg'), decDeg = number('DEdeg');
    if (raDeg == null || raDeg < 0 || raDeg >= 360 || decDeg == null || Math.abs(decDeg) > 90) throw new Error('Invalid Gaia source coordinates.');
    const ra2000 = number('RAJ2000'), dec2000 = number('DEJ2000');
    const valid2000 = ra2000 != null && ra2000 >= 0 && ra2000 < 360 && dec2000 != null && Math.abs(dec2000) <= 90;
    const hip = number('HIP'), neighbours = number('nHIP'), flag = number('f_HIP');
    const row = { sourceId, raDeg, decDeg, refEpoch: GAIA_DR3_HIPS.referenceEpoch,
      raJ2000Deg: valid2000 ? ra2000 : null, decJ2000Deg: valid2000 ? dec2000 : null,
      gMag: number('Gmag'), bpMag: number('BPmag'), rpMag: number('RPmag'), bpRp: number('BP-RP'),
      parallaxMas: number('Plx'), parallaxErrorMas: number('e_Plx'), pmRaMasYr: number('pmRA'), pmDecMasYr: number('pmDE'),
      ruwe: number('RUWE'), duplicatedSource: optionalFlag(value('Dup')), inQsoCandidates: optionalFlag(value('QSO?')), inGalaxyCandidates: optionalFlag(value('Gal?')),
      // These are reported links, NOT an approved merge with NASA identities.
      // CDS ReadMe gives dHIP in arcsec; metadata.xml incorrectly labels it mas.
      hipMatches: Number.isInteger(hip) && hip > 0 ? [{ hip, angularDistanceArcsec: number('dHIP'), numberOfNeighbours: Number.isInteger(neighbours) ? neighbours : null, xmFlag: Number.isInteger(flag) ? flag : null }] : [],
    };
    const old = seen.get(sourceId);
    if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new Error('Conflicting measurements for one Gaia source identifier.');
    if (!old) { seen.set(sourceId, row); result.push(row); }
  }
  return result;
}
