import * as THREE from 'three';
import { t, formatNumber } from './i18n.js';
import { equatorialVector } from './sky-math.js';
import { createPlanetVisual } from './planet-visuals.js';

const RADIUS = 60;
const CELL_SIZE = 3;
const coordinatesKnown = object => Number.isFinite(object.raDeg) && Number.isFinite(object.decDeg) && Math.abs(object.decDeg) <= 90;
const extentKnown = object => Number.isFinite(object.angularSizeArcmin) && object.angularSizeArcmin > 0;
const colorFor = object => object.color || (object.colorIndex == null ? '#d8e6ff' : object.colorIndex < 0 ? '#b2caff' : object.colorIndex < .45 ? '#e2edff' : object.colorIndex < .85 ? '#fff0ce' : object.colorIndex < 1.4 ? '#ffd29f' : '#ffa87b');
const keyFor = (x, y, z) => `${x},${y},${z}`;
const visibleInTree = object => {for (let node = object; node; node = node.parent) if (!node.visible) return false; return true;};

// Each catalogue stays one GPU batch. Sparse map-local cells are traversed along
// the ray, so controller hover never scans 118,000 individual star records.
function indexedPicking(points, objects, pickRadius) {
  const cells = new Map(), bounds = new THREE.Box3(), point = new THREE.Vector3();
  for (let index = 0; index < objects.length; index++) {
    point.fromArray(objects[index].position);
    bounds.expandByPoint(point);
    const coordinates = point.toArray().map(value => Math.floor(value / CELL_SIZE));
    const key = keyFor(...coordinates);
    let bucket = cells.get(key);
    if (!bucket) {
      const min = new THREE.Vector3(...coordinates.map(value => value * CELL_SIZE));
      bucket = {indices: [], bounds: new THREE.Box3(min.clone().addScalar(-pickRadius), min.addScalar(CELL_SIZE + pickRadius))};
      cells.set(key, bucket);
    }
    bucket.indices.push(index);
  }
  bounds.expandByScalar(pickRadius);
  const inverse = new THREE.Matrix4(), ray = new THREE.Ray(), worldPoint = new THREE.Vector3();
  const stats = points.userData.pickStats = {visitedCells: 0, candidates: 0};
  points.userData.indexedCatalogue = true;
  points.raycast = function (raycaster, intersections) {
    stats.visitedCells = 0; stats.candidates = 0;
    if (!objects.length || !visibleInTree(this)) return;
    inverse.copy(this.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inverse);
    // Slab interval also handles a viewer walking outside the projection sphere.
    let enter = 0, leave = Infinity;
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(ray.direction[axis]) < 1e-14) {
        if (ray.origin[axis] < bounds.min[axis] || ray.origin[axis] > bounds.max[axis]) return;
      } else {
        const a = (bounds.min[axis] - ray.origin[axis]) / ray.direction[axis];
        const b = (bounds.max[axis] - ray.origin[axis]) / ray.direction[axis];
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (enter > leave || leave < 0) return;
    const start = ray.at(enter + 1e-7, new THREE.Vector3());
    const coordinates = start.toArray().map(value => Math.floor(value / CELL_SIZE));
    const origin = ray.origin.toArray(), direction = ray.direction.toArray();
    const step = direction.map(value => Math.sign(value));
    const next = direction.map((value, axis) => value === 0 ? Infinity : ((coordinates[axis] + (value > 0 ? 1 : 0)) * CELL_SIZE - origin[axis]) / value);
    const delta = direction.map(value => value === 0 ? Infinity : Math.abs(CELL_SIZE / value));
    const checked = new Set();
    let distance = enter, bestDistance = Infinity, bestIndex = -1, bestWorldDistance = Infinity;
    const padding = Math.ceil(pickRadius / CELL_SIZE);
    while (distance <= leave && distance <= bestDistance + pickRadius * 2) {
      for (let dx = -padding; dx <= padding; dx++) for (let dy = -padding; dy <= padding; dy++) for (let dz = -padding; dz <= padding; dz++) {
        const key = keyFor(coordinates[0] + dx, coordinates[1] + dy, coordinates[2] + dz);
        if (checked.has(key)) continue;
        checked.add(key); stats.visitedCells++;
        const bucket = cells.get(key);
        if (!bucket || !ray.intersectsBox(bucket.bounds)) continue;
        for (const index of bucket.indices) {
          stats.candidates++;
          point.fromArray(objects[index].position).sub(ray.origin);
          const along = point.dot(ray.direction);
          if (along + pickRadius < 0) continue;
          const perpendicularSq = Math.max(0, point.lengthSq() - along * along);
          if (perpendicularSq > pickRadius * pickRadius) continue;
          const hitDistance = Math.max(0, along - Math.sqrt(pickRadius * pickRadius - perpendicularSq));
          if (hitDistance >= bestDistance) continue;
          ray.at(hitDistance, worldPoint).applyMatrix4(this.matrixWorld);
          const worldDistance = raycaster.ray.origin.distanceTo(worldPoint);
          if (worldDistance < raycaster.near || worldDistance > raycaster.far) continue;
          bestDistance = hitDistance; bestIndex = index; bestWorldDistance = worldDistance;
        }
      }
      const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
      distance = next[axis]; coordinates[axis] += step[axis]; next[axis] += delta[axis];
    }
    if (bestIndex >= 0) intersections.push({
      distance: bestWorldDistance, point: ray.at(bestDistance, new THREE.Vector3()).applyMatrix4(this.matrixWorld),
      index: bestIndex, object: this, dataObject: objects[bestIndex],
    });
  };
}

