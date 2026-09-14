import * as THREE from 'three';
import { t, formatNumber } from './i18n.js';
import { equatorialVector } from './sky-math.js';

const RADIUS = 60;
const MARKER_LIMIT = 40;
const radians = THREE.MathUtils.degToRad;
const coordinatesKnown = object => Number.isFinite(object.raDeg) && Number.isFinite(object.decDeg) && Math.abs(object.decDeg) <= 90;
const colorFor = object => object.color || (object.colorIndex == null ? '#d8e6ff' : object.colorIndex < 0 ? '#b2caff' : object.colorIndex < .45 ? '#e2edff' : object.colorIndex < .85 ? '#fff0ce' : object.colorIndex < 1.4 ? '#ffd29f' : '#ffa87b');
const direction = object => new THREE.Vector3(...equatorialVector(object.raDeg, object.decDeg));
const angularSize = object => Number.isFinite(object.angularSizeArcmin) && object.angularSizeArcmin > 0 ? object.angularSizeArcmin : null;

/** Angular zoom only: catalogue distances are never used to invent sky depth. */
export function catalogueObjectFov(object) {
  return object.bodyKind === 'nebula' && angularSize(object)
    ? THREE.MathUtils.clamp(angularSize(object) / 60 * 2.8, .05, 70)
    : 35;
}

function pointsFor(objects, selectedId, pixelRatio, nebulae = false) {
  const positions = [], colors = [], sizes = [], alphas = [];
  for (const object of objects) {
    positions.push(...equatorialVector(object.raDeg, object.decDeg, RADIUS));
    const color = new THREE.Color(nebulae ? '#77b9ae' : colorFor(object));
    colors.push(color.r, color.g, color.b);
    const magnitude = Number.isFinite(object.mag) ? object.mag : 7;
    sizes.push(nebulae ? 3 : Math.max(1.5, 8 - magnitude * .7));
    alphas.push(object.id === selectedId ? 1 : nebulae ? .38 : THREE.MathUtils.clamp(Math.pow(10, -.15 * (magnitude - 2)), .09, .95));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  const material = new THREE.ShaderMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uPixelRatio: {value: pixelRatio}, uOpacity: {value: 1}},
    vertexShader: `attribute float aSize; attribute float aAlpha; varying vec3 vColor; varying float vAlpha; uniform float uPixelRatio;
      void main(){vColor=color;vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uPixelRatio;}`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha; uniform float uOpacity;
      void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float light=exp(-d*d*5.)*.6+exp(-d*d*35.)*.4;gl_FragColor=vec4(vColor,light*vAlpha*uOpacity);}`
  });
  material.userData.baseOpacity = 1;
  const points = new THREE.Points(geometry, material);
  points.name = nebulae ? 'nasa-nebula-centres' : 'nasa-catalogue-stars';
  // Catalogue measurements stay visible when decorative particle effects are off.
  points.userData.particles = false;
  return points;
}

function nebulaPatch(object) {
  const size = angularSize(object);
  if (!size) return null;
  const normal = direction(object);
  const right = new THREE.Vector3().crossVectors(Math.abs(normal.y) > .99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), normal).normalize();
  const up = new THREE.Vector3().crossVectors(normal, right).normalize();
  const tangentRadius = Math.tan(radians(Math.min(size / 60, 120) / 2));
  const geometry = new THREE.PlaneGeometry(2, 2, 24, 24);
  const attribute = geometry.attributes.position;
  for (let i = 0; i < attribute.count; i++) {
    const point = normal.clone().addScaledVector(right, attribute.getX(i) * tangentRadius).addScaledVector(up, attribute.getY(i) * tangentRadius).normalize().multiplyScalar(RADIUS);
    attribute.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: {uOpacity: {value: .6}},
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uOpacity;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p);if(r>1.)discard;float texture=noise(p*4.)*.55+noise(p*11.)*.3+noise(p*23.)*.15;float envelope=pow(max(0.,1.-r*r),1.8);vec3 color=mix(vec3(.26,.49,.56),vec3(.61,.45,.62),texture);gl_FragColor=vec4(color,envelope*(.18+texture*.82)*uOpacity);}`
  });
  material.userData.baseOpacity = .6;
  const patch = new THREE.Mesh(geometry, material);
  patch.name = 'nebula-angular-illustration';
  patch.userData.illustrative = true;
  patch.userData.angularDiameterDeg = size / 60;
  patch.userData.catalogueObjectId = object.id;
  patch.userData.particles = true;
  return patch;
}

