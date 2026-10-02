import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlanetVisual, getBodyAppearance, updatePlanetVisualLighting, stellarColor, disposePlanetTextures, createOfficialBodyGeometry } from '../src/planet-visuals.js';
import { BODY_SHAPES, BODY_SHAPE_SOURCE, SATURN_RINGS, URANUS_RINGS } from '../src/body-shape-data.js';
import officialSurfaces from '../src/official-surfaces.json' with { type: 'json' };

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const make = (id, extra = {}) => createPlanetVisual({ id, size: 1, bodyKind: 'planet', ...extra });
const surface = visual => visual.getObjectByName('planet-surface');
const dispose = visual => visual.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });

test('reference ellipsoids preserve NASA/JPL semiaxis ratios, including flattened planets and irregular moons', () => {
  // Source values from the active data blocks of NASA/JPL NAIF pck00011.
  const expected = {
    phobos: [13, 11.4, 9.1], deimos: [7.8, 6, 5.1], amalthea: [125, 73, 64],
    hyperion: [180.1, 133, 102.7], janus: [101.7, 93, 76.3],
    epimetheus: [64.9, 57.3, 53], proteus: [218, 208, 201],
    saturn: [60268, 60268, 54364], jupiter: [71492, 71492, 66854],
  };
  for (const [id, radii] of Object.entries(expected)) {
    assert.deepEqual(BODY_SHAPES[id].radiiKm, radii);
    const visual = make(id, { bodyKind: ['saturn', 'jupiter'].includes(id) ? 'planet' : 'moon' });
    try {
      const geometry = surface(visual).geometry;
      geometry.computeBoundingBox();
      const extent = geometry.boundingBox.getSize(new THREE.Vector3());
      close(extent.y / extent.x, radii[2] / radii[0]);
      close(extent.z / extent.x, radii[1] / radii[0]);
      close(visual.userData.bodyRadius, 1);
      assert.ok(visual.userData.appearance.shapeSource);
      if (!officialSurfaces[id]?.model) assert.equal(visual.userData.appearance.shapeSource, BODY_SHAPE_SOURCE);
      const positions = geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 73) {
        const ellipsoid = positions.getX(index) ** 2 + (positions.getY(index) * radii[0] / radii[2]) ** 2 + (positions.getZ(index) * radii[0] / radii[1]) ** 2;
        close(ellipsoid, 1, 2e-6); // No invented displacement/craters.
      }
    } finally { dispose(visual); }
  }
});

test('planet and moon albedo maps do not become fake height or emissive light', () => {
  for (const id of Object.keys(BODY_SHAPES).filter(id => id !== 'sun')) {
    const visual = make(id, { bodyKind: BODY_SHAPES[id].naifId % 100 === 99 ? 'planet' : 'moon' });
    try {
      const material = surface(visual).material;
      assert.equal(material.type, 'MeshStandardMaterial');
      assert.equal(material.emissiveIntensity, 0);
      assert.equal(material.emissive.getHex(), 0);
      assert.notEqual(material.bumpMap, material.map || undefined);
      if (material.bumpMap) assert.notEqual(material.bumpMap.name, material.map?.name);
      if (officialSurfaces[id]?.map && !officialSurfaces[id].model && (id !== 'titan' || officialSurfaces[id].kind === 'cloud-reconstruction')) assert.equal(material.map.name, officialSurfaces[id].map);
    } finally { dispose(visual); }
  }
});

test('unmapped moons are diffuse reference ellipsoids, not fabricated exoplanet terrain', () => {
  const visual = make('deimos', { bodyKind: 'moon', color: '#b7a798' });
  try {
    const material = surface(visual).material;
    assert.equal(material.type, 'MeshStandardMaterial');
    if (!officialSurfaces.deimos?.map) {
      assert.equal(material.map, null);
      assert.equal(visual.userData.appearance.kind, 'unmapped-body');
      assert.match(visual.userData.appearance.note, /avoids inventing/);
    }
    assert.equal(material.displacementMap, null);
  } finally { dispose(visual); }
});

test('stellar surfaces are white by default, never inherit orange solar imagery or planetary temperatures', () => {
  const sun = make('sun', { bodyKind: 'star' });
  const unknown = make('host-test', { bodyKind: 'star', temperatureK: 300 });
  const redStar = make('host-cool', { bodyKind: 'star', stellarTemperatureK: 3200 });
  try {
    assert.equal(surface(sun).material.uniforms.uColor.value.getHex(), 0xffffff);
    assert.equal(surface(unknown).material.uniforms.uColor.value.getHex(), 0xffffff);
    assert.equal(surface(unknown).material.userData.temperatureK, null);
    assert.equal(surface(unknown).material.map, undefined);
    assert.equal(surface(redStar).material.userData.temperatureK, 3200);
    assert.notEqual(surface(redStar).material.uniforms.uColor.value.getHex(), 0xffffff);
    assert.match(getBodyAppearance({ id: 'sun' }).note, /no dated sunspot map/);
    assert.equal(stellarColor(NaN).getHex(), 0xffffff);
  } finally { [sun, unknown, redStar].forEach(dispose); }
});

