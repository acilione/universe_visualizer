import { t, locale, formatNumber } from './i18n.js';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { equatorialVector, createSkyTransform } from './sky-math.js';

const RADIUS = 60;
// One physical scale for every selection; camera framing is independent.
export const CONSTELLATION_DISTANCE_FACTOR = .026;
const DEFAULT_REACH_LY = 1000;
const colorFor = bv => new THREE.Color(bv === null ? '#d8e6ff' : bv < 0 ? '#b2caff' : bv < .45 ? '#e2edff' : bv < .85 ? '#fff0ce' : bv < 1.4 ? '#ffd29f' : '#ffa87b');
const starVertex = `
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vAltitude;
uniform float uPixelRatio;
void main() {
  vColor = color; vAlpha = aAlpha; vAltitude = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
  gl_PointSize = aSize * uPixelRatio;
}`;
const starFragment = `
varying vec3 vColor; varying float vAlpha; varying float vAltitude;
uniform float uOpacity; uniform float uHorizon;
void main() {
  if (uHorizon > .5 && vAltitude < 0.) discard;
  float d = length(gl_PointCoord-.5)*2.;
  if (d > 1.) discard;
  float light = exp(-d*d*5.)*.55+exp(-d*d*35.)*.45;
  gl_FragColor=vec4(vColor,light*vAlpha*uOpacity);
}`;

function starCloud(stars, position, renderer, mode, members) {
  const p=[], colors=[], sizes=[], alphas=[];
  for (const star of stars) {
    p.push(...position(star));
    const color=colorFor(star.colorIndex);
    colors.push(color.r,color.g,color.b);
    const selected=members.has(star.hip);
    sizes.push(selected ? Math.max(5,10-star.mag*.9) : Math.max(1.2,8-star.mag*.75));
    alphas.push(selected ? 1 : Math.min(.9, Math.max(.065, Math.pow(10,-.16*(star.mag-2)))));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
  geometry.setAttribute('aAlpha',new THREE.Float32BufferAttribute(alphas,1));
  const material=new THREE.ShaderMaterial({vertexShader:starVertex,fragmentShader:starFragment,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uPixelRatio:{value:renderer.getPixelRatio()},uOpacity:{value:1},uHorizon:{value:mode==='earth'?1:0}}});
  material.userData.baseOpacity=1;
  const points=new THREE.Points(geometry,material);points.name='catalog-stars';points.userData.particles=false;
  return points;
}

