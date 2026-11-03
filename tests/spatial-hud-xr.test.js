import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createXR } from '../src/xr.js';

function harness(t, { hand = false, handsFirst = false } = {}) {
  const originals = new Map(['document', 'window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const context = new Proxy({}, { get: () => () => {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context }) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), viewer = new THREE.PerspectiveCamera();
  viewer.position.set(0, 1.6, 0);
  const controllers = [new THREE.Group(), new THREE.Group()], grips = [new THREE.Group(), new THREE.Group()], hands = [new THREE.Group(), new THREE.Group()];
  controllers[1].visible = false;
  for (let index = 0; index < 2; index++) {
    controllers[index].position.copy(viewer.position); grips[index].position.copy(viewer.position); hands[index].position.copy(viewer.position);
    hands[index].joints = Object.fromEntries(['thumb-tip', 'index-finger-tip', 'wrist'].map(name => [name, new THREE.Group()]));
    hands[index].joints['thumb-tip'].position.x = -.04;
    hands[index].joints['index-finger-tip'].position.x = .04;
    hands[index].add(...Object.values(hands[index].joints));
  }
  const session = new THREE.EventDispatcher();
  session.visibilityState = 'visible';
  const manager = { isPresenting: false, setReferenceSpaceType() {}, getController: index => controllers[index],
    getControllerGrip: index => grips[index], getHand: index => hands[index], getCamera: () => viewer, getSession: () => session,
    setSession: async () => { manager.isPresenting = true; } };
  session.end = async () => { manager.isPresenting = false; session.dispatchEvent({ type: 'end' }); };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: { requestSession: async () => session } } });
  const mapRoot = new THREE.Group(); scene.add(mapRoot);
  const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial());
  cloud.position.set(0, 0, -60); mapRoot.add(cloud);
  const record = { id: 'gaia-123', name: 'Gaia DR3 123', gaiaStreamed: true, position: [0, 0, -60] };
  let raycasts = 0;
  const meshRaycast = cloud.raycast.bind(cloud);
  cloud.raycast = (raycaster, intersections) => {
    raycasts++;
    const hits = []; meshRaycast(raycaster, hits);
    for (const hit of hits) intersections.push({ ...hit, dataObject: record });
  };
  const selected = [];
  const xr = createXR({ renderer: { xr: manager }, scene, camera, controls: { enabled: false, target: new THREE.Vector3() }, mapRoot,
    getPresentationMode: () => 'planetarium', getBoundsRadius: () => 60, getScale: () => 8, getTargets: () => [cloud],
    onSelect: object => selected.push(object), onMessage() {} });
  controllers[0].dispatchEvent({ type: 'connected', data: hand ? { hand: {}, handedness: 'right' } : { handedness: 'right' } });
  const enter = async () => { await xr.enter({ handsFirst }); xr.update(); xr.update(); };
  t.after(async () => {
    await xr.dispose(); cloud.geometry.dispose(); cloud.material.dispose();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  return { xr, enter, controllers, hands, session, cloud, mapRoot, record, scene, selected, get raycasts() { return raycasts; } };
}

test('XR HUD reuses navigation picks and preserves per-point catalogue records and world hit coordinates', async t => {
  const h = harness(t); await h.enter();
  const before = h.raycasts; h.xr.update();
  assert.equal(h.raycasts - before, 1, 'only the existing controller pick raycasts');
  const hit = h.xr.hoverHit;
  assert.equal(hit.item, h.record); assert.equal(hit.dataObject, h.record); assert.equal(hit.object, h.cloud);
  assert.ok(Math.abs(hit.point.y - 1.6) < 1e-8); assert.ok(hit.point.z < -58);
  for (let i = 0; i < 30; i++) { assert.equal(h.xr.hoverHit, hit); assert.equal(h.xr.hoverBlocked, false); }
  assert.equal(h.raycasts - before, 1, 'HUD getters never raycast');
  assert.deepEqual(h.selected, [], 'hover does not select or navigate');
});

test('XR HUD clears misses, hidden layers, disconnects and session exit without a stale selection', async t => {
  const h = harness(t); await h.enter(); assert.ok(h.xr.hoverHit);
  h.mapRoot.visible = false; assert.equal(h.xr.hoverHit, null);
  h.xr.update(); assert.equal(h.xr.hoverHit, null); assert.equal(h.xr.hoverBlocked, false);
  h.mapRoot.visible = true; h.xr.update(); assert.ok(h.xr.hoverHit);
  h.controllers[0].rotation.y = Math.PI / 2; h.xr.update();
  assert.equal(h.xr.hoverHit, null); assert.equal(h.xr.hoverBlocked, false, 'a miss allows head gaze');
  h.controllers[0].rotation.y = 0; h.xr.update(); assert.ok(h.xr.hoverHit);
  h.controllers[0].dispatchEvent({ type: 'disconnected' }); assert.equal(h.xr.hoverHit, null);
  h.controllers[0].dispatchEvent({ type: 'connected', data: {} }); h.xr.update(); assert.ok(h.xr.hoverHit);
  await h.session.end(); assert.equal(h.xr.hoverHit, null); assert.equal(h.xr.hoverBlocked, false);
});

test('XR HUD suppresses held press positions and immediately clears them on recenter', async t => {
  const h = harness(t, { handsFirst: true }); await h.enter(); assert.ok(h.xr.hoverHit);
  h.controllers[0].dispatchEvent({ type: 'selectstart' });
  assert.equal(h.xr.hoverHit, null); assert.equal(h.xr.hoverBlocked, true);
  h.xr.update(); assert.equal(h.xr.hoverHit, null); assert.equal(h.xr.hoverBlocked, true);
  h.xr.recenter(); assert.equal(h.xr.hoverHit, null);
  h.controllers[0].dispatchEvent({ type: 'selectend' }); assert.deepEqual(h.selected, []);
  for (let i = 0; i < 6; i++) { h.xr.update(.1); if (h.xr.isTransitioning) assert.equal(h.xr.hoverHit, null); }
  assert.ok(h.xr.hoverHit);
});

test('XR hand tracking loss releases hover to head gaze and session occlusion suppresses stale information', async t => {
  const h = harness(t, { hand: true }); await h.enter(); assert.ok(h.xr.hoverHit);
  h.hands[0].joints.wrist.visible = false; h.xr.update();
  assert.equal(h.xr.hoverHit, null); assert.equal(h.xr.hoverBlocked, false);
  h.hands[0].joints.wrist.visible = true; h.xr.update(); assert.ok(h.xr.hoverHit);
  h.session.visibilityState = 'visible-blurred'; h.session.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(h.xr.hoverHit, null); assert.equal(h.xr.hoverBlocked, true);
  h.xr.update(); assert.equal(h.xr.hoverHit, null); assert.equal(h.xr.hoverBlocked, true);
  h.session.visibilityState = 'visible'; h.xr.update(); assert.ok(h.xr.hoverHit);
});

test('XR navigation panel hover blocks catalogue gaze fallback', async t => {
  const h = harness(t); await h.enter();
  const panel = h.scene.getObjectByName('XR navigation panel');
  h.controllers[0].lookAt(panel.getWorldPosition(new THREE.Vector3()));
  // Object3D.lookAt points +Z at the target; controllers emit along -Z.
  h.controllers[0].rotateY(Math.PI); h.xr.update();
  assert.equal(h.xr.hoverHit, null); assert.equal(h.xr.hoverBlocked, true);
});
