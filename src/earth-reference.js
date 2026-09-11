import * as THREE from 'three';
import { createPlanetVisual } from './planet-visuals.js';

export const EARTH_REFERENCE_RADIUS = 0.65;

/**
 * Visible origin for the constellation atlas. Its radius is enlarged for
 * navigation; it is not part of the stellar distance scale. Surface orientation
 * is illustrative. The parent owns visibility, placement and disposal.
 */
export function makeEarthReference() {
  const group = new THREE.Group();
  group.name = 'earth-reference';
  group.userData.radius = EARTH_REFERENCE_RADIUS;
  group.userData.visualRadius = 1.09;
  group.userData.amplified = true;
  group.userData.orientationIllustrative = true;

  const earth = createPlanetVisual({ id: 'earth', size: EARTH_REFERENCE_RADIUS });
  // The atlas uses celestial north as Y; the solar-system obliquity would be
  // misleading here. A geographic/date-accurate orientation is a separate model.
  earth.children[0].rotation.set(0, 0, 0);
  earth.traverse((child) => {
    if (child.name === 'planet-surface') {
      // No physical Sun is rendered at the origin in this view. Keep the shared
      // day map readable from every angle without introducing a scene light.
      child.material.emissiveIntensity = 0.55;
      child.material.roughness = 1;
    }
    if (child.name === 'earth-clouds') child.material.emissiveIntensity = 0.35;
    if (child.name === 'atmosphere') {
      child.material.uniforms.uOpacity.value = 0.25;
      child.material.userData.baseOpacity = 0.25;
    }
  });
  group.add(earth);

  const points = [];
  for (let i = 0; i < 160; i++) {
    const angle = i / 160 * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * 1.01, 0, Math.sin(angle) * 1.01));
  }
  const material = new THREE.LineBasicMaterial({
    color: '#8ee9ef',
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material.userData.baseOpacity = 0.34;
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
  ring.name = 'earth-reference-ring';
  group.add(ring);

  const ticks = [];
  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * Math.PI * 2;
    const outer = i % 6 === 0 ? 1.09 : 1.055;
    ticks.push(
      Math.cos(angle) * 1.015, 0, Math.sin(angle) * 1.015,
      Math.cos(angle) * outer, 0, Math.sin(angle) * outer,
    );
  }
  const tickGeometry = new THREE.BufferGeometry();
  tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3));
  const tickMaterial = material.clone();
  tickMaterial.opacity = 0.52;
  tickMaterial.userData.baseOpacity = 0.52;
  const tickMarks = new THREE.LineSegments(tickGeometry, tickMaterial);
  tickMarks.name = 'earth-reference-ticks';
  group.add(tickMarks);

  return group;
}
