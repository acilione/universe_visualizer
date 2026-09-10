import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { singleGripTransform, dualGripTransform, isSelectionGesture } from '../src/xr-math.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
const pose = (position, quaternion = new Quaternion()) => ({ position, quaternion });

test('one grip rotates and translates the map about the hand instead of the scene origin', () => {
  const root = { position: new Vector3(2, 0, 0), quaternion: new Quaternion(), scale: 0.1 };
  const from = pose(new Vector3(1, 0, 0));
  const to = pose(new Vector3(1, 1, 0), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2));
  const result = singleGripTransform(root, from, to);
  near(result.position.x, 1);
  near(result.position.y, 2);
  near(result.quaternion.angleTo(to.quaternion), 0);
  near(result.scale, 0.1);
  assert.deepEqual(root.position.toArray(), [2, 0, 0]);
});

test('two hands preserve the midpoint anchor while rotating and enlarging', () => {
  const root = { position: new Vector3(1, 1, 0), quaternion: new Quaternion(), scale: 0.1 };
  const result = dualGripTransform(root, new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(3, 1, 0), new Vector3(3, 5, 0), 0.03, 0.4);
  near(result.scale, 0.2);
  near(result.position.x, 1);
  near(result.position.y, 3);
});

test('scale clamps also clamp the distance from the grip midpoint', () => {
  const root = { position: new Vector3(0, 1, 0), quaternion: new Quaternion(), scale: 0.1 };
  const result = dualGripTransform(root, new Vector3(-0.1, 0, 0), new Vector3(0.1, 0, 0), new Vector3(-2, 0, 0), new Vector3(2, 0, 0), 0.03, 0.4);
  near(result.scale, 0.4);
  near(result.position.y, 4);
  const smaller = dualGripTransform(root, new Vector3(-1, 0, 0), new Vector3(1, 0, 0), new Vector3(-0.02, 0, 0), new Vector3(0.02, 0, 0), 0.03, 0.4);
  near(smaller.scale, 0.03);
  near(smaller.position.y, 0.3);
});

test('coincident hand positions cannot produce infinite scale or invalid rotation', () => {
  const root = { position: new Vector3(), quaternion: new Quaternion(), scale: 1 };
  assert.equal(dualGripTransform(root, new Vector3(), new Vector3(), new Vector3(), new Vector3(1, 0, 0), 0.3, 4), null);
  assert.equal(dualGripTransform(root, new Vector3(), new Vector3(1, 0, 0), new Vector3(), new Vector3(), 0.3, 4), null);
});

test('brief still pinches select; dragging, twisting, holding or two-hand gestures do not', () => {
  assert.equal(isSelectionGesture({ duration: 150, distance: 0.005 }), true);
  assert.equal(isSelectionGesture({ duration: 600, distance: 0.005 }), false);
  assert.equal(isSelectionGesture({ duration: 150, distance: 0.03 }), false);
  assert.equal(isSelectionGesture({ duration: 150, distance: 0.005, rotated: 0.15 }), false);
  assert.equal(isSelectionGesture({ duration: 150, distance: 0.005, manipulated: true }), false);
});

