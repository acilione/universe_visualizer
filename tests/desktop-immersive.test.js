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
function fixture(options = {}) {
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
    onSelect: object => selected.push(object), onChange: (active, state) => changes.push({ active, ...state }), onMessage: message => messages.push(message), onMapAction: event => mapActions.push(event), ...options,
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
const settle = preview => { for (let frame = 0; frame < 50; frame++) preview.update(.05); };
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const cameraSnapshot = camera => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
  fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom, projection: camera.projectionMatrix.toArray() });
const rootSnapshot = root => ({ position: root.position.toArray(), quaternion: root.quaternion.toArray(), scale: root.scale.toArray() });

// This verifies independent first-person movement rather than reusing orbit controls.
test('desktop walking changes the viewer while the map remains in fixed world coordinates', () => {
  const f = fixture();
  try {
    assert.equal(f.preview.enter(), true); settle(f.preview);
    assert.equal(f.preview.isActive, true);
    assert.equal(f.controls.enabled, false); assert.equal(f.controls.autoRotate, false);
    assert.deepEqual(f.camera.position.toArray(), [0, 1.65, 0]);
    close(f.root.scale.x * 30, 6);
    const fixedMap = rootSnapshot(f.root);
    const key = f.doc.fire('keydown', { code: 'KeyW' }); assert.equal(key.defaultPrevented, true);
    for (let i = 0; i < 10; i++) f.preview.update(.1);
    assert.ok(f.camera.position.z < -1.4 && f.camera.position.z > -1.5, 'walking accelerates toward 1.5 m/s'); close(f.camera.position.y, 1.65);
    assert.deepEqual(rootSnapshot(f.root), fixedMap);
    f.doc.fire('keyup', { code: 'KeyW' }); f.win.fire('blur');
    f.doc.fire('keydown', { code: 'KeyE' }); f.preview.update(.1);
    assert.ok(f.camera.position.y > 1.75 && f.camera.position.y < 1.8);
    f.doc.fire('keyup', { code: 'KeyE' }); f.win.fire('blur');
    f.doc.fire('keydown', { code: 'KeyD' }); f.doc.fire('keydown', { code: 'ShiftLeft' }); f.preview.update(.1);
    assert.ok(f.camera.position.x > .3 && f.camera.position.x < .45, 'fast walking also accelerates');
    assert.deepEqual(rootSnapshot(f.root), fixedMap);
  } finally { f.dispose(); }
});

test('exit restores root, camera, projection and orbit state even after map manipulation', async () => {
  const f = fixture();
  try {
    const initialCamera = cameraSnapshot(f.camera), initialRoot = rootSnapshot(f.root), target = f.controls.target.toArray();
    f.preview.enter(); settle(f.preview); await f.preview.lockPointer();
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
    f.preview.enter(); settle(f.preview);
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
    f.preview.enter(); settle(f.preview); const fixedMap = rootSnapshot(f.root);
    f.canvas.fire('pointerdown');
    f.canvas.fire('pointermove', { clientX: 800, clientY: 300 });
    f.canvas.fire('pointerup', { clientX: 800, clientY: 300 });
    assert.equal(f.selected.length, 0);
    assert.equal(f.canvas.hasPointerCapture(1), false);
    settle(f.preview); f.doc.fire('keydown', { code: 'KeyW' }); f.preview.update(.1);
    assert.ok(f.camera.position.x > .04); assert.ok(f.camera.position.z < -.1);
    assert.deepEqual(rootSnapshot(f.root), fixedMap);
    f.win.fire('blur'); f.canvas.fire('pointerdown');
    for (let index = 1; index <= 5; index++) f.canvas.fire('pointermove', { clientX: 400, clientY: 99999 * index });
    settle(f.preview); assert.ok(Number.isFinite(f.camera.quaternion.x));
    const forward = f.camera.getWorldDirection(new THREE.Vector3()); assert.ok(forward.y < -.99);
    f.preview.exit(); assert.equal(f.canvas.hasPointerCapture(1), false);
  } finally { f.dispose(); }
});

