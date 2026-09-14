import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createImmersiveEffects } from '../src/immersive-effects.js';

function setup(options = {}) {
  const parent = new THREE.Group();
  parent.position.set(2, 3, -5);
  parent.rotation.set(0.2, 0.3, -0.1);
  parent.scale.setScalar(0.06);
  const effects = createImmersiveEffects({ parent });
  effects.configure(options);
  effects.setActive(true);
  return { parent, effects, uniforms: effects.group.children[0].material.uniforms };
}

function run(effects, seconds) {
  for (let i = 0; i < seconds * 60; i++) effects.update(1 / 60);
}

test('immersive motion leaves the map and scientific geometry fixed', () => {
  const { parent, effects, uniforms } = setup({ radius: 70 });
  const catalogue = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([1, 2, 3, -8, -2, 19], 3)));
  parent.add(catalogue);
  parent.updateMatrix();
  const initialMatrix = parent.matrix.clone();
  const initialPositions = catalogue.geometry.attributes.position.array.slice();
  const initialBuffers = effects.group.children.map(object => object.geometry.attributes.position.array);
  effects.reveal();
  run(effects, 4);
  effects.select({ position: new THREE.Vector3(1, 2, 3), radius: 2 });
  run(effects, 2);
  parent.updateMatrix();
  assert.deepEqual(parent.matrix.elements, initialMatrix.elements);
  assert.deepEqual(catalogue.geometry.attributes.position.array, initialPositions);
  assert.ok(uniforms.effectTime.value > 5.9);
  effects.group.children.forEach((object, index) => assert.equal(object.geometry.attributes.position.array, initialBuffers[index]));
  effects.dispose();
});

test('opening is explicit and repeated active-state updates never restart it', () => {
  const { effects, uniforms } = setup();
  assert.equal(uniforms.effectRevealStart.value, -100);
  run(effects, 1);
  effects.reveal();
  const started = uniforms.effectRevealStart.value;
  run(effects, 2);
  effects.setActive(true);
  assert.equal(uniforms.effectRevealStart.value, started);
  effects.reveal();
  assert.ok(uniforms.effectRevealStart.value > started);
  effects.setActive(false);
  assert.equal(effects.group.visible, false);
  assert.equal(uniforms.effectRevealStart.value, -100);
  effects.dispose();
});

test('angular sky excludes volumetric dust, scans and local distance cues', () => {
  const { effects, uniforms } = setup({ sky: true });
  effects.reveal();
  effects.select({ position: new THREE.Vector3(0, 10, 0), radius: 1 });
  effects.interact({ type: 'grab-start', points: [new THREE.Vector3(0, 1, -3)] });
  assert.deepEqual(effects.group.children.filter(child => child.visible).map(child => child.name), ['immersive-reference-tracers']);
  assert.ok(uniforms.effectEventStrengths.value.every(value => value === 0));
  effects.configure({ sky: false });
  assert.equal(effects.group.children.every(child => child.visible), true);
  effects.dispose();
});

test('particle visibility and reduced motion apply to all immersive feedback', () => {
  const { effects, uniforms } = setup();
  effects.select({ position: new THREE.Vector3(0, 0, -4), radius: 1 });
  assert.ok(uniforms.effectEventStrengths.value.some(value => value > 0));
  effects.configure({ reducedMotion: true });
  effects.reveal();
  effects.select({ position: new THREE.Vector3(0, 0, -4), radius: 1 });
  const reducedTime = uniforms.effectTime.value;
  run(effects, 2);
  assert.equal(uniforms.effectTime.value, reducedTime);
  assert.equal(uniforms.effectMotion.value, 0);
  assert.equal(uniforms.effectRevealStart.value, -100);
  assert.ok(uniforms.effectEventStrengths.value.every(value => value === 0));
  assert.deepEqual(effects.group.children.filter(child => child.visible).map(child => child.name), ['immersive-volume-dust', 'immersive-reference-tracers']);
  effects.configure({ enabled: false });
  assert.equal(effects.group.visible, false);
  const before = uniforms.effectTime.value;
  run(effects, 2);
  assert.equal(uniforms.effectTime.value, before);
  effects.configure({ enabled: true });
  assert.equal(effects.group.visible, true);
  effects.dispose();
});