function cataloguePoints(objects, kind, pixelRatio) {
  const positions = new Float32Array(objects.length * 3), colors = new Float32Array(objects.length * 3);
  const sizes = new Float32Array(objects.length), alphas = new Float32Array(objects.length);
  const star = kind === 'star', nebula = kind === 'nebula';
  objects.forEach((object, index) => {
    positions.set(object.position, index * 3);
    const color = new THREE.Color(star ? colorFor(object) : nebula ? '#98cbc5' : '#ecc28a');
    colors.set([color.r, color.g, color.b], index * 3);
    const magnitude = Number.isFinite(object.mag) ? object.mag : 7;
    sizes[index] = star ? Math.max(1.5, 8 - magnitude * .7) : nebula ? 4 : 3.5;
    alphas[index] = star ? THREE.MathUtils.clamp(Math.pow(10, -.15 * (magnitude - 2)), .09, .95) : nebula ? .65 : .55;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uPixelRatio: {value: pixelRatio}, uOpacity: {value: 1}, uRing: {value: kind === 'exoplanet' ? 1 : 0}},
    vertexShader: `attribute float aSize;attribute float aAlpha;varying vec3 vColor;varying float vAlpha;uniform float uPixelRatio;
      void main(){vColor=color;vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uPixelRatio;}`,
    fragmentShader: `varying vec3 vColor;varying float vAlpha;uniform float uOpacity;uniform float uRing;
      void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float light=mix(exp(-d*d*5.)*.6+exp(-d*d*35.)*.4,exp(-pow((d-.64)*5.,2.)),uRing);gl_FragColor=vec4(vColor,light*vAlpha*uOpacity);}`,
  });
  material.userData.baseOpacity = 1;
  const points = new THREE.Points(geometry, material);
  points.name = `combined-${kind}-points`;
  points.userData.particles = false;
  indexedPicking(points, objects, star ? .17 : .27);
  return points;
}

// All measured extents share one sphere-conforming mesh and one material.
// Opacity is deliberately restrained: these are angular illustrations, not photos.
function nebulaPatches(objects, quality) {
  const extents = objects.filter(extentKnown), segments = quality === 'low' ? 4 : 8;
  const positions = [], uvs = [], seeds = [], indices = [];
  const normal = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), point = new THREE.Vector3();
  extents.forEach((object, patchIndex) => {
    normal.fromArray(object.position).normalize();
    right.crossVectors(Math.abs(normal.y) > .99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), normal).normalize();
    up.crossVectors(normal, right).normalize();
    const tangentRadius = Math.tan(THREE.MathUtils.degToRad(Math.min(object.angularSizeArcmin / 60, 120) / 2));
    const offset = positions.length / 3;
    for (let y = 0; y <= segments; y++) for (let x = 0; x <= segments; x++) {
      point.copy(normal).addScaledVector(right, (x / segments * 2 - 1) * tangentRadius).addScaledVector(up, (y / segments * 2 - 1) * tangentRadius).normalize().multiplyScalar(RADIUS);
      positions.push(point.x, point.y, point.z); uvs.push(x / segments, y / segments); seeds.push(patchIndex * .731);
    }
    for (let y = 0; y < segments; y++) for (let x = 0; x < segments; x++) {
      const a = offset + y * (segments + 1) + x, b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: {uOpacity: {value: .4}},
    vertexShader: `attribute float aSeed;varying vec2 vUv;varying float vSeed;void main(){vUv=uv;vSeed=aSeed;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vSeed;uniform float uOpacity;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p);if(r>1.)discard;float texture=noise(p*4.+vSeed)*.55+noise(p*11.+vSeed)*.3+noise(p*23.+vSeed)*.15;float envelope=pow(max(0.,1.-r*r),1.8);vec3 color=mix(vec3(.26,.49,.56),vec3(.61,.45,.62),texture);gl_FragColor=vec4(color,envelope*(.18+texture*.82)*uOpacity);}`,
  });
  material.userData.baseOpacity = .4;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'combined-nebula-patches';
  mesh.userData.illustrative = true; mesh.userData.particles = false;
  mesh.userData.catalogueObjectIds = extents.map(object => object.id);
  mesh.userData.patchCount = extents.length; mesh.userData.segments = segments;
  return mesh;
}

