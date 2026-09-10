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
  { id:'solar', name:'Sistema Solare', short:'Sistema Solare', extent:'60 UA', unit:'unità astronomiche', title:'Dove tutto ha inizio.', subtitle:'Otto mondi. Una stella. La nostra casa.', count:'8', metric:'PIANETI', description:'Il Sole e gli otto pianeti che gli orbitano intorno. Le distanze orbitali sono compresse per rendere visibili anche i mondi più vicini alla nostra stella.', source:sources.solar },
  { id:'stars', name:'Vicino stellare', short:'Stelle vicine', extent:'50 a.l.', unit:'anni luce', title:'Al di là del Sole.', subtitle:'Le stelle più vicine, in un oceano di possibilità.', count:'4,24', metric:'A.L. A PROXIMA', description:'Una selezione delle stelle vicine e più riconoscibili. I marcatori del catalogo usano ascensione retta e declinazione J2000 arrotondate, con distanze approssimate. Il moto proprio non è simulato; le altre particelle sono illustrative.', source:sources.proxima },
  { id:'galaxy', name:'Via Lattea', short:'Via Lattea', extent:'100.000 a.l.', unit:'anni luce', title:'Ogni punto, una possibilità.', subtitle:'La nostra galassia. Un piccolo frammento dell’infinito.', count:'100–400', metric:'MILIARDI DI STELLE', description:'La Via Lattea è una galassia a spirale barrata. Il nostro Sistema Solare si trova nello Sperone di Orione, a circa 26.000 anni luce dal centro. Bracci, particelle e posizioni dei marcatori sono una ricostruzione illustrativa.', source:sources.galaxy },
  { id:'local', name:'Gruppo Locale', short:'Gruppo Locale', extent:'10 mln a.l.', unit:'milioni di anni luce', title:'Un arcipelago di galassie.', subtitle:'La Via Lattea e le sue vicine, legate dalla gravità.', count:'50+', metric:'GALASSIE NEL GRUPPO', description:'Il Gruppo Locale comprende la Via Lattea, Andromeda, la galassia del Triangolo e numerose galassie nane. Qui trovi una selezione con distanze e direzioni equatoriali approssimate, viste dal Sistema Solare, usato come origine nella Via Lattea. Le dimensioni sono amplificate.', source:sources.galaxy },
  { id:'cosmic', name:'Universo osservabile', short:'Rete cosmica', extent:'≈ 93 mld a.l.', unit:'miliardi di anni luce', title:'L’universo, senza confini visibili.', subtitle:'Filamenti, ammassi e grandi vuoti: la trama del cosmo.', count:'13,8', metric:'MILIARDI DI ANNI', description:'Una visualizzazione concettuale della rete cosmica nell’universo osservabile. I filamenti sono generati proceduralmente: non costituiscono un catalogo osservativo o una mappa di posizioni misurate. I riferimenti selezionabili sono strutture reali, collocate schematicamente.', source:sources.universe },
];
// Equatorial J2000 directions in degrees, Y-up scene: RA 0 -> +X, RA 90 -> -Z.
// distance and factor are reciprocal units: stars use ly and units/ly; local uses Mly and units/Mly.
export function equatorial(ra, dec, distance, factor=1) {
  const a=ra*Math.PI/180, d=dec*Math.PI/180;
  return [Math.cos(d)*Math.cos(a)*distance*factor, Math.sin(d)*distance*factor, -Math.cos(d)*Math.sin(a)*distance*factor];
}
const object=(id,name,type,position,distance,detail,color='#ecc589',extra={})=>({id,name,type,position,distance,detail,color,...extra});
const planets=[['mercury','Mercurio',.39,'#ac9d88'],['venus','Venere',.72,'#d5b97d'],['earth','Terra',1,'#81c4cc'],['mars','Marte',1.52,'#d58462'],['jupiter','Giove',5.2,'#d3a377'],['saturn','Saturno',9.58,'#e9ce92'],['uranus','Urano',19.2,'#96d6d7'],['neptune','Nettuno',30.05,'#658ecc']];
export const catalog = {
  solar:[object('sun','Sole','Stella',[0,0,0],'0 UA dal Sole','La stella al centro del nostro sistema. La sua luce impiega circa 8 minuti per raggiungere la Terra.','#ffd99a',{size:1.25}),...planets.map(([id,name,au,color],i)=>{const r=3.2+i*2.25,a=.55+i*2.28;return object(id,name,i<4?'Pianeta roccioso':i<6?'Gigante gassoso':'Gigante ghiacciato',[Math.cos(a)*r,0,Math.sin(a)*r],`${au.toLocaleString('it-IT')} UA dal Sole`,`${name} è il ${['primo','secondo','terzo','quarto','quinto','sesto','settimo','ottavo'][i]} pianeta del Sistema Solare. La distanza indicata approssima il semiasse maggiore orbitale. Orbite circolari e fasi sono illustrative.`,color,{size:i<4?.27:.6,orbit:r})})],
  stars:[object('sol','Sole','La nostra stella',[0,0,0],'0 a.l.','Il punto di partenza della nostra esplorazione.','#ffe2a8'),...[
    ['proxima','Proxima Centauri',217.43,-62.68,4.24,'Nana rossa','La stella più vicina al Sole, parte del sistema di Alfa Centauri.','#dd9174'],
    ['alpha','Alfa Centauri A/B',219.90,-60.83,4.37,'Sistema binario','Una coppia di stelle nel sistema stellare più vicino al nostro.','#f1d391'],
    ['barnard','Stella di Barnard',269.45,4.69,5.96,'Nana rossa','Una piccola stella dalla notevole velocità apparente nel cielo.','#cd866c'],
    ['sirius','Sirio',101.29,-16.72,8.60,'Sistema binario','La stella più luminosa del cielo notturno, accompagnata da una nana bianca.','#a9dce9'],
    ['epsilon','Epsilon Eridani',53.23,-9.46,10.47,'Stella','Una giovane stella vicina, più piccola e fredda del Sole.','#e6bd7c'],
    ['procyon','Procione',114.83,5.22,11.46,'Sistema binario','Una stella luminosa della costellazione del Cane Minore.','#ece7d9'],
    ['tau','Tau Ceti',26.02,-15.94,11.91,'Stella','Una stella simile al Sole nella costellazione della Balena.','#e8c590'],
    ['vega','Vega',279.23,38.78,25.04,'Stella','Una stella bianco-azzurra nella costellazione della Lira.','#a7d4f1'],
  ].map(([id,n,ra,dec,d,t,info,c])=>object(id,n,t,equatorial(ra,dec,d,.7),`${d.toLocaleString('it-IT')} a.l. dal Sole`,info,c,{raDeg:ra,decDeg:dec,distanceLy:d,sceneUnitsPerLy:.7}))],
  galaxy:[object('milkyway','Via Lattea','Galassia a spirale barrata',[0,0,0],'≈ 100.000 a.l. di diametro',scales[2].description,'#f5d298',{size:.45}),object('solar-system','Sistema Solare','Sperone di Orione',[8.4,.15,5.8],'≈ 26.000 a.l. dal centro','Sei qui. Il Sole e i suoi pianeti orbitano intorno al centro della Via Lattea. Un giro richiede circa 240 milioni di anni.','#a4e5e0',{targetScale:0}),object('sagittarius','Sagittarius A*','Buco nero supermassiccio',[.3,.15,.2],'≈ 26.000 a.l. dal Sole','Il buco nero supermassiccio al centro della nostra galassia. Contiene circa quattro milioni di masse solari.','#f7bc72'),object('orion','Nebulosa di Orione','Regione di formazione stellare',[9.1,.3,6.2],'≈ 1.300 a.l. dal Sole','Una vasta nube di gas e polveri in cui nascono nuove stelle. La posizione sulla mappa è schematica.','#97bbd6')],
  local:[object('local-milkyway','Via Lattea','La nostra galassia',[0,0,0],'Origine: Sistema Solare','Il nostro punto di riferimento nella Via Lattea per il Gruppo Locale. Le dimensioni delle galassie sono amplificate per renderle visibili.','#edc88f',{targetScale:2,size:.6}),object('andromeda','Andromeda · M31','Galassia a spirale',equatorial(10.685,41.269,2.5,6),'≈ 2,5 milioni a.l.','La grande galassia a spirale più vicina alla Via Lattea. È uno dei membri dominanti del Gruppo Locale.','#c5d4db',{size:1}),object('triangulum','Triangolo · M33','Galassia a spirale',equatorial(23.46,30.66,3,6),'≈ 3 milioni a.l.','Una galassia a spirale del Gruppo Locale, più piccola di Andromeda e della Via Lattea.','#c0cbd6',{size:.5}),object('lmc','Grande Nube di Magellano','Galassia satellite',equatorial(80.89,-69.76,.163,6),'≈ 163.000 a.l.','Una galassia satellite della Via Lattea, visibile soprattutto dall’emisfero australe.','#cfac84',{size:.15}),object('smc','Piccola Nube di Magellano','Galassia satellite',equatorial(13.19,-72.83,.2,6),'≈ 200.000 a.l.','Una piccola galassia irregolare vicina alla Grande Nube di Magellano.','#b9cbd5',{size:.12})],
  cosmic:[object('laniakea','Laniakea','Superammasso',[-4,1,3],'≈ 520 milioni a.l. di estensione','La vasta regione di flussi galattici che comprende la Via Lattea. Il marcatore è un riferimento schematico.','#edd39f',{targetScale:3}),object('virgo','Ammasso della Vergine','Ammasso di galassie',[6,3,-3],'≈ 54 milioni a.l. dalla Terra','Un grande ammasso di galassie relativamente vicino al Gruppo Locale. La posizione qui è schematica.','#b3d7df'),object('coma','Ammasso della Chioma','Ammasso di galassie',[-10,-2,-9],'≈ 320 milioni a.l. dalla Terra','Un ricco ammasso di galassie nella costellazione della Chioma di Berenice. La posizione qui è schematica.','#dbb6ab')],
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
  solar: 'Orbite e fasi illustrative; distanze compresse e dimensioni amplificate.',
  stars: 'Direzione J2000 e distanza approssimate; dimensioni amplificate.',
  galaxy: 'Posizione schematica nella ricostruzione della Via Lattea.',
  local: 'Direzione equatoriale e distanza approssimate dal Sistema Solare; dimensioni amplificate.',
  cosmic: 'Posizione schematica; la rete di particelle è una visualizzazione concettuale.',
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
      entry.positionNote = 'Origine del sistema di riferimento di questa vista.';
    }
  }
}
export function seededRandom(seed=42){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}


