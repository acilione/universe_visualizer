import * as THREE from 'three';

// All effects live in map coordinates: no camera motion and no change to catalogue data.
// The five renderables share their time and event uniforms and allocate no frame buffers.
const EVENT_SLOTS = 4;
const DUST_COUNT = 1800;
const TAU = Math.PI * 2;
const CYAN = new THREE.Color('#8de1e5');
const GOLD = new THREE.Color('#e8bd79');

function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function geometryWith(attributes) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, [values, size]] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  }
  return geometry;
}

function material(uniforms, vertexShader, fragmentShader, vertexColors = false) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, vertexColors,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, toneMapped: false,
  });
}

const pointFragment = `
varying vec3 vTint;
varying float vAlpha;
void main() {
  float distanceFromCenter = length(gl_PointCoord - 0.5) * 2.0;
  if (distanceFromCenter > 1.0 || vAlpha < 0.001) discard;
  float core = exp(-distanceFromCenter * distanceFromCenter * 11.0);
  float halo = exp(-distanceFromCenter * distanceFromCenter * 4.0) * 0.2;
  gl_FragColor = vec4(vTint, (core + halo) * vAlpha);
}`;

const lineFragment = `
varying vec3 vTint;
varying float vAlpha;
void main() {
  if (vAlpha < 0.001) discard;
  gl_FragColor = vec4(vTint, vAlpha);
}`;