// The lifecycle harness uses real Three.js transforms and synthetic XR events.
// A physical headset is still needed to validate tracking and stereo comfort.
async function withXRHarness(run, requestError = null) {
  const THREE = await import('three');
  const { createXR } = await import('../src/xr.js');
  const previous = ['window', 'document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const context = new Proxy({}, { get: () => () => {}, set: () => true });
  let requests = 0;
  const session = new EventTarget();
  session.visibilityState = 'visible';
  const groups = () => [new THREE.Group(), new THREE.Group()];
  const controllers = groups(), grips = groups(), hands = groups();
  hands.forEach(hand => { hand.joints = {}; });
  [...controllers, ...grips, ...hands].forEach(group => { group.visible = false; });
  const xrCamera = new THREE.PerspectiveCamera();
  const xr = {
    enabled: false, isPresenting: false,
    setReferenceSpaceType() {},
    getController: i => controllers[i], getControllerGrip: i => grips[i], getHand: i => hands[i],
    getCamera: () => xrCamera, getSession: () => session,
    async setSession() { this.isPresenting = true; },
  };
  session.end = async () => { xr.isPresenting = false; session.dispatchEvent(new Event('end')); };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context }) } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: { async requestSession() { requests++; if (requestError) throw requestError; return session; } } } });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.2, 200);
  camera.position.set(3, 4, 5);
  camera.zoom = 1.25;
  camera.rotation.set(0.1, 0.2, 0.3);
  const mapRoot = new THREE.Group();
  mapRoot.position.set(1, 2, 3);
  mapRoot.rotation.set(0.2, 0.3, 0.4);
  mapRoot.scale.setScalar(2);
  mapRoot.add(new THREE.Mesh(new THREE.SphereGeometry(10), new THREE.MeshBasicMaterial()));
  scene.add(mapRoot);
  const controls = { enabled: true, target: new THREE.Vector3(0, 1, 2) };
  const messages = [], selected = [], targets = [], scaleDeltas = [];
  const app = createXR({ renderer: { xr }, scene, camera, controls, mapRoot, getTargets: () => targets, getScale: () => 2, onSelect: object => selected.push(object), onScale: delta => scaleDeltas.push(delta), onMessage: message => messages.push(message) });
  try { await run({ app, session, xr, scene, camera, controls, mapRoot, messages, controllers, hands, targets, selected, scaleDeltas, requests: () => requests, THREE }); }
  finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('an insecure origin explains HTTPS without requesting a VR session', async () => {
  await withXRHarness(async ({ app, requests, messages, controls }) => {
    window.isSecureContext = false;
    assert.equal(await app.enter(), false);
    assert.equal(requests(), 0);
    assert.match(messages.at(-1), /HTTPS/);
    assert.equal(controls.enabled, true);
  });
});

test('denied VR access leaves the desktop state usable', async () => {
  await withXRHarness(async ({ app, camera, controls, messages }) => {
    assert.equal(await app.enter(), false);
    assert.equal(app.isPresenting, false);
    assert.equal(controls.enabled, true);
    assert.deepEqual(camera.position.toArray(), [3, 4, 5]);
    assert.match(messages.at(-1), /non consentito/);
  }, { name: 'NotAllowedError' });
});

test('VR entry places the map in metres and exit restores camera, root and controls', async () => {
  await withXRHarness(async ({ app, session, camera, controls, mapRoot }) => {
    const position = mapRoot.position.clone(), rotation = mapRoot.quaternion.clone(), cameraRotation = camera.quaternion.clone();
    assert.equal(await app.enter(), true);
    assert.equal(controls.enabled, false);
    assert.equal(camera.near, 0.01);
    app.update();
    assert.ok(mapRoot.scale.x < 0.2);
    assert.ok(mapRoot.position.z < -1);
    camera.fov = 95;
    camera.aspect = 1.8;
    camera.zoom = 1;
    await session.end();
    assert.equal(app.isPresenting, false);
    assert.equal(controls.enabled, true);
    assert.equal(camera.near, 0.2);
    assert.equal(camera.fov, 50);
    assert.equal(camera.aspect, 1);
    assert.equal(camera.zoom, 1.25);
    assert.deepEqual(camera.position.toArray(), [3, 4, 5]);
    assert.deepEqual(camera.quaternion.toArray(), cameraRotation.toArray());
    assert.deepEqual(mapRoot.position.toArray(), position.toArray());
    assert.deepEqual(mapRoot.quaternion.toArray(), rotation.toArray());
    assert.deepEqual(mapRoot.scale.toArray(), [2, 2, 2]);
    assert.deepEqual(controls.target.toArray(), [0, 1, 2]);
  });
});