test('interaction pool is bounded, preserves local positions and throttles drag trails', () => {
  const { effects, uniforms } = setup({ radius: 80 });
  const point = new THREE.Vector3(1, 2, 3);
  effects.interact({ type: 'grab-start', points: [point] });
  assert.deepEqual(uniforms.effectEvents.value[0].toArray().slice(0, 3), point.toArray());
  effects.interact({ type: 'grab-move', points: [point] });
  assert.equal(uniforms.effectEventStrengths.value.filter(value => value > 0).length, 1);
  run(effects, 0.5);
  effects.interact({ type: 'grab-move', points: [point] });
  assert.equal(uniforms.effectEventStrengths.value.filter(value => value > 0).length, 2);
  for (let i = 0; i < 100; i++) effects.select({ position: point, radius: 1 });
  assert.equal(uniforms.effectEvents.value.length, 4);
  assert.equal(uniforms.effectEventStarts.value.length, 4);
  assert.deepEqual(point.toArray(), [1, 2, 3]);
  effects.dispose();
});

test('quality uses a seeded bounded geometry and shader-aware bounds', () => {
  const { effects } = setup({ radius: 90 });
  const second = setup({ radius: 90 }).effects;
  const dust = effects.group.getObjectByName('immersive-volume-dust');
  const sparks = effects.group.getObjectByName('immersive-selection-sparks');
  assert.equal(effects.group.children.length, 5);
  assert.ok(dust.geometry.drawRange.count + sparks.geometry.attributes.position.count <= 2500);
  assert.deepEqual(dust.geometry.attributes.position.array, second.group.getObjectByName('immersive-volume-dust').geometry.attributes.position.array);
  effects.configure({ quality: 'low' });
  assert.ok(dust.geometry.drawRange.count + sparks.geometry.attributes.position.count <= 1000);
  assert.ok(dust.geometry.boundingSphere.radius > 90);
  for (const child of effects.group.children) {
    assert.equal(child.material.depthWrite, false);
    assert.equal(child.material.transparent, true);
  }
  effects.dispose();
  second.dispose();
});

test('invalid frame values and positions cannot poison pooled uniforms', () => {
  const { effects, uniforms } = setup({ radius: 40 });
  effects.configure({ radius: NaN });
  effects.update(NaN);
  effects.update(-10);
  effects.update(Infinity);
  effects.select({ position: new THREE.Vector3(NaN, 0, 0) });
  assert.equal(uniforms.effectRadius.value, 40);
  assert.equal(uniforms.effectTime.value, 0);
  assert.ok(uniforms.effectEventStrengths.value.every(value => value === 0));
  effects.update(10000);
  assert.equal(uniforms.effectTime.value, 0.1);
  effects.dispose();
});

test('disposal detaches effects and frees every GPU resource once', () => {
  const { parent, effects } = setup();
  const group = effects.group;
  let geometryDisposals = 0, materialDisposals = 0;
  for (const child of group.children) {
    child.geometry.addEventListener('dispose', () => geometryDisposals++);
    child.material.addEventListener('dispose', () => materialDisposals++);
  }
  effects.dispose();
  effects.dispose();
  effects.configure({ enabled: true });
  effects.setActive(true);
  effects.reveal();
  effects.update(1);
  assert.equal(group.parent, null);
  assert.equal(parent.children.includes(group), false);
  assert.equal(group.visible, false);
  assert.equal(geometryDisposals, 5);
  assert.equal(materialDisposals, 5);
});


test('desktop map adjustments give local feedback without replaying the opening', () => {
  const { effects, uniforms } = setup({ radius: 80 });
  effects.reveal();
  const openingStart = uniforms.effectRevealStart.value;
  run(effects, 2);
  effects.interact({ type: 'adjust', points: [new THREE.Vector3(1, 2, 3)] });
  assert.ok(uniforms.effectEventStrengths.value.some(value => value > 0));
  assert.equal(uniforms.effectEvents.value[0].w, 3.2);
  assert.equal(uniforms.effectRevealStart.value, openingStart);
  effects.dispose();
});
