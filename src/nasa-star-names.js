// Display-name expansion only. All measurements stay in the NASA snapshots.
// Sources for the designation grammar and common-name aliases are listed below.
export const starNameSources = Object.freeze({
  designations: 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html',
  constellationGenitives: 'https://ntrs.nasa.gov/citations/19760010919',
  brightStarAliases: 'https://ntrs.nasa.gov/citations/19740019266',
  pegasusAliases: 'https://imagine.gsfc.nasa.gov/ask_astro/night_sky.html',
  lyraAliases: 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-57/',
  deneb: 'https://apod.nasa.gov/apod/ap210819.html',
  sadr: 'https://apod.nasa.gov/apod/ap121130.html',
  rigel: 'https://imagine.gsfc.nasa.gov/ask_astro/stars.html',
});

const GENITIVES = Object.freeze({
  And: 'Andromedae', Ant: 'Antliae', Aps: 'Apodis', Aqr: 'Aquarii', Aql: 'Aquilae',
  Ara: 'Arae', Ari: 'Arietis', Aur: 'Aurigae', Boo: 'Bootis', Cae: 'Caeli',
  Cam: 'Camelopardalis', Cnc: 'Cancri', CVn: 'Canum Venaticorum', CMa: 'Canis Majoris',
  CMi: 'Canis Minoris', Cap: 'Capricorni', Car: 'Carinae', Cas: 'Cassiopeiae',
  Cen: 'Centauri', Cep: 'Cephei', Cet: 'Ceti', Cha: 'Chamaeleontis', Cir: 'Circini',
  Col: 'Columbae', Com: 'Comae Berenices', CrA: 'Coronae Australis', CrB: 'Coronae Borealis',
  Crv: 'Corvi', Crt: 'Crateris', Cru: 'Crucis', Cyg: 'Cygni', Del: 'Delphini',
  Dor: 'Doradus', Dra: 'Draconis', Equ: 'Equulei', Eri: 'Eridani', For: 'Fornacis',
  Gem: 'Geminorum', Gru: 'Gruis', Her: 'Herculis', Hor: 'Horologii', Hya: 'Hydrae',
  Hyi: 'Hydri', Ind: 'Indi', Lac: 'Lacertae', Leo: 'Leonis', LMi: 'Leonis Minoris',
  Lep: 'Leporis', Lib: 'Librae', Lup: 'Lupi', Lyn: 'Lyncis', Lyr: 'Lyrae',
  Men: 'Mensae', Mic: 'Microscopii', Mon: 'Monocerotis', Mus: 'Muscae', Nor: 'Normae',
  Oct: 'Octantis', Oph: 'Ophiuchi', Ori: 'Orionis', Pav: 'Pavonis', Peg: 'Pegasi',
  Per: 'Persei', Phe: 'Phoenicis', Pic: 'Pictoris', Psc: 'Piscium', PsA: 'Piscis Austrini',
  Pup: 'Puppis', Pyx: 'Pyxidis', Ret: 'Reticuli', Sge: 'Sagittae', Sgr: 'Sagittarii',
  Sco: 'Scorpii', Scl: 'Sculptoris', Sct: 'Scuti', Ser: 'Serpentis', Sex: 'Sextantis',
  Tau: 'Tauri', Tel: 'Telescopii', Tri: 'Trianguli', TrA: 'Trianguli Australis',
  Tuc: 'Tucanae', UMa: 'Ursae Majoris', UMi: 'Ursae Minoris', Vel: 'Velorum',
  Vir: 'Virginis', Vol: 'Volantis', Vul: 'Vulpeculae',
});