test('click rays select room objects and sky targets 60 metres away', () => {
  for (const mode of ['atlas', 'planetarium']) {
    const f = fixture();
    try {
      f.setMode(mode); f.preview.enter(); settle(f.preview);
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
    f.setMode('planetarium'); f.preview.enter(); settle(f.preview);
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
    f.preview.enter(); settle(f.preview); f.doc.fire('keydown', { code: 'KeyD' }); f.preview.update(.1);
    const position = f.camera.position.toArray(), direction = f.camera.quaternion.toArray();
    f.camera.position.set(10, 40, 60); f.camera.lookAt(0, 0, 0); f.controls.enabled = true;
    f.preview.onViewChanged();
    assert.deepEqual(f.camera.position.toArray(), position); assert.deepEqual(f.camera.quaternion.toArray(), direction);
    assert.equal(f.changes.at(-1).viewChanged, true); assert.equal(f.controls.enabled, false);
    close(f.root.position.x, position[0]);
    f.preview.setLayout('tabletop'); settle(f.preview); close(f.root.scale.x * 30, 1.05);
    assert.equal(f.preview.layout, 'tabletop');
    const centre = f.root.position.toArray();
    f.preview.scaleMap(2); settle(f.preview); close(f.root.scale.x * 30, 2.1);
    f.preview.rotateMap(.5); settle(f.preview); assert.deepEqual(f.root.position.toArray(), centre);
    f.doc.fire('keydown', { code: 'KeyR' }); settle(f.preview); close(f.root.scale.x * 30, 1.05);
    f.preview.dispose(); assert.equal(f.preview.enter(), false);
    assert.equal([...f.doc.listeners.values()].flat().length, 0);
  } finally { f.dispose(); }
});

test('locating an object changes gaze without moving the viewer or the map', () => {
  const f = fixture();
  try {
    f.preview.enter(); settle(f.preview);
    const world = new THREE.Vector3(3, 1.65, -4), target = f.addTarget(f.root.worldToLocal(world.clone()));
    const viewer = f.camera.position.toArray(), map = rootSnapshot(f.root);
    assert.equal(f.preview.lookAtObject(target.userData.object), true); settle(f.preview);
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
    f.preview.enter(); settle(f.preview);
    f.canvas.requestPointerLock = async () => { throw new Error('denied'); };
    assert.equal(await f.preview.lockPointer(), false); assert.equal(f.messages.length, 1);
    f.canvas.fire('pointerdown'); f.canvas.fire('pointermove', { clientX: 450 }); f.canvas.fire('pointerup', { clientX: 450 });
    settle(f.preview); assert.notEqual(f.camera.quaternion.y, 0); assert.equal(f.preview.isActive, true);
  } finally { f.dispose(); }
});


test('desktop animation events follow placement and explicit map changes, not viewer movement', () => {
  const f = fixture();
  try {
    f.preview.enter(); settle(f.preview);
    assert.deepEqual(f.mapActions.map(event => event.type), ['reveal']);
    f.doc.fire('keydown', { code: 'KeyW' }); f.preview.update(.1);
    f.canvas.fire('pointerdown'); f.canvas.fire('pointermove', { clientX: 430 }); f.canvas.fire('pointerup', { clientX: 430 });
    assert.equal(f.mapActions.length, 1);
    f.preview.scaleMap(1); f.preview.rotateMap(0); f.preview.scaleMap(NaN);
    assert.equal(f.mapActions.length, 1);
    f.preview.scaleMap(1.2); f.preview.rotateMap(.1);
    assert.deepEqual(f.mapActions.slice(1).map(event => event.type), ['adjust', 'adjust']);
    assert.deepEqual(f.mapActions.at(-1).points[0].toArray(), f.root.getWorldPosition(new THREE.Vector3()).toArray());
    f.preview.recenter(); settle(f.preview); f.preview.onViewChanged(); settle(f.preview);
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
    f.preview.enter(); settle(f.preview);
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


test('planet jumps and gaze changes commit only under a fully hidden canvas, with no visible intermediate pose', () => {
  const f = fixture();
  try {
    f.canvas.style.opacity = '.75'; f.preview.enter(); settle(f.preview);
    const initialCamera = cameraSnapshot(f.camera), initialMap = rootSnapshot(f.root);
    f.preview.focusObject({ id: 'planet', position: [20, -4, 8], size: .1 });
    for (let frame = 0; frame < 5; frame++) {
      f.preview.update(.02);
      assert.deepEqual(rootSnapshot(f.root), initialMap);
      assert.deepEqual(cameraSnapshot(f.camera), initialCamera);
      assert.ok(f.preview.transitionOpacity > 0);
    }
    f.preview.update(.025);
    assert.equal(f.preview.transitionOpacity, 0);
    assert.equal(Number(f.canvas.style.opacity), 0);
    assert.notDeepEqual(rootSnapshot(f.root), initialMap);
    const arrivedMap = rootSnapshot(f.root);
    for (let frame = 0; frame < 10; frame++) {
      f.preview.update(.02);
      assert.deepEqual(rootSnapshot(f.root), arrivedMap);
      assert.deepEqual(cameraSnapshot(f.camera), initialCamera);
    }
    assert.equal(f.preview.isTransitioning, false); assert.equal(f.canvas.style.opacity, '.75');
    f.preview.lookAtObject({ id: 'distant', position: [-35, 20, 12] });
    f.preview.update(.06);
    assert.deepEqual(cameraSnapshot(f.camera), initialCamera, 'gaze must not turn while the sky is still visible');
    f.preview.update(.06);
    assert.equal(Number(f.canvas.style.opacity), 0);
    assert.notDeepEqual(f.camera.quaternion.toArray(), initialCamera.quaternion);
    assert.deepEqual(f.camera.position.toArray(), initialCamera.position);
    assert.deepEqual(rootSnapshot(f.root), arrivedMap);
    const finalGaze = cameraSnapshot(f.camera); settle(f.preview);
    assert.deepEqual(cameraSnapshot(f.camera), finalGaze);
    f.preview.exit(); assert.equal(f.canvas.style.opacity, '.75');
  } finally { f.dispose(); }
});

test('replacement jumps cancel the first destination and overview also relocates only while hidden', async () => {
  const f = fixture();
  try {
    f.preview.enter(); settle(f.preview);
    const oldMap = rootSnapshot(f.root), commits = [];
    const first = f.preview.runTransition(() => commits.push('old'));
    f.preview.update(.05);
    const second = f.preview.runTransition(() => {
      commits.push('new'); f.preview.focusObject({ id: 'second', position: [2, 0, -5], size: .3 });
    });
    assert.equal(await first, false);
    f.preview.update(.06); assert.deepEqual(commits, []); assert.deepEqual(rootSnapshot(f.root), oldMap);
    f.preview.update(.06); assert.deepEqual(commits, ['new']); assert.equal(Number(f.canvas.style.opacity), 0);
    settle(f.preview); assert.equal(await second, true);
    assert.equal(f.preview.isInspecting, true);
    const focused = rootSnapshot(f.root);
    f.preview.navigateBack(); f.preview.update(.06); assert.deepEqual(rootSnapshot(f.root), focused);
    f.preview.update(.06); assert.equal(Number(f.canvas.style.opacity), 0);
    assert.deepEqual(rootSnapshot(f.root), oldMap); settle(f.preview);
    assert.equal(f.preview.isInspecting, false);
  } finally { f.dispose(); }
});

test('async catalogue transitions remain hidden and nested view/focus/restore operations cannot deadlock', async () => {
  const f = fixture();
  try {
    f.preview.enter(); settle(f.preview);
    f.doc.fire('keydown', { code: 'KeyD' }); f.preview.update(.1); f.win.fire('blur');
    f.canvas.fire('pointerdown'); f.canvas.fire('pointermove', { clientX: 480 }); f.canvas.fire('pointerup', { clientX: 480 }); settle(f.preview);
    f.preview.focusObject({ id: 'saved', position: [1, 2, 3], size: .25 }); settle(f.preview);
    const saved = f.preview.captureNavigationState();
    let ready; const data = new Promise(resolve => { ready = resolve; });
    const transition = f.preview.runTransition(async () => {
      await data;
      f.setMode('planetarium'); f.preview.onViewChanged();
      f.preview.lookAtObject({ id: 'sky', position: [30, 20, -20] });
      f.setMode('atlas'); f.preview.onViewChanged();
      assert.equal(await f.preview.restoreNavigationState(saved), true);
    });
    f.preview.update(.1); f.preview.update(.02);
    assert.equal(Number(f.canvas.style.opacity), 0);
    for (let frame = 0; frame < 20; frame++) f.preview.update(.1);
    assert.equal(Number(f.canvas.style.opacity), 0, 'network latency must never expose a partly built view');
    ready(); for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    assert.deepEqual(f.preview.captureNavigationState(), saved);
    settle(f.preview); assert.equal(await transition, true);
    assert.equal(f.preview.isTransitioning, false); assert.equal(f.canvas.style.opacity, '');
  } finally { f.dispose(); }
});

test('exiting an unfinished async jump restores opacity and ignores its late fade completion', async () => {
  const f = fixture();
  try {
    f.canvas.style.opacity = '.8'; const original = cameraSnapshot(f.camera);
    f.preview.enter(); settle(f.preview);
    let release; const deferred = new Promise(resolve => { release = resolve; });
    const result = f.preview.runTransition(() => deferred);
    f.preview.update(.1); f.preview.update(.02); assert.equal(Number(f.canvas.style.opacity), 0);
    f.preview.exit(); assert.equal(await result, false);
    release(); await Promise.resolve(); await Promise.resolve(); f.preview.update(.1);
    assert.deepEqual(cameraSnapshot(f.camera), original); assert.equal(f.canvas.style.opacity, '.8');
    assert.equal(f.preview.isTransitioning, false);
  } finally { f.dispose(); }
});

test('manual mouse, keyboard, and zoom input are bounded per frame and blur clears residual motion', () => {
  const f = fixture();
  try {
    f.preview.enter({ directTravel: true }); settle(f.preview);
    const initial = f.camera.quaternion.clone();
    f.canvas.fire('pointerdown'); f.canvas.fire('pointermove', { clientX: 90000, clientY: -90000 });
    assert.ok(f.camera.quaternion.angleTo(initial) < 1e-8, 'input must not snap outside the render loop');
    f.preview.update(1 / 60);
    assert.ok(f.camera.quaternion.angleTo(initial) < .07, 'both angular axes have a bounded rate');
    f.canvas.fire('pointerup', { clientX: 90000, clientY: -90000 }); settle(f.preview);
    const before = f.camera.position.clone(); f.doc.fire('keydown', { code: 'KeyW' }); f.preview.update(1 / 60);
    assert.ok(f.camera.position.distanceTo(before) > 0 && f.camera.position.distanceTo(before) < .01, 'walking accelerates from rest');
    f.win.fire('blur'); const stopped = cameraSnapshot(f.camera); settle(f.preview);
    assert.deepEqual(cameraSnapshot(f.camera), stopped);
    const scale = f.root.scale.x;
    f.canvas.fire('wheel', { deltaY: -100000, deltaMode: 0 });
    close(f.root.scale.x, scale);
    f.preview.update(1 / 60); assert.ok(f.root.scale.x > scale && f.root.scale.x / scale < 1.05);
    f.win.fire('blur'); const stoppedMap = rootSnapshot(f.root); settle(f.preview);
    assert.deepEqual(rootSnapshot(f.root), stoppedMap);
  } finally { f.dispose(); }
});

test('rotation preserves the inspected planet world anchor instead of sweeping it around the map origin', () => {
  const f = fixture();
  try {
    f.preview.enter({ directTravel: true }); settle(f.preview);
    const object = { id: 'planet', position: [35, 4, -18], size: .1 };
    f.preview.focusObject(object); settle(f.preview);
    const anchor = f.root.localToWorld(new THREE.Vector3(...object.position));
    f.preview.rotateMap(1.2);
    for (let frame = 0; frame < 60; frame++) {
      f.preview.update(1 / 60);
      assert.ok(f.root.localToWorld(new THREE.Vector3(...object.position)).distanceTo(anchor) < 1e-8);
    }
  } finally { f.dispose(); }
});

test('reduced-motion jumps are immediate without fades or automatic spatial interpolation', () => {
  const previous = globalThis.matchMedia; globalThis.matchMedia = () => ({ matches: true });
  const f = fixture();
  try {
    f.preview.enter(); assert.equal(f.preview.isTransitioning, false);
    f.preview.focusObject({ id: 'planet', position: [20, 3, -9], size: .1 });
    assert.equal(f.preview.isInspecting, true); assert.equal(f.preview.transitionOpacity, 1);
    const placed = rootSnapshot(f.root); settle(f.preview); assert.deepEqual(rootSnapshot(f.root), placed);
    f.preview.lookAtObject({ id: 'star', position: [-30, 8, 4] });
    const gaze = cameraSnapshot(f.camera); settle(f.preview); assert.deepEqual(cameraSnapshot(f.camera), gaze);
    assert.equal(f.canvas.style.opacity, '');
  } finally { f.dispose(); if (previous === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = previous; }
});

test('Earth sky placement applies observer orientation without changing viewer pose or unit scale', () => {
  const frame = new THREE.Quaternion().setFromEuler(new THREE.Euler(.7, -.6, .3));
  const f = fixture({ getSkyFrame: () => frame });
  try {
    f.setMode('planetarium'); f.preview.enter(); settle(f.preview);
    assert.ok(f.root.quaternion.angleTo(frame) < 1e-8); assert.equal(f.root.scale.x, 1);
    assert.deepEqual(f.root.position.toArray(), f.camera.position.toArray());
    assert.deepEqual(f.camera.quaternion.toArray(), [0, 0, 0, 1]);
  } finally { f.dispose(); }
});


test('enabling reduced motion completes an already queued preview jump without a later rewind', () => {
  const previous = globalThis.matchMedia; let reduce = false;
  globalThis.matchMedia = () => ({ matches: reduce });
  const f = fixture();
  try {
    f.preview.enter(); settle(f.preview);
    f.preview.focusObject({ id: 'planet', position: [12, -3, 7], size: .15 }); f.preview.update(.04);
    assert.equal(f.preview.isInspecting, false);
    reduce = true; f.preview.update(.01);
    assert.equal(f.preview.isInspecting, true); assert.equal(f.preview.isTransitioning, false);
    assert.equal(f.preview.transitionOpacity, 1);
    const arrived = rootSnapshot(f.root); reduce = false; settle(f.preview);
    assert.deepEqual(rootSnapshot(f.root), arrived);
  } finally { f.dispose(); if (previous === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = previous; }
});
