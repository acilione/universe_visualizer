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
async function withXRHarness(run, requestError = null, options = {}) {
  const THREE = await import('three');
  const { createXR } = await import('../src/xr.js');
  const previous = ['window', 'document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const context = new Proxy({}, { get: () => () => {}, set: () => true });
  let requests = 0;
  const requestArguments = [];
  const referenceSpace = new EventTarget();
  let referenceSpaceType;
  let scale = 2;
  const session = new EventTarget();
  session.visibilityState = 'visible';
  const groups = () => [new THREE.Group(), new THREE.Group()];
  const controllers = groups(), grips = groups(), hands = groups();
  hands.forEach(hand => { hand.joints = {}; });
  [...controllers, ...grips, ...hands].forEach(group => { group.visible = false; });
  const xrCamera = new THREE.PerspectiveCamera();
  const xr = {
    enabled: false, isPresenting: false,
    setReferenceSpaceType(value) { referenceSpaceType = value; },
    getReferenceSpace: () => referenceSpace,
    getController: i => controllers[i], getControllerGrip: i => grips[i], getHand: i => hands[i],
    getCamera: () => xrCamera, getSession: () => session,
    async setSession() { if (options.setupError) throw options.setupError; this.isPresenting = true; if (options.endDuringSetup) await session.end(); },
  };
  session.end = async () => { if (!options.nativeEndOrdering) xr.isPresenting = false; session.dispatchEvent(new Event('end')); xr.isPresenting = false; };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context }) } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: { async requestSession(...args) { requestArguments.push(args); requests++; if (requestError) throw requestError; return session; } } } });
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
  const messages = [], selected = [], targets = [], scaleDeltas = [], focused = [], immersiveChanges = [], endedStates = [];
  const environment = new THREE.Group();
  scene.add(environment);
  scene.background = new THREE.Color(0x152025);
  scene.fog = new THREE.Fog(0x152025, 1, 100);
  let clearAlpha = 0.8;
  const clearColor = new THREE.Color(0x123456);
  const renderer = { xr, getClearColor: color => color.copy(clearColor), getClearAlpha: () => clearAlpha, setClearColor(color, alpha) { clearColor.set(color); clearAlpha = alpha; } };
  const app = createXR({ renderer, scene, camera, controls, mapRoot, getTargets: () => targets, getScale: () => scale, getBoundsRadius: () => 10, getEnvironment: () => [environment], onSelect: object => selected.push(object), onFocus: object => focused.push(object), onImmersiveChange: value => immersiveChanges.push(value), onScale: delta => scaleDeltas.push(delta), onSessionEnd: details => endedStates.push({ ...details, presenting: xr.isPresenting, cameraPosition: camera.position.toArray() }), onMessage: message => messages.push(message) });
  try { await run({ app, session, xr, endedStates, renderer, environment, referenceSpace, requestArguments, getReferenceSpaceType: () => referenceSpaceType, setScale: value => { scale = value; }, scene, camera, controls, mapRoot, messages, controllers, hands, targets, selected, focused, immersiveChanges, scaleDeltas, xrCamera, requests: () => requests, THREE }); }
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
    assert.match(messages.at(-1), /access was denied/);
  }, { name: 'NotAllowedError' });
});