test('Titan is opaque visible-light haze even if a radar/infrared surface texture exists', () => {
  const visual = make('titan', { bodyKind: 'moon' });
  try {
    assert.equal(surface(visual).material.transparent, false);
    if (officialSurfaces.titan?.kind === 'cloud-reconstruction') assert.equal(surface(visual).material.map.name, officialSurfaces.titan.map);
    else assert.equal(surface(visual).material.map, null);
    assert.ok(['haze-model', 'cloud-reconstruction'].includes(visual.userData.appearance.kind));
    assert.ok(visual.getObjectByName('atmosphere'));
  } finally { dispose(visual); }
});

test('ring geometry uses measured radial boundaries and contains the Cassini division', () => {
  for (const id of ['saturn', 'uranus']) {
    const visual = make(id);
    try {
      const group = visual.getObjectByName(`${id}-rings`);
      assert.ok(group.children.length >= 4);
      for (const ring of group.children) {
        const [innerKm, outerKm] = ring.userData.radialBoundsKm;
        close(ring.geometry.parameters.innerRadius, innerKm / BODY_SHAPES[id].radiiKm[0]);
        close(ring.geometry.parameters.outerRadius, outerKm / BODY_SHAPES[id].radiiKm[0]);
        assert.ok(ring.geometry.parameters.outerRadius <= visual.userData.visualRadius);
        assert.match(ring.material.fragmentShader, /discriminant/);
      }
      if (id === 'saturn') {
        const division = group.getObjectByName('saturn-ring-Cassini division');
        assert.deepEqual(division.userData.radialBoundsKm, [117507, 122340]);
        if (officialSurfaces.saturn?.ringMap) {
          assert.equal(division.material.uniforms.uOpacity.value, 1, 'source alpha must not be multiplied by another band opacity');
          assert.equal(division.material.uniforms.uRingMap.value.name, officialSurfaces.saturn.ringMap);
          assert.match(division.material.fragmentShader, /ringColor.a \* uOpacity/);
        } else assert.ok(division.material.uniforms.uOpacity.value < .1);
        assert.equal(SATURN_RINGS.at(-1).outerKm, 136780);
      } else {
        assert.equal(URANUS_RINGS.at(-1).radiusKm, 51149);
        assert.ok(group.children.every(ring => ring.userData.radialBoundsKm[1] - ring.userData.radialBoundsKm[0] <= 96));
      }
    } finally { dispose(visual); }
  }
});

test('shader light direction follows the world star and ignores invalid zero vectors', () => {
  for (const id of ['earth', 'saturn', 'titan', 'exo-example']) {
    const visual = make(id, { bodyKind: id === 'titan' ? 'moon' : id.startsWith('exo') ? 'exoplanet' : 'planet' });
    try {
      const worldDirection = new THREE.Vector3(4, -2, 8);
      const before = worldDirection.clone();
      updatePlanetVisualLighting(visual, worldDirection);
      assert.deepEqual(worldDirection, before);
      const expected = worldDirection.clone().normalize();
      assert.ok(visual.userData.lightingMaterials.length > 0);
      for (const material of visual.userData.lightingMaterials) assert.ok(material.uniforms.uLightDirection.value.distanceTo(expected) < 1e-10);
      updatePlanetVisualLighting(visual, new THREE.Vector3());
      for (const material of visual.userData.lightingMaterials) assert.ok(material.uniforms.uLightDirection.value.distanceTo(expected) < 1e-10);
    } finally { dispose(visual); }
  }
});

test('tidally locked moon major axis points toward its parent; spin metadata avoids double retrograde', () => {
  const phase = 1.2;
  const phobos = make('phobos', { bodyKind: 'moon', phase });
  const venus = make('venus');
  const uranus = make('uranus');
  try {
    const toParent = new THREE.Vector3(-Math.cos(phase), 0, -Math.sin(phase));
    const majorAxis = new THREE.Vector3(1, 0, 0).applyEuler(phobos.userData.surface.rotation);
    assert.ok(majorAxis.distanceTo(toParent) < 1e-10);
    assert.equal(phobos.userData.surface.userData.staticOrientation, true);
    assert.equal(phobos.userData.surface.userData.tidallyLocked, true);
    for (const visual of [venus, uranus]) {
      assert.ok(visual.getObjectByName('body-axis').rotation.z > Math.PI / 2);
      assert.ok(visual.userData.surface.userData.rotationPeriodHours > 0);
    }
  } finally { [phobos, venus, uranus].forEach(dispose); disposePlanetTextures(); }
});