function solarOrbits(objects) {
  const positions = [], byId = new Map(objects.map(object => [object.id, object]));
  for (const object of objects) {
    const moon = object.bodyKind === 'moon', radius = moon ? object.orbitRadius : object.orbit;
    if (!Number.isFinite(radius) || radius <= 0) continue;
    const center = moon ? byId.get(object.parentId)?.position : [0, 0, 0];
    if (!center) continue;
    const inclination = moon ? object.orbitInclinationRad || 0 : 0;
    for (let i = 0; i < 96; i++) for (const j of [i, i + 1]) {
      const angle = j / 96 * Math.PI * 2;
      positions.push(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius * Math.sin(inclination), center[2] + Math.sin(angle) * radius * Math.cos(inclination));
    }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({color: '#85b4ad', transparent: true, opacity: .13, depthWrite: false});
  material.userData.baseOpacity = .13;
  const orbits = new THREE.LineSegments(geometry, material); orbits.name = 'combined-solar-orbits';
  return orbits;
}

/** A walkable schematic Solar System surrounded by catalogue sky directions. */
export function createCombinedMap({catalogue = {}, planets = [], exoplanets = [], pixelRatio = 1, quality = 'high', planetVisual = createPlanetVisual} = {}) {
  const group = new THREE.Group(); group.name = 'map';
  const layers = Object.fromEntries(['planets', 'stars', 'nebulae'].map(name => {const layer = new THREE.Group();layer.name = `combined-${name}`;group.add(layer);return [name, layer];}));
  const byId = new Map(), objects = [], targets = [], unplacedCounts = {planets: 0, stars: 0, nebulae: 0};
  const positionNote = t(
    'Schematic Solar System with enlarged bodies, surrounded by equatorial sky projections. Projection radius does not encode catalogue distance. Nebula patches illustrate angular extent.',
    'Sistema Solare schematico con corpi amplificati, circondato da proiezioni celesti equatoriali. Il raggio di proiezione non rappresenta la distanza di catalogo. Le nubi illustrano l\u2019estensione angolare.');
  const skyNote = t(
    'Equatorial sky projection around the schematic Solar System. Catalogue distances remain in the object data; this display radius is not a physical distance.',
    'Proiezione celeste equatoriale intorno al Sistema Solare schematico. Le distanze di catalogo restano nelle schede; il raggio visualizzato non \u00e8 una distanza fisica.');
  const hostNote = t(
    'Marker at the host\u2019s catalogue sky direction. Planets in the same system share a direction; individual orbits are not resolved in this projection.',
    'Marcatore nella direzione celeste di catalogo della stella ospite. I pianeti dello stesso sistema condividono una direzione; le singole orbite non sono risolte in questa proiezione.');
  const skyRecords = (entries, layer, host = false) => entries.map(entry => {
    const known = coordinatesKnown(entry);
    const object = {...entry, combinedLayer: layer, position: known ? equatorialVector(entry.raDeg, entry.decDeg, RADIUS) : null, positionKind: known ? 'sky-projection' : 'unplaced', positionNote: host ? `${skyNote} ${hostNote}` : entry.bodyKind === 'nebula' ? `${skyNote} ${positionNote}` : skyNote};
    byId.set(object.id, object);
    if (known) objects.push(object); else unplacedCounts[layer]++;
    return object;
  }).filter(object => object.position);
  const solar = planets.map(entry => {
    const layer = entry.id === 'sun' || entry.bodyKind === 'star' ? 'stars' : 'planets';
    const position = Array.isArray(entry.position) && entry.position.length === 3 && entry.position.every(Number.isFinite) ? [...entry.position] : null;
    const object = {...entry, combinedLayer: layer, position, positionNote: `${entry.positionNote || ''} ${positionNote}`.trim()};
    byId.set(object.id, object);
    if (position) objects.push(object); else unplacedCounts[layer]++;
    return object;
  }).filter(object => object.position);
  for (const object of solar) {
    const body = new THREE.Group(); body.position.fromArray(object.position); body.userData.object = object;
    const visual = planetVisual(object); body.add(visual);
    const radius = object.bodyKind === 'moon' ? Math.max((object.size || .1) * 1.15, .08) : Math.max(object.size || .5, .52);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial({visible: false}));
    hit.name = `combined-target-${object.id}`; hit.userData.object = object;
    // Three.js does not inspect ancestor visibility during a direct target raycast.
    const raycast = hit.raycast;
    hit.raycast = function (raycaster, intersections) {if (visibleInTree(this)) raycast.call(this, raycaster, intersections);};
    body.add(hit); targets.push(hit); layers[object.combinedLayer].add(body);
  }
  layers.planets.add(solarOrbits(solar));
  const stars = skyRecords(catalogue.stars || [], 'stars');
  const nebulae = skyRecords(catalogue.nebulae || [], 'nebulae');
  const hosts = skyRecords(exoplanets, 'planets', true);
  for (const [records, kind, layer] of [[stars, 'star', 'stars'], [nebulae, 'nebula', 'nebulae'], [hosts, 'exoplanet', 'planets']]) {
    const points = cataloguePoints(records, kind, pixelRatio); layers[layer].add(points); targets.push(points);
  }
  const patches = nebulaPatches(nebulae, quality);
  layers.nebulae.add(patches);
  const context = {
    id: 'combined-map', mode: 'combined-map', name: t('Combined immersive map', 'Mappa immersiva combinata'), short: t('Combined map', 'Mappa combinata'),
    extent: t('Solar System + equatorial sky', 'Sistema Solare + cielo equatoriale'), metric: t('PLACED OBJECTS', 'OGGETTI POSIZIONATI'), count: formatNumber(objects.length),
    description: t('Solar System bodies, NASA catalogue stars, nebulae and confirmed exoplanet host directions in one view.', 'Corpi del Sistema Solare, stelle dei cataloghi NASA, nebulose e direzioni delle stelle con esopianeti confermati in una vista.'),
    source: 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/hipparcos.html', positionNote,
    overview: t('Planets, stars and nebulae', 'Pianeti, stelle e nebulose'),
    renderedStarCount: stars.length, catalogStarCount: (catalogue.stars || []).length, nebulaCount: nebulae.length, catalogNebulaCount: (catalogue.nebulae || []).length,
    exoplanetCount: hosts.length, catalogExoplanetCount: exoplanets.length, solarBodyCount: solar.length,
    unplacedCounts, unplacedCount: Object.values(unplacedCounts).reduce((sum, count) => sum + count, 0),
    nebulaPatchCount: nebulae.filter(extentKnown).length,
  };
  return {
    group, objects, targets, context, radius: RADIUS, layers, byId,
    setLayer(name, visible) {if (!Object.hasOwn(layers, name)) throw new RangeError(`Unknown combined map layer: ${name}`);layers[name].visible = Boolean(visible);},
    getObject(id) {return byId.get(id);},
    setQuality(nextQuality, nextPixelRatio = pixelRatio) {
      pixelRatio = Number.isFinite(nextPixelRatio) && nextPixelRatio > 0 ? nextPixelRatio : pixelRatio;
      for (const target of targets) if (target.userData.indexedCatalogue) target.material.uniforms.uPixelRatio.value = pixelRatio;
      const segments = nextQuality === 'low' ? 4 : 8;
      if (patches.userData.segments !== segments) {
        const replacement = nebulaPatches(nebulae, nextQuality);
        patches.geometry.dispose(); patches.geometry = replacement.geometry;
        patches.userData.segments = segments;
        replacement.material.dispose();
      }
    },
  };
}