test('tabletop VR entry places the map in metres and exit restores camera, root and controls', async () => {
  await withXRHarness(async ({ app, session, camera, controls, mapRoot }) => {
    const position = mapRoot.position.clone(), rotation = mapRoot.quaternion.clone(), cameraRotation = camera.quaternion.clone();
    assert.equal(await app.enter({ layout: 'tabletop' }), true);
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
    pressButton(115);
    pressButton(301);
    assert.deepEqual(scaleDeltas, [-1, 1]);
    mapRoot.position.x = 10;
    pressButton(673);
    app.update();
    near(mapRoot.position.x, 0);
    pressButton(1045);
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


function clickAtPoint(controller, scene, point, THREE) {
  const origin = controller.getWorldPosition(new THREE.Vector3());
  controller.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), point.clone().sub(origin).normalize());
  scene.updateMatrixWorld(true);
  controller.dispatchEvent({ type: 'selectstart' });
  controller.dispatchEvent({ type: 'selectend' });
}

function panelButtonPoint(scene, pixelX, THREE) {
  return scene.getObjectByName('XR navigation panel').localToWorld(new THREE.Vector3(
    (pixelX / 1160 - 0.5) * 1.45, (0.5 - 257 / 420) * 1.45 * 420 / 1160, 0,
  ));
}

test('FOCUS forwards the complete selected planet and host context to the engine', async () => {
  await withXRHarness(async ({ app, controllers, scene, focused, session, THREE }) => {
    await app.enter();
    app.update();
    const planet = { id: 'kepler-186-f', name: 'Kepler-186 f', distance: '580 a.l.', position: [4, 0, -2], size: 0.28, host: 'Kepler-186', scaleLabel: 'Sistema Kepler-186' };
    app.setInfo(planet);
    const controller = controllers[0];
    controller.visible = true;
    controller.dispatchEvent({ type: 'connected', data: { handedness: 'right' } });
    clickAtPoint(controller, scene, panelButtonPoint(scene, 487, THREE), THREE);
    assert.deepEqual(focused, [planet]);
    await session.end();
  });
});

test('planet inspection animates its rendered center and radius without moving the viewer, and reset restores overview', async () => {
  await withXRHarness(async ({ app, targets, mapRoot, controllers, camera, xrCamera, session, THREE }) => {
    const planet = { id: 'earth', name: 'Terra', position: [5, 0.2, -2], size: 0.25 };
    const content = new THREE.Group();
    content.scale.setScalar(0.92);
    content.position.set(0.7, -0.4, 1);
    content.rotation.y = 0.4;
    const target = new THREE.Mesh(new THREE.SphereGeometry(0.25), new THREE.MeshBasicMaterial());
    target.position.fromArray(planet.position);
    target.userData.object = planet;
    content.add(target);
    mapRoot.add(content);
    targets.push(target);
    await app.enter();
    app.update();
    const overviewScale = mapRoot.scale.x;
    xrCamera.position.set(0.4, 1.2, 0.7);
    xrCamera.rotation.y = 0.3;
    const cameraPosition = camera.position.clone(), cameraQuaternion = camera.quaternion.clone();
    const viewerPosition = xrCamera.position.clone(), viewerQuaternion = xrCamera.quaternion.clone();
    const destination = new THREE.Vector3(0, 0, -1).applyQuaternion(viewerQuaternion).add(viewerPosition);
    assert.equal(app.focusObject(planet, 0.25), true);
    const initialScale = mapRoot.scale.x;
    app.update(0.05);
    assert.ok(mapRoot.scale.x > initialScale && mapRoot.scale.x < 1.12, 'inspection begins gradually');
    for (let i = 0; i < 35; i++) {
      content.scale.setScalar(Math.min(1, 0.92 + i * 0.004));
      app.update(0.05);
    }
    near(target.getWorldPosition(new THREE.Vector3()).distanceTo(destination), 0);
    near(target.getWorldScale(new THREE.Vector3()).x * 0.25, 0.28);
    assert.deepEqual(camera.position.toArray(), cameraPosition.toArray());
    assert.deepEqual(camera.quaternion.toArray(), cameraQuaternion.toArray());
    assert.deepEqual(xrCamera.position.toArray(), viewerPosition.toArray());
    assert.deepEqual(xrCamera.quaternion.toArray(), viewerQuaternion.toArray());
    const inspectionScale = mapRoot.scale.x;
    for (let i = 0; i < controllers.length; i++) {
      const controller = controllers[i];
      controller.visible = true;
      controller.position.set(i === 0 ? -0.15 : 0.15, 0.1, -0.5);
      controller.dispatchEvent({ type: 'connected', data: { handedness: i === 0 ? 'left' : 'right' } });
      controller.dispatchEvent({ type: 'squeezestart' });
    }
    app.update(0);
    controllers[1].position.x = 0.3;
    app.update(0);
    near(mapRoot.scale.x, inspectionScale * 1.5);
    assert.equal(app.recenter(), true);
    app.update();
    near(mapRoot.scale.x, overviewScale);
    await session.end();
  });
});

test('IMMERSIVE hides writing and a textless peripheral sphere restores the panel in VR', async () => {
  await withXRHarness(async ({ app, controllers, scene, immersiveChanges, targets, selected, session, THREE }) => {
    await app.enter();
    app.update();
    const panel = scene.getObjectByName('XR navigation panel');
    const orb = scene.getObjectByName('XR restore controls');
    const controller = controllers[0];
    controller.visible = true;
    controller.dispatchEvent({ type: 'connected', data: { handedness: 'right' } });
    const formerFocusPoint = panelButtonPoint(scene, 487, THREE);
    clickAtPoint(controller, scene, panelButtonPoint(scene, 859, THREE), THREE);
    assert.equal(panel.visible, false);
    assert.equal(orb.visible, true);
    assert.equal(app.isImmersive, true);
    assert.deepEqual(immersiveChanges, [true]);
    // Hidden panel geometry must not intercept rays aimed at the universe.
    const object = { id: 'unobstructed', name: 'Visible star' };
    const target = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial());
    target.position.copy(formerFocusPoint).multiplyScalar(1.4);
    target.userData.object = object;
    targets.push(target);
    scene.add(target);
    clickAtPoint(controller, scene, target.position, THREE);
    assert.deepEqual(selected, [object]);
    clickAtPoint(controller, scene, orb.position, THREE);
    assert.equal(panel.visible, true);
    assert.equal(orb.visible, false);
    assert.equal(app.isImmersive, false);
    assert.deepEqual(immersiveChanges, [true, false]);
    await session.end();
  });
});

test('immersive mode selected before VR entry is preserved and the restore sphere is disposed', async () => {
  await withXRHarness(async ({ app, scene, session }) => {
    app.setImmersive(true);
    await app.enter();
    app.update();
    const panel = scene.getObjectByName('XR navigation panel');
    const orb = scene.getObjectByName('XR restore controls');
    assert.equal(panel.visible, false);
    assert.equal(orb.visible, true);
    let disposed = false;
    orb.geometry.addEventListener('dispose', () => { disposed = true; });
    await session.end();
    assert.equal(orb.visible, false);
    await app.dispose();
    assert.equal(disposed, true);
    assert.equal(scene.getObjectByName('XR restore controls'), undefined);
  });
});


test('room VR uses local-floor and the full 12 metre map stays fixed while the viewer walks', async () => {
  await withXRHarness(async ({ app, xrCamera, mapRoot, requestArguments, getReferenceSpaceType, session }) => {
    xrCamera.position.set(2, 1.65, 3);
    xrCamera.rotation.y = 0.8;
    await app.enter();
    app.update();
    assert.equal(app.layout, 'room');
    assert.equal(app.mode, 'immersive-vr');
    assert.equal(getReferenceSpaceType(), 'local-floor');
    assert.deepEqual(requestArguments[0], ['immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] }]);
    near(mapRoot.scale.x * 20, 12);
    assert.deepEqual(mapRoot.position.toArray(), [2, 1.25, 3]);
    const fixed = mapRoot.matrixWorld.clone();
    xrCamera.position.set(3.2, 1.1, 1.2);
    xrCamera.rotation.set(0.4, 1.2, 0);
    for (let i = 0; i < 30; i++) app.update();
    assert.deepEqual(mapRoot.matrixWorld.elements, fixed.elements, 'walking and looking never drag the map');
    app.recenter();
    app.update();
    near(mapRoot.position.x, 3.2);
    near(mapRoot.position.z, 1.2);
    await session.end();
  });
});

test('room placement ignores distant decorative geometry and handles a transformed parent', async () => {
  await withXRHarness(async ({ app, mapRoot, scene, xrCamera, THREE, session }) => {
    const parent = new THREE.Group();
    parent.position.set(4, 2, -3);
    parent.rotation.y = 0.7;
    parent.scale.setScalar(2);
    scene.add(parent);
    parent.add(mapRoot);
    const distant = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());
    distant.position.set(100000, 0, 0);
    mapRoot.add(distant);
    xrCamera.position.set(1, 1.65, 2);
    await app.enter();
    app.update();
    near(mapRoot.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 1.25, 2)), 0);
    near(mapRoot.getWorldScale(new THREE.Vector3()).x, 0.6);
    near(mapRoot.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion()), 0);
    await session.end();
  });
});

