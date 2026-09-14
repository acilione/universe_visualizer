import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogueSkyView, catalogueObjectFov } from '../src/catalogue-sky-visuals.js';
import { equatorialVector } from '../src/sky-math.js';

const star = (id, raDeg, decDeg, extra = {}) => ({id, name: id, bodyKind: 'catalog-star', raDeg, decDeg, mag: 4, distanceLy: null, source: 'NASA HEASARC', ...extra});
const nebula = (id, raDeg, decDeg, extra = {}) => ({id, name: id, bodyKind: 'nebula', raDeg, decDeg, angularSizeArcmin: 60, distanceLy: null, source: 'NASA HEASARC', ...extra});
const dispose = view => view.group.traverse(object => {object.geometry?.dispose();object.material?.dispose();});
const close = (actual, expected, tolerance = .00001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

test('NASA catalogue objects use J2000 angular directions without assigning unknown distances', () => {
  const selected = nebula('ngc-1976', 83.82, -5.39);
  const stars = [star('bsc-1', 0, 0, {distanceLy: 4}), star('hip-2', 90, -90, {distanceLy: 1000}), star('hip-3', 359.9, 89.9)];
  const view = createCatalogueSkyView({stars, nebulae: [selected]}, selected);
  try {
    assert.equal(view.objects[0].id, selected.id);
    assert.equal(view.objects[0].distanceLy, null);
    assert.equal(view.objects.find(object => object.id === 'hip-2').distanceLy, 1000);
    for (const object of view.objects) {
      close(Math.hypot(...object.position), 60);
      const expected = equatorialVector(object.raDeg, object.decDeg, 60);
      object.position.forEach((value, index) => close(value, expected[index]));
      assert.equal(object.positionKind, 'sky-projection');
    }
    assert.equal(view.context.mode, 'catalogue-sky');
    assert.equal(view.context.nebulaCount, 1);
    assert.equal(view.context.renderedStarCount, 3);
    assert.deepEqual(view.lookDirection.toArray(), equatorialVector(selected.raDeg, selected.decDeg));
    assert.ok(!Object.hasOwn(selected, 'position'), 'catalogue entries must not be mutated');
  } finally {dispose(view);}
});

test('a full 120,000-star catalogue remains one point cloud with at most 40 interactive labels', () => {
  const stars = Array.from({length: 120000}, (_, i) => star(`hip-${i}`, i * 137.508 % 360, Math.asin(i / 60000 - 1) * 180 / Math.PI, {mag: i % 11}));
  const selected = stars[90123];
  const view = createCatalogueSkyView({stars, nebulae: []}, selected, {pixelRatio: 1.5});
  try {
    const cloud = view.group.getObjectByName('nasa-catalogue-stars');
    assert.equal(cloud.geometry.attributes.position.count, stars.length);
    assert.equal(cloud.material.uniforms.uPixelRatio.value, 1.5);
    assert.equal(cloud.userData.particles, false);
    assert.equal(view.objects.length, 40);
    assert.equal(view.objects[0].id, selected.id);
    assert.equal(new Set(view.objects.map(object => object.id)).size, 40);
    assert.ok(!view.group.getObjectByName('nebula-angular-illustration'));
  } finally {dispose(view);}
});

test('nebula illustration follows catalogue angular diameter and stays on the sky sphere', () => {
  const selected = nebula('ngc-7009', 313.3, -11.36, {angularSizeArcmin: 1.2});
  const view = createCatalogueSkyView({stars: [], nebulae: [selected]}, selected);
  try {
    const patch = view.group.getObjectByName('nebula-angular-illustration');
    assert.equal(patch.userData.illustrative, true);
    assert.equal(patch.userData.angularDiameterDeg, .02);
    const positions = patch.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) close(Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)), 60);
    const centreRow = 12 * 25;
    const left = [positions.getX(centreRow), positions.getY(centreRow), positions.getZ(centreRow)];
    const right = [positions.getX(centreRow + 24), positions.getY(centreRow + 24), positions.getZ(centreRow + 24)];
    const cosine = left.reduce((sum, value, i) => sum + value * right[i], 0) / Math.hypot(...left) / Math.hypot(...right);
    close(Math.acos(Math.min(1, cosine)) * 180 / Math.PI, .02, .00001);
    close(view.fov, .056);
  } finally {dispose(view);}
});

test('missing angular extent yields a catalogue position without a fabricated cloud size', () => {
  const selected = nebula('ngc-unknown', 10, 20, {angularSizeArcmin: null});
  const view = createCatalogueSkyView({stars: [star('bad', null, null)], nebulae: [selected]}, selected);
  try {
    assert.ok(!view.group.getObjectByName('nebula-angular-illustration'));
    assert.equal(view.context.renderedStarCount, 0);
    assert.equal(view.fov, 35);
    assert.equal(view.objects[0].angularSizeArcmin, null);
    assert.equal(catalogueObjectFov({...selected, angularSizeArcmin: .001}), .05);
    assert.equal(catalogueObjectFov({...selected, angularSizeArcmin: 5000}), 70);
    assert.throws(() => createCatalogueSkyView({stars: [], nebulae: []}, {...selected, decDeg: 100}), RangeError);
  } finally {dispose(view);}
});
