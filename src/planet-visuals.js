import * as THREE from 'three';

// Local equirectangular maps by Solar System Scope / INOVE, CC BY 4.0.
// Source, limitations and complete attribution: /TEXTURE_SOURCES.md in this repo.
const PLANETS = {
  sun: { map: '2k_sun.jpg', tilt: 7.25, glow: '#ffb960' },
  mercury: { map: '2k_mercury.jpg', tilt: 0.03, bump: 0.004 },
  venus: { map: '2k_venus_atmosphere.jpg', tilt: 177.4, glow: '#edd1a2' },
  earth: { map: '2k_earth_daymap.jpg', tilt: 23.44, glow: '#69dbff' },
  mars: { map: '2k_mars.jpg', tilt: 25.19, bump: 0.003, glow: '#df9c76' },
  jupiter: { map: '2k_jupiter.jpg', tilt: 3.13, glow: '#e6c8a2' },
  saturn: { map: '2k_saturn.jpg', tilt: 26.73, glow: '#edd2a0' },
  uranus: { map: '2k_uranus.jpg', tilt: 97.77, glow: '#78e9ec' },
  neptune: { map: '2k_neptune.jpg', tilt: 28.32, glow: '#679bff' },
};

const textures = new Map();
const loader = new THREE.TextureLoader();

function texture(file, color = true) {
  const key = file + (color ? ':srgb' : ':linear');
  if (!textures.has(key)) {
    const map = loader.load(`${import.meta.env.BASE_URL}textures/${file}`);
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.anisotropy = 4;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    textures.set(key, map);
  }
  return textures.get(key);
}

