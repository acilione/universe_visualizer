import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDesktopImmersive } from '../src/desktop-immersive.js';

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) { const callbacks = this.listeners.get(type) || []; callbacks.push(callback); this.listeners.set(type, callbacks); }
  removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); }
  fire(type, details = {}) {
    const event = { target: this, button: 0, pointerId: 1, clientX: 400, clientY: 300,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...details };
    for (const callback of this.listeners.get(type) || []) { callback(event); if (event.stopped) break; }
    return event;
  }
}
function fixture() {
  const win = new Events();
  const doc = new Events(); doc.defaultView = win; doc.hidden = false; doc.activeElement = null;
  doc.querySelector = () => doc.modal ? {} : null;
  doc.exitPointerLock = () => { doc.pointerLockElement = null; doc.fire('pointerlockchange'); };
  const canvas = new Events(); canvas.ownerDocument = doc; canvas.style = { cursor: 'crosshair', touchAction: 'pan-y' };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  const captures = new Set();
  canvas.setPointerCapture = id => captures.add(id); canvas.hasPointerCapture = id => captures.has(id);
  canvas.releasePointerCapture = id => { captures.delete(id); canvas.fire('lostpointercapture', { pointerId: id }); };
  canvas.requestPointerLock = async () => { doc.pointerLockElement = canvas; doc.fire('pointerlockchange'); };
  const camera = new THREE.PerspectiveCamera(44, 4 / 3, .04, 850);
  camera.position.set(2, 27, 41); camera.lookAt(1, 2, 3); camera.zoom = 1.3; camera.updateProjectionMatrix();
  const root = new THREE.Group(); root.position.set(2, 3, 4); root.rotation.set(.1, .3, .2); root.scale.setScalar(1.4);
  const scene = new THREE.Scene(); scene.add(root);
  const controls = { enabled: true, autoRotate: true, target: new THREE.Vector3(1, 2, 3) };
  const changes = [], selected = [], messages = [], targets = [], mapActions = [];
  let mode = 'atlas';
  const preview = createDesktopImmersive({ canvas, camera, controls, mapRoot: root, getBoundsRadius: () => 30,
    getPresentationMode: () => mode, getTargets: () => targets,
    onSelect: object => selected.push(object), onChange: (active, state) => changes.push({ active, ...state }), onMessage: message => messages.push(message), onMapAction: event => mapActions.push(event),
  });
  const addTarget = (position, id = 'target') => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.6, 12, 8), new THREE.MeshBasicMaterial());
    mesh.position.copy(position); mesh.userData.object = { id, name: id, position: position.toArray() };
    root.add(mesh); targets.push(mesh); return mesh;
  };
  return { preview, camera, controls, root, scene, doc, win, canvas, changes, selected, messages, targets, mapActions, addTarget,
    setMode(value) { mode = value; }, dispose() { preview.dispose(); targets.forEach(target => { target.geometry.dispose(); target.material.dispose(); }); },
  };
}
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const cameraSnapshot = camera => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
  fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom, projection: camera.projectionMatrix.toArray() });
const rootSnapshot = root => ({ position: root.position.toArray(), quaternion: root.quaternion.toArray(), scale: root.scale.toArray() });

// This verifies independent first-person movement rather than reusing orbit controls.
test('desktop walking changes the viewer while the map remains in fixed world coordinates', () => {
  const f = fixture();
  try {
    assert.equal(f.preview.enter(), true);
    assert.equal(f.preview.isActive, true);
    assert.equal(f.controls.enabled, false); assert.equal(f.controls.autoRotate, false);
    assert.deepEqual(f.camera.position.toArray(), [0, 1.65, 0]);
    close(f.root.scale.x * 30, 6);
    const fixedMap = rootSnapshot(f.root);
    const key = f.doc.fire('keydown', { code: 'KeyW' }); assert.equal(key.defaultPrevented, true);
    for (let i = 0; i < 10; i++) f.preview.update(.1);
    close(f.camera.position.z, -1.5); close(f.camera.position.y, 1.65);
    assert.deepEqual(rootSnapshot(f.root), fixedMap);
    f.doc.fire('keyup', { code: 'KeyW' });
    f.doc.fire('keydown', { code: 'KeyE' }); f.preview.update(.1);
    close(f.camera.position.y, 1.8);
    f.doc.fire('keyup', { code: 'KeyE' });
    f.doc.fire('keydown', { code: 'KeyD' }); f.doc.fire('keydown', { code: 'ShiftLeft' }); f.preview.update(.1);
    close(f.camera.position.x, .45);
    assert.deepEqual(rootSnapshot(f.root), fixedMap);
  } finally { f.dispose(); }
});