export function createImmersiveEffects({ parent } = {}) {
  if (!parent?.isObject3D) throw new TypeError('Immersive effects require a map parent.');
  const group = new THREE.Group();
  group.name = 'immersive-holographic-effects';
  group.userData.immersiveEffects = true;
  group.visible = false;
  parent.add(group);
  const settings = { radius: 40, sky: false, quality: 'high', reducedMotion: false, enabled: true };
  let active = false;
  let disposed = false;
  let elapsed = 0;
  let eventIndex = 0;
  let lastInteraction = -Infinity;
  const uniforms = {
    effectTime: { value: 0 },
    effectRadius: { value: settings.radius },
    effectMotion: { value: 1 },
    effectRevealStart: { value: -100 },
    effectEvents: { value: Array.from({ length: EVENT_SLOTS }, () => new THREE.Vector4()) },
    effectEventStarts: { value: new Float32Array(EVENT_SLOTS).fill(-100) },
    effectEventStrengths: { value: new Float32Array(EVENT_SLOTS) },
  };
  const random = randomSequence(0xA37E2026);
  const positions = [], phases = [], sizes = [], colors = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    const radius = Math.cbrt(random()) * 0.94;
    const z = random() * 2 - 1;
    const theta = random() * TAU;
    const planar = Math.sqrt(1 - z * z);
    positions.push(radius * planar * Math.cos(theta), radius * z, radius * planar * Math.sin(theta));
    phases.push(random() * TAU);
    sizes.push(0.55 + random() * 0.85);
    const color = random() < 0.4 ? GOLD : CYAN;
    colors.push(color.r, color.g, color.b);
  }
  const dustGeometry = geometryWith({ position: [positions, 3], aPhase: [phases, 1], aSize: [sizes, 1], color: [colors, 3] });
  const dust = new THREE.Points(dustGeometry, material(uniforms, `
attribute float aPhase;
attribute float aSize;
uniform float effectTime;
uniform float effectRadius;
uniform float effectMotion;
uniform float effectRevealStart;
varying vec3 vTint;
varying float vAlpha;
void main() {
  float slowTime = effectTime * effectMotion * 0.035;
  vec3 drift = vec3(sin(slowTime + aPhase), cos(slowTime * 0.7 + aPhase), sin(slowTime * 0.8 + aPhase * 2.0)) * 0.009 * effectMotion;
  vec3 local = (position + drift) * effectRadius;
  vec4 view = modelViewMatrix * vec4(local, 1.0);
  gl_Position = projectionMatrix * view;
  float physicalScale = length(modelMatrix[0].xyz) * effectRadius;
  gl_PointSize = clamp(aSize * physicalScale * 0.75 / max(0.15, -view.z), 1.4, 4.0);
  float nearFade = smoothstep(0.18, 0.75, length(view.xyz));
  float depthFade = smoothstep(0.02, 0.15, -view.z);
  float life = (effectTime - effectRevealStart) / 3.2;
  float scan = exp(-pow((length(position) - life) * 21.0, 2.0)) * step(0.0, life) * (1.0 - step(1.1, life)) * effectMotion;
  vAlpha = nearFade * depthFade * (0.17 + 0.055 * sin(slowTime + aPhase) + scan * 0.45);
  vTint = color;
}`, pointFragment, true));
  dust.name = 'immersive-volume-dust';
  group.add(dust);

  // Six interrupted great-circle tracks. The faint stationary geometry is a
  // projection guide; small light tracers move along it without rotating the map.
  const arcPositions = [], arcProgress = [], arcPhases = [], arcColors = [];
  const base = new THREE.Vector3();
  for (let arc = 0; arc < 6; arc++) {
    const rotation = new THREE.Euler(arc * 0.51, arc * 0.77, arc * 0.29);
    for (let segment = 0; segment < 180; segment++) {
      // Gaps keep the outline airy instead of enclosing the observer in a cage.
      if (segment % 30 > 23) continue;
      for (let endpoint = 0; endpoint < 2; endpoint++) {
        const progress = (segment + endpoint) / 180;
        const theta = progress * TAU;
        base.set(Math.cos(theta), 0, Math.sin(theta)).applyEuler(rotation);
        arcPositions.push(base.x, base.y, base.z);
        arcProgress.push(progress);
        arcPhases.push(arc * 0.173);
        const tint = arc % 3 === 0 ? GOLD : CYAN;
        arcColors.push(tint.r, tint.g, tint.b);
      }
    }
  }
  const arcGeometry = geometryWith({ position: [arcPositions, 3], aProgress: [arcProgress, 1], aPhase: [arcPhases, 1], color: [arcColors, 3] });
  const arcs = new THREE.LineSegments(arcGeometry, material(uniforms, `
attribute float aProgress;
attribute float aPhase;
uniform float effectTime;
uniform float effectRadius;
uniform float effectMotion;
uniform float effectRevealStart;
varying vec3 vTint;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position * effectRadius * 1.04, 1.0);
  gl_Position = projectionMatrix * view;
  float tracer = fract(aProgress - effectTime * effectMotion * 0.014 + aPhase);
  float trail = smoothstep(0.92, 0.992, tracer) * (1.0 - smoothstep(0.992, 1.0, tracer));
  float entrance = clamp((effectTime - effectRevealStart) / 3.2, 0.0, 1.0);
  float revealAlpha = mix(0.035, 1.0, smoothstep(aProgress * 0.6, aProgress * 0.6 + 0.2, entrance));
  float pulse = sin(clamp(entrance, 0.0, 1.0) * 3.14159265) * effectMotion * 0.13;
  vAlpha = (0.026 + trail * 0.36 + pulse) * revealAlpha * smoothstep(0.15, 0.55, length(view.xyz));
  vTint = color;
}`, lineFragment, true));
  arcs.name = 'immersive-reference-tracers';
  group.add(arcs);

  const scanPositions = [];
  for (let axis = 0; axis < 3; axis++) {
    for (let segment = 0; segment < 192; segment++) {
      for (let endpoint = 0; endpoint < 2; endpoint++) {
        const theta = (segment + endpoint) / 192 * TAU;
        const a = Math.cos(theta), b = Math.sin(theta);
        scanPositions.push(...(axis === 0 ? [a, 0, b] : axis === 1 ? [0, a, b] : [a, b, 0]));
      }
    }
  }
  const scanGeometry = geometryWith({ position: [scanPositions, 3] });
  const scan = new THREE.LineSegments(scanGeometry, material(uniforms, `
uniform float effectTime;
uniform float effectRadius;
uniform float effectMotion;
uniform float effectRevealStart;
varying vec3 vTint;
varying float vAlpha;
void main() {
  float life = (effectTime - effectRevealStart) / 3.2;
  float travel = clamp(life, 0.0, 1.0);
  // The physical expansion slows at its outer edge and never moves the observer.
  float radius = (0.025 + (1.0 - pow(1.0 - travel, 1.5)) * 1.015) * effectRadius;
  vec4 view = modelViewMatrix * vec4(position * radius, 1.0);
  gl_Position = projectionMatrix * view;
  float envelope = smoothstep(0.0, 0.14, life) * (1.0 - smoothstep(0.72, 1.0, life));
  vAlpha = envelope * 0.55 * effectMotion * smoothstep(0.18, 0.7, length(view.xyz));
  vTint = mix(vec3(0.92, 0.62, 0.25), vec3(0.35, 0.85, 0.95), travel);
}`, lineFragment));
  scan.name = 'immersive-opening-scan';
  group.add(scan);

  const ringPositions = [], ringSlots = [];
  const sparkPositions = [], sparkSlots = [], sparkPhases = [];
  for (let slot = 0; slot < EVENT_SLOTS; slot++) {
    for (let axis = 0; axis < 2; axis++) {
      for (let segment = 0; segment < 64; segment++) {
        for (let endpoint = 0; endpoint < 2; endpoint++) {
          const theta = (segment + endpoint) / 64 * TAU;
          const a = Math.cos(theta), b = Math.sin(theta);
          ringPositions.push(...(axis === 0 ? [a, b, 0] : [a, b * 0.35, b * 0.93675]));
          ringSlots.push(slot);
        }
      }
    }
    for (let i = 0; i < 24; i++) {
      const z = random() * 2 - 1, theta = random() * TAU;
      const planar = Math.sqrt(1 - z * z);
      sparkPositions.push(planar * Math.cos(theta), z, planar * Math.sin(theta));
      sparkSlots.push(slot);
      sparkPhases.push(random());
    }
  }
  const eventShader = `
attribute float aSlot;
uniform float effectTime;
uniform float effectMotion;
uniform vec4 effectEvents[4];
uniform float effectEventStarts[4];
uniform float effectEventStrengths[4];
varying vec3 vTint;
varying float vAlpha;
`;
  const ringGeometry = geometryWith({ position: [ringPositions, 3], aSlot: [ringSlots, 1] });
  const rings = new THREE.LineSegments(ringGeometry, material(uniforms, `${eventShader}
void main() {
  int slot = int(aSlot);
  float age = (effectTime - effectEventStarts[slot]) / 1.25;
  float progress = clamp(age, 0.0, 1.0);
  vec4 event = effectEvents[slot];
  vec3 local = event.xyz + position * event.w * (0.78 + progress * 0.58);
  vec4 view = modelViewMatrix * vec4(local, 1.0);
  gl_Position = projectionMatrix * view;
  float envelope = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.15, 1.0, age));
  vAlpha = envelope * effectEventStrengths[slot] * effectMotion * smoothstep(0.16, 0.5, length(view.xyz));
  vTint = mix(vec3(0.96, 0.71, 0.35), vec3(0.43, 0.86, 0.91), progress);
}`, lineFragment));
  rings.name = 'immersive-selection-rings';
  rings.frustumCulled = false;
  group.add(rings);
  const sparkGeometry = geometryWith({ position: [sparkPositions, 3], aSlot: [sparkSlots, 1], aPhase: [sparkPhases, 1] });
  const sparks = new THREE.Points(sparkGeometry, material(uniforms, `${eventShader}
attribute float aPhase;
void main() {
  int slot = int(aSlot);
  float age = (effectTime - effectEventStarts[slot]) / 1.25;
  float progress = clamp(age, 0.0, 1.0);
  vec4 event = effectEvents[slot];
  vec3 local = event.xyz + position * event.w * (0.8 + progress * (0.5 + aPhase * 0.4));
  vec4 view = modelViewMatrix * vec4(local, 1.0);
  gl_Position = projectionMatrix * view;
  float physicalScale = length(modelMatrix[0].xyz) * event.w;
  gl_PointSize = clamp(physicalScale * 12.0 / max(0.15, -view.z), 1.0, 4.0);
  float envelope = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.1, 0.8, age));
  vAlpha = envelope * effectEventStrengths[slot] * effectMotion * smoothstep(0.16, 0.5, length(view.xyz));
  vTint = vec3(0.96, 0.73, 0.42);
}`, pointFragment));
  sparks.name = 'immersive-selection-sparks';
  sparks.frustumCulled = false;
  group.add(sparks);

  function syncVisibility() {
    group.visible = !disposed && active && settings.enabled;
    dust.visible = !settings.sky;
    scan.visible = !settings.sky && !settings.reducedMotion;
    rings.visible = !settings.sky && !settings.reducedMotion;
    sparks.visible = !settings.sky && !settings.reducedMotion;
  }

  function resetEvents() {
    lastInteraction = -Infinity;
    uniforms.effectEventStarts.value.fill(-100);
    uniforms.effectEventStrengths.value.fill(0);
  }

  function pulse(position, radius, strength) {
    if (disposed || !active || !settings.enabled || settings.reducedMotion || settings.sky) return;
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return;
    const slot = eventIndex++ % EVENT_SLOTS;
    uniforms.effectEvents.value[slot].set(position.x, position.y, position.z, radius);
    uniforms.effectEventStarts.value[slot] = elapsed;
    uniforms.effectEventStrengths.value[slot] = strength;
  }

  function configure(options = {}) {
    if (disposed) return;
    const oldRadius = settings.radius;
    const oldSky = settings.sky;
    if (Number.isFinite(options.radius) && options.radius > 0) settings.radius = options.radius;
    for (const key of ['sky', 'reducedMotion', 'enabled']) {
      if (typeof options[key] === 'boolean') settings[key] = options[key];
    }
    if ('quality' in options) settings.quality = options.quality;
    uniforms.effectRadius.value = settings.radius;
    uniforms.effectMotion.value = settings.reducedMotion ? 0 : 1;
    dustGeometry.setDrawRange(0, settings.quality === 'low' ? 700 : settings.quality === 'medium' ? 1200 : DUST_COUNT);
    for (const renderable of [dust, arcs, scan]) {
      renderable.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), settings.radius * 1.12);
    }
    if (oldRadius !== settings.radius || oldSky !== settings.sky || settings.reducedMotion) {
      resetEvents();
      uniforms.effectRevealStart.value = -100;
    }
    syncVisibility();
  }

  configure();
  return {
    get group() { return group; },
    configure,
    setActive(value) {
      if (disposed || active === Boolean(value)) return;
      active = Boolean(value);
      if (!active) {
        resetEvents();
        uniforms.effectRevealStart.value = -100;
      }
      syncVisibility();
    },
    reveal() {
      if (disposed || settings.reducedMotion || !settings.enabled) return;
      uniforms.effectRevealStart.value = elapsed;
    },
    select({ position, radius } = {}) {
      const objectRadius = Number.isFinite(radius) && radius > 0 ? radius : settings.radius * 0.006;
      pulse(position, Math.min(settings.radius * 0.18, Math.max(objectRadius * 1.3, settings.radius * 0.006)), 0.75);
    },
    interact({ type, points = [] } = {}) {
      if (type === 'reveal') return;
      if (!points.length || ((type === 'grab-move' || type === 'adjust') && elapsed - lastInteraction < 0.28)) return;
      const strength = type === 'adjust' ? 0.3 : type === 'grab-move' ? 0.16 : type === 'grab-end' ? 0.33 : 0.52;
      const radius = settings.radius * (type === 'adjust' ? 0.04 : 0.009);
      for (const point of points.slice(0, 2)) pulse(point, radius, strength);
      lastInteraction = elapsed;
    },
    update(dt) {
      if (disposed || !active || !settings.enabled || settings.reducedMotion || !Number.isFinite(dt) || dt <= 0) return;
      elapsed += Math.min(dt, 0.1);
      uniforms.effectTime.value = elapsed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.visible = false;
      group.removeFromParent();
      for (const renderable of group.children) {
        renderable.geometry.dispose();
        renderable.material.dispose();
      }
      group.clear();
    },
  };
}