function figureLines(figure, byHip, position, mode, renderer) {
  const positions=[], progress=[], pulses=[];
  let segmentCount=0;
  for(const [a,b] of figure.segments) {
    const starA=byHip.get(a),starB=byHip.get(b);
    if(mode==='space' && (starA.distanceLy===null || starB.distanceLy===null))continue;
    const start=new THREE.Vector3(...position(starA)),end=new THREE.Vector3(...position(starB));
    const steps=mode==='space'?1:24;
    for(let i=0;i<steps;i++) {
      let left=start.clone().lerp(end,i/steps),right=start.clone().lerp(end,(i+1)/steps);
      if(mode!=='space') {
        left.normalize().multiplyScalar(RADIUS);right.normalize().multiplyScalar(RADIUS);
        if(mode==='earth'){
          if(left.y<0&&right.y<0)continue;
          if(left.y<0)left.lerp(right,-left.y/(right.y-left.y));
          if(right.y<0)right.lerp(left,-right.y/(left.y-right.y));
        }
      }
      positions.push(...left.toArray(),...right.toArray());
      progress.push(i/steps,(i+1)/steps);
    }
    if(mode!=='earth'||start.y>0||end.y>0)pulses.push({start,end,phase:segmentCount*.173});
    segmentCount++;
  }
  const group=new THREE.Group();group.name='constellation-lines';group.userData.segmentCount=segmentCount;
  if(!positions.length)return group;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('aProgress',new THREE.Float32BufferAttribute(progress,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0},uOpacity:{value:.88}},
    vertexShader:`attribute float aProgress; varying float vProgress; void main(){vProgress=aProgress;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying float vProgress;uniform float uTime;uniform float uOpacity;void main(){float pulse=pow(max(0.,cos(vProgress*6.283-uTime*.7)),14.);gl_FragColor=vec4(mix(vec3(.24,.65,.72),vec3(.72,1.,1.),pulse*.6),uOpacity*(.55+.45*pulse));}`});
  material.userData.baseOpacity=.88;group.add(new THREE.LineSegments(geometry,material));
  const haloGeometry=new LineSegmentsGeometry();haloGeometry.setPositions(positions);
  const haloMaterial=new LineMaterial({color:0x70ddd9,linewidth:3,transparent:true,opacity:.1,depthWrite:false,blending:THREE.AdditiveBlending});
  haloMaterial.resolution.set(renderer.domElement.clientWidth,renderer.domElement.clientHeight);haloMaterial.userData.baseOpacity=.1;
  group.add(new LineSegments2(haloGeometry,haloMaterial));
  const pulseGeometry=new THREE.BufferGeometry();pulseGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Array(pulses.length*3).fill(0),3));
  const pulseMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uOpacity:{value:.8},uHorizon:{value:mode==='earth'?1:0},uPixelRatio:{value:renderer.getPixelRatio()}},
    vertexShader:`varying float vAltitude;uniform float uPixelRatio;void main(){vAltitude=position.y;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(240.*length(modelMatrix[0].xyz)/max(.1,-mv.z),2.,6.)*uPixelRatio;}`,
    fragmentShader:`varying float vAltitude;uniform float uOpacity;uniform float uHorizon;void main(){if(uHorizon>.5&&vAltitude<0.)discard;float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(.8,1.,.94,exp(-d*d*5.)*uOpacity);}`});
  pulseMaterial.userData.baseOpacity=.8;
  const sparks=new THREE.Points(pulseGeometry,pulseMaterial);sparks.name='constellation-pulses';sparks.userData.particles=true;
  sparks.userData.animate=time=>{
    const attribute=pulseGeometry.attributes.position;
    for(let i=0;i<pulses.length;i++){
      const pulse=pulses[i],p=pulse.start.clone().lerp(pulse.end,(time*.055+pulse.phase)%1);
      if(mode!=='space')p.normalize().multiplyScalar(RADIUS);
      attribute.setXYZ(i,p.x,p.y,p.z);
    }
    attribute.needsUpdate=true;
  };
  sparks.frustumCulled=false;group.add(sparks);return group;
}

