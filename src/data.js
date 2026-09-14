import { t, locale } from './i18n.js';
import nearbyStars from './nearby-stars.json' with { type: 'json' };
export const sources = {
  solar: 'https://science.nasa.gov/solar-system/planet-sizes-and-locations-in-our-solar-system/',
  galaxy: 'https://science.nasa.gov/universe/galaxies/',
  proxima: 'https://science.nasa.gov/asset/hubble/proxima-centauri/',
  andromeda: 'https://science.nasa.gov/asset/hubble/compass-and-scale-image-of-andromeda/',
  universe: 'https://science.nasa.gov/exoplanets/what-is-the-universe/',
  simbad: 'https://simbad.cds.unistra.fr/simbad/',
  sagittarius: 'https://science.nasa.gov/universe/black-holes/types/',
  orion: 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-42/',
  triangulum: 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-33/',
  laniakea: 'https://arxiv.org/abs/1409.0880',
  virgo: 'https://science.nasa.gov/missions/hubble/globular-clusters-tell-tale-of-star-formation-in-nearby-galaxy-metropolis/',
  coma: 'https://science.nasa.gov/missions/hubble/an-island-universe-in-the-coma-cluster/',
};
export const scales = [
  { id:'solar', name:t("Solar System", "Sistema Solare"), short:t("Solar System", "Sistema Solare"), extent:t("60 AU", "60 UA"), unit:t("astronomical units", "unità astronomiche"), title:t("Solar System", "Sistema Solare"), subtitle:t("The Sun, eight planets and major moons · schematic orbital distances.", "Il Sole, otto pianeti e satelliti principali · distanze orbitali schematiche."), count:'8', metric:t("PLANETS", "PIANETI"), description:t("The Sun, its eight planets and selected major moons. Orbital distances are compressed and body sizes are enlarged for visibility.", "Il Sole, gli otto pianeti e una selezione dei satelliti principali. Distanze orbitali compresse e dimensioni dei corpi amplificate per la visibilità."), source:sources.solar },
  { id:'stars', name:t("Stellar neighborhood", "Vicino stellare"), short:t("Nearby stars", "Stelle vicine"), extent:t("50 ly", "50 a.l."), unit:t("light-years", "anni luce"), title:t("Stellar neighborhood", "Vicino stellare"), subtitle:t("Nearby stars · J2000 coordinates and catalog distances.", "Stelle vicine · coordinate J2000 e distanze di catalogo."), count:t("4.24", "4,24"), metric:t("LY TO PROXIMA", "A.L. A PROXIMA"), description:t("Selected nearby stars. Catalog markers use rounded J2000 right ascension and declination, with approximate distances. Proper motion is not simulated; other particles are illustrative.", "Una selezione delle stelle vicine e più riconoscibili. I marcatori del catalogo usano ascensione retta e declinazione J2000 arrotondate, con distanze approssimate. Il moto proprio non è simulato; le altre particelle sono illustrative."), source:sources.proxima },
  { id:'galaxy', name:t("Milky Way", "Via Lattea"), short:t("Milky Way", "Via Lattea"), extent:t("100,000 ly", "100.000 a.l."), unit:t("light-years", "anni luce"), title:t("Milky Way", "Via Lattea"), subtitle:t("Barred spiral galaxy · approximate diameter: 100,000 light-years.", "Galassia a spirale barrata · diametro approssimato: 100.000 anni luce."), count:'100–400', metric:t("BILLION STARS", "MILIARDI DI STELLE"), description:t("The Milky Way is a barred spiral galaxy. The Solar System lies in the Orion Spur, approximately 26,000 light-years from the center. The arms, particles and marker positions form an illustrative reconstruction.", "La Via Lattea è una galassia a spirale barrata. Il nostro Sistema Solare si trova nello Sperone di Orione, a circa 26.000 anni luce dal centro. Bracci, particelle e posizioni dei marcatori sono una ricostruzione illustrativa."), source:sources.galaxy },
  { id:'local', name:t("Local Group", "Gruppo Locale"), short:t("Local Group", "Gruppo Locale"), extent:t("10 million ly", "10 mln a.l."), unit:t("million light-years", "milioni di anni luce"), title:t("Local Group", "Gruppo Locale"), subtitle:t("Nearby galaxies · distances measured from the Solar System.", "Galassie vicine · distanze misurate dal Sistema Solare."), count:'50+', metric:t("GALAXIES IN THE GROUP", "GALASSIE NEL GRUPPO"), description:t("The Local Group includes the Milky Way, Andromeda, Triangulum and numerous dwarf galaxies. Selected galaxies are shown at approximate distances and equatorial directions from the Solar System, the reference origin within the Milky Way. Galaxy sizes are enlarged.", "Il Gruppo Locale comprende la Via Lattea, Andromeda, la galassia del Triangolo e numerose galassie nane. Qui trovi una selezione con distanze e direzioni equatoriali approssimate, viste dal Sistema Solare, usato come origine nella Via Lattea. Le dimensioni sono amplificate."), source:sources.galaxy },
  { id:'cosmic', name:t("Observable universe", "Universo osservabile"), short:t("Cosmic web", "Rete cosmica"), extent:t("≈ 93 billion ly", "≈ 93 mld a.l."), unit:t("billion light-years", "miliardi di anni luce"), title:t("Observable universe", "Universo osservabile"), subtitle:t("Large-scale structure · conceptual model of the cosmic web.", "Struttura a grande scala · modello concettuale della rete cosmica."), count:t("13.8", "13,8"), metric:t("BILLION YEARS", "MILIARDI DI ANNI"), description:t("A conceptual visualization of the cosmic web in the observable universe. Procedurally generated filaments do not represent an observational catalog or measured positions. Selectable references are real structures placed schematically.", "Una visualizzazione concettuale della rete cosmica nell’universo osservabile. I filamenti sono generati proceduralmente: non costituiscono un catalogo osservativo o una mappa di posizioni misurate. I riferimenti selezionabili sono strutture reali, collocate schematicamente."), source:sources.universe },
];
// Equatorial J2000 directions in degrees, Y-up scene: RA 0 -> +X, RA 90 -> -Z.
// distance and factor are reciprocal units: stars use ly and units/ly; local uses Mly and units/Mly.
export function equatorial(ra, dec, distance, factor=1) {
  const a=ra*Math.PI/180, d=dec*Math.PI/180;
  return [Math.cos(d)*Math.cos(a)*distance*factor, Math.sin(d)*distance*factor, -Math.cos(d)*Math.sin(a)*distance*factor];
}
const object=(id,name,type,position,distance,detail,color='#ecc589',extra={})=>({id,name,type,position,distance,detail,color,...extra});
const planets=[['mercury',t("Mercury", "Mercurio"),.39,'#ac9d88'],['venus',t("Venus", "Venere"),.72,'#d5b97d'],['earth',t("Earth", "Terra"),1,'#81c4cc'],['mars',t("Mars", "Marte"),1.52,'#d58462'],['jupiter',t("Jupiter", "Giove"),5.2,'#d3a377'],['saturn',t("Saturn", "Saturno"),9.58,'#e9ce92'],['uranus',t("Uranus", "Urano"),19.2,'#96d6d7'],['neptune',t("Neptune", "Nettuno"),30.05,'#658ecc']];
export const catalog = {
  solar:[object('sun',t("Sun", "Sole"),t("Star", "Stella"),[0,0,0],t("0 AU from the Sun", "0 UA dal Sole"),t("The star at the center of the Solar System. Its light takes approximately 8 minutes to reach Earth.", "La stella al centro del nostro sistema. La sua luce impiega circa 8 minuti per raggiungere la Terra."),'#ffd99a',{size:1.25}),...planets.map(([id,name,au,color],i)=>{const r=3.2+i*2.25,a=.55+i*2.28;return object(id,name,i<4?t("Terrestrial planet", "Pianeta roccioso"):i<6?t("Gas giant", "Gigante gassoso"):t("Ice giant", "Gigante ghiacciato"),[Math.cos(a)*r,0,Math.sin(a)*r],t(`${au.toLocaleString(locale())} AU from the Sun`, `${au.toLocaleString(locale())} UA dal Sole`),t(`${name} is the ${['first','second','third','fourth','fifth','sixth','seventh','eighth'][i]} planet in the Solar System. The distance approximates the orbital semimajor axis. Circular orbits and orbital phases are illustrative.`, `${name} è il ${['primo','secondo','terzo','quarto','quinto','sesto','settimo','ottavo'][i]} pianeta del Sistema Solare. La distanza indicata approssima il semiasse maggiore orbitale. Orbite circolari e fasi sono illustrative.`),color,{size:i<4?.27:.6,orbit:r})})],
  stars:[object('sol',t("Sun", "Sole"),t("Reference star", "Stella di riferimento"),[0,0,0],t("0 ly", "0 a.l."),t("The Sun is the origin of this heliocentric reference frame.", "Il Sole è l’origine di questo sistema di riferimento eliocentrico."),'#ffe2a8',{targetScale:0}),...[
    ['proxima','Proxima Centauri',217.43,-62.68,4.24,t("Red dwarf", "Nana rossa"),t("The closest star to the Sun, part of the Alpha Centauri system.", "La stella più vicina al Sole, parte del sistema di Alfa Centauri."),'#dd9174'],
    ['alpha',t("Alpha Centauri A/B", "Alfa Centauri A/B"),219.90,-60.83,4.37,t("Binary system", "Sistema binario"),t("A pair of stars in the nearest stellar system to the Sun.", "Una coppia di stelle nel sistema stellare più vicino al nostro."),'#f1d391'],
    ['barnard',t("Barnard’s Star", "Stella di Barnard"),269.45,4.69,5.96,t("Red dwarf", "Nana rossa"),t("A red dwarf with a high proper motion across the sky.", "Una piccola stella dalla notevole velocità apparente nel cielo."),'#cd866c'],
    ['sirius',t("Sirius", "Sirio"),101.29,-16.72,8.60,t("Binary system", "Sistema binario"),t("The brightest star in the night sky, with a white dwarf companion.", "La stella più luminosa del cielo notturno, accompagnata da una nana bianca."),'#a9dce9'],
    ['epsilon','Epsilon Eridani',53.23,-9.46,10.47,t("Star", "Stella"),t("A nearby young star, smaller and cooler than the Sun.", "Una giovane stella vicina, più piccola e fredda del Sole."),'#e6bd7c'],
    ['procyon',t("Procyon", "Procione"),114.83,5.22,11.46,t("Binary system", "Sistema binario"),t("A bright star in the constellation Canis Minor.", "Una stella luminosa della costellazione del Cane Minore."),'#ece7d9'],
    ['tau','Tau Ceti',26.02,-15.94,11.91,t("Star", "Stella"),t("A Sun-like star in the constellation Cetus.", "Una stella simile al Sole nella costellazione della Balena."),'#e8c590'],
    ['vega','Vega',279.23,38.78,25.04,t("Star", "Stella"),t("A blue-white star in the constellation Lyra.", "Una stella bianco-azzurra nella costellazione della Lira."),'#a7d4f1'],
  ].map(([id,n,ra,dec,d,type,info,c])=>object(id,n,type,equatorial(ra,dec,d,.7),t(`${d.toLocaleString(locale())} ly from the Sun`, `${d.toLocaleString(locale())} a.l. dal Sole`),info,c,{raDeg:ra,decDeg:dec,distanceLy:d,sceneUnitsPerLy:.7}))],
  galaxy:[object('milkyway',t("Milky Way", "Via Lattea"),t("Barred spiral galaxy", "Galassia a spirale barrata"),[0,0,0],t("≈ 100,000 ly in diameter", "≈ 100.000 a.l. di diametro"),scales[2].description,'#f5d298',{size:.45}),object('solar-system',t("Solar System", "Sistema Solare"),t("Orion Spur", "Sperone di Orione"),[8.4,.15,5.8],t("≈ 26,000 ly from the center", "≈ 26.000 a.l. dal centro"),t("The Sun and its planets orbit the center of the Milky Way. One orbit takes approximately 240 million years.", "Il Sole e i pianeti orbitano intorno al centro della Via Lattea. Un’orbita richiede circa 240 milioni di anni."),'#a4e5e0',{targetScale:0}),object('sagittarius','Sagittarius A*',t("Supermassive black hole", "Buco nero supermassiccio"),[.3,.15,.2],t("≈ 26,000 ly from the Sun", "≈ 26.000 a.l. dal Sole"),t("The supermassive black hole at the center of the Milky Way, with approximately four million solar masses.", "Il buco nero supermassiccio al centro della nostra galassia. Contiene circa quattro milioni di masse solari."),'#f7bc72'),object('orion',t("Orion Nebula", "Nebulosa di Orione"),t("Star-forming region", "Regione di formazione stellare"),[9.1,.3,6.2],t("≈ 1,300 ly from the Sun", "≈ 1.300 a.l. dal Sole"),t("A large cloud of gas and dust where stars are forming. Its map position is schematic.", "Una vasta nube di gas e polveri in cui nascono nuove stelle. La posizione sulla mappa è schematica."),'#97bbd6')],
  local:[object('local-milkyway',t("Milky Way", "Via Lattea"),t("Reference galaxy", "Galassia di riferimento"),[0,0,0],t("Origin: Solar System", "Origine: Sistema Solare"),t("The Solar System is the origin of the Local Group reference frame. Galaxy sizes are enlarged for visibility.", "Il nostro punto di riferimento nella Via Lattea per il Gruppo Locale. Le dimensioni delle galassie sono amplificate per renderle visibili."),'#edc88f',{targetScale:2,size:.6}),object('andromeda','Andromeda · M31',t("Spiral galaxy", "Galassia a spirale"),equatorial(10.685,41.269,2.5,6),t("≈ 2.5 million ly", "≈ 2,5 milioni a.l."),t("The nearest large spiral galaxy to the Milky Way and one of the dominant members of the Local Group.", "La grande galassia a spirale più vicina alla Via Lattea. È uno dei membri dominanti del Gruppo Locale."),'#c5d4db',{size:1}),object('triangulum',t("Triangulum · M33", "Triangolo · M33"),t("Spiral galaxy", "Galassia a spirale"),equatorial(23.46,30.66,3,6),t("≈ 3 million ly", "≈ 3 milioni a.l."),t("A Local Group spiral galaxy, smaller than Andromeda and the Milky Way.", "Una galassia a spirale del Gruppo Locale, più piccola di Andromeda e della Via Lattea."),'#c0cbd6',{size:.5}),object('lmc',t("Large Magellanic Cloud", "Grande Nube di Magellano"),t("Satellite galaxy", "Galassia satellite"),equatorial(80.89,-69.76,.163,6),t("≈ 163,000 ly", "≈ 163.000 a.l."),t("A satellite galaxy of the Milky Way, primarily visible from the Southern Hemisphere.", "Una galassia satellite della Via Lattea, visibile soprattutto dall’emisfero australe."),'#cfac84',{size:.15}),object('smc',t("Small Magellanic Cloud", "Piccola Nube di Magellano"),t("Satellite galaxy", "Galassia satellite"),equatorial(13.19,-72.83,.2,6),t("≈ 200,000 ly", "≈ 200.000 a.l."),t("A small irregular galaxy near the Large Magellanic Cloud.", "Una piccola galassia irregolare vicina alla Grande Nube di Magellano."),'#b9cbd5',{size:.12})],
  cosmic:[object('laniakea','Laniakea',t("Supercluster", "Superammasso"),[-4,1,3],t("≈ 520 million ly across", "≈ 520 milioni a.l. di estensione"),t("The large galactic flow region that includes the Milky Way. The marker is a schematic reference.", "La vasta regione di flussi galattici che comprende la Via Lattea. Il marcatore è un riferimento schematico."),'#edd39f',{targetScale:3}),object('virgo',t("Virgo Cluster", "Ammasso della Vergine"),t("Galaxy cluster", "Ammasso di galassie"),[6,3,-3],t("≈ 54 million ly from Earth", "≈ 54 milioni a.l. dalla Terra"),t("A large galaxy cluster relatively close to the Local Group. Its map position is schematic.", "Un grande ammasso di galassie relativamente vicino al Gruppo Locale. La posizione qui è schematica."),'#b3d7df'),object('coma',t("Coma Cluster", "Ammasso della Chioma"),t("Galaxy cluster", "Ammasso di galassie"),[-10,-2,-9],t("≈ 320 million ly from Earth", "≈ 320 milioni a.l. dalla Terra"),t("A rich galaxy cluster in the constellation Coma Berenices. Its map position is schematic.", "Un ricco ammasso di galassie nella costellazione della Chioma di Berenice. La posizione qui è schematica."),'#dbb6ab')],
};
// Provenance is kept alongside the objects so cards and future catalog importers can
// distinguish observed directions from illustration. These are curated approximations,
// not live ephemerides or a complete survey of the observable universe.
const simbadObject = identifier => `${sources.simbad}sim-id?Ident=${encodeURIComponent(identifier)}`;
const objectSources = {
  sun: 'https://science.nasa.gov/sun/',
  sol: 'https://science.nasa.gov/sun/',
  proxima: sources.proxima,
  alpha: simbadObject('alf Cen'),
  barnard: simbadObject('Barnard star'),
  sirius: simbadObject('Sirius'),
  epsilon: simbadObject('eps Eri'),
  procyon: simbadObject('Procyon'),
  tau: simbadObject('tau Cet'),
  vega: simbadObject('Vega'),
  'solar-system': 'https://science.nasa.gov/solar-system/facts/',
  sagittarius: sources.sagittarius,
  orion: sources.orion,
  andromeda: sources.andromeda,
  triangulum: sources.triangulum,
  lmc: simbadObject('LMC'),
  smc: simbadObject('SMC'),
  laniakea: sources.laniakea,
  virgo: sources.virgo,
  coma: sources.coma,
};
const positionNotes = {
  solar: t("Illustrative orbits and phases; compressed distances and enlarged sizes.", "Orbite e fasi illustrative; distanze compresse e dimensioni amplificate."),
  stars: t("Approximate J2000 direction and distance; enlarged sizes.", "Direzione J2000 e distanza approssimate; dimensioni amplificate."),
  galaxy: t("Schematic position in the Milky Way reconstruction.", "Posizione schematica nella ricostruzione della Via Lattea."),
  local: t("Approximate equatorial direction and distance from the Solar System; enlarged sizes.", "Direzione equatoriale e distanza approssimate dal Sistema Solare; dimensioni amplificate."),
  cosmic: t("Schematic position; the particle network is a conceptual visualization.", "Posizione schematica; la rete di particelle è una visualizzazione concettuale."),
};
for (const scale of scales) {
  scale.positionNote = positionNotes[scale.id];
  for (const entry of catalog[scale.id]) {
    entry.source = objectSources[entry.id] ?? (scale.id === 'solar'
      ? `https://science.nasa.gov/${entry.id}/facts/`
      : scale.source);
    entry.positionKind = ['stars', 'local'].includes(scale.id) ? 'approximate-equatorial' : 'schematic';
    entry.positionNote = scale.positionNote;
    if (['sun', 'sol', 'local-milkyway'].includes(entry.id)) {
      entry.positionKind = 'reference';
      entry.positionNote = t("Origin of this view’s reference frame.", "Origine del sistema di riferimento di questa vista.");
    }
  }
}
export function seededRandom(seed=42){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}