export function createCatalogueSkyView({stars = [], nebulae = [], metadata = {}}, selectedObject, {pixelRatio = 1} = {}) {
  if (!selectedObject || !coordinatesKnown(selectedObject)) throw new RangeError(t('This catalogue object has no valid sky coordinates.', 'Questo oggetto di catalogo non ha coordinate celesti valide.'));
  const validStars = stars.filter(coordinatesKnown), validNebulae = nebulae.filter(coordinatesKnown);
  const selectedDirection = direction(selectedObject);
  const markerEntries = new Map([[selectedObject.id, selectedObject]]);
  const nearest = [], brightest = [];
  const retain = (list, candidate, limit) => {if (list.length < limit || candidate.score > list[list.length - 1].score) {list.push(candidate);list.sort((a,b) => b.score - a.score);if (list.length > limit) list.pop();}};
  for (const object of validStars) {retain(nearest, {object, score: direction(object).dot(selectedDirection)}, 24);retain(brightest, {object, score: -(object.mag ?? 99)}, MARKER_LIMIT);}
  for (const object of validNebulae) retain(nearest, {object, score: direction(object).dot(selectedDirection)}, 24);
  for (const {object} of nearest) markerEntries.set(object.id, object);
  for (const {object} of brightest) { if (markerEntries.size >= MARKER_LIMIT) break; markerEntries.set(object.id, object); }
  const positionNote = t('Equatorial sky directions; coordinate frames and position epochs are listed in the object data. Angular projection; catalogue distances are retained only as object data. Nebula clouds illustrate the catalogue angular extent, not observed morphology.', 'Direzioni celesti equatoriali; sistemi di coordinate ed epoche sono indicati nelle schede. Proiezione angolare; le distanze del catalogo sono conservate solo nei dati degli oggetti. Le nubi illustrano l’estensione angolare del catalogo, non la morfologia osservata.');
  const objects = [...markerEntries.values()].map(object => ({...object, measured: true, positionKind: 'sky-projection', position: equatorialVector(object.raDeg, object.decDeg, RADIUS), color: colorFor(object), positionNote}));
  const group = new THREE.Group(); group.name = 'map';
  group.add(pointsFor(validStars, selectedObject.id, pixelRatio));
  group.add(pointsFor(validNebulae, selectedObject.id, pixelRatio, true));
  if (selectedObject.bodyKind === 'nebula') {const patch = nebulaPatch(selectedObject); if (patch) group.add(patch);}
  const hasGaia = Boolean(metadata.gaiaDr3);
  const context = {
    id: 'nasa-sky', mode: 'catalogue-sky', name: hasGaia ? t('NASA + Gaia catalogue sky','Cielo dei cataloghi NASA + Gaia') : t('NASA catalogue sky', 'Cielo dei cataloghi NASA'), short: hasGaia ? 'NASA + Gaia' : 'NASA', extent: t('Equatorial sky', 'Cielo equatoriale'),
    metric: t('CATALOGUE OBJECTS', 'OGGETTI DI CATALOGO'), count: formatNumber(validStars.length + validNebulae.length),
    source: 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/hipparcos.html', description: t('Hipparcos, Bright Star Catalogue and NGC 2000.0 nebulae from NASA HEASARC.', 'Hipparcos, Bright Star Catalogue e nebulose NGC 2000.0 da NASA HEASARC.'),
    gaiaDr3: metadata.gaiaDr3 || null, positionNote, overview: t('Stars and nebulae', 'Stelle e nebulose'), renderedStarCount: validStars.length, catalogStarCount: stars.length, nebulaCount: validNebulae.length
  };
  if (hasGaia) context.description += t(' Includes the experimental Gaia DR3 bright-source subset from ESA.',' Include il sottoinsieme sperimentale di sorgenti luminose Gaia DR3 di ESA.');
  return {group, objects, context, lookDirection: selectedDirection, radius: RADIUS, fov: catalogueObjectFov(selectedObject)};
}