test('exit restores root, camera, projection and orbit state even after map manipulation', async () => {
  const f = fixture();
  try {
    const initialCamera = cameraSnapshot(f.camera), initialRoot = rootSnapshot(f.root), target = f.controls.target.toArray();
    f.preview.enter(); await f.preview.lockPointer();
    assert.equal(f.preview.isPointerLocked, true);
    f.preview.scaleMap(2); f.preview.rotateMap(.7);
    f.controls.target.set(9, 8, 7);
    f.preview.exit();
    assert.deepEqual(cameraSnapshot(f.camera), initialCamera);
    assert.deepEqual(rootSnapshot(f.root), initialRoot);
    assert.deepEqual(f.controls.target.toArray(), target);
    assert.equal(f.controls.enabled, true); assert.equal(f.controls.autoRotate, true);
    assert.equal(f.preview.isActive, false); assert.equal(f.preview.isPointerLocked, false);
    assert.equal(f.canvas.style.cursor, 'crosshair'); assert.equal(f.canvas.style.touchAction, 'pan-y');
    assert.equal(f.changes.at(-1).active, false);
  } finally { f.dispose(); }
});

test('input fields, modal dialogs, blur and visibility changes stop desktop movement', () => {
  const f = fixture();
  try {
    f.preview.enter();
    const field = { closest: () => ({}) };
    assert.equal(f.doc.fire('keydown', { code: 'KeyW', target: field }).defaultPrevented, undefined);
    f.preview.update(.1); close(f.camera.position.z, 0);
    f.doc.fire('keydown', { code: 'KeyW' }); f.doc.modal = true; f.preview.update(.1);
    close(f.camera.position.z, 0);
    f.doc.modal = false; f.preview.update(.1); close(f.camera.position.z, 0);
    f.doc.fire('keydown', { code: 'KeyW' }); f.win.fire('blur'); f.preview.update(.1); close(f.camera.position.z, 0);
    f.doc.fire('keydown', { code: 'KeyW' }); f.doc.hidden = true; f.doc.fire('visibilitychange'); f.doc.hidden = false;
    f.preview.update(.1); close(f.camera.position.z, 0);
  } finally { f.dispose(); }
});

test('drag look uses viewer orientation for walking and does not select objects', () => {
  const f = fixture();
  try {
    f.preview.enter(); const fixedMap = rootSnapshot(f.root);
    f.canvas.fire('pointerdown');
    f.canvas.fire('pointermove', { clientX: 800, clientY: 300 });
    f.canvas.fire('pointerup', { clientX: 800, clientY: 300 });
    assert.equal(f.selected.length, 0);
    assert.equal(f.canvas.hasPointerCapture(1), false);
    f.doc.fire('keydown', { code: 'KeyW' }); f.preview.update(.1);
    assert.ok(f.camera.position.x > .12); assert.ok(f.camera.position.z < -.08);
    assert.deepEqual(rootSnapshot(f.root), fixedMap);
    f.canvas.fire('pointerdown'); f.canvas.fire('pointermove', { clientX: 400, clientY: 99999 });
    assert.ok(Number.isFinite(f.camera.quaternion.x));
    const forward = f.camera.getWorldDirection(new THREE.Vector3()); assert.ok(forward.y < -.99);
    f.preview.exit(); assert.equal(f.canvas.hasPointerCapture(1), false);
  } finally { f.dispose(); }
});

test('click rays select room objects and sky targets 60 metres away', () => {
  for (const mode of ['atlas', 'planetarium']) {
    const f = fixture();
    try {
      f.setMode(mode); f.preview.enter();
      const position = f.root.worldToLocal(new THREE.Vector3(0, 1.65, mode === 'planetarium' ? -60 : -2));
      const mesh = f.addTarget(position, mode);
      f.canvas.fire('pointerdown'); f.canvas.fire('pointerup');
      assert.equal(f.selected[0]?.id, mode);
      mesh.visible = false;
      f.canvas.fire('pointerdown'); f.canvas.fire('pointerup');
      assert.equal(f.selected.length, 1);
    } finally { f.dispose(); }
  }
});

test('planetarium keeps an angular sky centred on a stationary viewer', () => {
  const f = fixture();
  try {
    f.setMode('planetarium'); f.preview.enter();
    assert.equal(f.preview.isPlanetarium, true); assert.equal(f.root.scale.x, 1);
    assert.deepEqual(f.root.position.toArray(), f.camera.position.toArray());
    const fixedCamera = f.camera.position.toArray(), fixedMap = rootSnapshot(f.root);
    f.doc.fire('keydown', { code: 'KeyW' }); f.doc.fire('keydown', { code: 'KeyE' });
    f.preview.update(.1);
    assert.equal(f.preview.scaleMap(2), false); assert.equal(f.preview.rotateMap(.5), false);
    assert.deepEqual(f.camera.position.toArray(), fixedCamera); assert.deepEqual(rootSnapshot(f.root), fixedMap);
  } finally { f.dispose(); }
});