const GREEK = Object.freeze({
  Alp: ['Alpha', '\u03b1'], Bet: ['Beta', '\u03b2'], Gam: ['Gamma', '\u03b3'],
  Del: ['Delta', '\u03b4'], Eps: ['Epsilon', '\u03b5'], Zet: ['Zeta', '\u03b6'],
  Eta: ['Eta', '\u03b7'], The: ['Theta', '\u03b8'], Iot: ['Iota', '\u03b9'],
  Kap: ['Kappa', '\u03ba'], Lam: ['Lambda', '\u03bb'], Mu: ['Mu', '\u03bc'],
  Nu: ['Nu', '\u03bd'], Xi: ['Xi', '\u03be'], Omi: ['Omicron', '\u03bf'],
  Pi: ['Pi', '\u03c0'], Rho: ['Rho', '\u03c1'], Sig: ['Sigma', '\u03c3'],
  Tau: ['Tau', '\u03c4'], Ups: ['Upsilon', '\u03c5'], Phi: ['Phi', '\u03c6'],
  Chi: ['Chi', '\u03c7'], Psi: ['Psi', '\u03c8'], Ome: ['Omega', '\u03c9'],
});

// HR IDs are the stable row identifiers of the NASA BSC5P snapshot. A name is
// an additional search/display alias, never a substitute for a catalog ID.
const COMMON_NAMES = Object.freeze({
  337: 'Mirach', 472: 'Achernar', 681: 'Mira', 1457: 'Aldebaran',
  1708: 'Capella', 1713: 'Rigel', 2061: 'Betelgeuse', 2326: 'Canopus',
  2491: 'Sirius', 2943: 'Procyon', 2990: 'Pollux', 4730: 'Acrux',
  4763: 'Gacrux', 5267: 'Hadar', 5340: 'Arcturus', 5459: 'Rigil Kentaurus',
  6134: 'Antares', 6217: 'Atria', 7001: 'Vega', 7106: 'Sheliak',
  7178: 'Sulafat', 7557: 'Altair', 7796: 'Sadr', 7924: 'Deneb',
  39: 'Algenib', 8308: 'Enif', 8450: 'Baham', 8634: 'Homam',
  8650: 'Matar', 8775: 'Scheat', 8781: 'Markab',
});

/** Expand the NASA Bayer/Flamsteed designation without guessing a star ID.
 * Accepts a row expanded from snapshot.columns. HIP-only rows remain HIP IDs;
 * callers can supply BSC hr/designation after a verified crossmatch.
 */
export function starNames(row) {
  const raw = typeof row.designation === 'string' ? row.designation.trim() : '';
  const constellation = raw.slice(-3);
  const genitive = GENITIVES[constellation];
  const prefix = genitive ? raw.slice(0, -3).replace(/\s+/g, '') : '';
  const parts = /^(\d*)([A-Za-z]*)(\d*)$/.exec(prefix);
  const aliases = [];
  let expanded = '';
  if (parts && genitive) {
    const [, flamsteed, letter, component] = parts;
    const greek = GREEK[letter];
    if (letter) {
      const label = `${greek?.[0] || letter}${component ? ` ${component}` : ''}`;
      expanded = `${label} ${genitive}`;
      aliases.push(expanded, `${label} ${constellation}`);
      if (component) aliases.push(`${greek?.[0] || letter}${component} ${genitive}`);
      if (greek) aliases.push(`${greek[1]}${component} ${genitive}`, `${greek[1]}${component} ${constellation}`);
    }
    if (flamsteed) {
      aliases.push(`${flamsteed} ${genitive}`, `${flamsteed} ${constellation}`);
      if (!expanded) expanded = `${flamsteed} ${genitive}`;
    }
  }
  const common = COMMON_NAMES[row.hr];
  const fallback = row.hip ? `HIP ${row.hip}` : row.hr ? `HR ${row.hr}` : row.hd ? `HD ${row.hd}` : raw;
  const name = common || expanded || raw || fallback;
  aliases.push(name, raw);
  for (const [key, prefixLabel] of [['hr', 'HR'], ['hd', 'HD'], ['hip', 'HIP'], ['sao', 'SAO']]) {
    if (Number.isInteger(row[key]) && row[key] > 0) aliases.push(`${prefixLabel} ${row[key]}`, `${prefixLabel}${row[key]}`);
  }
  if (typeof row.variableId === 'string' && row.variableId.trim()) aliases.push(row.variableId.trim());
  // Accept the spelling used in the initial request, while keeping canonical Cygni.
  if (row.hr === 8252) aliases.push('Rho Cigny');
  return { name, englishName: name, italianName: name, aliases: [...new Set(aliases.filter(Boolean))], constellation: genitive ? constellation : null };
}
