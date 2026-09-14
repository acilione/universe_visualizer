import { getLanguage, setLanguage } from '../src/i18n.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createXR } from '../src/xr.js';

function createHarness(t, initialMode = 'planetarium', initialLayers = null) {
  const savedGlobals = new Map(['document', 'window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const text = [];
  const context = new Proxy({ fillText: value => text.push(value) }, { get: (target, key) => target[key] ?? (() => {}) });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context }) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1.5, 0.1, 1000);
  camera.position.set(0, 5, 20);
  const viewer = new THREE.PerspectiveCamera();
  viewer.position.set(1, 1.6, 2);
  const controllers = [new THREE.Group(), new THREE.Group()];
  const grips = [new THREE.Group(), new THREE.Group()];
  const hands = [new THREE.Group(), new THREE.Group()];
  for (let index = 0; index < 2; index++) {
    controllers[index].position.copy(viewer.position);
    grips[index].position.copy(viewer.position);
    hands[index].position.copy(viewer.position);
    hands[index].joints = Object.fromEntries(['thumb-tip', 'index-finger-tip', 'wrist'].map(name => [name, new THREE.Group()]));
    hands[index].joints['thumb-tip'].position.x = -0.03;
    hands[index].joints['index-finger-tip'].position.x = 0.03;
    hands[index].add(...Object.values(hands[index].joints));
  }
  const manager = {
    isPresenting: false,
    setReferenceSpaceType: () => {},
    getController: index => controllers[index],
    getControllerGrip: index => grips[index],
    getHand: index => hands[index],
    getCamera: () => viewer,
    getSession: () => session,
    setSession: async () => { manager.isPresenting = true; },
  };
  const session = new THREE.EventDispatcher();
  session.end = async () => { manager.isPresenting = false; session.dispatchEvent({ type: 'end' }); };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: { requestSession: async () => session } } });
  const controls = { enabled: initialMode !== 'planetarium', target: new THREE.Vector3() };
  const mapRoot = new THREE.Group();
  const object = { id: 'hip-27989', name: 'Betelgeuse', size: 1, position: [0, 0, -60] };
  const star = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial());
  star.position.fromArray(object.position);
  star.userData.object = object;
  const opposite = star.clone();
  opposite.position.z = 60;
  opposite.userData.object = { ...object, id: 'opposite' };
  mapRoot.add(star, opposite);
  scene.add(mapRoot);
  const selected = [];
  const mapActions = [];
  const scaleActions = [];
  const focusActions = [];
  const ended = [];
  const messages = [];
  const layerActions = [];
  let layers = initialLayers;
  const targets = [star, opposite];
  let mode = initialMode;
  let scale = initialLayers ? 9 : mode === 'planetarium' ? 7 : 6;
  const xr = createXR({ renderer: { xr: manager }, scene, camera, controls, mapRoot,
    getTargets: () => targets, getBoundsRadius: () => 60, getPresentationMode: () => mode, getScale: () => scale,
    onSelect: value => selected.push(value), onScale: sign => scaleActions.push(sign), onFocus: value => focusActions.push(value), onMessage: message => messages.push(message),
    onSessionEnd: event => ended.push({ ...event, controlsEnabled: controls.enabled }),
    onMapAction: event => mapActions.push(event),
    getObjectLayers: () => layers,
    onObjectLayerChange: (name, enabled) => { layerActions.push([name, enabled]); layers = { ...layers, [name]: enabled }; },
  });
  const setMode = next => { mode = next; scale = next === 'planetarium' ? 7 : 6; };
  const connect = (index = 0, hand = false) => controllers[index].dispatchEvent({ type: 'connected', data: hand ? { hand: {} } : {} });
  t.after(async () => {
    await xr.dispose();
    star.geometry.dispose();
    star.material.dispose();
    for (const [key, descriptor] of savedGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { xr, mapRoot, camera, viewer, controls, controllers, grips, hands, selected, scaleActions, focusActions, ended, messages, text, object, session, setMode, connect, mapActions, manager, targets, star, layerActions, setLayers(value) { layers = value; } };
}

const identity = () => new THREE.Quaternion();

test('Earth VR surrounds the tracked viewer at full size and refuses object rescaling', async t => {
  const h = createHarness(t);
  assert.equal(await h.xr.enter(), true);
  h.xr.update();
  assert.deepEqual(h.mapRoot.position.toArray(), h.viewer.position.toArray());
  assert.deepEqual(h.mapRoot.scale.toArray(), [1, 1, 1]);
  assert.ok(h.mapRoot.quaternion.equals(identity()));
  assert.equal(h.xr.focusObject(h.object, 0.5), false);
  assert.deepEqual(h.mapRoot.scale.toArray(), [1, 1, 1]);
  assert.match(h.messages.at(-1), /Look around the sky/);
  h.viewer.position.set(3, 1.8, -1);
  h.xr.recenter();
  h.xr.update();
  assert.deepEqual(h.mapRoot.position.toArray(), [3, 1.8, -1]);
});

test('a controller trigger selects a real target on the 60 metre sky dome', async t => {
  const h = createHarness(t);
  h.connect();
  await h.xr.enter();
  h.xr.update();
  h.controllers[0].dispatchEvent({ type: 'selectstart' });
  h.controllers[0].dispatchEvent({ type: 'selectend' });
  assert.deepEqual(h.selected.map(item => item.id), ['hip-27989']);
});

test('a tracked hand pinch still selects stars in Earth VR', async t => {
  const h = createHarness(t);
  h.connect(0, true);
  await h.xr.enter();
  h.xr.update();
  const joints = h.hands[0].joints;
  joints['thumb-tip'].position.x = -0.005;
  joints['index-finger-tip'].position.x = 0.005;
  h.xr.update();
  joints['thumb-tip'].position.x = -0.03;
  joints['index-finger-tip'].position.x = 0.03;
  h.xr.update();
  assert.deepEqual(h.selected.map(item => item.id), ['hip-27989']);
});

test('one and two controller grips cannot drag, rotate or resize the terrestrial sky', async t => {
  const h = createHarness(t);
  h.connect(0);
  h.connect(1);
  await h.xr.enter();
  h.xr.update();
  h.controllers[0].dispatchEvent({ type: 'squeezestart' });
  h.grips[0].position.x -= 0.3;
  h.grips[0].rotation.y = 0.8;
  h.xr.update();
  h.controllers[1].dispatchEvent({ type: 'squeezestart' });
  h.grips[1].position.x += 0.7;
  h.grips[1].position.y += 0.5;
  h.xr.update();
  assert.deepEqual(h.mapRoot.position.toArray(), h.viewer.position.toArray());
  assert.deepEqual(h.mapRoot.scale.toArray(), [1, 1, 1]);
  assert.ok(h.mapRoot.quaternion.equals(identity()));
});

test('changing into sky mode cancels an atlas grab and exit uses the current controls mode', async t => {
  const h = createHarness(t, 'atlas');
  h.connect();
  await h.xr.enter();
  h.xr.update();
  assert.equal(h.mapRoot.scale.x, 0.1);
  h.controllers[0].dispatchEvent({ type: 'squeezestart' });
  h.xr.update();
  h.grips[0].position.x += 0.4;
  h.xr.update();
  assert.ok(h.mapRoot.position.x > h.viewer.position.x);
  h.setMode('planetarium');
  h.xr.update();
  assert.deepEqual(h.mapRoot.position.toArray(), h.viewer.position.toArray());
  assert.deepEqual(h.mapRoot.scale.toArray(), [1, 1, 1]);
  h.grips[0].position.x += 2;
  h.xr.update();
  assert.deepEqual(h.mapRoot.position.toArray(), h.viewer.position.toArray());
  await h.session.end();
  assert.equal(h.controls.enabled, false);
  assert.deepEqual(h.ended, [{ presentationMode: 'planetarium', previousPresentationMode: 'atlas', viewChanged: true, modeChanged: true, controlsEnabled: false }]);
});

test('leaving the sky restores atlas focus and enables current desktop orbit controls', async t => {
  const h = createHarness(t);
  await h.xr.enter();
  h.xr.update();
  h.setMode('atlas');
  h.xr.update();
  assert.equal(h.mapRoot.scale.x, 0.1);
  assert.equal(h.xr.focusObject(h.object, 0.5), true);
  h.xr.update(0.1);
  await h.session.end();
  assert.equal(h.controls.enabled, true);
  assert.equal(h.ended[0].presentationMode, 'atlas');
  assert.equal(h.ended[0].previousPresentationMode, 'planetarium');
  assert.equal(h.ended[0].viewChanged, true);
});


test('constellation world panel exposes figure cycling and perspective switching', async t => {
  const h = createHarness(t);
  h.connect();
  await h.xr.enter();
  h.xr.update();
  assert.ok(h.text.includes('\u2190 FIGURE'));
  assert.ok(h.text.includes('FIGURE \u2192'));
  assert.ok(h.text.includes('3D SPACE'));
  assert.ok(h.text.includes('Change the constellation or perspective using the panel.'));
  const panel = h.mapRoot.parent.getObjectByName('XR navigation panel');
  const clickPanel = (x, y) => {
    const target = panel.localToWorld(new THREE.Vector3((x / 1160 - 0.5) * 1.45, (0.5 - y / 420) * (1.45 * 420 / 1160), 0));
    const direction = target.sub(h.controllers[0].position).normalize();
    h.controllers[0].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    h.controllers[0].dispatchEvent({ type: 'selectstart' });
    h.controllers[0].dispatchEvent({ type: 'selectend' });
  };
  clickPanel(115, 257);
  clickPanel(301, 257);
  clickPanel(487, 257);
  assert.deepEqual(h.scaleActions, [-1, 1]);
  // A figure can be changed before any individual star has been selected.
  assert.equal(h.focusActions.length, 1);
  h.setMode('atlas');
  h.xr.update();
  assert.ok(h.text.includes('FROM EARTH'));
});


test('VR uses English by default and renders Italian only after an explicit language selection', async t => {
  assert.equal(getLanguage(), 'en');
  setLanguage('it');
  t.after(() => setLanguage('en'));
  const h = createHarness(t);
  await h.xr.enter();
  h.xr.update();
  assert.ok(h.text.includes('← FIGURA'));
  assert.ok(h.text.includes('SPAZIO 3D'));
  assert.ok(h.text.includes('RICENTRA'));
  assert.ok(h.text.includes('ESCI VR'));
  assert.match(h.messages.at(-1), /VR attiva/);
  assert.ok(!h.text.includes('3D SPACE'));
});


test('VR reveal waits for tracked placement and does not repeat while the viewer walks', async t => {
  const h = createHarness(t, 'atlas');
  let tracked = false;
  h.manager.getFrame = () => ({ getViewerPose: () => tracked ? {} : null });
  h.manager.getReferenceSpace = () => new THREE.EventDispatcher();
  await h.xr.enter();
  h.xr.update();
  assert.equal(h.mapActions.length, 0);
  tracked = true; h.xr.update();
  assert.deepEqual(h.mapActions.map(event => event.type), ['reveal']);
  h.viewer.position.x += 1; h.xr.update(); h.xr.update();
  assert.equal(h.mapActions.length, 1);
  h.xr.recenter();
  assert.equal(h.mapActions.length, 1);
  h.xr.update();
  assert.deepEqual(h.mapActions.map(event => event.type), ['reveal', 'reveal']);
});

test('controller feedback keeps one grab lifecycle through single and dual hand transitions', async t => {
  const h = createHarness(t, 'atlas');
  h.connect(0); h.connect(1);
  await h.xr.enter(); h.xr.update(); h.mapActions.length = 0;
  h.grips[0].position.x -= .2; h.grips[1].position.x += .2;
  h.controllers[0].dispatchEvent({ type: 'squeezestart' }); h.xr.update();
  const first = h.mapActions.find(event => event.type === 'grab-start');
  assert.equal(first.points.length, 1);
  assert.deepEqual(first.points[0].toArray(), h.grips[0].getWorldPosition(new THREE.Vector3()).toArray());
  const firstPoint = first.points[0].toArray();
  h.grips[0].position.x -= .1; h.xr.update();
  h.controllers[1].dispatchEvent({ type: 'squeezestart' }); h.xr.update();
  assert.equal(h.mapActions.at(-1).points.length, 2);
  h.controllers[0].dispatchEvent({ type: 'squeezeend' }); h.xr.update();
  assert.equal(h.mapActions.at(-1).points.length, 1);
  h.controllers[1].dispatchEvent({ type: 'squeezeend' });
  assert.equal(h.mapActions.filter(event => event.type === 'grab-start').length, 1);
  assert.equal(h.mapActions.filter(event => event.type === 'grab-end').length, 1);
  assert.equal(h.mapActions.at(-1).type, 'grab-end');
  assert.deepEqual(first.points[0].toArray(), firstPoint, 'previous feedback snapshots remain independent');
  h.xr.update(); assert.equal(h.mapActions.at(-1).type, 'grab-end');
});

test('hand tracking loss and session exit clear feedback while planetarium grips remain silent', async t => {
  const h = createHarness(t, 'atlas');
  h.connect(0, true);
  await h.xr.enter(); h.xr.update(); h.mapActions.length = 0;
  const joints = h.hands[0].joints;
  joints['thumb-tip'].position.x = -.005; joints['index-finger-tip'].position.x = .005;
  h.xr.update();
  assert.equal(h.mapActions.length, 0, 'brief pinch does not start map manipulation');
  h.hands[0].position.x += .04; h.xr.update();
  assert.equal(h.mapActions[0].type, 'grab-start');
  assert.deepEqual(h.mapActions[0].points[0].toArray(), h.hands[0].getWorldPosition(new THREE.Vector3()).toArray());
  joints.wrist.visible = false; h.xr.update();
  assert.equal(h.mapActions.at(-1).type, 'grab-end');
  h.controllers[0].dispatchEvent({ type: 'disconnected' }); h.connect(0);
  h.controllers[0].dispatchEvent({ type: 'squeezestart' }); h.xr.update();
  assert.equal(h.mapActions.at(-1).type, 'grab-move');
  h.setMode('planetarium'); h.xr.update();
  assert.equal(h.mapActions.filter(event => event.type === 'grab-end').length, 2);
  h.mapActions.length = 0;
  h.controllers[0].dispatchEvent({ type: 'squeezestart' }); h.grips[0].position.x += .5; h.xr.update();
  h.controllers[0].dispatchEvent({ type: 'squeezeend' });
  assert.equal(h.mapActions.length, 0);
  h.setMode('atlas'); h.xr.update();
  h.controllers[0].dispatchEvent({ type: 'squeezestart' }); h.xr.update();
  await h.session.end();
  assert.equal(h.mapActions.at(-1).type, 'grab-end');
});


function pointAtLayer(h, index) {
  const panel = h.mapRoot.parent.getObjectByName('XR object layers');
  const x = [206, 580, 954][index];
  const point = panel.localToWorld(new THREE.Vector3((x / 1160 - .5) * 1.45, (.5 - 83 / 150) * 1.45 * 150 / 1160, 0));
  const controller = h.controllers[0];
  controller.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), point.sub(controller.getWorldPosition(new THREE.Vector3())).normalize());
}

