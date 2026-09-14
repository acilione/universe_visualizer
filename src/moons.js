import { catalog } from './data.js';
import { t, locale } from './i18n.js';

const PHYSICAL_SOURCE = 'https://ssd.jpl.nasa.gov/sats/phys_par/';
const ORBIT_SOURCE = 'https://ssd.jpl.nasa.gov/sats/elem/';

// Curated natural satellites, not a complete list of planetary moons.
// [id, English name, Italian name, mean radius km, semimajor axis km,
//  mean orbital period days (JPL P), display color, retrograde].
const records = {
  earth: [
    ['moon', 'Moon', 'Luna', 1737.4, 384400, 27.322, '#c4c4be'],
  ],
  mars: [
    ['phobos', 'Phobos', 'Fobos', 11.08, 9375, 0.3187, '#938577'],
    ['deimos', 'Deimos', 'Deimos', 6.2, 23457, 1.2625, '#b7a798'],
  ],
  jupiter: [
    ['amalthea', 'Amalthea', 'Amaltea', 83.5, 181400, 0.499918, '#a8836c'],
    ['io', 'Io', 'Io', 1821.49, 421800, 1.762732, '#dcc575'],
    ['europa', 'Europa', 'Europa', 1560.8, 671100, 3.525463, '#d8c9b3'],
    ['ganymede', 'Ganymede', 'Ganimede', 2631.2, 1070400, 7.155588, '#a69d8b'],
    ['callisto', 'Callisto', 'Callisto', 2410.3, 1882700, 16.690440, '#938c80'],
  ],
  saturn: [
    ['epimetheus', 'Epimetheus', 'Epimeteo', 58.2, 151400, 0.697012, '#b7afa0'],
    ['janus', 'Janus', 'Giano', 89.2, 151500, 0.697353, '#beb4a6'],
    ['mimas', 'Mimas', 'Mimas', 198.2, 186000, 0.942422, '#c9c7be'],
    ['enceladus', 'Enceladus', 'Encelado', 252.1, 238400, 1.370218, '#e6ecea'],
    ['tethys', 'Tethys', 'Teti', 531.1, 295000, 1.887802, '#d4d2c7'],
    ['dione', 'Dione', 'Dione', 561.4, 377700, 2.736916, '#cac9bf'],
    ['rhea', 'Rhea', 'Rea', 763.5, 527200, 4.517503, '#bfc0ba'],
    ['titan', 'Titan', 'Titano', 2574.76, 1221900, 15.945448, '#d5ab65'],
    ['hyperion', 'Hyperion', 'Iperione', 135, 1481500, 21.276658, '#b69d80'],
    ['iapetus', 'Iapetus', 'Giapeto', 734.3, 3561700, 79.331002, '#ada38f'],
    ['phoebe', 'Phoebe', 'Febe', 106.5, 12929400, 550.303910, '#878078', true],
  ],
  uranus: [
    ['miranda', 'Miranda', 'Miranda', 235.8, 129846, 1.413479, '#c6c7bd'],
    ['ariel', 'Ariel', 'Ariel', 578.9, 190929, 2.520379, '#c9c9c2'],
    ['umbriel', 'Umbriel', 'Umbriel', 584.7, 265986, 4.144177, '#96958e'],
    ['titania', 'Titania', 'Titania', 788.9, 436298, 8.705869, '#b4aba0'],
    ['oberon', 'Oberon', 'Oberon', 761.4, 583511, 13.463237, '#aba095'],
  ],
  neptune: [
    ['larissa', 'Larissa', 'Larissa', 96, 73500, 0.554989, '#999a95'],
    ['proteus', 'Proteus', 'Proteo', 208, 117600, 1.122315, '#989c98'],
    ['triton', 'Triton', 'Tritone', 1352.6, 354800, 5.876994, '#ccc2b9', true],
    ['nereid', 'Nereid', 'Nereide', 170, 5513900, 360.133039, '#a7aaa4'],
  ],
};