export function createConstellationView({catalog,figure,figures=figure?[figure]:[],mode='space',observer,renderer,distanceFactor=CONSTELLATION_DISTANCE_FACTOR}) {
  if (!Array.isArray(figures)) throw new TypeError('Constellation figures must be an array.');
  if (!Number.isFinite(distanceFactor) || distanceFactor <= 0) throw new RangeError('The constellation distance factor must be positive and finite.');
  const selection = [...new Map(figures.map(item => [item.id, item])).values()];
  const ids = selection.map(item => item.id), names = selection.map(item => item.name);
  const primary = selection[0] || null;
  const memberships = new Map(), segments = new Map();
  for (const item of selection) {
    for (const [a,b] of item.segments) {
      for (const hip of [a,b]) {
        if (!catalog.byHip.has(hip)) throw new RangeError('Unknown constellation endpoint HIP ' + hip);
        if (!memberships.has(hip)) memberships.set(hip, new Map());
        memberships.get(hip).set(item.id, { id:item.id, name:item.name });
      }
      const key = a < b ? a + ':' + b : b + ':' + a;
      if (!segments.has(key)) segments.set(key, { endpoints:[a,b], constellationIds:[] });
      const owners = segments.get(key).constellationIds;
      if (!owners.includes(item.id)) owners.push(item.id);
    }
  }
  const union = { segments:[...segments.values()].map(segment => segment.endpoints) };
  const memberIds = new Set(memberships.keys()), members = [...memberIds].map(hip => catalog.byHip.get(hip));
  const unknownDistanceCount=members.filter(s=>s.distanceLy===null).length;
  const known=members.filter(s=>s.distanceLy!==null);
  const reach=known.length?Math.max(30,...known.map(s=>s.distanceLy)):DEFAULT_REACH_LY;
  const factor=distanceFactor;
  const transform=createSkyTransform(observer);
  const position=mode==='earth'?s=>transform.vector(s.raDeg,s.decDeg,RADIUS):s=>equatorialVector(s.raDeg,s.decDeg,s.distanceLy*factor);
  // Keep one stable physical catalogue around the solar origin. Selecting a
  // figure changes highlighting and lines, never background membership or depth.
  const physicalCatalog=catalog.stars.filter(star=>star.distanceLy!==null);
  const catalogueRadius=physicalCatalog.reduce((radius,star)=>Math.max(radius,star.distanceLy*factor),0);
  const visibleCatalog=mode==='earth'?catalog.stars:physicalCatalog;
  const group=new THREE.Group();group.name='map';group.add(starCloud(visibleCatalog,position,renderer,mode,memberIds));
  const lines=figureLines(union,catalog.byHip,position,mode,renderer);
  lines.userData.constellationIds=ids.slice();lines.userData.segmentMemberships=[...segments.values()];group.add(lines);
  const grid=new THREE.Group();grid.name='grid';
  if(mode==='earth') {
    const ground=new THREE.Mesh(new THREE.CircleGeometry(150,128),new THREE.MeshBasicMaterial({color:0x070d13,side:THREE.DoubleSide}));
    ground.rotation.x=-Math.PI/2;ground.position.y=-1.6;ground.name='earth-ground';group.add(ground);
    const horizon=[];
    for(let i=0;i<=360;i++)horizon.push(new THREE.Vector3(Math.sin(i*Math.PI/180)*RADIUS,0,-Math.cos(i*Math.PI/180)*RADIUS));
    const horizonMaterial=new THREE.LineBasicMaterial({color:0x74bcb3,transparent:true,opacity:.32,depthWrite:false});horizonMaterial.userData.baseOpacity=.32;
    grid.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(horizon),horizonMaterial));
    for(let i=0;i<72;i++){
      const angle=i*Math.PI/36,points=[new THREE.Vector3(Math.sin(angle)*RADIUS,0,-Math.cos(angle)*RADIUS),new THREE.Vector3(Math.sin(angle)*RADIUS,i%18===0?1.5:.35,-Math.cos(angle)*RADIUS)];
      grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),horizonMaterial.clone()));
    }
  } else {
    const origin=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),new THREE.MeshBasicMaterial({color:0xffd993}));origin.name='solar-origin';group.add(origin);
    if(known.length){
      const radial=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(...position(known[0]))]);
      const material=new THREE.LineDashedMaterial({color:0xb69a64,dashSize:.25,gapSize:.35,transparent:true,opacity:.22});material.userData.baseOpacity=.22;
      const reference=new THREE.Line(radial,material);reference.computeLineDistances();grid.add(reference);
    }
  }
  group.add(grid);
  const visibleStarCount=members.filter(s=>transform.horizontal(s.raDeg,s.decDeg).altitudeDeg>=0).length;
  const objectFor=(s,angularOnly=false)=>{
    const horizontal=transform.horizontal(s.raDeg,s.decDeg);
    const figureMemberships=[...memberships.get(s.hip).values()], constellationIds=figureMemberships.map(item=>item.id), constellationNames=figureMemberships.map(item=>item.name), memberNames=constellationNames.join(', ');
    return {...s,figureMemberships,constellationIds,constellationNames,bodyKind:'catalog-star',type:t('Star · ','Stella · ')+memberNames,measured:true,color:colorFor(s.colorIndex).getStyle(),size:.12,
      distance:s.distanceLy===null?t('Unknown distance','Distanza sconosciuta'):formatNumber(s.distanceLy,{maximumFractionDigits:1})+t(' light-years',' anni luce'),
      position:angularOnly?equatorialVector(s.raDeg,s.decDeg,RADIUS):position(s),altitudeDeg:horizontal.altitudeDeg,azimuthDeg:horizontal.azimuthDeg,earthAngularReference:angularOnly,
      source:catalog.metadata.source,positionKind:mode==='earth'||angularOnly?'sky-projection':'measured',
      detail:t(`HYG v4.1 star. Selected figures: ${memberNames}. Apparent magnitude ${formatNumber(s.mag)}.`,`Stella del catalogo HYG v4.1. Figure selezionate: ${memberNames}. Magnitudine apparente ${formatNumber(s.mag)}.`)+(horizontal?t(` Altitude above the horizon: ${formatNumber(horizontal.altitudeDeg,{minimumFractionDigits:1,maximumFractionDigits:1})}°.`,` Altezza sull’orizzonte: ${formatNumber(horizontal.altitudeDeg,{minimumFractionDigits:1,maximumFractionDigits:1})}°.`):''),
      positionNote:angularOnly?t('Angular reference only: the distance is unknown. Visible only from Earth’s origin, not placed in the measured 3D volume.','Riferimento solo angolare: la distanza non è nota. Visibile solo dall’origine terrestre, non collocato nel volume 3D misurato.'):mode==='earth'
        ?t('Sky projection from J2000 coordinates, precessed to the selected date. Geometric horizon; refraction, proper motion and parallax are not included.','Proiezione del cielo da coordinate J2000, con precessione alla data scelta. Orizzonte geometrico; senza rifrazione, moto proprio o parallasse.')
        :t('J2000 coordinates and HYG distances. Linear scale in all directions; stellar sizes are enlarged.','Coordinate J2000 e distanze HYG. Scala lineare in tutte le direzioni; dimensioni stellari amplificate.')
    };
  };
  const objects=(mode==='earth'?members:known).map(s=>objectFor(s)).sort((a,b)=>(mode==='earth'?Number(b.altitudeDeg>=0)-Number(a.altitudeDeg>=0):0)||a.mag-b.mag);
  const centroid=new THREE.Vector3();
  for(const star of (mode==='earth'?objects.filter(o=>o.altitudeDeg>=0):objects))centroid.add(new THREE.Vector3(...star.position));
  if(centroid.lengthSq()<.001)centroid.set(0,.2,-1);
  const lookDirection=centroid.clone().normalize();
  const center=mode==='earth'?new THREE.Vector3():new THREE.Box3().setFromPoints([new THREE.Vector3(),...objects.map(o=>new THREE.Vector3(...o.position))]).getCenter(new THREE.Vector3());
  const radius=mode==='earth'?RADIUS:objects.length?Math.max(8,...objects.map(o=>new THREE.Vector3(...o.position).distanceTo(center)),center.length()):reach*factor*1.55;
  const observationDate=new Date(observer.dateIso).toLocaleString(locale(),{timeZone:'UTC'})+' UTC';
  const coordinates=`${formatNumber(observer.latitude,{minimumFractionDigits:2,maximumFractionDigits:2})}°, ${formatNumber(observer.longitude,{minimumFractionDigits:2,maximumFractionDigits:2})}°`;
  const positionNote=mode==='earth'
    ? t(`Sky at ${coordinates} · ${observationDate}. ${visibleStarCount}/${members.length} figure stars above the horizon. Brightness is amplified; daylight is not simulated.`,`Cielo per ${coordinates} · ${observationDate}. ${visibleStarCount}/${members.length} stelle della figura sopra l’orizzonte. Luminosità amplificata; cielo diurno non simulato.`)
    : t(`J2000 directions; ${formatNumber(physicalCatalog.length)} stars with catalogue distances on a fixed linear scale.`,`Direzioni J2000; ${formatNumber(physicalCatalog.length)} stelle con distanze di catalogo su una scala lineare fissa.`)+(unknownDistanceCount
      ? t(` ${unknownDistanceCount} selected stars without distance measurements appear only as angular references when viewing from Earth's origin.`,` ${unknownDistanceCount} stelle selezionate senza distanza e relativi segmenti visibili solo dalla Terra.`)
      : '');
  const context={id:'constellations',constellationId:primary?.id||null,constellationIds:ids.slice(),constellationNames:names.slice(),constellationCount:ids.length,segmentCount:union.segments.length,spaceSegmentCount:union.segments.filter(([a,b])=>catalog.byHip.get(a).distanceLy!==null&&catalog.byHip.get(b).distanceLy!==null).length,distanceFactor:factor,mode,observer,name:ids.length===1?primary.name:ids.length?ids.length+t(' constellations',' costellazioni'):t('Constellations','Costellazioni'),short:ids.length===1?primary.abbr:t('Constellations','Costellazioni'),extent:mode==='earth'?t('Sky from Earth’s surface','Cielo dalla superficie terrestre'):formatNumber(Math.round(catalogueRadius/factor))+t(' light-years',' anni luce'),metric:t('FIGURE STARS','STELLE DELLA FIGURA'),count:String(members.length),starCount:members.length,visibleStarCount,unknownDistanceCount,
    source:catalog.metadata.source,description:t('88 constellations with HYG v4.1 stellar coordinates.','88 costellazioni con coordinate stellari HYG v4.1.'),positionNote,overview:t('Constellations','Costellazioni'),renderedStarCount:visibleCatalog.length,catalogStarCount:catalog.stars.length};
  // Supplement only sources without measured distances while the observer is exactly at
  // the origin. These points never become invented radial distances in orbit.
  let angularReference=null;
  const angularObjects=[];
  const spatialStars=new Set(visibleCatalog);
  const earthLookDirection=new THREE.Vector3();
  for(const star of members)earthLookDirection.add(new THREE.Vector3(...equatorialVector(star.raDeg,star.decDeg)));
  if(earthLookDirection.lengthSq()<1e-8)earthLookDirection.set(0,0,-1);
  earthLookDirection.normalize();
  function setEarthPerspective(active){
    if(mode!=='space')return;
    if(active&&!angularReference){
      angularReference=new THREE.Group();angularReference.name='earth-angular-reference';angularReference.userData.angularReferenceOnly=true;
      const remainder=catalog.stars.filter(star=>!spatialStars.has(star));
      const angularPosition=star=>equatorialVector(star.raDeg,star.decDeg,RADIUS);
      const background=starCloud(remainder,angularPosition,renderer,'angular',memberIds);background.name='earth-angular-stars';background.userData.angularReferenceOnly=true;
      angularReference.add(background);
      const missingSegments=union.segments.filter(([a,b])=>catalog.byHip.get(a).distanceLy===null||catalog.byHip.get(b).distanceLy===null);
      const missingLines=figureLines({segments:missingSegments},catalog.byHip,angularPosition,'angular',renderer);
      missingLines.name='angular-constellation-lines';missingLines.userData.angularReferenceOnly=true;angularReference.add(missingLines);
      for(const star of members.filter(star=>star.distanceLy===null))angularObjects.push(objectFor(star,true));
      group.add(angularReference);
    }
    if(angularReference)angularReference.visible=Boolean(active);
    context.renderedStarCount=active?catalog.stars.length:visibleCatalog.length;
    context.earthAngularReferenceCount=active?catalog.stars.length-visibleCatalog.length:0;
  }
  return {group,objects,angularObjects,context,center,radius,lookDirection,earthLookDirection,skyTransform:transform,mode,figure:primary,figures:selection,ids,distanceFactor:factor,catalogueRadius,sceneExtentRadius:mode==='earth'?RADIUS:Math.max(RADIUS,catalogueRadius),observer,setEarthPerspective};
}