const fixedPose = root => ({ position: root.position.toArray(), quaternion: root.quaternion.toArray(), scale: root.scale.toArray() });

test('combined VR controller toggles every object layer without recentering the map', async t => {
  const h = createHarness(t, 'atlas', { planets: true, stars: true, nebulae: true });
  h.connect();
  await h.xr.enter(); h.xr.update();
  const panel = h.mapRoot.parent.getObjectByName('XR object layers');
  assert.equal(panel.visible, true);
  assert.ok(h.text.includes('PLANETS  ON'));
  h.mapRoot.position.x += .9;
  const fixed = fixedPose(h.mapRoot), animationCount = h.mapActions.length;
  for (const index of [0, 1, 2, 1]) {
    pointAtLayer(h, index);
    h.controllers[0].dispatchEvent({ type: 'selectstart' });
    h.controllers[0].dispatchEvent({ type: 'selectend' });
    h.xr.update();
    assert.deepEqual(fixedPose(h.mapRoot), fixed);
  }
  assert.deepEqual(h.layerActions, [['planets', false], ['stars', false], ['nebulae', false], ['stars', true]]);
  assert.equal(h.selected.length, 0);
  assert.equal(h.mapActions.length, animationCount);
  assert.ok(h.text.includes('PLANETS  OFF'));
  h.setLayers({ planets: false, stars: false, nebulae: true });
  h.xr.setInfo({ name: 'Updated object' }); h.xr.update();
  assert.ok(h.text.includes('Updated object'));
  assert.ok(h.text.slice(-4).includes('NEBULAE  ON'));
  assert.deepEqual(fixedPose(h.mapRoot), fixed);
});