// HYG v4.1 subset: David Nash, CC BY-SA 4.0. See DATA_SOURCES.md.
// These are measured catalog entries; decorative sky particles are separate.
for (const star of nearbyStars) {
  const spectral=star.spectralType?.[0];
  const tint={M:'#d9957b',K:'#e7ba88',G:'#e8d2a5',F:'#eae4d1',A:'#bfd9ed',B:'#a5c5ec',O:'#99b9ed'}[spectral] || '#c9d7dd';
  catalog.stars.push(object(star.id,star.name,t("Star · HYG 4.1", "Stella · HYG 4.1"),equatorial(star.raDeg,star.decDeg,star.distanceLy,.7),
    t(`≈ ${star.distanceLy.toLocaleString(locale(),{maximumFractionDigits:2})} ly from the Sun`, `≈ ${star.distanceLy.toLocaleString(locale(),{maximumFractionDigits:2})} a.l. dal Sole`),
    t(`HYG 4.1 catalog star (${star.sourceId}). Equatorial J2000 direction and catalog distance.${star.spectralType?' Spectral type: '+star.spectralType+'.':''} Display brightness is increased for visibility.`, `Stella del catalogo HYG 4.1 (${star.sourceId}). Direzione equatoriale J2000 e distanza da catalogo.${star.spectralType?' Tipo spettrale: '+star.spectralType+'.':''} La luminosità nella mappa è amplificata per renderla visibile.`),tint,
    {raDeg:star.raDeg,decDeg:star.decDeg,distanceLy:star.distanceLy,sceneUnitsPerLy:.7,mag:star.mag,measured:true,source:star.source,positionKind:'approximate-equatorial',positionNote:scales[1].positionNote}));
}
scales[1].description=t(`This view includes ${nearbyStars.length} HYG 4.1 catalog stars within 25 light-years of the Sun, plus selected reference stars. Equatorial J2000 coordinates and catalog distances; sizes and brightness are increased. The catalog is not complete.`, `La vista include ${nearbyStars.length} stelle dal catalogo HYG 4.1 entro 25 anni luce dal Sole, oltre ai riferimenti principali. Coordinate equatoriali J2000 e distanze di catalogo; dimensioni e luminosità sono amplificate. Il catalogo non è completo.`);

