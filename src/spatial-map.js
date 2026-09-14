import { Matrix4, Quaternion, Vector3 } from 'three';

export const SPATIAL_ROOM_DIAMETER = 12;
export const SPATIAL_TABLETOP_DIAMETER = 2.1;

/**
 * One-time placement in metre-based world/reference coordinates. Retain this
 * transform as the viewer walks: only explicit manipulation or recentering
 * changes the map. Catalogue coordinates and relative distances are preserved.
 */
export function computeSpatialPlacement({ boundsRadius, viewerPosition, viewerQuaternion, layout = 'room', planetarium = false }) {
  const position = viewerPosition.clone();
  const quaternion = new Quaternion();
  if (planetarium) return { position, quaternion, scale: 1 };
  const radius = Number.isFinite(boundsRadius) && boundsRadius > 0 ? boundsRadius : 30;
  if (layout === 'tabletop') {
    const forward = new Vector3(0, 0, -1).applyQuaternion(viewerQuaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    position.addScaledVector(forward.normalize(), 1.65);
    position.y -= 0.22;
    quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.3);
    return { position, quaternion, scale: SPATIAL_TABLETOP_DIAMETER / (2 * radius) };
  }
  position.y -= 0.4;
  return { position, quaternion, scale: SPATIAL_ROOM_DIAMETER / (2 * radius) };
}

/** Convert a world transform to a child transform under a uniform-scale parent. */
export function spatialWorldToLocal(transform, parent) {
  if (!parent) return { position: transform.position.clone(), quaternion: transform.quaternion.clone(), scale: transform.scale };
  parent.updateWorldMatrix(true, false);
  const matrix = new Matrix4().compose(transform.position, transform.quaternion, new Vector3().setScalar(transform.scale));
  matrix.premultiply(parent.matrixWorld.clone().invert());
  const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale: scale.x };
}