const positionNote = t(
  'Schematic circular orbits with compressed separations, enlarged moon sizes and illustrative phases. Orbital planes are simplified.',
  'Orbite circolari schematiche con separazioni compresse, dimensioni delle lune amplificate e fasi illustrative. Piani orbitali semplificati.',
);
const number = (value, digits = 3) => value.toLocaleString(locale(), { maximumFractionDigits: digits });
function phaseFor(id) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296 * Math.PI * 2;
}

export const solarMoons = Object.entries(records).flatMap(([parentId, moons]) => {
  const parent = catalog.solar.find(body => body.id === parentId);
  // Saturn's visible rings end at 2.32 planet radii. Reserve 2.5 radii
  // regardless of ring tilt; successive display lanes also clear adjacent moons.
  let previousRadius = parent.size * (parentId === 'saturn' ? 2.5 : 1) + 0.35;
  let previousSize = 0;
  return moons.map(([id, englishName, italianName, radiusKm, semiMajorAxisKm, periodDays, color, retrograde = false]) => {
    const size = 0.05 + 0.14 * Math.sqrt(radiusKm / 2631.2);
    const orbitRadius = previousRadius + previousSize + size + 0.1;
    previousRadius = orbitRadius;
    previousSize = size;
    const phase = phaseFor(id);
    const orbitInclinationRad = 0;
    const localPosition = [Math.cos(phase) * orbitRadius, 0, Math.sin(phase) * orbitRadius];
    const name = t(englishName, italianName);
    return {
      id, name, englishName, italianName,
      bodyKind: 'moon', isMoon: true,
      parentId, parentName: parent.name,
      type: t('Natural satellite', 'Satellite naturale'),
      radiusKm, semiMajorAxisKm, periodDays, retrograde,
      color, size, orbitRadius, orbitInclinationRad, phase,
      position: parent.position.map((coordinate, axis) => coordinate + localPosition[axis]),
      distance: t(`${number(semiMajorAxisKm)} km from ${parent.name}`, `${number(semiMajorAxisKm)} km da ${parent.name}`),
      detail: t(
        `Natural satellite of ${parent.name}. Mean radius: ${number(radiusKm)} km. Mean orbital period: ${number(periodDays, 4)} Earth days.${retrograde ? ' Retrograde orbit.' : ''}`,
        `Satellite naturale di ${parent.name}. Raggio medio: ${number(radiusKm)} km. Periodo orbitale medio: ${number(periodDays, 4)} giorni terrestri.${retrograde ? ' Orbita retrograda.' : ''}`,
      ),
      source: ORBIT_SOURCE,
      sources: [PHYSICAL_SOURCE, ORBIT_SOURCE],
      radiusSource: PHYSICAL_SOURCE,
      orbitSource: ORBIT_SOURCE,
      periodKind: 'mean-orbital',
      positionKind: 'schematic', positionNote,
    };
  });
});

const moonIndex = new Map(solarMoons.map(moon => [moon.id, moon]));
export const findMoon = id => moonIndex.get(id);
export const moonsForPlanet = parentId => solarMoons.filter(moon => moon.parentId === parentId);
export const moonCatalogMetadata = {
  moonCount: solarMoons.length,
  planetCount: Object.keys(records).length,
  complete: false,
  name: t('Selected Solar System moons', 'Lune selezionate del Sistema Solare'),
  description: t(
    `${solarMoons.length} selected natural satellites of six planets, including Earth's Moon. This is a curated selection, not a complete moon catalogue.`,
    `${solarMoons.length} satelliti naturali selezionati di sei pianeti, inclusa la Luna terrestre. Il catalogo contiene una selezione di lune.`,
  ),
  source: ORBIT_SOURCE,
  sources: [PHYSICAL_SOURCE, ORBIT_SOURCE],
  retrievedOn: '2026-09-11',
  positionNote,
};
