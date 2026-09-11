import { t, locale, formatNumber } from './i18n.js';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { equatorialVector, createSkyTransform } from './sky-math.js';

const RADIUS = 60;
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
    const steps=mode==='earth'?24:1;
    for(let i=0;i<steps;i++) {
      let left=start.clone().lerp(end,i/steps),right=start.clone().lerp(end,(i+1)/steps);
      if(mode==='earth') {
        left.normalize().multiplyScalar(RADIUS);right.normalize().multiplyScalar(RADIUS);
        if(left.y<0&&right.y<0)continue;
        if(left.y<0)left.lerp(right,-left.y/(right.y-left.y));
        if(right.y<0)right.lerp(left,-right.y/(left.y-right.y));
      }
      positions.push(...left.toArray(),...right.toArray());
      progress.push(i/steps,(i+1)/steps);
    }
    if(mode==='space'||start.y>0||end.y>0)pulses.push({start,end,phase:segmentCount*.173});
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
      if(mode==='earth')p.normalize().multiplyScalar(RADIUS);
      attribute.setXYZ(i,p.x,p.y,p.z);
    }
    attribute.needsUpdate=true;
  };
  sparks.frustumCulled=false;group.add(sparks);return group;
}

export function createConstellationView({catalog,figure,mode,observer,renderer}) {
  const memberIds=new Set(figure.segments.flat()),members=[...memberIds].map(hip=>catalog.byHip.get(hip));
  const unknownDistanceCount=members.filter(s=>s.distanceLy===null).length;
  const known=members.filter(s=>s.distanceLy!==null);
  const reach=Math.max(30,...known.map(s=>s.distanceLy));
  const factor=26/reach;
  const transform=mode==='earth'?createSkyTransform(observer):null;
  const position=mode==='earth'?s=>transform.vector(s.raDeg,s.decDeg,RADIUS):s=>equatorialVector(s.raDeg,s.decDeg,s.distanceLy*factor);
  // Linear depth, centered on the Sun. Distant field stars outside this view's
  // volume are culled; selecting a different constellation changes that volume.
  const visibleCatalog=mode==='earth'?catalog.stars:catalog.stars.filter(s=>s.distanceLy!==null&&s.distanceLy<=reach*1.55);
  const group=new THREE.Group();group.name='map';group.add(starCloud(visibleCatalog,position,renderer,mode,memberIds));
  group.add(figureLines(figure,catalog.byHip,position,mode,renderer));
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
    const radial=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(...position(known[0]))]);
    const material=new THREE.LineDashedMaterial({color:0xb69a64,dashSize:.25,gapSize:.35,transparent:true,opacity:.22});material.userData.baseOpacity=.22;
    const reference=new THREE.Line(radial,material);reference.computeLineDistances();grid.add(reference);
  }
  group.add(grid);
  const visibleStarCount=mode==='earth'?members.filter(s=>position(s)[1]>=0).length:known.length;
  const objects=(mode==='earth'?members:known).map(s=>{
    const horizontal=transform?.horizontal(s.raDeg,s.decDeg);
    return {...s,bodyKind:'catalog-star',type:t('Star · ','Stella · ')+figure.name,measured:true,color:colorFor(s.colorIndex).getStyle(),size:.12,
      distance:s.distanceLy===null?t('Unknown distance','Distanza sconosciuta'):formatNumber(s.distanceLy,{maximumFractionDigits:1})+t(' light-years',' anni luce'),
      position:position(s),altitudeDeg:horizontal?.altitudeDeg,azimuthDeg:horizontal?.azimuthDeg,
      source:catalog.metadata.source,positionKind:mode==='earth'?'sky-projection':'measured',
      detail:t(`HYG v4.1 star in ${figure.name}. Apparent magnitude ${formatNumber(s.mag)}.`,`Stella del catalogo HYG v4.1 in ${figure.name}. Magnitudine apparente ${formatNumber(s.mag)}.`)+(horizontal?t(` Altitude above the horizon: ${formatNumber(horizontal.altitudeDeg,{minimumFractionDigits:1,maximumFractionDigits:1})}°.`,` Altezza sull’orizzonte: ${formatNumber(horizontal.altitudeDeg,{minimumFractionDigits:1,maximumFractionDigits:1})}°.`):''),
      positionNote:mode==='earth'
        ?t('Sky projection from J2000 coordinates, precessed to the selected date. Geometric horizon; refraction, proper motion and parallax are not included.','Proiezione del cielo da coordinate J2000, con precessione alla data scelta. Orizzonte geometrico; senza rifrazione, moto proprio o parallasse.')
        :t('J2000 coordinates and HYG distances. Linear scale in all directions; stellar sizes are enlarged.','Coordinate J2000 e distanze HYG. Scala lineare in tutte le direzioni; dimensioni stellari amplificate.')
    };
  }).sort((a,b)=>(mode==='earth'?Number(b.altitudeDeg>=0)-Number(a.altitudeDeg>=0):0)||a.mag-b.mag);
  const centroid=new THREE.Vector3();
  for(const star of (mode==='earth'?objects.filter(o=>o.altitudeDeg>=0):objects))centroid.add(new THREE.Vector3(...star.position));
  if(centroid.lengthSq()<.001)centroid.set(0,.2,-1);
  const lookDirection=centroid.clone().normalize();
  const center=mode==='earth'?new THREE.Vector3():new THREE.Box3().setFromPoints([new THREE.Vector3(),...objects.map(o=>new THREE.Vector3(...o.position))]).getCenter(new THREE.Vector3());
  const radius=mode==='earth'?RADIUS:Math.max(8,...objects.map(o=>new THREE.Vector3(...o.position).distanceTo(center)),center.length());
  const observationDate=new Date(observer.dateIso).toLocaleString(locale(),{timeZone:'UTC'})+' UTC';
  const coordinates=`${formatNumber(observer.latitude,{minimumFractionDigits:2,maximumFractionDigits:2})}°, ${formatNumber(observer.longitude,{minimumFractionDigits:2,maximumFractionDigits:2})}°`;
  const positionNote=mode==='earth'
    ? t(`Sky at ${coordinates} · ${observationDate}. ${visibleStarCount}/${members.length} figure stars above the horizon. Brightness is amplified; daylight is not simulated.`,`Cielo per ${coordinates} · ${observationDate}. ${visibleStarCount}/${members.length} stelle della figura sopra l’orizzonte. Luminosità amplificata; cielo diurno non simulato.`)
    : t(`Linear HYG distances · radius ${formatNumber(Math.round(reach*1.55))} light-years from the Sun.`,`Distanze lineari HYG · raggio di ${formatNumber(Math.round(reach*1.55))} anni luce dal Sole.`)+' '+(unknownDistanceCount
      ? t(`${unknownDistanceCount} stars without distance measurements and their segments are available only in the Earth sky view.`,`${unknownDistanceCount} stelle senza distanza e relativi segmenti visibili solo dalla Terra.`)
      : t('All figure stars have catalog distances.','Tutte le stelle della figura hanno una distanza di catalogo.'));
  const context={id:'constellations',constellationId:figure.id,mode,observer,name:figure.name,short:figure.abbr,extent:mode==='earth'?t('Sky from Earth’s surface','Cielo dalla superficie terrestre'):formatNumber(Math.round(reach))+t(' light-years',' anni luce'),metric:t('FIGURE STARS','STELLE DELLA FIGURA'),count:String(members.length),starCount:members.length,visibleStarCount,unknownDistanceCount,
    source:catalog.metadata.source,description:t('88 constellations with HYG v4.1 stellar coordinates.','88 costellazioni con coordinate stellari HYG v4.1.'),positionNote,overview:t('Constellations','Costellazioni'),renderedStarCount:visibleCatalog.length,catalogStarCount:catalog.stars.length};
  return {group,objects,context,center,radius,lookDirection,mode,figure,observer};
}

