import * as THREE from 'three';
import { getLanguage, t } from './i18n.js';
import { hudObjectInfo } from './spatial-hud-info.js';

const WIDTH = 640, HEIGHT = 384, DEPTH = 2.2;
const visible = object => {
  if (!object?.parent) return false;
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
};
const record = hit => hit?.dataObject || hit?.item || hit?.object?.userData.object;

/** A single camera-facing instrument, outside the transformed astronomical map.
 * Catalogue work stays in its existing workers. Picking is indexed and throttled;
 * this bounded canvas is painted only on acquisition/language changes, never in
 * the animation loop. No input interception, DOM overlay or per-star labels. */
export function createSpatialHud({ scene, canvas, getCamera, getTargets, resolveObject = object => object,
  getMode = () => ({}), getHover = () => null, isBlocked = () => false }) {
  const doc = canvas.ownerDocument || document, win = doc.defaultView || window;
  const group = new THREE.Group(); group.name = 'Spatial object HUD'; group.visible = false; scene.add(group);
  const surface = doc.createElement('canvas'); surface.width = WIDTH; surface.height = HEIGHT;
  const context = surface.getContext('2d');
  const texture = new THREE.CanvasTexture(surface); texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, HEIGHT / WIDTH), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  panel.name = 'Object telemetry'; panel.renderOrder = 202; panel.frustumCulled = false; panel.raycast = () => {}; group.add(panel);
  const linePositions = new Float32Array(38 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({
    color: 0x8be2d0, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  lines.name = 'Telemetry reticle and frame'; lines.renderOrder = 203; lines.frustumCulled = false; lines.raycast = () => {}; group.add(lines);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const origin = new THREE.Vector3(), direction = new THREE.Vector3(), projected = new THREE.Vector3();
  const anchor = new THREE.Vector3(), localAnchor = new THREE.Vector3(), inverse = new THREE.Quaternion();
  const hits = [], targets = [], pressed = new Set(), listeners = [];
  const diagnostics = { picks: 0, paints: 0, lastPickMs: 0, maxPickMs: 0 };
  let enabled = true, disposed = false, pointerInside = false, pointerUsed = false, touch = false;
  let object = null, info = null, currentHit = null, candidate = null, candidateAge = 0, lossAge = 0, acquired = false;
  let time = 0, nextPick = 0, opacity = 0, language = getLanguage(), lastMode = '', canShow = false;

  function listen(target, type, fn) { target.addEventListener(type, fn, { passive: true }); listeners.push(() => target.removeEventListener(type, fn)); }
  function trackPointer(event) {
    touch = event.pointerType === 'touch'; pointerUsed = true; pointerInside = true;
    const rect = canvas.getBoundingClientRect();
    if (rect.width && rect.height) pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
  }
  listen(canvas, 'pointermove', trackPointer);
  listen(canvas, 'pointerdown', event => { trackPointer(event); pressed.add(event.pointerId); reset(); });
  listen(canvas, 'pointerleave', () => { pointerInside = false; });
  listen(win, 'pointerup', event => { pressed.delete(event.pointerId); nextPick = 0; });
  listen(win, 'pointercancel', event => { pressed.delete(event.pointerId); pointerInside = false; reset(); });
  listen(win, 'blur', () => { pressed.clear(); pointerInside = false; reset(); });
  listen(doc, 'visibilitychange', () => { if (doc.hidden) { pressed.clear(); reset(); } });

  function reset() {
    object = info = currentHit = candidate = null; acquired = false; candidateAge = lossAge = opacity = 0;
    nextPick = 0; canShow = false; group.visible = false; panel.visible = false;
  }
  function fitted(text, maxWidth) {
    let value = String(text ?? '');
    if (context.measureText(value).width <= maxWidth) return value;
    while (value.length > 1 && context.measureText(value + '…').width > maxWidth) value = value.slice(0, -1);
    return value + '…';
  }
  function paint() {
    if (!info) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.beginPath(); context.moveTo(18, 0); context.lineTo(WIDTH - 40, 0); context.lineTo(WIDTH, 40);
    context.lineTo(WIDTH, HEIGHT - 18); context.lineTo(WIDTH - 18, HEIGHT); context.lineTo(0, HEIGHT); context.lineTo(0, 18); context.closePath();
    context.fillStyle = 'rgba(5, 17, 23, .9)'; context.fill(); context.strokeStyle = 'rgba(119, 222, 203, .45)'; context.lineWidth = 2; context.stroke();
    const text = (value, x, y, font, color, max = WIDTH - x - 30) => {
      context.font = font; context.fillStyle = color; context.textAlign = 'left'; context.fillText(fitted(value, max), x, y);
    };
    text(t('OBJECT TELEMETRY', 'DATI OGGETTO'), 30, 36, '18px monospace', '#8fbaaF');
    text(info.name, 28, 85, '500 36px sans-serif', '#edf9f5');
    text(info.kind, 30, 119, '23px sans-serif', '#91ddcc');
    context.fillStyle = 'rgba(137, 220, 202, .22)'; context.fillRect(30, 138, WIDTH - 60, 1);
    info.rows.slice(0, 4).forEach((row, index) => {
      text(row.label, 30, 176 + index * 35, '21px sans-serif', '#a0b6bd', 255);
      text(row.value, 292, 176 + index * 35, '22px monospace', '#eff8f5', WIDTH - 322);
    });
    context.fillStyle = 'rgba(137, 220, 202, .22)'; context.fillRect(30, 316, WIDTH - 60, 1);
    text(info.source || t('Catalogue data', 'Dati di catalogo'), 30, 353, '18px sans-serif', '#8aacae');
    texture.needsUpdate = true; diagnostics.paints++;
  }
  function acquire(hit) {
    const raw = record(hit);
    object = resolveObject(raw) || raw; info = hudObjectInfo(object); currentHit = hit; acquired = true;
    language = getLanguage(); paint();
  }
  function sample(camera, mode) {
    const external = mode.xr ? getHover() : null;
    if (external && visible(external.object)) return external;
    // Background particle fields without a catalogue identity are deliberately
    // excluded: Three's generic Points.raycast would scan every decorative point.
    targets.length = 0;
    for (const target of getTargets()) if (visible(target) && (!target.isPoints || target.userData.indexedCatalogue)) targets.push(target);
    if (!targets.length) return null;
    camera.updateWorldMatrix(true, false);
    if (mode.spatial || touch || !pointerUsed || doc.pointerLockElement === canvas) {
      camera.getWorldPosition(origin); camera.getWorldDirection(direction);
      raycaster.set(origin, direction);
    } else {
      if (!pointerInside) return null;
      raycaster.setFromCamera(pointer, camera);
    }
    raycaster.near = Math.max(.001, camera.near || .001); raycaster.far = camera.far || 1500;
    hits.length = 0;
    const start = performance.now(); raycaster.intersectObjects(targets, false, hits);
    diagnostics.lastPickMs = performance.now() - start;
    diagnostics.maxPickMs = Math.max(diagnostics.maxPickMs, diagnostics.lastPickMs); diagnostics.picks++;
    return hits.find(hit => record(hit)?.id) || null;
  }
  function layout(camera, mode, reducedMotion) {
    camera.getWorldPosition(group.position); camera.getWorldQuaternion(group.quaternion);
    // Keep a finite stereo-readable distance; never alter the tracked camera or map.
    const projection = camera.projectionMatrix.elements;
    const halfW = DEPTH / Math.max(.01, Math.abs(projection[0])), halfH = DEPTH / Math.max(.01, Math.abs(projection[5]));
    const widthPx = Math.max(1, canvas.clientWidth), heightPx = Math.max(1, canvas.clientHeight);
    const insetsX = !mode.spatial && !mode.immersive && widthPx > 900 ? Math.min(290, widthPx * .24) : 16;
    const topInset = !mode.spatial && !mode.immersive ? Math.min(180, heightPx * .23) : 24;
    const bottomInset = !mode.spatial && !mode.immersive ? Math.min(165, heightPx * .23) : 24;
    const w = mode.xr ? Math.min(.88, halfW * 1.35) : 2 * halfW * Math.min(300, widthPx - 2 * insetsX) / widthPx;
    const h = w * HEIGHT / WIDTH;
    const left = -halfW + (mode.xr ? .08 : 2 * halfW * insetsX / widthPx);
    const right = -left;
    const bottom = -halfH + (mode.xr ? .08 : 2 * halfH * bottomInset / heightPx);
    const top = halfH - (mode.xr ? .08 : 2 * halfH * topInset / heightPx);
    let x = 0, y = 0;
    if (currentHit?.point) {
      anchor.copy(currentHit.point); projected.copy(anchor).project(camera);
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.08 || Math.abs(projected.y) > 1.08) return false;
      inverse.copy(group.quaternion).invert(); localAnchor.copy(anchor).sub(group.position).applyQuaternion(inverse);
      if (localAnchor.z >= -.001) return false;
      x = localAnchor.x * DEPTH / -localAnchor.z; y = localAnchor.y * DEPTH / -localAnchor.z;
    }
    const gap = halfH * .075;
    let px = x + gap + w / 2, py = y - gap - h / 2;
    if (px + w / 2 > right) px = x - gap - w / 2;
    const clampCenter = (value, min, max, size) => max - min < size ? (min + max) / 2 : THREE.MathUtils.clamp(value, min + size / 2, max - size / 2);
    px = clampCenter(px, left, right, w); py = clampCenter(py, bottom, top, h);
    panel.position.set(px, py, -DEPTH); panel.scale.setScalar(w);
    let vertex = 0;
    const segment = (ax, ay, bx, by) => {
      linePositions[vertex++] = ax; linePositions[vertex++] = ay; linePositions[vertex++] = -DEPTH + .001;
      linePositions[vertex++] = bx; linePositions[vertex++] = by; linePositions[vertex++] = -DEPTH + .001;
    };
    const r = halfH * (mode.xr ? .019 : .024), tick = r * .48;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      segment(x + sx * r, y + sy * r, x + sx * (r - tick), y + sy * r);
      segment(x + sx * r, y + sy * r, x + sx * r, y + sy * (r - tick));
    }
    if (object) {
      const edgeX = px < x ? px + w / 2 : px - w / 2, edgeY = py + h / 2 - h * .13;
      segment(x, y - r * 1.4, x, edgeY); segment(x, edgeY, edgeX, edgeY);
      const corner = w * .05;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const cx = px + sx * w / 2, cy = py + sy * h / 2;
        segment(cx, cy, cx - sx * corner, cy); segment(cx, cy, cx, cy - sy * corner);
      }
      const scan = reducedMotion ? .7 : (Math.sin(time * .8) * .5 + .5);
      const scanX = px - w * .4 + w * .64 * scan;
      segment(scanX, py + h / 2, scanX + w * .16, py + h / 2);
    }
    lineGeometry.setDrawRange(0, vertex / 3); lineGeometry.attributes.position.needsUpdate = true;
    return true;
  }
  function update(dt, { reducedMotion = false } = {}) {
    if (disposed) return;
    const delta = Math.min(.1, Math.max(0, dt)); time += delta;
    if (!enabled || doc.hidden) { if (group.visible || object) reset(); return; }
    const mode = getMode(), modeKey = `${!!mode.xr}:${!!mode.spatial}:${!!mode.immersive}`;
    if (lastMode !== modeKey) { lastMode = modeKey; reset(); }
    // Visibility/gesture checks also clear stale retained hits before another pick.
    if (pressed.size || isBlocked() || currentHit && !visible(currentHit.object)) { reset(); return; }
    const camera = getCamera();
    if (time >= nextPick) {
      nextPick = time + .1;
      if (doc.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) { reset(); nextPick = time + .1; return; }
      const hit = sample(camera, mode), raw = record(hit);
      if (raw?.id) {
        lossAge = 0;
        if (candidate?.id === raw.id) candidateAge += .1;
        else { candidate = raw; candidateAge = 0; }
        if (object?.id === raw.id) { currentHit = hit; acquired = true; }
        else if (candidateAge >= .18) acquire(hit);
      } else {
        candidate = null; candidateAge = 0; lossAge += .1;
        if (lossAge >= .3) acquired = false;
      }
      canShow = !pointerUsed || pointerInside || mode.spatial || touch;
    }
    if (object && language !== getLanguage()) { info = hudObjectInfo(object); language = getLanguage(); paint(); }
    const goal = object && acquired && canShow ? 1 : 0;
    opacity = reducedMotion ? goal : THREE.MathUtils.damp(opacity, goal, goal ? 14 : 18, delta);
    if (opacity < .005) { opacity = 0; if (!acquired) object = info = currentHit = null; }
    const reticle = canShow && (mode.spatial || !pointerUsed || touch);
    group.visible = (opacity > 0 || reticle) && layout(camera, mode, reducedMotion);
    panel.visible = opacity > 0 && Boolean(object); panel.material.opacity = opacity;
    lines.material.opacity = object ? .8 * opacity : .28;
  }
  return {
    group, panel, texture, diagnostics, update, reset,
    get enabled() { return enabled; }, get object() { return object; }, get info() { return info; },
    setEnabled(value) { enabled = Boolean(value); reset(); },
    dispose() {
      if (disposed) return; disposed = true; reset(); listeners.forEach(remove => remove());
      panel.geometry.dispose(); panel.material.dispose(); texture.dispose(); lineGeometry.dispose(); lines.material.dispose(); group.removeFromParent(); group.clear();
    },
  };
}
