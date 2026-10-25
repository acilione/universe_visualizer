import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { captureAtlasView, directionToGaia } from '../src/atlas-view-state.js';

const same = (actual, expected, epsilon = 1e-10) => assert.ok(actual.distanceTo(expected) < epsilon, `${actual.toArray()} != ${expected.toArray()}`);
function fixture() {
  const scene = new THREE.Scene(), mapRoot = new THREE.Group(), camera = new THREE.PerspectiveCamera(43, 1.5, .1, 500);
  scene.add(mapRoot); scene.add(camera); camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0);
  return { camera, mapRoot, index: 9, boundsRadius: 60, combinedView: { radius: 60 }, selected: null,
    objects: [{ id: 'earth', position: [1, 0, 0] }], viewContext: { id: 'combined', nested: { version: 1 } },
    controls: { target: new THREE.Vector3(1, 2, 3), enabled: true, autoRotate: false, minDistance: .2, maxDistance: 250, minPolarAngle: 0, maxPolarAngle: Math.PI },
    renderer: { xr: { isPresenting: false } }, xr: { isPresenting: false }, preview: { isActive: false }, skyYaw: .3, skyPitch: -.2 };
}

test('atlas capture isolates mutable transforms, orbit state, observer and selected coordinates', () => {
  const atlas = fixture(); atlas.selected = atlas.objects[0]; atlas.systemHost = 'example';
  atlas.constellationData = { figure: { id: 'ori' }, mode: 'space', observer: { latitude: 38, longitude: 15, date: '2026-12-11' } };
  atlas.mapRoot.position.set(3, 4, 5); atlas.mapRoot.scale.setScalar(2);
  const snapshot = captureAtlasView(atlas);
  atlas.camera.position.set(99, 99, 99); atlas.controls.target.set(9, 9, 9); atlas.mapRoot.position.setScalar(8);
  atlas.selected.position[0] = 22; atlas.viewContext.nested.version = 2; atlas.constellationData.observer.latitude = 50; atlas.objects.push({ id: 'moon' });
  same(snapshot.camera.position, new THREE.Vector3(0, 0, 100)); same(snapshot.camera.target, new THREE.Vector3(1, 2, 3)); same(snapshot.mapTransform.position, new THREE.Vector3(3, 4, 5));
  assert.equal(snapshot.selected.position[0], 1); assert.equal(snapshot.context.nested.version, 1); assert.equal(snapshot.constellation.observer.latitude, 38);
  assert.equal(snapshot.objects.length, 1); assert.equal(snapshot.systemHost, 'example'); assert.equal(snapshot.camera.fov, 43); assert.equal(snapshot.controls.maxDistance, 250);
  assert.equal(snapshot.sky.pitch, -.2); assert.equal(snapshot.previewActive, false);
});

test('normal combined entry uses the visible near hemisphere, not camera forward through the sphere', () => {
  const atlas = fixture(); same(directionToGaia(atlas), new THREE.Vector3(0, 0, 1));
  atlas.camera.position.set(0, 0, 0); atlas.camera.lookAt(0, 0, -1); same(directionToGaia(atlas), new THREE.Vector3(0, 0, -1));
});

test('combined bearing handles transformed maps and a selected schematic planet without invented coordinates', () => {
  const atlas = fixture(); atlas.selected = { id: 'earth', bodyKind: 'planet', position: [50, 0, 0] };
  atlas.mapRoot.position.set(10, -5, 4); atlas.mapRoot.rotation.y = .8; atlas.mapRoot.scale.setScalar(2); atlas.mapRoot.updateMatrixWorld(true);
  atlas.camera.position.copy(atlas.mapRoot.localToWorld(new THREE.Vector3(0, 0, 100)));
  atlas.camera.lookAt(atlas.mapRoot.localToWorld(new THREE.Vector3())); same(directionToGaia(atlas), new THREE.Vector3(0, 0, 1));
});

test('selected measured equatorial source takes precedence in a 3D map without altering its epoch', () => {
  const atlas = fixture(); atlas.selected = { id: 'real-source', raDeg: 90, decDeg: 30, positionEpoch: 2000, pmRaMasYr: 10000, position: [25, 1, 9] };
  same(directionToGaia(atlas), new THREE.Vector3(0, .5, -Math.sqrt(3) / 2)); assert.equal(atlas.selected.positionEpoch, 2000); assert.equal(atlas.selected.raDeg, 90);
});

test('an existing angular survey preserves its current bearing instead of its stale selected source', () => {
  const atlas = fixture(); atlas.index = 8; atlas.selected = { raDeg: 90, decDeg: 30 };
  atlas.camera.position.set(0, 0, 0); atlas.camera.lookAt(1, 0, 0); same(directionToGaia(atlas), new THREE.Vector3(1, 0, 0));
  atlas.index = 6; atlas.earthPerspective = true; same(directionToGaia(atlas), new THREE.Vector3(1, 0, 0));
});

test('XR bearing uses the tracked viewer and all capture/direction helpers leave its pose unchanged', () => {
  const atlas = fixture(), xrCamera = new THREE.PerspectiveCamera(80, 1, .01, 1000); xrCamera.position.set(2, 1.65, 3); xrCamera.lookAt(3, 1.65, 3);
  atlas.index = 8; atlas.renderer.xr = { isPresenting: true, getCamera: () => xrCamera }; atlas.xr.isPresenting = true;
  const before = xrCamera.position.clone(), rotation = xrCamera.quaternion.clone(); same(directionToGaia(atlas), new THREE.Vector3(1, 0, 0));
  const snapshot = captureAtlasView(atlas); assert.equal(snapshot.xrActive, true); same(xrCamera.position, before); assert.ok(xrCamera.quaternion.angleTo(rotation) < 1e-10);
});

test('missing mapped shell intersection falls back to finite orientation and invalid targets cannot inject NaNs', () => {
  const atlas = fixture(); atlas.camera.lookAt(0, 100, 100); atlas.selected = { raDeg: NaN, decDeg: 3, position: [5, 6, 7] };
  same(directionToGaia(atlas), atlas.camera.getWorldDirection(new THREE.Vector3())); assert.throws(() => directionToGaia({})); assert.throws(() => captureAtlasView({}));
});
