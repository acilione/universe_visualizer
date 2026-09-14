import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombinedMap } from '../src/combined-map.js';
import { equatorialVector } from '../src/sky-math.js';

const star = (id, raDeg, decDeg, extra = {}) => ({id, name: id, bodyKind: 'catalog-star', raDeg, decDeg, mag: 4, distanceLy: null, ...extra});
const nebula = (id, raDeg, decDeg, extra = {}) => ({id, name: id, bodyKind: 'nebula', raDeg, decDeg, angularSizeArcmin: 60, distanceLy: null, ...extra});
const make = options => createCombinedMap({planetVisual: () => new THREE.Group(), ...options});
const dispose = view => view.group.traverse(object => {object.geometry?.dispose();object.material?.dispose();});
const close = (actual, expected, tolerance = .00001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const rayAt = (view, position, origin = new THREE.Vector3()) => {
  view.group.updateMatrixWorld(true);
  const target = new THREE.Vector3(...position).applyMatrix4(view.group.matrixWorld);
  return new THREE.Raycaster(origin, target.sub(origin).normalize());
};

test('combined map retains every catalogue record and assigns only measured sky directions', () => {
  const stars = [star('hip-1', 0, 0, {distanceLy: 4}), star('hip-2', 90, -90, {distanceLy: 10000}), star('hip-missing', null, null)];
  const nebulae = [nebula('ngc-1', 359.9, 89.9), nebula('ngc-missing', 10, 91)];
  const exoplanets = [{id: 'exo-1', bodyKind: 'exoplanet', raDeg: 90, decDeg: 30, distancePc: null, position: [8, 0, 2]}, {id: 'exo-missing', bodyKind: 'exoplanet', raDeg: null, decDeg: null, position: [5, 0, 0]}];
  const view = make({catalogue: {stars, nebulae}, exoplanets});
  try {
    assert.equal(view.objects.length, 4); assert.equal(view.byId.size, 7);
    assert.deepEqual(view.context.unplacedCounts, {stars: 1, nebulae: 1, planets: 1});
    assert.equal(view.context.unplacedCount, 3); assert.equal(view.context.exoplanetCount, 1);
    assert.equal(view.getObject('exo-missing').position, null);
    assert.equal(view.getObject('exo-1').distancePc, null);
    assert.match(view.getObject('exo-1').positionNote, /host.*catalogue sky direction/);
    for (const object of view.objects) {
      assert.equal(object.positionKind, 'sky-projection');
      close(Math.hypot(...object.position), 60);
      assert.deepEqual(object.position, equatorialVector(object.raDeg, object.decDeg, 60));
    }
    assert.equal(view.getObject('hip-2').distanceLy, 10000);
    assert.ok(!Object.hasOwn(stars[0], 'position'));
    assert.deepEqual(exoplanets[0].position, [8, 0, 2]);
    assert.equal(view.context.mode, 'combined-map');
    assert.ok(Object.values(view.layers).every(layer => layer.visible));
  } finally {dispose(view);}
});

test('Solar System stays schematic; Sun follows Stars and moons follow Planets', () => {
  const planets = [
    {id: 'sun', bodyKind: 'star', size: 1.25, position: [0, 0, 0]},
    {id: 'earth', bodyKind: 'planet', size: .53, position: [7, 0, 1], orbit: 7},
    {id: 'moon', bodyKind: 'moon', parentId: 'earth', size: .15, position: [8, 0, 1], orbitRadius: 1},
  ];
  const view = make({planets});
  try {
    assert.equal(view.objects.length, 3); assert.equal(view.context.solarBodyCount, 3);
    assert.equal(view.getObject('sun').combinedLayer, 'stars');
    assert.equal(view.getObject('earth').combinedLayer, 'planets');
    assert.equal(view.getObject('moon').combinedLayer, 'planets');
    assert.notEqual(view.getObject('earth').position, planets[1].position);
    assert.deepEqual(view.getObject('earth').position, planets[1].position);
    assert.equal(view.targets.length, 6, 'only solar proxies and three catalogue batches');
    assert.equal(view.group.getObjectByName('combined-solar-orbits').geometry.attributes.position.count, 384);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 0, -1));
    view.group.updateMatrixWorld(true);
    assert.equal(ray.intersectObjects(view.targets, false)[0].object.userData.object.id, 'sun');
    view.setLayer('stars', false);
    assert.equal(ray.intersectObjects(view.targets, false).length, 0, 'disabled ancestors also suppress direct proxy raycasts');
    assert.equal(view.layers.planets.visible, true);
    assert.throws(() => view.setLayer('galaxies', true), RangeError);
  } finally {dispose(view);}
});

