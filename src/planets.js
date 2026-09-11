import snapshot from './exoplanets.json' with { type: 'json' };
import { seededRandom } from './data.js';

export const planetCatalogMetadata = snapshot.metadata;
const systems = new Map();
for (const row of snapshot.planets) {
  if (!systems.has(row.host)) systems.set(row.host, []);
  systems.get(row.host).push(row);
}
const n = (value, digits=2) => Number.isFinite(value) ? value.toLocaleString('it-IT',{maximumFractionDigits:digits}) : 'sconosciuto';
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
      ...row,type:'Esopianeta confermato',bodyKind:'exoplanet',isPlanet:true,
      position:[Math.cos(phase)*orbit,0,Math.sin(phase)*orbit],orbit,size,color:colors[index%colors.length],
      distance:Number.isFinite(row.distancePc)?`≈ ${n(row.distancePc*3.261563777,1)} a.l. dalla Terra`:'Distanza dalla Terra sconosciuta',
      detail:`Pianeta confermato del sistema ${host}. ${Number.isFinite(row.discoveryYear)?'Scoperto nel '+row.discoveryYear+'. ':''}Raggio: ${n(row.radiusEarth)} R⊕. Periodo orbitale: ${n(row.periodDays)} giorni. Superficie, dimensioni sullo schermo e fase orbitale sono illustrative.`,
      source,positionKind:'schematic',positionNote:'Orbite schematiche: separazioni compresse, fasi e superfici illustrative. Nessuna effemeride osservata.',
    });
  });
}
export const exoplanets=snapshot.planets.map(row=>mapped.get(row.id));
export const findPlanet=id=>mapped.get(id);
export const planetsForHost=host=>(systems.get(host)||[]).map(row=>mapped.get(row.id));
export function hostView(planet){
  const planets=planetsForHost(planet.host);
  const star={id:'host-'+planet.host,name:planet.host,type:'Stella ospite',bodyKind:'star',position:[0,0,0],size:1.12,color:'#ffe1ab',distance:planet.distance,detail:`Sistema con ${planets.length} pianeti confermati presenti nello snapshot NASA. Orbite, dimensioni visive e luminosità sono illustrative.`,source:planet.source,positionKind:'reference',positionNote:'Origine del sistema planetario.'};
  return {objects:[star,...planets],context:{name:planet.host,short:planet.host,extent:'Sistema esoplanetario',metric:'PIANETI CONFERMATI',count:String(planets.length),description:star.detail,positionNote:planet.positionNote,source:planet.source,overview:star}};
}
