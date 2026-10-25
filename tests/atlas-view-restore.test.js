import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Universe } from '../src/universe.js';
import { captureAtlasView } from '../src/atlas-view-state.js';

function fixture({ previewActive = false } = {}) {
  const engine = Object.create(Universe.prototype);
  const camera = new THREE.PerspectiveCamera(47, 1.5, .02, 1200);
  camera.position.set(3, 5, 9); camera.lookAt(1, 2, 0); camera.zoom = 1.2; camera.updateProjectionMatrix();
  const mapRoot = new THREE.Group(); mapRoot.position.set(2, -1, 4); mapRoot.rotation.y = .3; mapRoot.scale.setScalar(1.8);
  const source = { id: 'betelgeuse', position: [20, 4, -8], bodyKind: 'catalog-star' };
  const selected = [], restoredPreview = [];
  let resolveBuilder;
  Object.assign(engine, {
    camera, mapRoot, index: 6, viewRequest: 0, disposed: false,
    objects: [source], selected: source, viewContext: { id: 'Ori' },
    constellationData: { figure: { id: 'Ori' }, mode: 'space', observer: { latitude: 38, longitude: 15, dateIso: '2026-12-11T19:00:00.000Z' } },
    controls: { target: new THREE.Vector3(1, 2, 0), enabled: !previewActive, autoRotate: false, minDistance: .3, maxDistance: 250 },
    renderer: { xr: { isPresenting: false } }, xr: { isPresenting: false },
    preview: { isActive: previewActive, captureNavigationState: () => ({ token: 'saved-room-pose' }),
      restoreNavigationState: value => { restoredPreview.push(value); return Promise.resolve(true); } },
    earthVisible: false, earthPerspective: false, skyYaw: .6, skyPitch: -.2,
    focusedPlanet: null, focusedMoonSystem: null, elapsed: 12, content: new THREE.Group(),
    selectObject(object) { selected.push(object); this.selected = object; },
    updateMoonOrbits() { this.moonUpdates = (this.moonUpdates || 0) + 1; },
    resetView(immediate) { assert.equal(immediate, true); this.normalResets = (this.normalResets || 0) + 1; },
    showConstellation() {
      this.viewRequest++;
      return new Promise(resolve => { resolveBuilder = resolve; });
    },
  });
  const saved = captureAtlasView(engine);
  engine.index = 8; engine.objects = [{ id: 'gaia-survey-centre', position: [0, 0, -60] }]; engine.selected = engine.objects[0];
  camera.position.set(0, 0, 0); camera.quaternion.identity(); camera.fov = 70; camera.zoom = 1; camera.updateProjectionMatrix();
  mapRoot.position.set(0, 0, 0); mapRoot.quaternion.identity(); mapRoot.scale.setScalar(1);
  engine.controls.target.set(0, 0, -60); engine.controls.enabled = false; engine.controls.minDistance = .01;
  engine.skyYaw = 2; engine.skyPitch = .4;
  return { engine, saved, selected, restoredPreview,
    finish(result = true) { resolveBuilder(result); },
    installBuiltView() {
      engine.index = 6; engine.objects = [{ ...source, position: source.position.slice() }]; engine.selected = engine.objects[0];
      camera.position.set(11, 12, 13); camera.lookAt(0, 0, 0); camera.fov = 44; camera.zoom = 1; camera.updateProjectionMatrix();
    },
  };
}
const pose = camera => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov, zoom: camera.zoom });

test('cancelled async constellation restoration cannot apply an old selection or pose to a newer view', async () => {
  const f = fixture();
  const pending = f.engine.restoreAtlasView(f.saved);
  f.engine.viewRequest++; f.engine.index = 2;
  const newObject = { id: 'milkyway', position: [0, 0, 0] };
  f.engine.objects = [newObject]; f.engine.selected = newObject;
  f.engine.camera.position.set(80, 90, 100); f.engine.camera.lookAt(0, 0, 0);
  const current = pose(f.engine.camera);
  f.finish(false); await pending;
  assert.equal(f.engine.index, 2); assert.equal(f.engine.selected, newObject);
  assert.deepEqual(f.selected, []); assert.deepEqual(pose(f.engine.camera), current);
  assert.equal(f.engine.moonUpdates, undefined);
});

test('preview exit during awaited restoration cannot put an immersive camera pose into the normal atlas', async () => {
  const f = fixture({ previewActive: true });
  const pending = f.engine.restoreAtlasView(f.saved);
  f.engine.preview.isActive = false;
  f.installBuiltView(); const normalPose = pose(f.engine.camera);
  f.finish(true); await pending;
  assert.deepEqual(pose(f.engine.camera), normalPose);
  assert.deepEqual(f.restoredPreview, []); assert.deepEqual(f.selected, []);
});

test('a preview snapshot restored after preview already exited retains the normal builder camera', async () => {
  const f = fixture({ previewActive: true }); f.engine.preview.isActive = false;
  const pending = f.engine.restoreAtlasView(f.saved);
  f.installBuiltView(); const normalPose = pose(f.engine.camera);
  f.finish(true); await pending;
  assert.deepEqual(pose(f.engine.camera), normalPose);
  assert.deepEqual(f.restoredPreview, []); assert.equal(f.engine.normalResets, 1);
});

test('valid normal restoration restores the saved camera, orbit target, map transform and selected canonical record', async () => {
  const f = fixture(); const pending = f.engine.restoreAtlasView(f.saved);
  f.installBuiltView(); const canonical = f.engine.objects[0]; f.finish(true); await pending;
  assert.equal(f.engine.selected, canonical); assert.deepEqual(f.selected, [canonical]);
  assert.deepEqual(f.engine.camera.position.toArray(), f.saved.camera.position.toArray());
  assert.deepEqual(f.engine.camera.quaternion.toArray(), f.saved.camera.quaternion.toArray());
  assert.deepEqual(f.engine.camera.up.toArray(), f.saved.camera.up.toArray());
  assert.equal(f.engine.camera.fov, f.saved.camera.fov); assert.equal(f.engine.camera.zoom, f.saved.camera.zoom);
  assert.deepEqual(f.engine.controls.target.toArray(), f.saved.camera.target.toArray());
  assert.equal(f.engine.controls.enabled, true); assert.equal(f.engine.controls.minDistance, .3);
  assert.deepEqual(f.engine.mapRoot.position.toArray(), f.saved.mapTransform.position.toArray());
  assert.deepEqual(f.engine.mapRoot.quaternion.toArray(), f.saved.mapTransform.quaternion.toArray());
  assert.deepEqual(f.engine.mapRoot.scale.toArray(), f.saved.mapTransform.scale.toArray());
  assert.equal(f.engine.skyYaw, f.saved.sky.yaw); assert.equal(f.engine.skyPitch, f.saved.sky.pitch);
  assert.equal(f.engine.content.userData.born, f.engine.elapsed - 2);
});

test('valid preview restoration delegates its saved navigation state without applying ordinary orbit transforms', async () => {
  const f = fixture({ previewActive: true }); const pending = f.engine.restoreAtlasView(f.saved);
  f.installBuiltView(); const builtPose = pose(f.engine.camera); f.finish(true); await pending;
  assert.deepEqual(f.restoredPreview, [f.saved.preview]);
  assert.deepEqual(pose(f.engine.camera), builtPose, 'the preview component owns restoration of its viewer and map');
});