// HYG v4.1 subset: David Nash, CC BY-SA 4.0. See DATA_SOURCES.md.
// These are measured catalog entries; decorative sky particles are separate.
for (const star of nearbyStars) {
  const spectral=star.spectralType?.[0];
  const tint={M:'#d9957b',K:'#e7ba88',G:'#e8d2a5',F:'#eae4d1',A:'#bfd9ed',B:'#a5c5ec',O:'#99b9ed'}[spectral] || '#c9d7dd';
  catalog.stars.push(object(star.id,star.name,'Stella · HYG 4.1',equatorial(star.raDeg,star.decDeg,star.distanceLy,.7),
    `≈ ${star.distanceLy.toLocaleString('it-IT',{maximumFractionDigits:2})} a.l. dal Sole`,
    `Stella del catalogo HYG 4.1 (${star.sourceId}). Direzione equatoriale J2000 e distanza da catalogo.${star.spectralType?' Tipo spettrale: '+star.spectralType+'.':''} La luminosità nella mappa è amplificata per renderla visibile.`,tint,
    {raDeg:star.raDeg,decDeg:star.decDeg,distanceLy:star.distanceLy,sceneUnitsPerLy:.7,mag:star.mag,measured:true,source:star.source,positionKind:'approximate-equatorial',positionNote:scales[1].positionNote}));
}
scales[1].description=`La vista include ${nearbyStars.length} stelle dal catalogo HYG 4.1 entro 25 anni luce dal Sole, oltre ai riferimenti principali. Coordinate equatoriali J2000 e distanze di catalogo; dimensioni e luminosità sono amplificate. Il catalogo non è completo.`;
