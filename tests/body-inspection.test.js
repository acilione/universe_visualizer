import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Universe } from '../src/universe.js';
import { createPlanetVisual } from '../src/planet-visuals.js';
import { planetCameraFraming } from '../src/planet-navigation.js';
import { catalog } from '../src/data.js';
import { solarMoons } from '../src/moons.js';

// Keep real focus/activation/framing code, with only WebGL construction and UI
// notification excluded. Real body geometry and archive metadata are retained.
function harness(t, object, { width = 1280, height = 900, xr = false } = {}) {
  const visual = createPlanetVisual(object);
  const engine = Object.create(Universe.prototype);
  const xrFocus = [];
  Object.assign(engine, {
    index: 0, bodyVisuals: new Map([[object.id, visual]]), elapsed: 4,
    camera: new THREE.PerspectiveCamera(width < 700 ? 59 : 44, width / height, .008, 1500),
    canvas: { clientWidth: width, clientHeight: height },
    controls: { target: new THREE.Vector3(), minDistance: 4 },
    sunLight: new THREE.PointLight(), renderer: { xr: { isPresenting: xr } },
    layers: { grid: true }, immersive: false, reducedMotion: true,
    content: new THREE.Group(), selectionRing: new THREE.Group(),
    selectObject(selected) { this.selected = selected; },
    xr: { focusObject: (selected, extent) => xrFocus.push({ selected, extent }) },
  });
  engine.camera.position.set(0, 27, 41);
  t.after(() => {
    visual.userData.dispose?.();
    visual.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
  });
  return { engine, visual, xrFocus };
}
const viewDirection = engine => engine.cameraFlight.to.clone().sub(engine.cameraFlight.targetTo).normalize();
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('selecting the Sun with focus uses body-safe framing on desktop and narrow screens', t => {
  const sun = catalog.solar.find(object => object.id === 'sun');
  for (const dimensions of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const { engine, visual } = harness(t, sun, dimensions);
    assert.equal(engine.activateObject(sun, { focus: true }), true);
    assert.equal(engine.focusedPlanet, sun);
    assert.equal(engine.selected, sun);
    assert.equal(engine.selectionRing.visible, false, 'inspection does not draw a selection guide across the photosphere');
    const expected = planetCameraFraming(visual.userData.bodyRadius, { ...dimensions, fov: engine.camera.fov, visualRadius: visual.userData.visualRadius });
    close(engine.controls.minDistance, expected.minDistance);
    close(engine.cameraFlight.to.distanceTo(engine.cameraFlight.targetTo), expected.focusDistance);
    assert.ok(engine.controls.minDistance > visual.userData.bodyRadius);
    assert.ok(engine.cameraFlight.targetTo.equals(new THREE.Vector3(...sun.position)));
    assert.ok(viewDirection(engine).distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-9);
  }
});

test('Sun focus follows the currently rotated observed hemisphere instead of the unmapped far side', t => {
  const sun = catalog.solar.find(object => object.id === 'sun');
  const { engine, visual } = harness(t, sun);
  visual.userData.surface.rotation.y = Math.PI * .8;
  const axis = visual.getObjectByName('body-axis');
  const observedDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(visual.userData.surface.quaternion).applyQuaternion(axis.quaternion);
  engine.focusObject(sun);
  assert.ok(viewDirection(engine).dot(observedDirection) > .99999, 'measured SDO hemisphere faces the new inspection camera after simulated spin');
});

test('Voyager-mapped moons begin on the observed southern hemisphere without changing their body orientation', t => {
  for (const id of ['ariel', 'umbriel', 'titania', 'oberon', 'miranda', 'triton']) {
    const moon = solarMoons.find(object => object.id === id);
    const { engine, visual } = harness(t, moon);
    const axis = visual.getObjectByName('body-axis');
    const orientation = visual.userData.surface.quaternion.clone();
    const pole = new THREE.Vector3(0, 1, 0).applyQuaternion(axis.quaternion);
    const expectedLatitude = visual.userData.appearance.inspectionLatitudeDeg;
    assert.ok(expectedLatitude < 0, id + ' declares its photographed hemisphere');
    engine.focusObject(moon);
    close(THREE.MathUtils.radToDeg(Math.asin(viewDirection(engine).dot(pole))), expectedLatitude, 1e-7);
    assert.ok(visual.userData.surface.quaternion.equals(orientation), 'camera choice must not rotate surface geography');
    assert.equal(engine.focusedPlanet, moon);
    assert.ok(engine.controls.minDistance > moon.size);
    const towardSun = engine.sunLight.position.clone().sub(new THREE.Vector3(...moon.position));
    towardSun.addScaledVector(pole, -towardSun.dot(pole)).normalize();
    const directionOnEquator = viewDirection(engine).addScaledVector(pole, -viewDirection(engine).dot(pole)).normalize();
    assert.ok(directionOnEquator.dot(towardSun) > .75, 'southern view retains the illuminated azimuth');
  }
});

test('southern inspection latitude uses the displayed body pole even when the axis is tilted', t => {
  const moon = solarMoons.find(object => object.id === 'ariel');
  const { engine, visual } = harness(t, moon);
  const axis = visual.getObjectByName('body-axis');
  axis.rotation.set(.3, -.15, .7);
  const pole = new THREE.Vector3(0, 1, 0).applyQuaternion(axis.quaternion);
  engine.focusObject(moon);
  close(THREE.MathUtils.radToDeg(Math.asin(viewDirection(engine).dot(pole))), -40, 1e-7);
});

test('XR Sun inspection forwards its measured display bounds without flying the headset camera', t => {
  const sun = catalog.solar.find(object => object.id === 'sun');
  const { engine, visual, xrFocus } = harness(t, sun, { xr: true });
  const position = engine.camera.position.clone();
  engine.activateObject(sun, { focus: true });
  assert.equal(xrFocus.length, 1);
  assert.equal(xrFocus[0].selected, sun);
  assert.ok(xrFocus[0].extent >= visual.userData.visualRadius);
  assert.equal(engine.cameraFlight, undefined);
  assert.ok(engine.camera.position.equals(position));
  assert.equal(engine.focusedPlanet, sun);
});


test('Sun inspection does not change catalogue-star marker navigation', t => {
  const sun = catalog.solar.find(object => object.id === 'sun');
  const { engine } = harness(t, sun);
  const star = { id: 'catalogue-star', bodyKind: 'star', position: [2, 3, 4], size: .1 };
  assert.equal(engine.isInspectableBody(star), false);
  engine.activateObject(star, { focus: true });
  assert.equal(engine.selected, star);
  assert.equal(engine.cameraFlight, undefined);
});


test('selection guides stay hidden during body inspection and return for an unfocused selection', t => {
  const saturn = catalog.solar.find(object => object.id === 'saturn');
  const { engine } = harness(t, saturn);
  engine.focusObject(saturn);
  assert.equal(engine.selectionRing.visible, false);
  engine.selected = catalog.solar.find(object => object.id === 'earth');
  engine.updateMoonOrbits();
  assert.equal(engine.selectionRing.visible, true);
});
