import { Quaternion, Vector3 } from 'three';

/** Rigid transform about a tracked grip, in the scene's metre coordinate system. */
export function singleGripTransform(start, gripStart, gripNow) {
  const rotation = gripNow.quaternion.clone().multiply(gripStart.quaternion.clone().invert());
  return {
    position: start.position.clone().sub(gripStart.position).applyQuaternion(rotation).add(gripNow.position),
    quaternion: rotation.multiply(start.quaternion),
    scale: start.scale,
  };
}

/** Scale and rotate around the midpoint, preserving the object-to-grip offset. */
export function dualGripTransform(start, firstStart, secondStart, firstNow, secondNow, minScale, maxScale, gain = 1) {
  const before = new Vector3().subVectors(secondStart, firstStart);
  const after = new Vector3().subVectors(secondNow, firstNow);
  const separation = before.length();
  if (separation < 0.03 || after.length() < 0.015) return null;
  const scale = Math.max(minScale, Math.min(maxScale, start.scale * Math.pow(after.length() / separation, Math.max(1, Math.min(3, gain)))));
  const rotation = new Quaternion().setFromUnitVectors(before.normalize(), after.normalize());
  const midpointBefore = firstStart.clone().add(secondStart).multiplyScalar(0.5);
  const midpointAfter = firstNow.clone().add(secondNow).multiplyScalar(0.5);
  return {
    position: start.position.clone().sub(midpointBefore).multiplyScalar(scale / start.scale).applyQuaternion(rotation).add(midpointAfter),
    quaternion: rotation.multiply(start.quaternion),
    scale,
  };
}

export function isSelectionGesture({ duration, distance, rotated = 0, manipulated = false }) {
  return !manipulated && duration <= 350 && distance < 0.025 && rotated < 0.12;
}

/** More tolerant hand motion while still distinguishing a deliberate grab. */
export function isTravelGesture({ duration, distance, rotated = 0, manipulated = false }) {
  return !manipulated && duration >= 0 && duration <= 420 && distance < 0.045 && rotated < 0.28;
}

/** All four fingers must fold towards the wrist; a thumb/index pinch is not a fist. */
export function isClosedHand(joints) {
  const wrist = joints?.wrist;
  if (!wrist?.visible) return false;
  return ['index', 'middle', 'ring', 'pinky'].every(finger => {
    const tip = joints[`${finger}-finger-tip`];
    const middle = joints[`${finger}-finger-phalanx-intermediate`];
    if (!tip?.visible || !middle?.visible) return false;
    const length = middle.position.distanceTo(wrist.position);
    return length > 0.015 && tip.position.distanceTo(wrist.position) < length * 0.9;
  });
}

/** A held gesture fires once, must first see release, and loses arming on lost tracking. */
export function createHeldGesture(seconds = 0.65) {
  let armed = false, elapsed = 0;
  return {
    update(closed, delta, tracked = true) {
      if (!tracked) { armed = false; elapsed = 0; return false; }
      if (!closed) { armed = true; elapsed = 0; return false; }
      if (!armed) return false;
      elapsed += Math.max(0, Math.min(Number.isFinite(delta) ? delta : 0, 0.1));
      if (elapsed < seconds) return false;
      armed = false; elapsed = 0;
      return true;
    },
    reset() { armed = false; elapsed = 0; },
    get progress() { return armed ? Math.min(1, elapsed / seconds) : 0; },
  };
}
