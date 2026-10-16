import * as THREE from 'three';
import { equatorialVector } from './sky-math.js';
import { indexedPicking } from './combined-map.js';
import { createImmersiveEffects } from './immersive-effects.js';

// A distant angular reference, separate from the map's measured 3D coordinates.
// No invented stellar distances, parallax, variability, or nebula morphology.
// W3C alpha-blend is source-over composition with the real-world camera image:
// https://www.w3.org/TR/webxr-ar-module-1/#xrcompositor-behaviors
// Meta Browser requires a transparent application background for passthrough:
// https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/
const PICK_RADIUS = 60;
const knownDirection = object => Number.isFinite(object.raDeg) && Number.isFinite(object.decDeg) && Math.abs(object.decDeg) <= 90;
const extentKnown = object => knownDirection(object) && Number.isFinite(object.angularSizeArcmin) && object.angularSizeArcmin > 0;
const stellarColor = object => object.color || (object.colorIndex == null ? '#e7ecff' : object.colorIndex < 0 ? '#bbd0ff' : object.colorIndex < .45 ? '#e7edff' : object.colorIndex < .85 ? '#fff1d7' : object.colorIndex < 1.4 ? '#ffdab0' : '#ffb486');
const finiteVector = vector => vector && [vector.x, vector.y, vector.z].every(Number.isFinite);
const clamp = THREE.MathUtils.clamp;
const farDirection = `vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = clip; gl_Position.z = clip.w * 0.99998;`;

/** Black can attenuate passthrough only with alpha blending, never additive AR. */
export function supportsPassthroughDimming({ mode, blendMode } = {}) {
  return (mode === 'mr' || mode === 'immersive-ar') && blendMode === 'alpha-blend';
}

