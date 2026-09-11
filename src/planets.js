import { t, locale } from './i18n.js';
import snapshot from './exoplanets.json' with { type: 'json' };
import { seededRandom } from './data.js';

export const planetCatalogMetadata = snapshot.metadata;
const systems = new Map();
for (const row of snapshot.planets) {
  if (!systems.has(row.host)) systems.set(row.host, []);
  systems.get(row.host).push(row);
}
const n = (value, digits=2) => Number.isFinite(value) ? value.toLocaleString(locale(),{maximumFractionDigits:digits}) : t('unknown', 'sconosciuto');
const discoveryMethods = {
  'Radial Velocity': 'Velocità radiale',
  Imaging: 'Immagine diretta',
  'Eclipse Timing Variations': 'Variazioni dei tempi di eclisse',
  Microlensing: 'Microlente gravitazionale',
  Transit: 'Transito',
  'Transit Timing Variations': 'Variazioni dei tempi di transito',
  Astrometry: 'Astrometria',
  'Disk Kinematics': 'Cinematica del disco',
  'Orbital Brightness Modulation': 'Modulazione della luminosità orbitale',
  'Pulsation Timing Variations': 'Variazioni dei tempi di pulsazione',
  'Pulsar Timing': 'Cronometria delle pulsar',
};
const colors = ['#b4cccf','#cd9872','#dbbe94','#97bacc','#b69d84'];
const mapped = new Map();
for (const [host, rows] of systems) {
  rows.sort((a,b)=>(a.semiMajorAxisAu??Infinity)-(b.semiMajorAxisAu??Infinity)||(a.periodDays??Infinity)-(b.periodDays??Infinity)||a.name.localeCompare(b.name));
  const seed=Array.from(host).reduce((acc,c)=>(acc*31+c.charCodeAt(0))>>>0,19), random=seededRandom(seed);
  rows.forEach((row,index)=>{
    const orbit=3.6+index*2.7;
    const phase=random()*Math.PI*2;
    const size=Number.isFinite(row.radiusEarth)?Math.min(1.12,Math.max(.35,.45*Math.pow(row.radiusEarth,.3))):.57;
    const source=`https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(row.name)}`;
    mapped.set(row.id,{
      ...row,type:t('Confirmed exoplanet','Esopianeta confermato'),bodyKind:'exoplanet',isPlanet:true,
      discoveryMethodOriginal:row.discoveryMethod,
      discoveryMethod:t(row.discoveryMethod,discoveryMethods[row.discoveryMethod] || row.discoveryMethod),
      position:[Math.cos(phase)*orbit,0,Math.sin(phase)*orbit],orbit,size,color:colors[index%colors.length],
      distance:Number.isFinite(row.distancePc)?t(`≈ ${n(row.distancePc*3.261563777,1)} ly from Earth`, `≈ ${n(row.distancePc*3.261563777,1)} a.l. dalla Terra`):t('Distance from Earth unknown','Distanza dalla Terra sconosciuta'),
      detail:t(`Confirmed planet in the ${host} system. ${Number.isFinite(row.discoveryYear)?'Discovered in '+row.discoveryYear+'. ':''}Radius: ${n(row.radiusEarth)} R⊕. Orbital period: ${n(row.periodDays)} days. Surface appearance, display sizes and orbital phases are illustrative.`, `Pianeta confermato del sistema ${host}. ${Number.isFinite(row.discoveryYear)?'Scoperto nel '+row.discoveryYear+'. ':''}Raggio: ${n(row.radiusEarth)} R⊕. Periodo orbitale: ${n(row.periodDays)} giorni. Superficie, dimensioni sullo schermo e fase orbitale sono illustrative.`),
      source,positionKind:'schematic',positionNote:t('Schematic orbits: compressed separations, illustrative phases and surfaces. No observed ephemerides.', 'Orbite schematiche: separazioni compresse, fasi e superfici illustrative. Nessuna effemeride osservata.'),
    });
  });
}
export const exoplanets=snapshot.planets.map(row=>mapped.get(row.id));
export const findPlanet=id=>mapped.get(id);
export const planetsForHost=host=>(systems.get(host)||[]).map(row=>mapped.get(row.id));
export function hostView(planet){
  const planets=planetsForHost(planet.host);
  const star={id:'host-'+planet.host,name:planet.host,type:t('Host star','Stella ospite'),bodyKind:'star',position:[0,0,0],size:1.12,color:'#ffe1ab',distance:planet.distance,detail:t(`System with ${planets.length} confirmed ${planets.length === 1 ? 'planet' : 'planets'} in the NASA catalog snapshot. Orbits, display sizes and brightness are illustrative.`, `Sistema con ${planets.length} ${planets.length === 1 ? 'pianeta confermato presente' : 'pianeti confermati presenti'} nello snapshot NASA. Orbite, dimensioni visive e luminosità sono illustrative.`),source:planet.source,positionKind:'reference',positionNote:t('Origin of the planetary system.','Origine del sistema planetario.')};
  return {objects:[star,...planets],context:{name:planet.host,short:planet.host,extent:t('Exoplanet system','Sistema esoplanetario'),metric:t('CONFIRMED PLANETS','PIANETI CONFERMATI'),count:String(planets.length),description:star.detail,positionNote:planet.positionNote,source:planet.source,overview:star}};
}
