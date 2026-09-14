import * as THREE from 'three';
import { t } from './i18n.js';
import { computeSpatialPlacement } from './spatial-map.js';

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const EYE_HEIGHT = 1.65;

/** First-person desktop inspection of the same metre-scale scene used by WebXR. */
export function createDesktopImmersive({ canvas, camera, controls, mapRoot,
  getBoundsRadius = () => 24, getPresentationMode = () => 'atlas', getTargets = () => [],
  onSelect = () => {}, onChange = () => {}, onMessage = () => {}, onMapAction = () => {},
}) {
  const doc = canvas.ownerDocument || globalThis.document;
  const win = doc.defaultView || globalThis.window;
  const keys = new Set();
  const listeners = [];
  const raycaster = new THREE.Raycaster();
  const viewerPosition = new THREE.Vector3(0, EYE_HEIGHT, 0);
  const look = new THREE.Euler(0, 0, 0, 'YXZ');
  let active = false;
  let disposed = false;
  let layout = 'room';
  let snapshot = null;
  let pointer = null;
  let baseScale = 1;
  let viewChanged = false;
  let yaw = 0;
  let pitch = 0;

  const planetarium = () => getPresentationMode() === 'planetarium';
  const locked = () => doc.pointerLockElement === canvas;
  const state = () => ({ active, layout, planetarium: planetarium(), pointerLocked: locked(), viewChanged });
  const notify = () => onChange(active, state());
  const listen = (target, type, callback, options) => {
    target.addEventListener(type, callback, options);
    listeners.push(() => target.removeEventListener(type, callback, options));
  };
  const editable = element => !!element?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
  const blocked = event => editable(event?.target) || editable(doc.activeElement)
    || !!doc.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };

  function applyCamera() {
    camera.position.copy(viewerPosition);
    camera.quaternion.setFromEuler(look.set(pitch, yaw, 0, 'YXZ'));
    camera.updateMatrixWorld(true);
  }

  function applyPlacement(placement) {
    const world = new THREE.Matrix4().compose(placement.position, placement.quaternion, new THREE.Vector3().setScalar(placement.scale));
    if (mapRoot.parent) {
      mapRoot.parent.updateWorldMatrix(true, false);
      world.premultiply(mapRoot.parent.matrixWorld.clone().invert());
    }
    world.decompose(mapRoot.position, mapRoot.quaternion, mapRoot.scale);
    mapRoot.updateMatrixWorld(true);
  }

  function placeMap() {
    const placement = computeSpatialPlacement({ boundsRadius: getBoundsRadius(), viewerPosition,
      viewerQuaternion: camera.quaternion, layout, planetarium: planetarium() });
    baseScale = placement.scale;
    applyPlacement(placement);
    onMapAction({ type: 'reveal' });
  }

  function clearPointer() {
    const old = pointer;
    pointer = null;
    if (old && canvas.hasPointerCapture?.(old.id)) {
      try { canvas.releasePointerCapture(old.id); } catch { /* A cancelled pointer may already be released. */ }
    }
  }
  function clearInput() { keys.clear(); clearPointer(); }

  function enter(options = {}) {
    if (disposed) return false;
    if (active) { if (options.layout) setLayout(options.layout); return true; }
    layout = options.layout === 'tabletop' ? 'tabletop' : 'room';
    snapshot = {
      position: camera.position.clone(), quaternion: camera.quaternion.clone(), scale: camera.scale.clone(), up: camera.up.clone(),
      projection: Object.fromEntries(['fov', 'near', 'far', 'zoom', 'filmGauge', 'filmOffset', 'focus'].map(key => [key, camera[key]])),
      view: camera.view ? { ...camera.view } : null,
      rootPosition: mapRoot.position.clone(), rootQuaternion: mapRoot.quaternion.clone(), rootScale: mapRoot.scale.clone(),
      enabled: controls.enabled, autoRotate: controls.autoRotate, target: controls.target.clone(),
      cursor: canvas.style.cursor, touchAction: canvas.style.touchAction,
    };
    active = true; viewChanged = false;
    yaw = 0; pitch = 0;
    viewerPosition.set(0, EYE_HEIGHT, 0);
    controls.enabled = false; controls.autoRotate = false;
    camera.scale.setScalar(1); camera.up.copy(Y_AXIS);
    camera.fov = 72; camera.near = .008; camera.far = Math.max(snapshot.projection.far, 1500); camera.zoom = 1;
    if (camera.view) camera.view.enabled = false;
    camera.updateProjectionMatrix();
    canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none';
    clearInput(); applyCamera(); placeMap(); notify();
    return true;
  }

  function exit() {
    if (!active) return;
    active = false; clearInput();
    if (locked()) doc.exitPointerLock?.();
    const saved = snapshot;
    mapRoot.position.copy(saved.rootPosition); mapRoot.quaternion.copy(saved.rootQuaternion); mapRoot.scale.copy(saved.rootScale);
    mapRoot.updateMatrixWorld(true);
    controls.enabled = saved.enabled; controls.autoRotate = saved.autoRotate; controls.target.copy(saved.target);
    camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.scale.copy(saved.scale); camera.up.copy(saved.up);
    Object.assign(camera, saved.projection); camera.view = saved.view;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    canvas.style.cursor = saved.cursor; canvas.style.touchAction = saved.touchAction;
    snapshot = null; notify();
  }

  function update(dt) {
    if (!active) return;
    // Modal UI and lost focus must never leave an old movement key pressed.
    if (blocked() || doc.hidden) clearInput();
    if (!planetarium()) {
      const movement = new THREE.Vector3(
        Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
        Number(keys.has('KeyE')) - Number(keys.has('KeyQ')),
        Number(keys.has('KeyS')) - Number(keys.has('KeyW')),
      );
      if (movement.lengthSq()) {
        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4.5 : 1.5;
        movement.normalize().applyAxisAngle(Y_AXIS, yaw).multiplyScalar(Math.min(.1, Math.max(0, Number(dt) || 0)) * speed);
        viewerPosition.add(movement);
      }
    }
    applyCamera();
  }

  function recenter() {
    if (!active) return;
    clearInput(); applyCamera(); placeMap(); notify();
  }
  function setLayout(value) {
    const next = value === 'tabletop' ? 'tabletop' : 'room';
    if (layout === next) return;
    layout = next;
    if (active) recenter();
  }
  function onViewChanged() {
    if (!active) return;
    viewChanged = true;
    // Scene builders may change the orbit camera. Restore the viewer pose first.
    camera.fov = 72; camera.zoom = 1; camera.updateProjectionMatrix();
    controls.enabled = false; controls.autoRotate = false;
    clearInput(); applyCamera(); placeMap(); notify();
  }
  function scaleMap(factor) {
    if (!active || planetarium() || !Number.isFinite(factor) || factor <= 0) return false;
    const worldScale = mapRoot.getWorldScale(new THREE.Vector3()).x;
    const next = THREE.MathUtils.clamp(worldScale * factor, baseScale * .1, baseScale * 8);
    mapRoot.scale.multiplyScalar(next / worldScale); mapRoot.updateMatrixWorld(true);
    if (Math.abs(next - worldScale) > 1e-12) onMapAction({ type: 'adjust', points: [mapRoot.getWorldPosition(new THREE.Vector3())] });
    return true;
  }
  function rotateMap(radians) {
    if (!active || planetarium() || !Number.isFinite(radians)) return false;
    const rotation = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, radians);
    const worldQuaternion = mapRoot.getWorldQuaternion(new THREE.Quaternion()).premultiply(rotation);
    if (mapRoot.parent) worldQuaternion.premultiply(mapRoot.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
    mapRoot.quaternion.copy(worldQuaternion); mapRoot.updateMatrixWorld(true);
    if (radians !== 0) onMapAction({ type: 'adjust', points: [mapRoot.getWorldPosition(new THREE.Vector3())] });
    return true;
  }
  function lookAtObject(object) {
    if (!active || !object) return false;
    mapRoot.updateMatrixWorld(true);
    const target = getTargets().find(item => item.userData.object?.id === object.id);
    let position;
    if (target) position = target.getWorldPosition(new THREE.Vector3());
    else if (Array.isArray(object.position) && object.position.length === 3 && object.position.every(Number.isFinite)) {
      position = mapRoot.localToWorld(new THREE.Vector3(...object.position));
    }
    if (!position || position.distanceToSquared(viewerPosition) < .000001) return false;
    camera.position.copy(viewerPosition); camera.lookAt(position);
    look.setFromQuaternion(camera.quaternion, 'YXZ');
    yaw = look.y; pitch = THREE.MathUtils.clamp(look.x, -Math.PI / 2 + .01, Math.PI / 2 - .01);
    applyCamera();
    onMapAction({ type: 'focus', object });
    return true;
  }
  async function lockPointer() {
    if (!active || blocked()) return false;
    if (!canvas.requestPointerLock) {
      onMessage(t('Mouse lock is unavailable. Drag to look around.', 'Il blocco del mouse non è disponibile. Trascina per guardarti intorno.'));
      return false;
    }
    try { await canvas.requestPointerLock(); return true; }
    catch {
      onMessage(t('Mouse lock was not enabled. Drag to look around.', 'Il blocco del mouse non è stato attivato. Trascina per guardarti intorno.'));
      return false;
    }
  }

  function pick(event) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ndc = locked() ? new THREE.Vector2() : new THREE.Vector2(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1,
    );
    camera.updateMatrixWorld(true); mapRoot.updateMatrixWorld(true);
    raycaster.near = camera.near; raycaster.far = camera.far;
    raycaster.setFromCamera(ndc, camera);
    const targets = getTargets().filter(target => {
      for (let node = target; node; node = node.parent) if (!node.visible) return false;
      return true;
    });
    const hit = raycaster.intersectObjects(targets, false).find(item => item.dataObject || item.object.userData.object);
    if (hit) onSelect(hit.dataObject || hit.object.userData.object);
  }

  listen(canvas, 'pointerdown', event => {
    if (!active || event.button !== 0 || blocked(event)) return;
    consume(event);
    if (pointer) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, distance: 0, time: performance.now() };
    if (!locked()) { canvas.setPointerCapture?.(event.pointerId); canvas.style.cursor = 'grabbing'; }
  }, true);
  listen(canvas, 'pointermove', event => {
    if (!active || blocked(event) || (!locked() && pointer?.id !== event.pointerId)) return;
    consume(event);
    const dx = locked() ? event.movementX || 0 : event.clientX - pointer.x;
    const dy = locked() ? event.movementY || 0 : event.clientY - pointer.y;
    yaw -= dx * .0025;
    pitch = THREE.MathUtils.clamp(pitch - dy * .0025, -Math.PI / 2 + .01, Math.PI / 2 - .01);
    if (pointer) { pointer.x = event.clientX; pointer.y = event.clientY; pointer.distance += Math.hypot(dx, dy); }
    applyCamera();
  }, true);
  listen(canvas, 'pointerup', event => {
    if (!active || pointer?.id !== event.pointerId) return;
    consume(event);
    const click = !blocked(event) && pointer.distance < 6
      && (locked() || Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 6)
      && performance.now() - pointer.time < 500;
    clearPointer(); canvas.style.cursor = locked() ? 'none' : 'grab';
    if (click) pick(event);
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) listen(canvas, type, event => {
    if (active && pointer?.id === event.pointerId) { clearPointer(); canvas.style.cursor = locked() ? 'none' : 'grab'; }
  }, true);
  // Capturing keys prevents the atlas keyboard shortcuts from also zooming or panning.
  listen(doc, 'keydown', event => {
    if (!active || blocked(event) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (MOVEMENT_KEYS.has(event.code)) { consume(event); keys.add(event.code); }
    else if (event.code === 'KeyR') { consume(event); if (!event.repeat) recenter(); }
  }, true);
  listen(doc, 'keyup', event => {
    const wasPressed = keys.delete(event.code);
    if (active && wasPressed && !blocked(event)) consume(event);
  }, true);
  listen(win, 'blur', clearInput);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) clearInput(); });
  listen(doc, 'pointerlockchange', () => {
    if (!active) return;
    clearInput(); canvas.style.cursor = locked() ? 'none' : 'grab'; notify();
  });
  listen(doc, 'pointerlockerror', () => {
    if (active) onMessage(t('Mouse lock was not enabled. Drag to look around.', 'Il blocco del mouse non è stato attivato. Trascina per guardarti intorno.'));
  });

  return {
    enter, exit, update, recenter, setLayout, onViewChanged, scaleMap, rotateMap, lookAtObject, lockPointer,
    get isActive() { return active; },
    get isPointerLocked() { return locked(); },
    get layout() { return layout; },
    get isPlanetarium() { return planetarium(); },
    dispose() { if (disposed) return; exit(); disposed = true; listeners.splice(0).forEach(remove => remove()); },
  };
}