const displayRadii={mercury:.38,venus:.50,earth:.53,mars:.42,jupiter:1.05,saturn:.95,uranus:.78,neptune:.76};
for(const planet of catalog.solar){if(displayRadii[planet.id]){planet.size=displayRadii[planet.id];planet.bodyKind='planet';planet.isPlanet=true;}else planet.bodyKind='star';}

const objectNameAliases = {
  sun:['Sun','Sole'], sol:['Sun','Sole'], mercury:['Mercury','Mercurio'], venus:['Venus','Venere'], earth:['Earth','Terra'], mars:['Mars','Marte'], jupiter:['Jupiter','Giove'], saturn:['Saturn','Saturno'], uranus:['Uranus','Urano'], neptune:['Neptune','Nettuno'],
  alpha:['Alpha Centauri A/B','Alfa Centauri A/B'], barnard:["Barnard’s Star",'Stella di Barnard'], sirius:['Sirius','Sirio'], procyon:['Procyon','Procione'], milkyway:['Milky Way','Via Lattea'], 'solar-system':['Solar System','Sistema Solare'], orion:['Orion Nebula','Nebulosa di Orione'], 'local-milkyway':['Milky Way','Via Lattea'], triangulum:['Triangulum · M33','Triangolo · M33'], lmc:['Large Magellanic Cloud','Grande Nube di Magellano'], smc:['Small Magellanic Cloud','Piccola Nube di Magellano'], virgo:['Virgo Cluster','Ammasso della Vergine'], coma:['Coma Cluster','Ammasso della Chioma'],
};
for (const entries of Object.values(catalog)) for (const entry of entries) {
  [entry.englishName, entry.italianName] = objectNameAliases[entry.id] || [entry.name, entry.name];
}
