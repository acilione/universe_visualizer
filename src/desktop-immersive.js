import * as THREE from 'three';
import { t } from './i18n.js';
import { computeSpatialPlacement } from './spatial-map.js';

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const EYE_HEIGHT = 1.65;

/** First-person desktop inspection of the same metre-scale scene used by WebXR. */
export function createDesktopImmersive({ canvas, camera, controls, mapRoot,
  getBoundsRadius = () => 24, getPresentationMode = () => 'atlas', getSkyFrame = () => null, getTargets = () => [],
  onSelect = () => {}, onTravel, onNavigateBack, onChange = () => {}, onMessage = () => {}, onMapAction = () => {},
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
  let directTravel = false, inspecting = false, focusAnchor = null;
  let targetYaw = 0, targetPitch = 0, zoomTarget = null, rotationRemaining = 0;
  const velocity = new THREE.Vector3();
  let transitionState = null, transitionOpacity = 1;
  let pendingFocus = false;
  const smooth = value => value * value * (3 - 2 * value);
  const damp = (value, goal, rate, dt, maxStep = Infinity) => value + THREE.MathUtils.clamp(
    (goal - value) * (1 - Math.exp(-rate * dt)), -maxStep, maxStep);
  const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

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
      viewerQuaternion: camera.quaternion, layout, planetarium: planetarium(), skyFrame: getSkyFrame() });
    baseScale = placement.scale; inspecting = false; focusAnchor = null; pendingFocus = false;
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
  function clearInput() {
    keys.clear(); clearPointer(); velocity.set(0, 0, 0);
    targetYaw = yaw; targetPitch = pitch; zoomTarget = null; rotationRemaining = 0;
  }

  function setOpacity(value) {
    transitionOpacity = THREE.MathUtils.clamp(value, 0, 1);
    const original = snapshot?.opacity;
    if (transitionOpacity === 1) canvas.style.opacity = original ?? '';
    else canvas.style.opacity = String(transitionOpacity * (original == null || original === '' ? 1 : Number(original)));
  }
  function cancelTransition() {
    const old = transitionState;
    transitionState = null; pendingFocus = false;
    old?.resolve(false); setOpacity(1);
  }
  function completeHidden(state) {
    if (transitionState !== state) return;
    state.phase = 'in'; state.age = 0;
  }
  function commitHidden(state) {
    if (transitionState !== state) return;
    setOpacity(0); state.phase = 'waiting';
    try {
      const result = state.callback();
      if (result?.then) Promise.resolve(result).then(() => completeHidden(state), error => {
        if (transitionState !== state) return;
        onMessage(error?.message || String(error)); state.failed = true; completeHidden(state);
      });
      else completeHidden(state);
    } catch (error) {
      onMessage(error?.message || String(error)); state.failed = true; completeHidden(state);
    }
  }
  /** Commit programmatic jumps only with the complete rendered scene hidden.
   * Async view builders remain hidden until ready; their nested focus/placement
   * calls execute immediately, so a catalogue change cannot deadlock itself. */
  function runTransition(callback) {
    if (!active || typeof callback !== 'function') return Promise.resolve(false);
    if (transitionState && transitionOpacity === 0 && ['waiting', 'in'].includes(transitionState.phase)) {
      try { return Promise.resolve(callback()).then(() => true); }
      catch (error) { return Promise.reject(error); }
    }
    const startOpacity = transitionOpacity;
    const previous = transitionState;
    transitionState = null; previous?.resolve(false);
    clearInput(); pendingFocus = false;
    if (reducedMotion()) {
      setOpacity(1);
      try { return Promise.resolve(callback()).then(() => true); }
      catch (error) { return Promise.reject(error); }
    }
    return new Promise(resolve => {
      transitionState = { callback, resolve, phase: 'out', age: 0, startOpacity };
    });
  }
  function updateTransition(dt) {
    const state = transitionState;
    if (!state || state.phase === 'waiting') return;
    if (reducedMotion()) {
      if (state.phase === 'out') commitHidden(state);
      if (transitionState === state && state.phase === 'in') {
        transitionState = null; setOpacity(1); state.resolve(!state.failed);
      }
      return;
    }
    state.age += dt;
    if (state.phase === 'out') {
      const progress = Math.min(1, state.age / .12);
      setOpacity(state.startOpacity * (1 - smooth(progress)));
      if (progress === 1) commitHidden(state);
    } else {
      const progress = Math.min(1, state.age / .16);
      setOpacity(smooth(progress));
      if (progress === 1) {
        transitionState = null; setOpacity(1); state.resolve(!state.failed);
      }
    }
  }
  function revealPlacement(callback) {
    // A scene builder may already have replaced the map before notifying us.
    // Hide it now, before the next render; an enclosing runTransition keeps its
    // own fade and runs this placement as a nested hidden commit.
    if (transitionState && transitionOpacity === 0) return runTransition(callback);
    const result = runTransition(callback);
    if (transitionState) commitHidden(transitionState);
    return result;
  }

  function enter(options = {}) {
    if (disposed) return false;
    if (active) { if (options.layout) setLayout(options.layout); return true; }
    directTravel = Boolean(options.directTravel);
    layout = options.layout === 'tabletop' ? 'tabletop' : 'room';
    snapshot = {
      position: camera.position.clone(), quaternion: camera.quaternion.clone(), scale: camera.scale.clone(), up: camera.up.clone(),
      projection: Object.fromEntries(['fov', 'near', 'far', 'zoom', 'filmGauge', 'filmOffset', 'focus'].map(key => [key, camera[key]])),
      view: camera.view ? { ...camera.view } : null,
      rootPosition: mapRoot.position.clone(), rootQuaternion: mapRoot.quaternion.clone(), rootScale: mapRoot.scale.clone(),
      enabled: controls.enabled, autoRotate: controls.autoRotate, target: controls.target.clone(),
      cursor: canvas.style.cursor, touchAction: canvas.style.touchAction, opacity: canvas.style.opacity,
    };
    active = true; viewChanged = false;
    yaw = 0; pitch = 0; targetYaw = 0; targetPitch = 0;
    viewerPosition.set(0, EYE_HEIGHT, 0);
    controls.enabled = false; controls.autoRotate = false;
    camera.scale.setScalar(1); camera.up.copy(Y_AXIS);
    camera.fov = 72; camera.near = .008; camera.far = Math.max(snapshot.projection.far, 1500); camera.zoom = 1;
    if (camera.view) camera.view.enabled = false;
    camera.updateProjectionMatrix();
    canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none';
    clearInput(); revealPlacement(() => { applyCamera(); placeMap(); notify(); });
    return true;
  }

  function exit() {
    if (!active) return;
    cancelTransition(); active = false; inspecting = false; focusAnchor = null; clearInput();
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
    const delta = Math.min(.1, Math.max(0, Number(dt) || 0));
    if (blocked() || doc.hidden) clearInput();
    if (transitionState) { updateTransition(delta); applyCamera(); return; }
    yaw = damp(yaw, targetYaw, 18, delta, 2.8 * delta);
    pitch = damp(pitch, targetPitch, 18, delta, 2.8 * delta);
    if (!planetarium()) {
      const movement = new THREE.Vector3(Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
        Number(keys.has('KeyE')) - Number(keys.has('KeyQ')), Number(keys.has('KeyS')) - Number(keys.has('KeyW')));
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4.5 : 1.5;
      if (movement.lengthSq()) movement.normalize().applyAxisAngle(Y_AXIS, yaw).multiplyScalar(speed);
      velocity.lerp(movement, 1 - Math.exp(-(movement.lengthSq() ? 14 : 22) * delta));
      if (velocity.lengthSq() < 1e-10) velocity.set(0, 0, 0);
      viewerPosition.addScaledVector(velocity, delta);
      if (zoomTarget !== null) {
        const current = Math.log(transform().scale);
        const next = damp(current, zoomTarget, 14, delta, 2.4 * delta);
        applyScale(Math.exp(Math.abs(next - zoomTarget) < 1e-6 ? zoomTarget : next));
        if (Math.abs(next - zoomTarget) < 1e-6) zoomTarget = null;
      }
      if (rotationRemaining) {
        const step = damp(0, rotationRemaining, 14, delta, 1.6 * delta);
        applyRotation(step); rotationRemaining -= step;
        if (Math.abs(rotationRemaining) < 1e-6) { applyRotation(rotationRemaining); rotationRemaining = 0; }
      }
    }
    applyCamera();
  }

  function recenter() {
    if (!active) return false;
    runTransition(() => { applyCamera(); placeMap(); notify(); }); return true;
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
    // Restore the physically represented viewer before any frame can expose a
    // camera pose temporarily installed by an atlas scene builder.
    applyCamera(); controls.enabled = false; controls.autoRotate = false;
    revealPlacement(() => {
      camera.fov = 72; camera.zoom = 1; camera.updateProjectionMatrix();
      clearInput(); applyCamera(); placeMap(); notify();
    });
  }
  function transform() {
    mapRoot.updateWorldMatrix(true, false);
    return { position: mapRoot.getWorldPosition(new THREE.Vector3()), quaternion: mapRoot.getWorldQuaternion(new THREE.Quaternion()), scale: mapRoot.getWorldScale(new THREE.Vector3()).x };
  }
  function focusObject(object, extent = object?.size || .5) {
    if (!active || planetarium() || !Array.isArray(object?.position) || object.position.length !== 3 || !object.position.every(Number.isFinite)) return false;
    runTransition(() => {
      inspecting = true; pendingFocus = false; focusAnchor = new THREE.Vector3(...object.position);
      const from = transform(), radius = Math.max(.002, Number(extent) || .5);
      const scale = THREE.MathUtils.clamp(.3 / radius, baseScale * .03, baseScale * 300);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const destination = viewerPosition.clone().addScaledVector(forward, 1.35);
      const position = destination.sub(focusAnchor.clone().multiplyScalar(scale).applyQuaternion(from.quaternion));
      applyPlacement({ position, quaternion: from.quaternion, scale });
      onMapAction({ type: 'travel', object });
    });
    pendingFocus = transitionState?.phase === 'out'; return true;
  }
  function navigateBack() {
    if (!active) return false;
    if (pendingFocus || inspecting || transform().scale > baseScale * 1.6) {
      runTransition(() => { placeMap(); onMapAction({ type: 'overview' }); }); return true;
    }
    if (onNavigateBack) runTransition(onNavigateBack); else recenter();
    return true;
  }
  function applyScale(next) {
    const from = transform();
    const pivot = focusAnchor ? mapRoot.localToWorld(focusAnchor.clone()) : directTravel ? viewerPosition : from.position;
    const position = from.position.clone().sub(pivot).multiplyScalar(next / from.scale).add(pivot);
    applyPlacement({ position, quaternion: from.quaternion, scale: next });
  }
  function scaleMap(factor) {
    if (!active || planetarium() || !Number.isFinite(factor) || factor <= 0) return false;
    if (factor === 1) return true;
    if (transitionState?.phase === 'waiting') return false;
    if (transitionState) cancelTransition();
    const from = transform();
    zoomTarget = THREE.MathUtils.clamp((zoomTarget ?? Math.log(from.scale)) + Math.log(factor),
      Math.log(baseScale * (directTravel ? .025 : .1)), Math.log(baseScale * (directTravel ? 300 : 8)));
    if (reducedMotion()) { applyScale(Math.exp(zoomTarget)); zoomTarget = null; }
    onMapAction({ type: 'adjust', points: [focusAnchor ? mapRoot.localToWorld(focusAnchor.clone()) : from.position.clone()] });
    return true;
  }
  function applyRotation(radians) {
    const from = transform(), rotation = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, radians);
    const pivot = focusAnchor ? mapRoot.localToWorld(focusAnchor.clone()) : from.position;
    const position = from.position.clone().sub(pivot).applyQuaternion(rotation).add(pivot);
    applyPlacement({ position, quaternion: from.quaternion.premultiply(rotation), scale: from.scale });
  }
  function rotateMap(radians) {
    if (!active || planetarium() || !Number.isFinite(radians)) return false;
    if (!radians) return true;
    if (transitionState?.phase === 'waiting') return false;
    if (transitionState) cancelTransition();
    rotationRemaining = THREE.MathUtils.clamp(rotationRemaining + radians, -Math.PI, Math.PI);
    if (reducedMotion()) { applyRotation(rotationRemaining); rotationRemaining = 0; }
    onMapAction({ type: 'adjust', points: [mapRoot.getWorldPosition(new THREE.Vector3())] });
    return true;
  }
  function lookAtObject(object) {
    if (!active || !object) return false;
    const target = getTargets().find(item => item.userData.object?.id === object.id);
    if (!target && (!Array.isArray(object.position) || object.position.length !== 3 || !object.position.every(Number.isFinite))) return false;
    runTransition(() => {
      mapRoot.updateMatrixWorld(true);
      const position = target ? target.getWorldPosition(new THREE.Vector3()) : mapRoot.localToWorld(new THREE.Vector3(...object.position));
      if (position.distanceToSquared(viewerPosition) < .000001) return;
      const orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(viewerPosition, position, Y_AXIS));
      look.setFromQuaternion(orientation, 'YXZ');
      yaw = targetYaw = look.y;
      pitch = targetPitch = THREE.MathUtils.clamp(look.x, -Math.PI / 2 + .01, Math.PI / 2 - .01);
      applyCamera(); onMapAction({ type: 'focus', object });
    });
    return true;
  }
  function captureNavigationState() {
    if (!active) return null;
    const world = transform();
    return { viewerPosition: viewerPosition.toArray(), yaw, pitch, layout, baseScale, inspecting,
      focusAnchor: focusAnchor?.toArray() || null, directTravel, fov: camera.fov, zoom: camera.zoom,
      mapPosition: world.position.toArray(), mapQuaternion: world.quaternion.toArray(), mapScale: world.scale };
  }
  function restoreNavigationState(saved) {
    const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
    if (!active || !saved || !vector(saved.viewerPosition, 3) || !vector(saved.mapPosition, 3) || !vector(saved.mapQuaternion, 4)
      || ![saved.yaw, saved.pitch, saved.baseScale, saved.mapScale, saved.fov, saved.zoom].every(Number.isFinite)
      || saved.mapScale <= 0 || saved.baseScale <= 0 || saved.zoom <= 0 || saved.fov <= 0 || saved.fov >= 180
      || (saved.focusAnchor !== null && !vector(saved.focusAnchor, 3))) return Promise.resolve(false);
    return runTransition(() => {
      viewerPosition.fromArray(saved.viewerPosition); yaw = targetYaw = saved.yaw; pitch = targetPitch = saved.pitch;
      layout = saved.layout === 'tabletop' ? 'tabletop' : 'room'; baseScale = saved.baseScale;
      inspecting = Boolean(saved.inspecting); focusAnchor = saved.focusAnchor ? new THREE.Vector3(...saved.focusAnchor) : null;
      directTravel = Boolean(saved.directTravel); clearInput();
      applyPlacement({ position: new THREE.Vector3(...saved.mapPosition), quaternion: new THREE.Quaternion(...saved.mapQuaternion).normalize(), scale: saved.mapScale });
      camera.fov = saved.fov; camera.zoom = saved.zoom; camera.updateProjectionMatrix();
      applyCamera(); viewChanged = true; notify();
    });
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
    if (transitionState) return;
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
    if (hit) { const object=hit.dataObject || hit.object.userData.object; if(directTravel && onTravel)runTransition(() => onTravel(object));else onSelect(object); }
  }

  listen(canvas, 'pointerdown', event => {
    if (!active || transitionState || event.button !== 0 || blocked(event)) return;
    consume(event);
    if (pointer) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, distance: 0, time: performance.now() };
    if (!locked()) { canvas.setPointerCapture?.(event.pointerId); canvas.style.cursor = 'grabbing'; }
  }, true);
  listen(canvas, 'pointermove', event => {
    if (!active || transitionState || blocked(event) || (!locked() && pointer?.id !== event.pointerId)) return;
    consume(event);
    const dx = locked() ? event.movementX || 0 : event.clientX - pointer.x;
    const dy = locked() ? event.movementY || 0 : event.clientY - pointer.y;
    targetYaw = THREE.MathUtils.clamp(targetYaw - THREE.MathUtils.clamp(dx, -160, 160) * .0025, yaw - Math.PI / 2, yaw + Math.PI / 2);
    targetPitch = THREE.MathUtils.clamp(targetPitch - THREE.MathUtils.clamp(dy, -160, 160) * .0025, -Math.PI / 2 + .01, Math.PI / 2 - .01);
    if (pointer) { pointer.x = event.clientX; pointer.y = event.clientY; pointer.distance += Math.hypot(dx, dy); }
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
  listen(canvas, 'wheel', event => {
    if(!active||blocked(event)||!directTravel)return;consume(event);
    const pageHeight=canvas.clientHeight||canvas.getBoundingClientRect?.().height||win.innerHeight||1;
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?pageHeight:1);
    scaleMap(Math.exp(THREE.MathUtils.clamp(-pixels*.0035,-1.2,1.2)));
  }, {capture:true,passive:false});
  // Capturing keys prevents the atlas keyboard shortcuts from also zooming or panning.
  listen(doc, 'keydown', event => {
    if (!active || transitionState || blocked(event) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (MOVEMENT_KEYS.has(event.code)) { consume(event); keys.add(event.code); }
    else if (directTravel && (event.code === 'KeyB' || event.code === 'Backspace')) { consume(event); if(!event.repeat)navigateBack(); }
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
    enter, exit, update, recenter, setLayout, onViewChanged, scaleMap, rotateMap, lookAtObject, focusObject, navigateBack, lockPointer,
    runTransition, captureNavigationState, restoreNavigationState,
    get transitionOpacity() { return transitionOpacity; },
    get isTransitioning() { return Boolean(transitionState); },
    get isInspecting() {return inspecting;},
    get directTravel() {return directTravel;},
    get isActive() { return active; },
    get isPointerLocked() { return locked(); },
    get layout() { return layout; },
    get isPlanetarium() { return planetarium(); },
    dispose() { if (disposed) return; exit(); disposed = true; listeners.splice(0).forEach(remove => remove()); },
  };
}
