import * as THREE from 'three';

const finiteDirection = value => value?.isVector3 && value.toArray().every(Number.isFinite) && value.lengthSq() > 1e-20;
const cloneData = value => Array.isArray(value) ? value.map(cloneData) : value && Object.getPrototypeOf(value) === Object.prototype ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)])) : value;
const controlFields = ['enabled', 'autoRotate', 'minDistance', 'maxDistance', 'minPolarAngle', 'maxPolarAngle', 'minAzimuthAngle', 'maxAzimuthAngle', 'enablePan', 'enableZoom', 'enableRotate', 'enableDamping', 'dampingFactor'];

/** Snapshot navigation state without copying the complete astronomical catalogue. */
export function captureAtlasView(universe) {
  const { camera, mapRoot, controls = {} } = universe || {};
  if (!camera?.isCamera || !mapRoot?.isObject3D) throw new TypeError('An atlas camera and map root are required.');
  const objects = universe.objects?.slice() || [];
  const data = universe.constellationData;
  return {
    index: universe.index,
    context: cloneData(universe.viewContext || null),
    // Records are immutable catalogue data. Clone the selected record's mutable
    // presentation coordinates, but retain the large catalogue's row references.
    selected: universe.selected ? { ...universe.selected, ...(Array.isArray(universe.selected.position) ? { position: universe.selected.position.slice() } : {}) } : null,
    objects,
    systemHost: universe.systemHost ?? null,
    focusedPlanet: universe.focusedPlanet || null,
    focusedMoonSystem: universe.focusedMoonSystem || null,
    preview: universe.preview?.isActive ? universe.preview.captureNavigationState?.() || null : null,
    constellation: data ? { id: data.ids?.[0] ?? data.figure?.id ?? null, ids: (data.ids || (data.figure?.id ? [data.figure.id] : [])).slice(), distanceFactor: data.distanceFactor ?? universe.constellationView?.distanceFactor, mode: data.mode, observer: cloneData(data.observer || null) } : null,
    camera: {
      position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(),
      target: controls.target?.clone() || new THREE.Vector3(),
      fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom,
    },
    mapTransform: { position: mapRoot.position.clone(), quaternion: mapRoot.quaternion.clone(), scale: mapRoot.scale.clone() },
    controls: Object.fromEntries(controlFields.filter(key => key in controls).map(key => [key, controls[key]])),
    sky: { yaw: universe.skyYaw, pitch: universe.skyPitch },
    earthVisible: universe.earthVisible,
    earthPerspective: Boolean(universe.earthPerspective),
    previewActive: Boolean(universe.preview?.isActive),
    xrActive: Boolean(universe.xr?.isPresenting || universe.renderer?.xr?.isPresenting),
  };
}

function equatorialDirection(object) {
  const ra = object?.raDeg, dec = object?.decDeg;
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) return null;
  const alpha = THREE.MathUtils.degToRad(ra), delta = THREE.MathUtils.degToRad(dec);
  return new THREE.Vector3(Math.cos(delta) * Math.cos(alpha), Math.sin(delta), -Math.cos(delta) * Math.sin(alpha));
}

/** A normalized ICRS bearing in the atlas's map-local axes, not a distance. */
export function directionToGaia(universe) {
  const { camera, mapRoot } = universe || {};
  if (!camera?.isCamera || !mapRoot?.isObject3D) throw new TypeError('An atlas camera and map root are required.');
  const viewer = universe.renderer?.xr?.isPresenting ? universe.renderer.xr.getCamera() : camera;
  viewer.updateWorldMatrix(true, false); mapRoot.updateWorldMatrix(true, false);
  const worldOrigin = viewer.getWorldPosition(new THREE.Vector3());
  const worldForward = viewer.getWorldDirection(new THREE.Vector3());
  const inverse = mapRoot.matrixWorld.clone().invert();
  const ray = new THREE.Ray(worldOrigin, worldForward).applyMatrix4(inverse);
  const forward = finiteDirection(ray.direction) ? ray.direction.clone().normalize() : new THREE.Vector3(0, 0, -1);

  // Equatorial sky views already have a meaningful bearing. An old horizontal
  // Earth-sky view (index 7) does not: use its selected equatorial source below.
  const angular = universe.index === 8 || universe.index === 6 && universe.earthPerspective;
  if (angular) return forward;
  const selected = equatorialDirection(universe.selected);
  if (selected) return selected;

  if (universe.index === 9) {
    const radius = universe.combinedView?.radius ?? universe.boundsRadius ?? 60;
    if (Number.isFinite(radius) && radius > 0) {
      // Outside the combined sky sphere, forward alone points at the opposite
      // hemisphere. The nearest positive ray/sphere intersection is what the
      // user sees at the screen centre. From inside it gives the exit surface.
      const hit = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), radius), new THREE.Vector3());
      if (finiteDirection(hit)) return hit.normalize();
    }
  }
  // Schematic planets have no invented RA/Dec derived from their orbit slots.
  // With no mapped equatorial target, carry the view orientation only.
  return forward;
}