const atmosphereVertex = `
  varying vec3 vNormal;
  varying vec3 vEye;
  void main() {
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vEye = -p.xyz;
    gl_Position = projectionMatrix * p;
  }
`;
const atmosphereFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vEye;
  void main() {
    float edge = 1.0 - max(dot(normalize(vNormal), normalize(vEye)), 0.0);
    float rim = pow(edge, 3.5);
    gl_FragColor = vec4(uColor, rim * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function atmosphere(radius, color, opacity = 0.4, extent = 1.035) {
  const material = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material.userData.baseOpacity = opacity;
  const rim = new THREE.Mesh(new THREE.SphereGeometry(radius * extent, 64, 40), material);
  rim.name = 'atmosphere';
  rim.renderOrder = 2;
  return rim;
}

function saturnRings(radius) {
  const inner = radius * 1.22;
  const outer = radius * 2.32;
  const geometry = new THREE.RingGeometry(inner, outer, 192, 4);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  const material = new THREE.MeshStandardMaterial({
    map: texture('2k_saturn_ring_alpha.png'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.93,
    roughness: 1,
    metalness: 0,
    emissive: '#c4ac83',
    emissiveMap: texture('2k_saturn_ring_alpha.png'),
    emissiveIntensity: 0.16,
    depthWrite: false,
  });
  material.userData.baseOpacity = 0.93;
  const ring = new THREE.Mesh(geometry, material);
  ring.name = 'saturn-rings';
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

const exoplanetVertex = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vEye;
  void main() {
    vPosition = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vEye = -p.xyz;
    gl_Position = projectionMatrix * p;
  }
`;

// Exoplanets have measured catalog properties, but no resolved surface maps.
// This deterministic shader is an explicitly illustrative appearance only.
const exoplanetFragment = `
  uniform vec3 uDeep;
  uniform vec3 uLight;
  uniform vec3 uAccent;
  uniform float uSeed;
  uniform float uGas;
  uniform float uOpacity;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vEye;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.19) + uSeed);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float n = 0.0, strength = 0.5;
    for (int i = 0; i < 5; i++) {
      n += noise(p) * strength;
      p = p * 2.04 + 4.71;
      strength *= 0.5;
    }
    return n;
  }
  void main() {
    vec3 p = normalize(vPosition);
    float cloud = fbm(p * 5.0 + uSeed);
    float grain = fbm(p * 35.0);
    float bands = 0.5 + 0.5 * sin(p.y * 44.0 + cloud * 7.0);
    float terrain = smoothstep(0.28, 0.70, cloud + grain * 0.1);
    float feature = mix(terrain, bands * 0.68 + grain * 0.32, uGas);
    vec3 color = mix(uDeep, uLight, feature);
    color = mix(color, uAccent, smoothstep(0.65, 0.8, grain) * 0.3);
    color *= 0.86 + grain * 0.24;
    vec3 N = normalize(vNormal), V = normalize(vEye);
    vec3 L = normalize(vec3(-0.6, 0.6, 0.8));
    float light = 0.22 + 0.85 * max(dot(N, L), 0.0);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    color = color * light + uAccent * rim * 0.15;
    gl_FragColor = vec4(color, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function seedFor(id) {
  let seed = 2166136261;
  for (const letter of String(id)) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619);
  return (seed >>> 0) / 4294967295;
}

function exoplanetMaterial(object) {
  const seed = seedFor(object.id);
  const gas = Number(object.radiusEarth) >= 2;
  const temperature = Number(object.temperatureK) || 0;
  const palette = temperature > 1100
    ? ['#45271e', '#e4ac73', '#ffd69b']
    : temperature > 550
      ? ['#504b38', '#c9b47d', '#eee0ad']
      : gas
        ? seed > 0.5
          ? ['#2c5374', '#7fb3c9', '#a4e4e7']
          : ['#685949', '#d4b68d', '#f1d6a3']
        : seed > 0.5
          ? ['#494d4b', '#aaa89a', '#d4cab0']
          : ['#453b37', '#b59473', '#d5bc94'];
  const material = new THREE.ShaderMaterial({
    vertexShader: exoplanetVertex,
    fragmentShader: exoplanetFragment,
    uniforms: {
      uDeep: { value: new THREE.Color(palette[0]) },
      uLight: { value: new THREE.Color(palette[1]) },
      uAccent: { value: new THREE.Color(palette[2]) },
      uSeed: { value: seed * 31 },
      uGas: { value: gas ? 1 : 0 },
      uOpacity: { value: 1 },
    },
    transparent: true,
  });
  material.userData.baseOpacity = 1;
  return material;
}

/** Build a centered body. Its parent owns placement, orbit and focus transforms. */
export function createPlanetVisual(object) {
  const radius = Math.max(0.01, Number(object.size) || 0.45);
  const group = new THREE.Group();
  group.name = 'planet-' + object.id;
  const definition = PLANETS[object.id] || (object.bodyKind === 'star' ? PLANETS.sun : undefined);
  const axialTilt = new THREE.Group();
  const surface = new THREE.Group();
  axialTilt.rotation.z = THREE.MathUtils.degToRad(definition?.tilt ?? seedFor(object.id) * 28);
  axialTilt.add(surface);
  group.add(axialTilt);
  group.userData.surface = surface;
  group.userData.radius = radius;
  group.userData.visualRadius = object.id === 'saturn' ? radius * 2.32 : radius * 1.04;
  group.userData.illustrative = !PLANETS[object.id];

  let material;
  if (!definition) {
    material = exoplanetMaterial(object);
  } else if (object.id === 'sun' || object.bodyKind === 'star') {
    material = new THREE.MeshBasicMaterial({ map: texture(definition.map), toneMapped: false });
  } else {
    const map = texture(definition.map);
    material = new THREE.MeshStandardMaterial({
      map,
      roughness: object.id === 'earth' ? 0.83 : 1,
      metalness: 0,
      emissive: '#ffffff',
      emissiveMap: map,
      emissiveIntensity: object.id === 'earth' ? 0.11 : 0.14,
      ...(definition.bump ? { bumpMap: map, bumpScale: radius * definition.bump } : {}),
    });
  }
  material.userData.baseOpacity = 1;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), material);
  mesh.name = 'planet-surface';
  surface.add(mesh);
  // Start on a recognizable longitude, with the Americas facing the default camera.
  if (object.id === 'earth') surface.rotation.y = -0.3;

  if (object.id === 'earth') {
    const cloudMap = texture('2k_earth_clouds.jpg', false);
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      alphaMap: cloudMap,
      transparent: true,
      opacity: 0.65,
      roughness: 1,
      depthWrite: false,
      emissive: '#ffffff',
      emissiveIntensity: 0.12,
    });
    cloudMaterial.userData.baseOpacity = 0.65;
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.009, 72, 48), cloudMaterial);
    clouds.name = 'earth-clouds';
    surface.add(clouds);
    group.userData.clouds = clouds;
  }
  if (object.id === 'saturn') axialTilt.add(saturnRings(radius));

  if (definition?.glow) {
    const sun = object.id === 'sun' || object.bodyKind === 'star';
    const weak = object.id === 'mars' || object.id === 'jupiter' || object.id === 'saturn';
    group.add(atmosphere(radius, definition.glow, sun ? 0.45 : weak ? 0.15 : 0.36, sun ? 1.09 : 1.027));
  }
  return group;
}

/** Textures are shared across scale changes. Dispose only when the atlas closes. */
export function disposePlanetTextures() {
  for (const map of textures.values()) map.dispose();
  textures.clear();
}
