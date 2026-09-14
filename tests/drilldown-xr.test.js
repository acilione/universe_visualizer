import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Universe } from '../src/universe.js';
import { createXR } from '../src/xr.js';
import { catalog, scales } from '../src/data.js';

function createHarness(t) {
  const savedGlobals = new Map(['document', 'window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const painted = [];
  const context = new Proxy({ fillText: text => painted.push(text) }, { get: (target, key) => target[key] ?? (() => {}) });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context }) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  const viewer = new THREE.PerspectiveCamera();
  viewer.position.set(1, 1.6, 2);
  const controllers = [new THREE.Group(), new THREE.Group()];
  const grips = [new THREE.Group(), new THREE.Group()];
  const hands = [new THREE.Group(), new THREE.Group()];
  for (let index = 0; index < 2; index++) {
    for (const input of [controllers[index], grips[index], hands[index]]) input.position.copy(viewer.position);
    hands[index].joints = Object.fromEntries(['thumb-tip', 'index-finger-tip', 'wrist'].map(name => [name, new THREE.Group()]));
    hands[index].joints['thumb-tip'].position.x = -0.03;
    hands[index].joints['index-finger-tip'].position.x = 0.03;
    hands[index].add(...Object.values(hands[index].joints));
  }
  const session = new THREE.EventDispatcher();
  let sessionEnds = 0;
  const manager = {
    isPresenting: false, setReferenceSpaceType() {},
    getController: index => controllers[index], getControllerGrip: index => grips[index], getHand: index => hands[index],
    getCamera: () => viewer, getSession: () => session,
    async setSession() { this.isPresenting = true; },
  };
  session.end = async () => { sessionEnds++; manager.isPresenting = false; session.dispatchEvent({ type: 'end' }); };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: { requestSession: async () => session } } });
  const selected = [], navigated = [], mapActions = [];
  const engine = Object.create(Universe.prototype);
  Object.assign(engine, {
    index: 2, objects: catalog.galaxy, viewContext: scales[2], viewRequest: 0, elapsed: 0, boundsRadius: 23,
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(44, 1.5, 0.008, 1500),
    canvas: { clientWidth: 1280, clientHeight: 720 }, renderer: { xr: manager },
    controls: { enabled: true, target: new THREE.Vector3(), autoRotate: false },
    mapRoot: new THREE.Group(), content: new THREE.Group(), sky: new THREE.Group(),
    skyPointers: new Map(), retiring: [], labels: [], targets: [], layers: { labels: true, grid: true, particles: true },
    autoRotate: false, quality: 'low', immersive: false, reducedMotion: true,
    effects: { configure() {}, select() {} },
    onSelect: object => selected.push(object.id), onScale: index => navigated.push(index), onMessage() {},
    // Geometry construction is replaced; catalogue navigation, view lifecycle,
    // selection, XR ray casting and XR transforms all use production code.
    makeGrid: () => new THREE.Group(), makeSolar: () => new THREE.Group(), makeStars: () => new THREE.Group(),
    makeMarker(object) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(Math.max(object.size || 0.5, 0.5), 12, 8), new THREE.MeshBasicMaterial());
      marker.position.fromArray(object.position);
      marker.userData.object = object;
      this.content.add(marker);
      this.targets.push(marker);
      return marker;
    },
  });
  engine.camera.position.set(0, 27, 41);
  engine.scene.add(engine.mapRoot);
  engine.mapRoot.add(engine.content);
  const solarSystem = catalog.galaxy.find(object => object.id === 'solar-system');
  engine.makeMarker(solarSystem);
  engine.xr = createXR({
    renderer: engine.renderer, scene: engine.scene, camera: engine.camera, controls: engine.controls, mapRoot: engine.mapRoot,
    getTargets: () => engine.targets, getBoundsRadius: () => engine.boundsRadius, getScale: () => engine.index,
    getPresentationMode: () => 'atlas', onSelect: object => engine.activateObject(object),
    onFocus: object => engine.focusFromXR(object), onMapAction: event => mapActions.push(event),
  });
  const aim = target => {
    const direction = target.clone().sub(controllers[0].position).normalize();
    controllers[0].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  };
  const aimAtSolarSystem = () => {
    engine.mapRoot.updateWorldMatrix(true, true);
    aim(engine.targets[0].getWorldPosition(new THREE.Vector3()));
  };
  const trigger = () => {
    controllers[0].dispatchEvent({ type: 'selectstart' });
    controllers[0].dispatchEvent({ type: 'selectend' });
  };
  t.after(async () => {
    await engine.xr.dispose();
    engine.mapRoot.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    for (const [key, descriptor] of savedGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    engine, viewer, painted, selected, navigated, mapActions, solarSystem, hands, controllers, trigger, aim, aimAtSolarSystem,
    get sessionEnds() { return sessionEnds; },
    connect(hand = false) { controllers[0].dispatchEvent({ type: 'connected', data: hand ? { hand: {} } : {} }); },
  };
}

async function verifySolarSystemEntry(h, activate) {
  const pose = { position: h.viewer.position.clone(), quaternion: h.viewer.quaternion.clone() };
  assert.equal(await h.engine.xr.enter(), true);
  h.engine.xr.update();
  h.aimAtSolarSystem();
  h.painted.length = 0;
  activate();
  h.engine.xr.update();
  assert.equal(h.engine.index, 0);
  assert.deepEqual(h.navigated, [0], 'one activation opens one destination');
  assert.deepEqual(h.selected, ['sun'], 'destination selection replaces the parent map marker');
  assert.equal(h.engine.selected.id, 'sun');
  assert.ok(h.painted.includes('Sun'), 'the XR information panel shows the destination object');
  assert.ok(h.engine.objects.some(object => object.id === 'earth'));
  assert.ok(h.engine.objects.some(object => object.bodyKind === 'moon'));
  assert.equal(h.engine.xr.isPresenting, true);
  assert.equal(h.sessionEnds, 0);
  assert.ok(h.viewer.position.equals(pose.position));
  assert.ok(h.viewer.quaternion.equals(pose.quaternion));
  assert.equal(h.engine.controls.enabled, false);
  const placement = h.engine.mapRoot.matrixWorld.clone();
  h.viewer.position.add(new THREE.Vector3(0.5, 0, -0.6));
  h.engine.xr.update();
  h.engine.mapRoot.updateWorldMatrix(true, true);
  assert.deepEqual(h.engine.mapRoot.matrixWorld.elements, placement.elements, 'the Solar System stays in floor coordinates while the viewer walks');
  assert.deepEqual(h.navigated, [0], 'subsequent XR frames do not repeat navigation');
}

test('XR controller selection enters the Solar System from the Milky Way without moving the viewer', async t => {
  const h = createHarness(t);
  h.connect();
  await verifySolarSystemEntry(h, () => h.trigger());
});

test('a tracked hand pinch enters the Solar System and retains room-scale navigation', async t => {
  const h = createHarness(t);
  h.connect(true);
  await verifySolarSystemEntry(h, () => {
    const joints = h.hands[0].joints;
    joints['thumb-tip'].position.x = -0.005;
    joints['index-finger-tip'].position.x = 0.005;
    h.engine.xr.update();
    joints['thumb-tip'].position.x = -0.03;
    joints['index-finger-tip'].position.x = 0.03;
    h.engine.xr.update();
  });
});

test('the XR focus panel follows a selected Solar System link instead of focusing its galaxy marker', async t => {
  const h = createHarness(t);
  h.connect();
  await verifySolarSystemEntry(h, () => {
    h.engine.xr.setInfo({ ...h.solarSystem, scaleLabel: scales[2].name });
    const panel = h.engine.scene.getObjectByName('XR navigation panel');
    const target = panel.localToWorld(new THREE.Vector3((487 / 1160 - 0.5) * 1.45, (0.5 - 257 / 420) * (1.45 * 420 / 1160), 0));
    h.aim(target);
    h.trigger();
  });
  assert.equal(h.mapActions.filter(action => action.type === 'focus').length, 0, 'drill-down does not resize the outgoing marker');
});

test('automatic selection of the nearby Sun does not follow its Solar System link', async t => {
  const h = createHarness(t);
  await h.engine.xr.enter();
  h.engine.xr.update();
  h.engine.setScale(1);
  h.engine.xr.update();
  assert.equal(h.engine.selected.id, 'sol');
  assert.equal(h.engine.selected.targetScale, 0, 'the nearby Sun exposes Solar System entry');
  assert.equal(h.engine.index, 1, 'opening Nearby stars remains at the requested map level');
  assert.deepEqual(h.navigated, [1]);
  assert.deepEqual(h.selected, ['sol']);
  assert.equal(h.engine.xr.isPresenting, true);
  assert.equal(h.sessionEnds, 0);
});