test('combined VR hand pinch toggles a layer and a held panel pinch cannot grab the map', async t => {
  const h = createHarness(t, 'atlas', { planets: true, stars: true, nebulae: true });
  h.connect(0, true);
  await h.xr.enter(); h.xr.update(); pointAtLayer(h, 2);
  const fixed = fixedPose(h.mapRoot);
  const joints = h.hands[0].joints;
  const setGap = gap => {
    joints['thumb-tip'].position.x = -gap / 2;
    joints['index-finger-tip'].position.x = gap / 2;
    h.xr.update();
  };
  setGap(.01); setGap(.06);
  assert.deepEqual(h.layerActions, [['nebulae', false]]);
  setGap(.01);
  h.hands[0].position.x += .5; h.xr.update();
  setGap(.06);
  assert.deepEqual(fixedPose(h.mapRoot), fixed);
  assert.equal(h.layerActions.length, 1, 'moving a held pinch does not activate a button');
  assert.equal(h.mapActions.filter(event => event.type.startsWith('grab')).length, 0);
});

test('combined layer controls hide with immersive writing and are absent outside combined mode', async t => {
  const h = createHarness(t, 'atlas', { planets: true, stars: true, nebulae: true });
  h.connect();
  await h.xr.enter(); h.xr.update();
  const scene = h.mapRoot.parent, panel = scene.getObjectByName('XR object layers');
  h.xr.setImmersive(true); h.xr.update();
  assert.equal(panel.visible, false);
  assert.equal(scene.getObjectByName('XR navigation panel').visible, false);
  assert.equal(scene.getObjectByName('XR restore controls').visible, true);
  h.xr.setImmersive(false); h.xr.update();
  assert.equal(panel.visible, true);
  h.setLayers(null); h.xr.update();
  assert.equal(panel.visible, false);
  pointAtLayer(h, 0);
  h.controllers[0].dispatchEvent({ type: 'selectstart' });
  h.controllers[0].dispatchEvent({ type: 'selectend' });
  assert.equal(h.layerActions.length, 0);
  h.setLayers({ planets: false, stars: false, nebulae: true }); h.xr.update();
  assert.equal(panel.visible, true);
  const disposed = [];
  panel.geometry.addEventListener('dispose', () => disposed.push('geometry'));
  panel.material.addEventListener('dispose', () => disposed.push('material'));
  panel.material.map.addEventListener('dispose', () => disposed.push('texture'));
  await h.xr.dispose();
  assert.deepEqual(disposed.sort(), ['geometry', 'material', 'texture']);
  assert.equal(scene.getObjectByName('XR object layers'), undefined);
});

test('XR selects the per-point catalogue record and ignores hidden cloud groups', async t => {
  const h = createHarness(t, 'atlas', { planets: true, stars: true, nebulae: true });
  h.connect();
  const catalogueObject = { id: 'hip-113881', name: 'Scheat', position: [0, 0, -10] };
  const layer = new THREE.Group(); h.mapRoot.add(layer); layer.add(h.star);
  h.targets.splice(0, h.targets.length, h.star);
  h.star.raycast = (raycaster, hits) => hits.push({ distance: 2, point: raycaster.ray.at(2, new THREE.Vector3()), object: h.star, dataObject: catalogueObject });
  await h.xr.enter(); h.xr.update();
  h.controllers[0].dispatchEvent({ type: 'selectstart' });
  h.controllers[0].dispatchEvent({ type: 'selectend' });
  assert.deepEqual(h.selected, [catalogueObject]);
  layer.visible = false;
  h.controllers[0].dispatchEvent({ type: 'selectstart' });
  h.controllers[0].dispatchEvent({ type: 'selectend' });
  assert.equal(h.selected.length, 1);
});