function skyStars(objects, uniforms, nebula = false) {
  const positions = [], colors = [], sizes = [], alphas = [];
  for (const object of objects) {
    positions.push(...object.position);
    const color = new THREE.Color(nebula ? '#82c0bc' : stellarColor(object));
    colors.push(color.r, color.g, color.b);
    const magnitude = Number.isFinite(object.mag) ? object.mag : 9;
    sizes.push(nebula ? 3.8 : clamp(7.8 - magnitude * .65, 1.1, 10));
    // Compress dynamic range for the display; retain the catalogue magnitude order.
    alphas.push(nebula ? .35 : clamp(Math.pow(10, -.19 * (magnitude - 1)), .018, 1));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  const material = new THREE.ShaderMaterial({
    uniforms, vertexColors: true, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `attribute float aSize; attribute float aAlpha; varying vec3 vColor; varying float vAlpha; uniform float uPixelRatio;
      void main(){vColor=color;vAlpha=aAlpha;${farDirection}gl_PointSize=aSize*uPixelRatio;}`,
    fragmentShader: `varying vec3 vColor;varying float vAlpha;uniform float uSkyOpacity;
      void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float glow=exp(-r*r*5.)*.45+exp(-r*r*30.)*.55;gl_FragColor=vec4(vColor,glow*vAlpha*uSkyOpacity);}`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = nebula ? 'immersive-nebula-centres' : 'immersive-catalogue-background'; points.frustumCulled = false; points.renderOrder = -9000;
  points.userData.angularReferenceOnly = true; points.userData.particles = false;
  points.userData.catalogueObjectIds = objects.map(object => object.id);
  indexedPicking(points, objects, nebula ? .28 : .2);
  return points;
}

// One mesh for all measured angular extents. Soft constant profiles deliberately
// do not pretend to reconstruct photographs or the unmeasured depth of a nebula.
function skyNebulae(objects, uniforms) {
  const positions = [], uvs = [], indices = [];
  const normal = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), point = new THREE.Vector3();
  const north = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
  const segments = 4;
  for (const object of objects) {
    normal.fromArray(equatorialVector(object.raDeg, object.decDeg));
    right.crossVectors(Math.abs(normal.y) > .99 ? xAxis : north, normal).normalize();
    up.crossVectors(normal, right).normalize();
    const tangent = Math.tan(THREE.MathUtils.degToRad(Math.min(object.angularSizeArcmin / 60, 120) / 2));
    const offset = positions.length / 3;
    for (let y = 0; y <= segments; y++) for (let x = 0; x <= segments; x++) {
      point.copy(normal).addScaledVector(right, (x / segments * 2 - 1) * tangent).addScaledVector(up, (y / segments * 2 - 1) * tangent).normalize();
      positions.push(point.x, point.y, point.z); uvs.push(x / segments, y / segments);
    }
    for (let y = 0; y < segments; y++) for (let x = 0; x < segments; x++) {
      const a = offset + y * (segments + 1) + x, b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;${farDirection}}`,
    fragmentShader: `varying vec2 vUv;uniform float uSkyOpacity;
      void main(){float r=length((vUv-.5)*2.);if(r>1.)discard;float envelope=pow(1.-r*r,2.);gl_FragColor=vec4(.37,.55,.57,envelope*.22*uSkyOpacity);}`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'immersive-nebula-extents'; mesh.frustumCulled = false; mesh.renderOrder = -9100;
  mesh.userData.illustrative = true; mesh.userData.angularReferenceOnly = true;
  mesh.userData.catalogueObjectIds = objects.map(object => object.id); mesh.userData.patchCount = objects.length;
  mesh.raycast = () => {};
  return mesh;
}

/** Four draw calls at most; no render targets or per-star scene objects. */
export function createImmersiveEnvironment({ parent } = {}) {
  if (!parent?.isObject3D) throw new TypeError('Immersive environment requires a scene parent.');
  const group = new THREE.Group(); group.name = 'immersive-surrounding-environment'; group.visible = false; parent.add(group);
  const settings = { active: false, mode: 'desktop', blendMode: 'opaque', dim: .56, stars: true, nebulae: true, skyVisible: true, quality: 'high', pixelRatio: 1, reducedMotion: false, nearField: false };
  const uniforms = { uSkyOpacity: { value: 0 }, uPixelRatio: { value: 1 }, uDimOpacity: { value: 0 } };
  let disposed = false, stars = null, nebulae = null, nebulaCentres = null, starCount = 0, nebulaCount = 0, nebulaPatchCount = 0, revealAge = 100;
  let objects = [], targets = [], currentCatalogue = null, nearFieldAnchored = false;
  const localField = new THREE.Group(); localField.name = 'immersive-local-field'; parent.add(localField);
  const ambient = createImmersiveEffects({parent:localField});
  ambient.configure({radius:6,ambientOnly:true});
  const viewer = new THREE.Vector3();
  // A full-viewport enclosure also covers both eye frusta. It draws at the far
  // depth after opaque geometry but before all transparent map objects. Thus it
  // attenuates only the background, never planets, hands, or holographic detail.
  const dimGeometry = new THREE.BufferGeometry();
  dimGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const dimMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: true, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.999999,1.0);}',
    fragmentShader: 'uniform float uDimOpacity;void main(){gl_FragColor=vec4(0.,0.,0.,uDimOpacity);}',
  });
  const dimmer = new THREE.Mesh(dimGeometry, dimMaterial);
  dimmer.name = 'immersive-passthrough-dimmer'; dimmer.frustumCulled = false; dimmer.renderOrder = -10000;
  dimmer.raycast = () => {}; dimmer.visible = false; group.add(dimmer);

  function sync() {
    group.visible = !disposed && settings.active;
    dimmer.visible = settings.active && supportsPassthroughDimming(settings) && uniforms.uDimOpacity.value > .0001;
    if (stars) {
      stars.visible = settings.skyVisible && settings.stars;
      const budget = settings.quality === 'low' ? 24000 : settings.quality === 'medium' ? 60000 : starCount;
      stars.geometry.setDrawRange(0, Math.min(starCount, budget));
    }
    if (nebulae) nebulae.visible = settings.skyVisible && settings.nebulae;
    if (nebulaCentres) nebulaCentres.visible = settings.skyVisible && settings.nebulae;
  }
  function release(object) {
    if (!object) return;
    object.removeFromParent(); object.geometry.dispose(); object.material.dispose();
  }
  function configure(options = {}) {
    if (disposed) return;
    for (const key of ['active', 'stars', 'nebulae', 'skyVisible', 'reducedMotion', 'nearField']) if (typeof options[key] === 'boolean') settings[key] = options[key];
    if (Number.isFinite(options.dim)) settings.dim = clamp(options.dim, 0, .8);
    if (Number.isFinite(options.pixelRatio)) settings.pixelRatio = clamp(options.pixelRatio, .5, 2);
    if (['vr', 'mr', 'desktop', 'immersive-vr', 'immersive-ar'].includes(options.mode)) settings.mode = options.mode;
    if (['opaque', 'alpha-blend', 'additive'].includes(options.blendMode)) settings.blendMode = options.blendMode;
    if (['low', 'medium', 'high'].includes(options.quality)) settings.quality = options.quality;
    uniforms.uPixelRatio.value = settings.pixelRatio;
    if (!settings.active) { uniforms.uDimOpacity.value = 0; uniforms.uSkyOpacity.value = 0; revealAge = 100; }
    if (settings.reducedMotion) {
      uniforms.uSkyOpacity.value = settings.active ? 1 : 0;
      uniforms.uDimOpacity.value = settings.active && supportsPassthroughDimming(settings) ? settings.dim : 0;
    }
    // Do not carry an alpha dimmer into additive AR or a different session.
    if (!supportsPassthroughDimming(settings)) uniforms.uDimOpacity.value = 0;
    ambient.configure({quality:settings.quality,reducedMotion:settings.reducedMotion});
    ambient.setActive(settings.active && settings.nearField);
    if (!settings.active || !settings.nearField) nearFieldAnchored = false;
    sync();
  }
  return {
    group,
    radius: PICK_RADIUS,
    get targets() { return targets; },
    get objects() { return objects; },
    configure,
    setCatalogue(catalogue = {}) {
      if (disposed || currentCatalogue === catalogue) return;
      currentCatalogue = catalogue;
      const projected = object => ({ id: object.id, name: object.name, bodyKind: object.bodyKind, raDeg: object.raDeg, decDeg: object.decDeg,
        mag: object.mag, colorIndex: object.colorIndex, color: object.color, angularSizeArcmin: object.angularSizeArcmin,
        position: equatorialVector(object.raDeg, object.decDeg, PICK_RADIUS), positionKind: 'sky-projection', environmentReference: true });
      const validStars = (catalogue.stars || []).filter(knownDirection).slice().sort((a, b) => (a.mag ?? Infinity) - (b.mag ?? Infinity)).map(projected);
      const validNebulae = (catalogue.nebulae || []).filter(knownDirection).map(projected);
      const patches = validNebulae.filter(extentKnown);
      release(stars); release(nebulae); release(nebulaCentres);
      stars = skyStars(validStars, uniforms); nebulaCentres = skyStars(validNebulae, uniforms, true); nebulae = skyNebulae(patches, uniforms);
      starCount = validStars.length; nebulaCount = validNebulae.length; nebulaPatchCount = patches.length;
      objects = [...validStars, ...validNebulae]; targets = [stars, nebulaCentres];
      group.add(nebulae, nebulaCentres, stars); sync();
    },
    reveal() { if (!disposed && !settings.reducedMotion) { revealAge = 0; uniforms.uSkyOpacity.value = 0; ambient.reveal(); nearFieldAnchored = false; } },
    update(dt, viewerPosition) {
      if (disposed) return;
      if (finiteVector(viewerPosition)) {
        viewer.copy(viewerPosition);
        // Picking proxies follow the viewer; the actual star shader discards
        // translation and renders catalogue directions at optical infinity.
        parent.updateWorldMatrix(true, false);
        group.position.copy(viewer); parent.worldToLocal(group.position);
        parent.getWorldQuaternion(group.quaternion).invert();
        parent.getWorldScale(group.scale); group.scale.set(1 / group.scale.x, 1 / group.scale.y, 1 / group.scale.z);
        group.updateWorldMatrix(false, true);
        if (settings.active && settings.nearField && !nearFieldAnchored) {
          localField.position.copy(group.position); localField.quaternion.copy(group.quaternion); localField.scale.copy(group.scale);
          nearFieldAnchored = true; ambient.reveal();
        }
      }
      if (!Number.isFinite(dt) || dt <= 0 || !settings.active) return;
      ambient.update(dt);
      const seconds = Math.min(dt, .1), ease = 1 - Math.exp(-seconds * 3.6);
      revealAge += seconds;
      const reveal = settings.reducedMotion ? 1 : THREE.MathUtils.smoothstep(revealAge, 0, 1.8);
      uniforms.uSkyOpacity.value = settings.reducedMotion ? reveal : uniforms.uSkyOpacity.value + (reveal - uniforms.uSkyOpacity.value) * ease;
      const target = supportsPassthroughDimming(settings) ? settings.dim : 0;
      uniforms.uDimOpacity.value = settings.reducedMotion ? target : uniforms.uDimOpacity.value + (target - uniforms.uDimOpacity.value) * ease;
      sync();
    },
    get diagnostics() {
      return { active: settings.active && !disposed, mode: settings.mode, dimSupported: supportsPassthroughDimming(settings), requestedDim: settings.dim, effectiveDim: uniforms.uDimOpacity.value,
        starCount, renderedStarCount: stars?.visible && group.visible ? stars.geometry.drawRange.count : 0,
        nearFieldActive:settings.active && settings.nearField, nearFieldPosition:localField.position.toArray(), nebulaCount, nebulaPatchCount, skyVisible: settings.skyVisible, angularReferenceOnly: true, viewer: viewer.toArray(), drawCalls: group.visible ? group.children.filter(object => object.visible).length + (settings.nearField ? ambient.group.children.filter(object=>object.visible).length : 0) : 0 };
    },
    dispose() {
      if (disposed) return;
      disposed = true; currentCatalogue = null; ambient.dispose(); localField.removeFromParent(); settings.active = false; uniforms.uDimOpacity.value = 0; uniforms.uSkyOpacity.value = 0;
      release(stars); release(nebulae); release(nebulaCentres); release(dimmer); objects = []; targets = []; group.visible = false; group.removeFromParent(); group.clear();
    },
  };
}