test('120,000 stars stay in one batch with bounded spatial picking instead of per-star targets', () => {
  const stars = Array.from({length: 120000}, (_, i) => star(`hip-${i}`, i * 137.508 % 360, Math.asin(i / 60000 - 1) * 180 / Math.PI, {mag: i % 11}));
  const view = make({catalogue: {stars}, pixelRatio: 1.5});
  try {
    const cloud = view.group.getObjectByName('combined-star-points');
    assert.equal(cloud.geometry.attributes.position.count, 120000);
    assert.equal(cloud.material.uniforms.uPixelRatio.value, 1.5);
    assert.equal(cloud.userData.particles, false);
    assert.equal(view.objects.length, 120000); assert.equal(view.targets.length, 3);
    assert.equal(view.group.children.flatMap(layer => layer.children).length, 5);
    const selected = view.getObject('hip-81234');
    const hits = rayAt(view, selected.position).intersectObjects(view.targets, false);
    assert.equal(hits.length, 1); assert.equal(hits[0].dataObject, selected);
    assert.ok(cloud.userData.pickStats.candidates < 500, `tested ${cloud.userData.pickStats.candidates} candidates`);
    assert.ok(cloud.userData.pickStats.visitedCells < 3000);
  } finally {dispose(view);}
});

test('all known nebula extents render in one sphere-conforming mesh at both quality levels', () => {
  const nebulae = [nebula('ngc-1', 83.8, -5.4, {angularSizeArcmin: 120}), nebula('ngc-2', 90, -90, {angularSizeArcmin: 2}), nebula('ngc-3', 10, 20, {angularSizeArcmin: null})];
  const high = make({catalogue: {nebulae}}), low = make({catalogue: {nebulae}, quality: 'low'});
  try {
    for (const view of [high, low]) {
      const mesh = view.group.getObjectByName('combined-nebula-patches');
      assert.equal(mesh.userData.patchCount, 2); assert.equal(mesh.userData.particles, false);
      assert.deepEqual(mesh.userData.catalogueObjectIds, ['ngc-1', 'ngc-2']);
      assert.equal(view.context.nebulaCount, 3); assert.equal(view.context.nebulaPatchCount, 2);
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) close(Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)), 60);
      const segments = mesh.userData.segments, row = segments / 2 * (segments + 1);
      const left = new THREE.Vector3().fromBufferAttribute(positions, row).normalize();
      const right = new THREE.Vector3().fromBufferAttribute(positions, row + segments).normalize();
      close(THREE.MathUtils.radToDeg(left.angleTo(right)), 2);
    }
    assert.ok(low.group.getObjectByName('combined-nebula-patches').geometry.attributes.position.count < high.group.getObjectByName('combined-nebula-patches').geometry.attributes.position.count);
  } finally {dispose(high);dispose(low);}
});