test('map changes preserve viewer position and look, with explicit recentering and layouts', () => {
  const f = fixture();
  try {
    f.preview.enter(); f.doc.fire('keydown', { code: 'KeyD' }); f.preview.update(.1);
    const position = f.camera.position.toArray(), direction = f.camera.quaternion.toArray();
    f.camera.position.set(10, 40, 60); f.camera.lookAt(0, 0, 0); f.controls.enabled = true;
    f.preview.onViewChanged();
    assert.deepEqual(f.camera.position.toArray(), position); assert.deepEqual(f.camera.quaternion.toArray(), direction);
    assert.equal(f.changes.at(-1).viewChanged, true); assert.equal(f.controls.enabled, false);
    close(f.root.position.x, position[0]);
    f.preview.setLayout('tabletop'); close(f.root.scale.x * 30, 1.05);
    assert.equal(f.preview.layout, 'tabletop');
    const centre = f.root.position.toArray();
    f.preview.scaleMap(2); close(f.root.scale.x * 30, 2.1);
    f.preview.rotateMap(.5); assert.deepEqual(f.root.position.toArray(), centre);
    f.doc.fire('keydown', { code: 'KeyR' }); close(f.root.scale.x * 30, 1.05);
    f.preview.dispose(); assert.equal(f.preview.enter(), false);
    assert.equal([...f.doc.listeners.values()].flat().length, 0);
  } finally { f.dispose(); }
});

test('locating an object changes gaze without moving the viewer or the map', () => {
  const f = fixture();
  try {
    f.preview.enter();
    const world = new THREE.Vector3(3, 1.65, -4), target = f.addTarget(f.root.worldToLocal(world.clone()));
    const viewer = f.camera.position.toArray(), map = rootSnapshot(f.root);
    assert.equal(f.preview.lookAtObject(target.userData.object), true);
    const expected = world.sub(f.camera.position).normalize();
    close(f.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected), 0);
    f.preview.update(.1);
    close(f.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected), 0);
    assert.deepEqual(f.camera.position.toArray(), viewer); assert.deepEqual(rootSnapshot(f.root), map);
    assert.equal(f.preview.lookAtObject({ id: 'missing' }), false);
  } finally { f.dispose(); }
});

test('pointer lock denial retains usable drag controls', async () => {
  const f = fixture();
  try {
    f.preview.enter();
    f.canvas.requestPointerLock = async () => { throw new Error('denied'); };
    assert.equal(await f.preview.lockPointer(), false); assert.equal(f.messages.length, 1);
    f.canvas.fire('pointerdown'); f.canvas.fire('pointermove', { clientX: 450 }); f.canvas.fire('pointerup', { clientX: 450 });
    assert.notEqual(f.camera.quaternion.y, 0); assert.equal(f.preview.isActive, true);
  } finally { f.dispose(); }
});


test('desktop animation events follow placement and explicit map changes, not viewer movement', () => {
  const f = fixture();
  try {
    f.preview.enter();
    assert.deepEqual(f.mapActions.map(event => event.type), ['reveal']);
    f.doc.fire('keydown', { code: 'KeyW' }); f.preview.update(.1);
    f.canvas.fire('pointerdown'); f.canvas.fire('pointermove', { clientX: 430 }); f.canvas.fire('pointerup', { clientX: 430 });
    assert.equal(f.mapActions.length, 1);
    f.preview.scaleMap(1); f.preview.rotateMap(0); f.preview.scaleMap(NaN);
    assert.equal(f.mapActions.length, 1);
    f.preview.scaleMap(1.2); f.preview.rotateMap(.1);
    assert.deepEqual(f.mapActions.slice(1).map(event => event.type), ['adjust', 'adjust']);
    assert.deepEqual(f.mapActions.at(-1).points[0].toArray(), f.root.getWorldPosition(new THREE.Vector3()).toArray());
    f.preview.recenter(); f.preview.onViewChanged();
    assert.deepEqual(f.mapActions.slice(3).map(event => event.type), ['reveal', 'reveal']);
    f.setMode('planetarium'); f.preview.onViewChanged();
    const count = f.mapActions.length;
    f.preview.scaleMap(2); f.preview.rotateMap(.5); f.preview.exit();
    assert.equal(f.mapActions.length, count);
  } finally { f.dispose(); }
});


test('desktop immersive selects catalogue point records and respects hidden parent layers', () => {
  const f = fixture();
  try {
    f.preview.enter();
    const target = f.addTarget(new THREE.Vector3(0, 0, -4));
    const layer = new THREE.Group(); f.root.add(layer); layer.add(target);
    const object = { id: 'ngc-1976', name: 'Orion Nebula' };
    target.raycast = (raycaster, hits) => hits.push({ distance: 2, point: raycaster.ray.at(2, new THREE.Vector3()), object: target, dataObject: object });
    f.canvas.fire('pointerdown'); f.canvas.fire('pointerup');
    assert.deepEqual(f.selected, [object]);
    layer.visible = false;
    f.canvas.fire('pointerdown'); f.canvas.fire('pointerup');
    assert.equal(f.selected.length, 1);
  } finally { f.dispose(); }
});