test('mixed reality requests passthrough and restores background, fog and alpha on exit', async () => {
  await withXRHarness(async ({ app, scene, renderer, environment, session, requestArguments, THREE }) => {
    const background = scene.background, fog = scene.fog;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    assert.equal(await app.enter({ mode: 'immersive-ar' }), true);
    assert.equal(requestArguments[0][0], 'immersive-ar');
    assert.equal(app.mode, 'immersive-ar');
    assert.equal(scene.background, null);
    assert.equal(scene.fog, null);
    assert.equal(renderer.getClearAlpha(), 0);
    assert.equal(environment.visible, false);
    app.update();
    await session.end();
    assert.equal(scene.background, background);
    assert.equal(scene.fog, fog);
    assert.equal(renderer.getClearAlpha(), clearAlpha);
    assert.equal(renderer.getClearColor(new THREE.Color()).getHex(), clearColor.getHex());
    assert.equal(environment.visible, true);
  });
});

test('failed mixed-reality setup restores every desktop environment state', async () => {
  await withXRHarness(async ({ app, scene, renderer, environment, controls, camera }) => {
    const background = scene.background, fog = scene.fog;
    environment.visible = false;
    controls.enabled = false;
    assert.equal(await app.enter({ mode: 'immersive-ar' }), false);
    assert.equal(app.isPresenting, false);
    assert.equal(scene.background, background);
    assert.equal(scene.fog, fog);
    assert.equal(renderer.getClearAlpha(), 0.8);
    assert.equal(environment.visible, false);
    assert.equal(controls.enabled, false);
    assert.deepEqual(camera.position.toArray(), [3, 4, 5]);
  }, null, { setupError: new Error('XR framebuffer setup failed') });
});

