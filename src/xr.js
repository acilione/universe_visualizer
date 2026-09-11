import * as THREE from 'three';
import { singleGripTransform, dualGripTransform, isSelectionGesture } from './xr-math.js';

const WIDTH = 1160;
const HEIGHT = 420;
const BUTTONS = [
  { label: '← SCALA', action: 'previous', x: 28, y: 220, w: 174, h: 74 },
  { label: 'SCALA →', action: 'next', x: 214, y: 220, w: 174, h: 74 },
  { label: 'AVVICINA', action: 'focus', x: 400, y: 220, w: 174, h: 74 },
  { label: 'RICENTRA', action: 'reset', x: 586, y: 220, w: 174, h: 74 },
  { label: 'LIBERA', action: 'immersive', x: 772, y: 220, w: 174, h: 74 },
  { label: 'ESCI VR', action: 'exit', x: 958, y: 220, w: 174, h: 74 },
];
const SCALE_NAMES = ['Sistema Solare', 'Stelle vicine', 'Via Lattea', 'Gruppo Locale', 'Universo osservabile'];

/**
 * WebXR interaction layer. Call update() inside renderer.setAnimationLoop().
 * onScale receives -1/+1; mapRoot transforms must be left to this module in VR.
 * XRInputSource.targetRaySpace works for both hands and handheld controllers.
 */