test('layer changes preserve GPU buffers and map coordinates while hidden layers cannot be picked', () => {
  const view = make({catalogue: {stars: [star('star', 0, 0)], nebulae: [nebula('nebula', 0, 0)]}, exoplanets: [{id: 'exo', bodyKind: 'exoplanet', raDeg: 0, decDeg: 0}]});
  try {
    view.group.position.set(5, 2, -3); view.group.rotation.set(.2, .8, -.1); view.group.scale.setScalar(.08);
    view.group.updateMatrixWorld(true);
    const matrix = view.group.matrixWorld.clone(), buffers = view.targets.map(target => target.geometry);
    const centre = view.group.localToWorld(new THREE.Vector3());
    const ray = rayAt(view, [60, 0, 0], centre);
    assert.equal(ray.intersectObjects(view.targets, false).length, 3);
    view.setLayer('planets', false); view.setLayer('stars', false);
    const hits = ray.intersectObjects(view.targets, false);
    assert.equal(hits.length, 1); assert.equal(hits[0].dataObject.id, 'nebula');
    view.setLayer('nebulae', false); assert.equal(ray.intersectObjects(view.targets, false).length, 0);
    view.setLayer('stars', true); assert.equal(ray.intersectObjects(view.targets, false)[0].dataObject.id, 'star');
    assert.deepEqual(view.group.matrixWorld.elements, matrix.elements);
    view.targets.forEach((target, index) => assert.equal(target.geometry, buffers[index]));
  } finally {dispose(view);}
});

test('indexed picking handles translated walkers, opposite rays, and world near/far clipping', () => {
  const view = make({catalogue: {stars: [star('east', 0, 0), star('west', 180, 0), star('north', 0, 90)]}});
  try {
    view.group.scale.setScalar(.1); view.group.position.set(2, 3, -1); view.group.updateMatrixWorld(true);
    const outside = new THREE.Vector3(20, 3, -1);
    const ray = rayAt(view, [60, 0, 0], outside);
    assert.equal(ray.intersectObjects(view.targets, false)[0].dataObject.id, 'east');
    ray.far = 5; assert.equal(ray.intersectObjects(view.targets, false).length, 0);
    ray.far = 100; ray.near = 13;
    assert.equal(ray.intersectObjects(view.targets, false)[0].dataObject.id, 'west');
    assert.equal(rayAt(view, [0, 60, 0], new THREE.Vector3(2, 0, -1)).intersectObjects(view.targets, false)[0].dataObject.id, 'north');
  } finally {dispose(view);}
});


test('quality updates preserve the map anchor, catalogue buffers, layer state and every object', () => {
  const view = make({catalogue: {stars: [star('star', 0, 0)], nebulae: [nebula('nebula', 0, 30)]}});
  try {
    view.group.position.set(3, 4, 5); view.group.rotation.set(.1, .2, .3); view.group.scale.setScalar(.09);
    view.group.updateMatrixWorld(true); view.setLayer('stars', false);
    const matrix = view.group.matrixWorld.clone(), objects = view.objects, layers = Object.values(view.layers);
    const points = view.targets.filter(target => target.isPoints), geometries = points.map(target => target.geometry);
    const patches = view.group.getObjectByName('combined-nebula-patches');
    const originalPatchVertices = patches.geometry.attributes.position.count;
    view.setQuality('low', 1.2);
    assert.equal(view.objects, objects); assert.equal(view.objects.length, 2);
    assert.deepEqual(view.group.matrixWorld.elements, matrix.elements);
    assert.deepEqual(Object.values(view.layers), layers); assert.equal(view.layers.stars.visible, false);
    points.forEach((point, index) => {assert.equal(point.geometry, geometries[index]);assert.equal(point.material.uniforms.uPixelRatio.value, 1.2);});
    assert.equal(view.group.getObjectByName('combined-nebula-patches'), patches);
    assert.equal(patches.userData.patchCount, 1); assert.ok(patches.geometry.attributes.position.count < originalPatchVertices);
    view.setQuality('high', 2);
    assert.equal(patches.geometry.attributes.position.count, originalPatchVertices);
    assert.equal(view.layers.stars.visible, false);
  } finally {dispose(view);}
});