test('a session ending during async setup cannot reactivate XR or lose desktop state', async () => {
  await withXRHarness(async ({ app, scene, renderer, controls }) => {
    const background = scene.background;
    assert.equal(await app.enter({ mode: 'immersive-ar' }), false);
    assert.equal(app.isPresenting, false);
    assert.equal(scene.background, background);
    assert.equal(renderer.getClearAlpha(), 0.8);
    assert.equal(controls.enabled, true);
  }, null, { endDuringSetup: true });
});

test('a known floor-origin reset preserves the physical map pose and unsubscribes at exit', async () => {
  await withXRHarness(async ({ app, referenceSpace, mapRoot, xrCamera, THREE, session }) => {
    xrCamera.position.set(2, 1.65, 3);
    await app.enter();
    app.update();
    const before = mapRoot.matrixWorld.clone();
    const originDelta = new THREE.Matrix4().compose(new THREE.Vector3(1, 0, 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4), new THREE.Vector3(1, 1, 1));
    const event = new Event('reset');
    event.transform = { matrix: originDelta.toArray() };
    referenceSpace.dispatchEvent(event);
    const physical = mapRoot.matrixWorld.clone().premultiply(originDelta);
    physical.elements.forEach((value, index) => near(value, before.elements[index]));
    await session.end();
    const restored = mapRoot.matrixWorld.clone();
    referenceSpace.dispatchEvent(event);
    assert.deepEqual(mapRoot.matrixWorld.elements, restored.elements);
  });
});

test('missing initial viewer tracking defers room placement until a tracked frame arrives', async () => {
  await withXRHarness(async ({ app, xr, mapRoot, xrCamera, session }) => {
    let tracked = false;
    xr.getFrame = () => ({ getViewerPose: () => tracked ? {} : null });
    const before = mapRoot.position.clone();
    await app.enter();
    app.update();
    assert.deepEqual(mapRoot.position.toArray(), before.toArray());
    tracked = true;
    xrCamera.position.set(1, 1.7, 2);
    app.update();
    near(mapRoot.position.y, 1.3);
    await session.end();
  });
});

test('changing layout or map scale explicitly replants the map at the current viewer', async () => {
  await withXRHarness(async ({ app, mapRoot, xrCamera, setScale, session }) => {
    await app.enter();
    app.update();
    app.setLayout('tabletop');
    app.update();
    near(mapRoot.scale.x * 20, 2.1);
    xrCamera.position.set(3, 1.7, 2);
    setScale(3);
    app.update();
    near(mapRoot.position.x, 3);
    near(mapRoot.position.z, 0.35);
    app.setLayout('room');
    app.update();
    near(mapRoot.scale.x * 20, 12);
    near(mapRoot.position.z, 2);
    await session.end();
  });
});


test('native session end waits for Three cleanup before restoring the desktop and notifying the engine', async () => {
  await withXRHarness(async ({ app, session, endedStates, camera, setScale, renderer }) => {
    await app.enter({ mode: 'immersive-ar' });
    app.update();
    setScale(3);
    await session.end();
    assert.equal(app.isPresenting, false);
    assert.equal(endedStates.length, 1);
    assert.equal(endedStates[0].presenting, false, 'engine resize and view reset must run after the XR framebuffer is released');
    assert.equal(endedStates[0].viewChanged, true);
    assert.deepEqual(endedStates[0].cameraPosition, [3, 4, 5]);
    assert.deepEqual(camera.position.toArray(), [3, 4, 5]);
    assert.equal(renderer.getClearAlpha(), 0.8);
  }, null, { nativeEndOrdering: true });
});
