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
export function dualGripTransform(start, firstStart, secondStart, firstNow, secondNow, minScale, maxScale) {
  const before = new Vector3().subVectors(secondStart, firstStart);
  const after = new Vector3().subVectors(secondNow, firstNow);
  const separation = before.length();
  if (separation < 0.03 || after.length() < 0.015) return null;
  const scale = Math.max(minScale, Math.min(maxScale, start.scale * after.length() / separation));
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