export function createXR({ renderer, scene, camera, controls, mapRoot, getTargets, onSelect, onFocus, onScale, getScale, getPresentationMode = () => 'atlas', onSessionEnd, onImmersiveChange, onMessage = () => {} }) {
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  const raycaster = new THREE.Raycaster();
  raycaster.near = 0.01;
  raycaster.far = 20;
  const rotationMatrix = new THREE.Matrix4();
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = WIDTH;
  panelCanvas.height = HEIGHT;
  const context = panelCanvas.getContext('2d');
  const texture = new THREE.CanvasTexture(panelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.45 * HEIGHT / WIDTH),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }),
  );
  panel.name = 'XR navigation panel';
  panel.renderOrder = 100;
  panel.visible = false;
  const restoreOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xa5efe7, transparent: true, opacity: 0.7, depthTest: false, toneMapped: false }),
  );
  restoreOrb.name = 'XR restore controls';
  restoreOrb.renderOrder = 101;
  restoreOrb.visible = false;
  scene.add(panel, restoreOrb);
  const jointGeometry = new THREE.SphereGeometry(1, 8, 6);
  const jointMaterials = [0xa5efe7, 0xf0cf91].map(color => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  let info = { name: 'Afferra l’universo', distance: 'Punta e pizzica brevemente per selezionare.' };
  let active = false;
  let disposed = false;
  let entering = false;
  let immersive = false;
  let focusState = null;
  let snapshot = null;
  let recenterPending = false;
  let gesture = null;
  let baseScale = 0.04;
  let hoverButton = -1;
  let panelDirty = true;
  let lastScale = null;
  let lastPresentationMode = presentationMode();
  function presentationMode() { return getPresentationMode() === 'planetarium' ? 'planetarium' : 'atlas'; }
  function isPlanetarium() { return presentationMode() === 'planetarium'; }
  const inputs = [];
  const listeners = [];
  const ownedGeometries = new Set([panel.geometry, restoreOrb.geometry, jointGeometry, lineGeometry]);
  const ownedMaterials = new Set([panel.material, restoreOrb.material, ...jointMaterials]);
  function listen(target, type, callback) {
    target.addEventListener(type, callback);
    listeners.push(() => target.removeEventListener(type, callback));
  }

  function paintPanel() {
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = 'rgba(6, 17, 22, .95)';
    context.beginPath();
    context.roundRect(1, 1, WIDTH - 2, HEIGHT - 2, 24);
    context.fill();
    context.strokeStyle = '#796849';
    context.lineWidth = 2;
    context.stroke();
    context.textBaseline = 'middle';
    context.font = '500 24px sans-serif';
    context.fillStyle = '#ccb180';
    const value = getScale?.();
    const constellationView = value === 6 || value === 7;
    const scaleName = info.scaleLabel || (typeof value === 'number' ? SCALE_NAMES[value] : value?.name || value) || 'Atlante cosmico';
    context.fillText(`ÆTHER  /  ${String(scaleName).toUpperCase()}`, 30, 39, 1090);
    context.fillStyle = '#f1e6ce';
    context.font = '500 46px sans-serif';
    context.fillText(String(info.name || 'Afferra l’universo'), 30, 103, 1090);
    context.fillStyle = '#aabdbc';
    context.font = '26px sans-serif';
    context.fillText(String(info.distance || ''), 30, 160, 1090);
    for (let i = 0; i < BUTTONS.length; i++) {
      const b = BUTTONS[i];
      context.fillStyle = hoverButton === i ? '#d6b882' : '#142930';
      context.beginPath();
      context.roundRect(b.x, b.y, b.w, b.h, 9);
      context.fill();
      context.strokeStyle = '#57635a';
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = hoverButton === i ? '#142026' : '#eadbbd';
      context.font = '600 23px sans-serif';
      context.textAlign = 'center';
      const label = constellationView
        ? ({ previous: '← FIGURA', next: 'FIGURA →', focus: value === 6 ? 'DALLA TERRA' : 'SPAZIO 3D' }[b.action] || b.label)
        : b.label;
      context.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
      context.textAlign = 'left';
    }
    context.fillStyle = '#afbfbd';
    context.font = '21px sans-serif';
    context.fillText(isPlanetarium()
      ? 'MANI  ·  Guarda il cielo intorno a te   /   Punta e pizzica per selezionare'
      : 'MANI  ·  Pizzico breve: seleziona   /   Tieni: sposta e ruota   /   Due mani: zoom', 30, 333, 1090);
    context.fillStyle = '#788f92';
    context.fillText(constellationView
      ? 'Cambia figura o prospettiva dal pannello.'
      : isPlanetarium()
      ? 'CONTROLLER  ·  Grilletto: seleziona   /   Ricentra: riposiziona l’orizzonte'
      : 'CONTROLLER  ·  Grilletto: seleziona   /   Impugnatura: afferra', 30, 375, 1090);
    texture.needsUpdate = true;
    panelDirty = false;
  }

  function inputPose(input) {
    if (input.source?.hand) {
      const thumb = input.hand.joints['thumb-tip'];
      const index = input.hand.joints['index-finger-tip'];
      const wrist = input.hand.joints.wrist;
      if (!input.hand.visible || !thumb?.visible || !index?.visible || !wrist?.visible) return null;
      const position = thumb.getWorldPosition(new THREE.Vector3()).add(index.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
      return { position, quaternion: wrist.getWorldQuaternion(new THREE.Quaternion()) };
    }
    const space = input.grip.visible ? input.grip : input.controller;
    if (!space.visible || !input.source) return null;
    return { position: space.getWorldPosition(new THREE.Vector3()), quaternion: space.getWorldQuaternion(new THREE.Quaternion()) };
  }

  function visibleObject(object) {
    for (let current = object; current; current = current.parent) if (!current.visible) return false;
    return true;
  }

  function pick(input) {
    if (!input.controller.visible) return null;
    input.controller.updateWorldMatrix(true, false);
    rotationMatrix.extractRotation(input.controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(input.controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotationMatrix).normalize();
    const orbHit = restoreOrb.visible ? raycaster.intersectObject(restoreOrb, false)[0] : null;
    if (orbHit) return { ...orbHit, action: 'restore', button: -2, panel: true };
    const panelHit = panel.visible ? raycaster.intersectObject(panel, false)[0] : null;
    if (panelHit?.uv) {
      const px = panelHit.uv.x * WIDTH;
      const py = (1 - panelHit.uv.y) * HEIGHT;
      const button = BUTTONS.findIndex(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
      return { ...panelHit, button, panel: true };
    }
    // The terrestrial sky is a 60 m dome, not a miniature held at arm's length.
    raycaster.far = isPlanetarium() ? 120 : 20;
    const targets = (getTargets?.() || []).filter(visibleObject);
    const hits = raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;
    return { ...hits[0], item: hits[0].object.userData.object };
  }

  function activate(hit) {
    if (!hit) return;
    if (hit.panel) {
      const action = hit.action || BUTTONS[hit.button]?.action;
      if (action === 'previous' || action === 'next') {
        onScale?.(action === 'previous' ? -1 : 1);
        recenter();
        panelDirty = true;
      } else if (action === 'focus' && (info.id || getScale?.() === 6 || getScale?.() === 7)) {
        if (onFocus) onFocus(info);
        else focusObject(info);
      } else if (action === 'reset') {
        recenter();
      } else if (action === 'immersive' || action === 'restore') {
        setImmersive(action === 'immersive');
      } else if (action === 'exit') {
        renderer.xr.getSession()?.end().catch(() => onMessage('Usa il menu del visore per uscire dalla VR.'));
      }
    } else if (hit.item) {
      setInfo(hit.item);
      onSelect?.(hit.item);
    }
  }

  function startInput(input, kind) {
    if (!active || input.press) return;
    const pose = inputPose(input);
    if (!pose) return;
    input.press = { kind, time: performance.now(), pose, hit: pick(input), manipulated: kind === 'squeeze', maxDistance: 0, maxAngle: 0 };
    gesture = null;
    if (!input.press.hit?.panel) focusState = null;
  }

  function endInput(input) {
    const press = input.press;
    if (!press) return;
    const pose = inputPose(input);
    const duration = performance.now() - press.time;
    const distance = Math.max(press.maxDistance, pose ? pose.position.distanceTo(press.pose.position) : Infinity);
    const rotated = Math.max(press.maxAngle, pose ? pose.quaternion.angleTo(press.pose.quaternion) : Infinity);
    const releaseHit = pick(input);
    if (isSelectionGesture({ duration, distance, rotated, manipulated: press.manipulated })) {
      const sameButton = press.hit?.panel && releaseHit?.panel && press.hit.button === releaseHit.button;
      const sameObject = !press.hit?.panel && press.hit?.item && releaseHit?.item?.id === press.hit.item.id;
      if (sameButton || sameObject) activate(press.hit);
    }
    input.press = null;
    gesture = null;
  }

  function cancelInput(input) {
    input.press = null;
    input.pinching = false;
    gesture = null;
  }

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    const grip = renderer.xr.getControllerGrip(i);
    const hand = renderer.xr.getHand(i);
    const ray = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: jointMaterials[i].color, transparent: true, opacity: 0.5, toneMapped: false }));
    ray.scale.z = 3;
    controller.add(ray);
    const cursor = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), jointMaterials[i]);
    cursor.visible = false;
    scene.add(controller, grip, hand, cursor);
    // A small procedural grip stays available when controller models are absent.
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.065, 4, 8), new THREE.MeshBasicMaterial({ color: 0x24414a, wireframe: true }));
    handle.rotation.x = Math.PI / 3;
    grip.add(handle);
    ownedGeometries.add(cursor.geometry);
    ownedGeometries.add(handle.geometry);
    ownedMaterials.add(ray.material);
    ownedMaterials.add(handle.material);
    const input = { controller, grip, hand, ray, cursor, handle, source: null, press: null, pinching: false, joints: new Map() };
    inputs.push(input);
    listen(controller, 'connected', event => {
      input.source = event.data;
      handle.visible = !event.data.hand;
    });
    listen(controller, 'disconnected', () => {
      cancelInput(input);
      input.source = null;
      cursor.visible = false;
    });
    listen(controller, 'selectstart', () => { if (!input.source?.hand) startInput(input, 'trigger'); });
    listen(controller, 'selectend', () => { if (!input.source?.hand && input.press?.kind === 'trigger') endInput(input); });
    listen(controller, 'squeezestart', () => { if (!input.source?.hand) startInput(input, 'squeeze'); });
    listen(controller, 'squeezeend', () => { if (!input.source?.hand && input.press?.kind === 'squeeze') endInput(input); });
  }

  function rootTransform() {
    return { position: mapRoot.position.clone(), quaternion: mapRoot.quaternion.clone(), scale: mapRoot.scale.x };
  }

  function applyTransform(value) {
    if (!value) return;
    mapRoot.position.copy(value.position);
    mapRoot.quaternion.copy(value.quaternion);
    mapRoot.scale.setScalar(value.scale);
    mapRoot.updateMatrixWorld(true);
  }

  function placeOverview() {
    gesture = null;
    focusState = null;
    const viewer = renderer.xr.getCamera();
    const eye = viewer.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(viewer.getWorldQuaternion(new THREE.Quaternion()));
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    mapRoot.position.set(0, 0, 0);
    mapRoot.quaternion.identity();
    mapRoot.scale.setScalar(1);
    mapRoot.updateMatrixWorld(true);
    if (isPlanetarium()) {
      baseScale = 1;
      mapRoot.position.copy(eye);
      if (mapRoot.parent) mapRoot.parent.worldToLocal(mapRoot.position);
      mapRoot.updateMatrixWorld(true);
      positionPanel();
      recenterPending = false;
      return;
    }
    const bounds = new THREE.Box3().setFromObject(mapRoot);
    const size = bounds.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z, 1);
    baseScale = Number.isFinite(extent) ? 2.1 / extent : 0.04;
    mapRoot.scale.setScalar(baseScale);
    mapRoot.rotation.x = 0.3;
    mapRoot.position.copy(eye).addScaledVector(forward, 1.65);
    mapRoot.position.y -= 0.22;
    mapRoot.updateMatrixWorld(true);
    positionPanel();
    recenterPending = false;
  }

  function positionPanel() {
    const viewer = renderer.xr.getCamera();
    const eye = viewer.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(viewer.getWorldQuaternion(new THREE.Quaternion()));
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    panel.position.copy(eye).addScaledVector(forward.normalize(), 1.25);
    panel.position.y -= 0.76;
    panel.lookAt(eye);
    panel.updateMatrixWorld(true);
  }

  function positionRestoreOrb() {
    const viewer = renderer.xr.getCamera();
    restoreOrb.position.set(0.36, -0.31, -0.72)
      .applyQuaternion(viewer.getWorldQuaternion(new THREE.Quaternion()))
      .add(viewer.getWorldPosition(new THREE.Vector3()));
    restoreOrb.updateMatrixWorld(true);
  }

  /** Hide all panel writing; the peripheral, textless sphere restores controls. */
  function setImmersive(value) {
    const changed = immersive !== Boolean(value);
    immersive = Boolean(value);
    panel.visible = active && !immersive;
    restoreOrb.visible = active && immersive;
    if (active) {
      if (immersive) positionRestoreOrb();
      else positionPanel();
    }
    hoverButton = -1;
    panelDirty = true;
    if (changed) onImmersiveChange?.(immersive);
  }

  /** Request an overview reset on the next tracked frame. */
  function recenter() {
    if (!active) return false;
    focusState = null;
    recenterPending = true;
    for (const input of inputs) cancelInput(input);
    return true;
  }

  function objectAnchor(object, extent) {
    mapRoot.updateWorldMatrix(true, true);
    const target = (getTargets?.() || []).find(candidate => candidate.userData.object?.id === object?.id);
    const rootInverse = mapRoot.matrixWorld.clone().invert();
    const rootScale = mapRoot.getWorldScale(new THREE.Vector3());
    const relativeScale = target ? target.getWorldScale(new THREE.Vector3()).divide(rootScale) : new THREE.Vector3(1, 1, 1);
    const inheritedScale = Math.max(Math.abs(relativeScale.x), Math.abs(relativeScale.y), Math.abs(relativeScale.z));
    // Numeric extents are marker-local radii, including rings when supplied by
    // the engine. This compensates for animated scaling of the content group.
    let radius = (typeof extent === 'number' ? extent : object?.size || 0.5) * inheritedScale;
    let center = target
      ? target.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse)
      : new THREE.Vector3().fromArray(object?.position || [0, 0, 0]);
    // Explicit object extents are already in mapRoot local coordinates.
    if (extent && typeof extent === 'object') {
      radius = extent.radius ?? radius;
      if (extent.center) center = extent.center.isVector3 ? extent.center.clone() : new THREE.Vector3().fromArray(extent.center);
    }
    if (!Number.isFinite(radius) || radius <= 0 || !center.toArray().every(Number.isFinite)) return null;
    return { center, radius };
  }

  /** Bring a body to the viewer by transforming the map, never the XR camera. */
  function focusObject(object, extent) {
    if (!active || !object || isPlanetarium()) return false;
    if (recenterPending) placeOverview();
    const anchor = objectAnchor(object, extent);
    if (!anchor) return false;
    const viewer = renderer.xr.getCamera();
    const viewerPosition = viewer.getWorldPosition(new THREE.Vector3());
    const destination = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(viewer.getWorldQuaternion(new THREE.Quaternion())).add(viewerPosition);
    const fromCenter = mapRoot.localToWorld(anchor.center.clone());
    const radius = THREE.MathUtils.clamp(extent?.displayRadius ?? 0.28, 0.2, 0.35);
    for (const input of inputs) cancelInput(input);
    focusState = {
      object, extent, radius, destination, fromCenter, fromScale: mapRoot.scale.x,
      quaternion: mapRoot.quaternion.clone(), elapsed: 0, duration: 0.85,
    };
    return true;
  }

  function updateFocus(delta) {
    if (!focusState) return;
    const state = focusState;
    const anchor = objectAnchor(state.object, state.extent);
    if (!anchor) { focusState = null; return; }
    const parentScale = mapRoot.parent?.getWorldScale(new THREE.Vector3()) || new THREE.Vector3(1, 1, 1);
    const scaleFactor = Math.max(Math.abs(parentScale.x), Math.abs(parentScale.y), Math.abs(parentScale.z));
    const nextScale = state.radius / (anchor.radius * scaleFactor);
    if (!Number.isFinite(nextScale) || nextScale < 1e-8 || nextScale > 1000) { focusState = null; return; }
    state.elapsed += Math.max(0, Math.min(Number.isFinite(delta) ? delta : 1 / 60, 0.1));
    const progress = Math.min(1, state.elapsed / state.duration);
    const eased = progress * progress * (3 - 2 * progress);
    const scale = Math.exp(THREE.MathUtils.lerp(Math.log(state.fromScale), Math.log(nextScale), eased));
    const center = state.fromCenter.clone().lerp(state.destination, eased);
    if (mapRoot.parent) mapRoot.parent.worldToLocal(center);
    const position = center.sub(anchor.center.clone().multiplyScalar(scale).applyQuaternion(state.quaternion));
    applyTransform({ position, quaternion: state.quaternion, scale });
    // Grabs start from the current inspection scale, without snapping back to
    // the overview's much smaller limits when the second hand joins.
    baseScale = scale;
  }

  function restoreDesktop() {
    const currentMode = presentationMode();
    const previousPresentationMode = snapshot?.presentationMode ?? currentMode;
    const viewChanged = snapshot ? snapshot.scale !== getScale?.() : false;
    active = false;
    entering = false;
    panel.visible = false;
    restoreOrb.visible = false;
    focusState = null;
    for (const input of inputs) {
      cancelInput(input);
      input.cursor.visible = false;
      input.controller.visible = false;
      input.grip.visible = false;
      input.hand.visible = false;
    }
    if (snapshot) {
      camera.position.copy(snapshot.cameraPosition);
      camera.quaternion.copy(snapshot.cameraQuaternion);
      camera.near = snapshot.near;
      camera.far = snapshot.far;
      camera.fov = snapshot.fov;
      camera.aspect = snapshot.aspect;
      camera.zoom = snapshot.zoom;
      camera.updateProjectionMatrix();
      mapRoot.position.copy(snapshot.rootPosition);
      mapRoot.quaternion.copy(snapshot.rootQuaternion);
      mapRoot.scale.copy(snapshot.rootScale);
      mapRoot.updateMatrixWorld(true);
      if (controls) {
        // A view can change inside VR; restore controls for the current view.
        controls.enabled = currentMode !== 'planetarium';
        controls.target.copy(snapshot.target);
      }
      snapshot = null;
    }
    onSessionEnd?.({ presentationMode: currentMode, previousPresentationMode, viewChanged, modeChanged: currentMode !== previousPresentationMode });
    onMessage('Sessione VR terminata. Sei tornato all’atlante.');
  }

  async function enter() {
    if (disposed) return false;
    if (active) {
      await renderer.xr.getSession()?.end();
      return false;
    }
    if (entering) return false;
    if (!window.isSecureContext) {
      onMessage('Per entrare in VR apri l’atlante tramite HTTPS o localhost sul browser del visore.');
      return false;
    }
    if (!navigator.xr) {
      onMessage('WebXR non è disponibile in questo browser. Apri l’atlante nel browser di un visore compatibile.');
      return false;
    }
    entering = true;
    let session;
    try {
      // Request immediately from the button gesture: an awaited support probe can
      // consume transient activation on some browsers and prevent entry.
      session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['hand-tracking', 'local-floor'] });
      if (disposed) {
        entering = false;
        await session.end();
        return false;
      }
      snapshot = {
        cameraPosition: camera.position.clone(), cameraQuaternion: camera.quaternion.clone(),
        near: camera.near, far: camera.far, fov: camera.fov, aspect: camera.aspect, zoom: camera.zoom,
        rootPosition: mapRoot.position.clone(), rootQuaternion: mapRoot.quaternion.clone(), rootScale: mapRoot.scale.clone(),
        target: controls?.target.clone(), presentationMode: presentationMode(), scale: getScale?.(),
      };
      if (controls) controls.enabled = false;
      camera.position.set(0, 0, 0);
      camera.quaternion.identity();
      camera.near = 0.01;
      camera.far = 1000;
      camera.updateProjectionMatrix();
      session.addEventListener('end', restoreDesktop, { once: true });
      session.addEventListener('visibilitychange', () => {
        if (session.visibilityState !== 'visible') for (const input of inputs) cancelInput(input);
      });
      await renderer.xr.setSession(session);
      active = true;
      lastPresentationMode = presentationMode();
      entering = false;
      panel.visible = !immersive;
      restoreOrb.visible = immersive;
      recenterPending = true;
      panelDirty = true;
      onMessage(isPlanetarium()
        ? 'VR attiva. Osserva il cielo intorno a te; punta e pizzica per selezionare una stella.'
        : 'VR attiva. Pizzica e tieni per afferrare; usa due mani per ingrandire.');
      return true;
    } catch (error) {
      if (session) {
        try { await session.end(); } catch { /* Session may have ended during setup. */ }
        if (snapshot) restoreDesktop();
      }
      entering = false;
      const message = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
        ? 'Accesso VR non consentito. Puoi riprovare dal pulsante VR e consentire l’accesso al visore.'
        : error?.name === 'NotSupportedError'
          ? 'Nessun visore WebXR disponibile. Collega un visore o apri la pagina nel suo browser.'
          : 'Impossibile avviare la VR. Verifica che il visore sia collegato e riprova.';
      onMessage(message);
      return false;
    }
  }

  function update(delta = 1 / 60) {
    if (!active || !renderer.xr.isPresenting) return;
    const currentMode = presentationMode();
    if (currentMode !== lastPresentationMode) {
      lastPresentationMode = currentMode;
      recenter();
      panelDirty = true;
    }
    if (recenterPending) placeOverview();
    updateFocus(delta);
    if (immersive) positionRestoreOrb();
    const time = performance.now();
    let nextHover = -1;
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      if (input.source?.hand) {
        for (const [name, joint] of Object.entries(input.hand.joints)) {
          let visual = input.joints.get(name);
          if (!visual) {
            visual = new THREE.Mesh(jointGeometry, jointMaterials[i]);
            joint.add(visual);
            input.joints.set(name, visual);
          }
          visual.scale.setScalar(Math.max(0.003, Math.min(0.012, joint.jointRadius || 0.007)));
        }
        const pose = inputPose(input);
        if (!pose) {
          cancelInput(input);
        } else {
          const thumb = input.hand.joints['thumb-tip'];
          const index = input.hand.joints['index-finger-tip'];
          const gap = thumb.position.distanceTo(index.position);
          const pinching = input.pinching ? gap < 0.03 : gap < 0.018;
          if (pinching && !input.pinching) startInput(input, 'pinch');
          else if (!pinching && input.pinching) endInput(input);
          input.pinching = pinching;
        }
      } else if (input.press && !inputPose(input)) {
        cancelInput(input);
      }
      const hit = pick(input);
      input.cursor.visible = !!hit && !!input.source;
      if (hit) {
        input.cursor.position.copy(hit.point);
        input.cursor.scale.setScalar(isPlanetarium() && !hit.panel ? Math.max(1, hit.distance / 2) : 1);
        input.ray.scale.z = hit.distance;
        if (hit.panel && hit.button >= 0) nextHover = hit.button;
      } else {
        input.ray.scale.z = 3;
      }
      input.ray.material.opacity = input.press ? 0.9 : 0.4;
      if (input.press) {
        const pose = inputPose(input);
        if (pose) {
          input.press.maxDistance = Math.max(input.press.maxDistance, pose.position.distanceTo(input.press.pose.position));
          input.press.maxAngle = Math.max(input.press.maxAngle, pose.quaternion.angleTo(input.press.pose.quaternion));
        }
      }
    }
    // Keep the terrestrial horizon fixed: pinch/trigger still select, while
    // a held hand or controller grip cannot rotate, drag or resize the sky.
    const grabbing = isPlanetarium() ? [] : inputs.filter(input => input.press && !input.press.hit?.panel && inputPose(input));
    if (grabbing.length === 2) {
      const poses = grabbing.map(inputPose);
      for (const input of grabbing) input.press.manipulated = true;
      if (gesture?.mode !== 'dual' || gesture.first.distanceTo(gesture.second) < 0.03) {
        gesture = { mode: 'dual', root: rootTransform(), first: poses[0].position, second: poses[1].position };
      }
      applyTransform(dualGripTransform(gesture.root, gesture.first, gesture.second, poses[0].position, poses[1].position, baseScale * 0.3, baseScale * 4));
    } else if (grabbing.length === 1) {
      const input = grabbing[0];
      const press = input.press;
      const pose = inputPose(input);
      const shouldGrab = press.manipulated || time - press.time > 350 || press.maxDistance >= 0.025 || press.maxAngle >= 0.12;
      if (shouldGrab) {
        press.manipulated = true;
        if (gesture?.mode !== 'single' || gesture.input !== input) {
          gesture = { mode: 'single', input, root: rootTransform(), pose };
        }
        applyTransform(singleGripTransform(gesture.root, gesture.pose, pose));
      }
    } else {
      gesture = null;
    }
    if (nextHover !== hoverButton) { hoverButton = nextHover; panelDirty = true; }
    const value = getScale?.();
    if (lastScale !== value) { lastScale = value; panelDirty = true; }
    if (panelDirty) paintPanel();
  }

  async function dispose() {
    if (disposed) return;
    if (active) await renderer.xr.getSession()?.end();
    disposed = true;
    for (const removeListener of listeners) removeListener();
    panel.removeFromParent();
    restoreOrb.removeFromParent();
    for (const input of inputs) {
      input.ray.removeFromParent();
      input.cursor.removeFromParent();
      // Only this module creates children on these grip groups.
      input.handle.removeFromParent();
      for (const visual of input.joints.values()) visual.removeFromParent();
      scene.remove(input.controller, input.grip, input.hand);
    }
    for (const geometry of ownedGeometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
    texture.dispose();
  }

  function setInfo(value = {}) {
    info = typeof value === 'string' ? { name: value, distance: '' } : { ...value };
    panelDirty = true;
  }

  paintPanel();
  return { enter, update, setInfo, focusObject, recenter, setImmersive, dispose, get isPresenting() { return active; }, get isImmersive() { return immersive; } };
}