test('native official mesh normalization preserves topology, UVs and irregular relief', () => {
  const source = { positions: [-2,0,0, 2,0,0, 0,1,0, 0,0,.5], uvs: [0,0, 1,0, .5,1, .3,.4], indices: [0,1,2, 0,3,1, 1,3,2, 2,3,0] };
  const original = structuredClone(source);
  const geometry = createOfficialBodyGeometry(source, 3);
  try {
    assert.deepEqual(Array.from(geometry.index.array), source.indices);
    const uv = geometry.attributes.uv.array;
    uv.forEach((value, i) => close(value, source.uvs[i]));
    close(geometry.boundingSphere.radius, 3);
    assert.equal(geometry.attributes.position.count, 4);
    assert.deepEqual(source, original, 'cached source JSON stays immutable');
    assert.ok(geometry.attributes.normal);
  } finally { geometry.dispose(); }
  assert.throws(() => createOfficialBodyGeometry({ ...source, indices: [0, 1, 99] }), /indices/);
  assert.throws(() => createOfficialBodyGeometry({ ...source, positions: [NaN, 0, 0] }), /positions/);
});

test('Saturn ring shadow shader preserves ambient light and shares the world source direction', () => {
  const visual = make('saturn');
  try {
    const material = surface(visual).material;
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uRingShadowLight, material.uniforms.uLightDirection);
    assert.equal(shader.uniforms.uPlanetRadius.value, 1);
    assert.match(shader.vertexShader, /vRingShadowDirection;\n#define STANDARD/);
    assert.match(shader.fragmentShader, /;\n#define STANDARD/);
    assert.doesNotMatch(shader.fragmentShader, /;#define/);
    assert.match(shader.vertexShader, /modelMatrix\[0\]/);
    assert.match(shader.fragmentShader, /reflectedLight.directDiffuse \*= ringTransmission/);
    assert.doesNotMatch(shader.fragmentShader, /indirectDiffuse \*= ringTransmission/);
    assert.equal(material.customProgramCacheKey(), officialSurfaces.saturn?.ringMap ? 'nasa-saturn-ring-shadow-map-v2' : 'nasa-saturn-ring-shadow-v1');
    if (officialSurfaces.saturn?.ringMap) {
      assert.equal(shader.uniforms.uSaturnRingMap.value.name, officialSurfaces.saturn.ringMap);
      assert.match(shader.fragmentShader, /ringOpacity = texture2D\(uSaturnRingMap/);
      close(shader.uniforms.uSaturnRingBounds.value.x, officialSurfaces.saturn.ringMapInnerKm / 60268);
      close(shader.uniforms.uSaturnRingBounds.value.y, officialSurfaces.saturn.ringMapOuterKm / 60268);
    }
    const direction = new THREE.Vector3(1, .4, -.5).normalize();
    updatePlanetVisualLighting(visual, direction);
    assert.ok(shader.uniforms.uRingShadowLight.value.distanceTo(direction) < 1e-10);
  } finally { dispose(visual); }
});

test('Neptune source texture retains its detail while documented hue correction reaches the shader', () => {
  const visual = make('neptune');
  try {
    const material = surface(visual).material;
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader);
    assert.equal(material.map.name, officialSurfaces.neptune.map);
    assert.equal(material.userData.colorAdjustment, 'pale-blue-green-approximation');
    assert.equal(shader.uniforms.uNeptuneDisplayHue.value.getHex(), 0xadc9d1);
    assert.match(shader.fragmentShader, /uNeptuneDisplayHue;\n#define STANDARD/);
    assert.match(shader.fragmentShader, /neptuneLuminance \/ 0.31362255/);
    assert.match(visual.userData.appearance.note, /hue is adjusted/);
    assert.match(visual.userData.appearance.note, /not a calibrated/);
    assert.equal(material.customProgramCacheKey(), 'nasa-neptune-display-hue-v1');
  } finally { dispose(visual); }
});

test('Saturn original NASA radial mapping preserves the outer F ring within focus bounds', () => {
  const source = officialSurfaces.saturn;
  assert.ok(source.ringMap);
  const visual = make('saturn', { size: 2 });
  try {
    const rings = visual.getObjectByName('saturn-rings');
    const fRing = rings.getObjectByName('saturn-ring-F-region');
    assert.ok(fRing, 'source outer band must not be cropped at the A ring');
    close(fRing.geometry.parameters.outerRadius, 2 * source.ringMapOuterKm / 60268);
    assert.ok(fRing.geometry.parameters.outerRadius <= visual.userData.visualRadius);
    close(visual.userData.visualRadius, 4.68);
    for (const ring of rings.children) {
      const uniforms = ring.material.uniforms;
      close(uniforms.uRingMapBounds.value.x, 2 * source.ringMapInnerKm / 60268);
      close(uniforms.uRingMapBounds.value.y, 2 * source.ringMapOuterKm / 60268);
      assert.equal(uniforms.uRingMap.value.wrapS, THREE.ClampToEdgeWrapping);
      assert.equal(uniforms.uOpacity.value, 1);
      assert.equal(uniforms.uColor.value.getHex(), 0xffffff, 'do not tint the original observed texture twice');
    }
    assert.equal(visual.userData.appearance.ringSourceUrl, source.ringMapSourceUrl);
  } finally { dispose(visual); }
});