test('controller rays select catalog objects using trigger press and release', async () => {
  await withXRHarness(async ({ app, controllers, targets, selected, scene, session, THREE }) => {
    await app.enter();
    app.update();
    const object = { id: 'test-star', name: 'Test star', distance: '4 a.l.' };
    const target = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial());
    target.position.set(0, 0, -2);
    target.userData.object = object;
    scene.add(target);
    targets.push(target);
    scene.updateMatrixWorld(true);
    const controller = controllers[0];
    controller.visible = true;
    controller.dispatchEvent({ type: 'connected', data: { handedness: 'right' } });
    controller.dispatchEvent({ type: 'selectstart' });
    controller.dispatchEvent({ type: 'selectend' });
    assert.deepEqual(selected, [object]);
    await session.end();
  });
});


test('the in-world panel supports scale navigation, reset and exit without DOM controls', async () => {
  await withXRHarness(async ({ app, controllers, scene, scaleDeltas, mapRoot, THREE }) => {
    await app.enter();
    app.update();
    const panel = scene.getObjectByName('XR navigation panel');
    const controller = controllers[0];
    controller.visible = true;
    controller.dispatchEvent({ type: 'connected', data: { handedness: 'right' } });
    const pressButton = (pixelX) => {
      const target = panel.localToWorld(new THREE.Vector3((pixelX / 1160 - 0.5) * 1.45, (0.5 - 257 / 420) * 1.45 * 420 / 1160, 0));
      controller.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), target.normalize());
      scene.updateMatrixWorld(true);
      controller.dispatchEvent({ type: 'selectstart' });
      controller.dispatchEvent({ type: 'selectend' });
    };
    pressButton(159);
    pressButton(440);
    assert.deepEqual(scaleDeltas, [-1, 1]);
    mapRoot.position.x = 10;
    pressButton(721);
    app.update();
    near(mapRoot.position.x, 0);
    pressButton(1002);
    assert.equal(app.isPresenting, false);
  });
});



test('tracked fingertip pinches select while a lost joint cancels the gesture', async () => {
  await withXRHarness(async ({ app, controllers, hands, targets, selected, scene, session, THREE }) => {
    await app.enter();
    app.update();
    const object = { id: 'pinch-star', name: 'Pinch star', distance: '8 a.l.' };
    const target = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial());
    target.position.set(0, 0, -2);
    target.userData.object = object;
    scene.add(target);
    targets.push(target);
    const controller = controllers[0], hand = hands[0];
    controller.visible = true;
    hand.visible = true;
    controller.dispatchEvent({ type: 'connected', data: { handedness: 'right', hand: {} } });
    for (const name of ['thumb-tip', 'index-finger-tip', 'wrist']) {
      const joint = new THREE.Group();
      hand.joints[name] = joint;
      hand.add(joint);
    }
    const setGap = gap => {
      hand.joints['thumb-tip'].position.x = -gap / 2;
      hand.joints['index-finger-tip'].position.x = gap / 2;
      scene.updateMatrixWorld(true);
      app.update();
    };
    setGap(0.04);
    setGap(0.01);
    setGap(0.04);
    assert.deepEqual(selected, [object]);
    assert.equal(hand.joints.wrist.children.length, 1, 'procedural joint visual exists');
    setGap(0.01);
    hand.joints['index-finger-tip'].visible = false;
    app.update();
    hand.joints['index-finger-tip'].visible = true;
    setGap(0.04);
    assert.equal(selected.length, 1, 'tracking loss must not trigger a selection');
    await session.end();
  });
});

test('disposing XR releases panel resources and removes its scene objects', async () => {
  await withXRHarness(async ({ app, scene }) => {
    const panel = scene.getObjectByName('XR navigation panel');
    let geometryDisposed = false, textureDisposed = false;
    panel.geometry.addEventListener('dispose', () => { geometryDisposed = true; });
    panel.material.map.addEventListener('dispose', () => { textureDisposed = true; });
    await app.dispose();
    assert.equal(geometryDisposed, true);
    assert.equal(textureDisposed, true);
    assert.equal(scene.getObjectByName('XR navigation panel'), undefined);
    assert.equal(await app.enter(), false);
    await app.dispose();
  });
});
