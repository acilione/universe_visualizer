import * as THREE from 'three';
import officialSurfaces from './official-surfaces.json' with { type: 'json' };
import { solarObservation, solarPhotosphereAppearance, createSolarPhotosphere } from './solar-photosphere.js';
import { BODY_SHAPES, BODY_SHAPE_SOURCE, bodyShapeScale, SATURN_RINGS, URANUS_RINGS, SATURN_RING_SOURCE, URANUS_RING_SOURCE } from './body-shape-data.js';

// Legacy maps remain clearly identified fallbacks, never described as official
// observations. Prefer local, provenance-tracked spacecraft products below.
const FALLBACK_MAPS = {
  mercury: '2k_mercury.jpg', venus: '2k_venus_atmosphere.jpg',
  earth: '2k_earth_daymap.jpg', moon: '2k_moon.jpg', mars: '2k_mars.jpg',
  jupiter: '2k_jupiter.jpg', saturn: '2k_saturn.jpg',
};
const ATMOSPHERES = {
  venus: ['#e3e0d8', .10, 1.012], earth: ['#77baff', .42, 1.018],
  mars: ['#d8b19a', .085, 1.009], jupiter: ['#ded3bd', .10, 1.008],
  saturn: ['#e1d6bc', .10, 1.009], uranus: ['#bbdedb', .16, 1.012],
  neptune: ['#afd1df', .16, 1.012], titan: ['#a1b6d2', .18, 1.038],
};
const NEUTRAL_COLORS = { uranus: '#b9d6d5', neptune: '#a9c7d4', titan: '#c8a574' };
const textures = new Map();
const models = new Map();
const modelRequests = new Set();
const loader = new THREE.TextureLoader();

function texture(file, color = true, flipY = true) {
  const key = file + (color ? ':srgb' : ':linear') + (flipY ? ':flip' : ':raw');
  if (!textures.has(key)) {
    // Node tests use a texture placeholder without a fake DOM or network.
    const map = typeof document === 'undefined' ? new THREE.Texture() : loader.load(`${import.meta.env?.BASE_URL || '/'}textures/${file}`);
    map.name = file;
    map.flipY = flipY;
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

/** Public provenance for the appearance actually used by the renderer. */
export function getBodyAppearance(object) {
  const observed = officialSurfaces[object.id];
  const shape = BODY_SHAPES[object.id];
  const base = {
    shape: shape ? 'reference-ellipsoid' : 'sphere',
    shapeSource: shape ? BODY_SHAPE_SOURCE : null,
    radiiKm: shape?.radiiKm || null,
    shapeNote: shape ? 'NASA/JPL reference ellipsoid; terrain relief is not modelled. Orientation and body sizes are schematic.' : 'Display sphere; shape is not resolved.',
    shapeNoteIt: shape ? 'Ellissoide di riferimento NASA/JPL; rilievo del terreno non modellato. Orientamento e dimensioni dei corpi schematici.' : 'Sfera di visualizzazione; forma non risolta.',
  };
  if (object.id === 'sun') return { ...base, ...solarPhotosphereAppearance() };
  if (object.bodyKind === 'star') return {
    ...base, kind: 'illustrative-photosphere', classification: 'illustrative',
    sourceUrl: 'https://science.nasa.gov/sun/facts/', credit: 'Photosphere shading model',
    band: 'Visible-light approximation', bandIt: 'Approssimazione della luce visibile',
    note: 'Unresolved stellar photosphere. Colour uses measured stellar temperature when available, otherwise neutral white; surface detail is illustrative.',
    noteIt: 'Fotosfera stellare non risolta. Colore dalla temperatura stellare misurata, se disponibile, altrimenti bianco neutro; dettagli illustrativi.',
  };
  if ((observed?.map || observed?.model) && (object.id !== 'titan' || observed.kind === 'cloud-reconstruction')) return {
    ...base, ...observed, classification: observed.kind === 'observed-mosaic' ? 'observed' : 'reconstructed',
    ...(observed.ringMap ? { ringCredit: observed.ringMapCredit, ringSourceUrl: observed.ringMapSourceUrl, ringNote: observed.ringMapNote, ringNoteIt: observed.ringMapNoteIt } : {}),
    ...(observed.bumpMap ? {
      shapeNote: 'NASA/JPL reference ellipsoid with surface-normal shading from documented elevation data at its physical scale; the silhouette stays an ellipsoid. Orientation and display size are schematic.',
      shapeNoteIt: 'Ellissoide di riferimento NASA/JPL con ombreggiatura delle normali da dati altimetrici alla scala fisica; il profilo resta ellissoidale. Orientamento e dimensioni visuali schematici.',
    } : {}),
    ...(observed.model ? {
      shape: observed.kind === 'measured-shape' ? 'measured-3d-model' : 'official-3d-model', shapeSource: observed.sourceUrl,
      shapeNote: observed.kind === 'measured-shape' ? observed.shapeNote || 'Observation-derived shape mesh archived by NASA PDS, scaled to the displayed body radius. Surface tone is approximate; a reference ellipsoid is shown while the mesh loads.' : 'NASA 3D visualization geometry and original texture coordinates; scaled to the displayed body radius. A reference ellipsoid is shown while the model loads. This is not a calibrated terrain-elevation product.',
      shapeNoteIt: observed.kind === 'measured-shape' ? observed.shapeNoteIt || 'Forma 3D da osservazioni archiviata nel NASA PDS, scalata al raggio visualizzato. Colore superficiale approssimativo; ellissoide di riferimento durante il caricamento.' : 'Geometria di visualizzazione 3D NASA con coordinate texture originali, scalata al raggio visualizzato. Durante il caricamento viene mostrato un ellissoide di riferimento. Non è un prodotto altimetrico calibrato.',
    } : {}),
  };
  if (object.id === 'titan') return {
    ...base, kind: 'haze-model', classification: 'reconstructed', sourceUrl: 'https://science.nasa.gov/resource/highlighting-titans-hazes/',
    credit: 'Visible-light haze model informed by NASA/JPL-Caltech/Space Science Institute Cassini observations',
    band: 'Visible light', bandIt: 'Luce visibile',
    note: 'Opaque orange atmospheric haze obscures the surface in visible light. This model does not present radar or infrared terrain as natural colour.',
    noteIt: 'La foschia atmosferica arancione nasconde la superficie nella luce visibile. Il modello non presenta terreno radar o infrarosso come colore naturale.',
  };
  if (object.id === 'uranus' || object.id === 'neptune') return {
    ...base, kind: 'cloud-reconstruction', classification: 'reconstructed', sourceUrl: 'https://science.nasa.gov/asset/hubble/the-colorful-lives-of-the-outer-planets/',
    credit: 'Atmospheric colour approximation informed by NASA/ESA/Erich Karkoschka (University of Arizona)',
    band: 'Visible-light approximation', bandIt: 'Approssimazione della luce visibile',
    note: 'Muted blue-green atmospheric colour informed by natural-colour Hubble observations. This is a smooth cloud model, not a resolved global weather map.',
    noteIt: 'Colore atmosferico blu-verde tenue basato su osservazioni Hubble a colori naturali. Modello liscio delle nubi, non una mappa meteorologica globale risolta.',
  };
  if (FALLBACK_MAPS[object.id]) return {
    ...base, kind: 'legacy-reconstruction', classification: 'reconstructed', map: FALLBACK_MAPS[object.id],
    sourceUrl: 'https://www.solarsystemscope.com/textures/', credit: 'Solar System Scope / INOVE, CC BY 4.0',
    band: 'Visual reconstruction', bandIt: 'Ricostruzione visiva',
    note: 'Reconstructed global texture. Brightness is not interpreted as elevation; no invented terrain displacement is applied.',
    noteIt: 'Texture globale ricostruita. La luminosità non viene interpretata come quota; nessun rilievo inventato applicato.',
  };
  return {
    ...base, kind: object.bodyKind === 'moon' ? 'unmapped-body' : 'illustrative-exoplanet', classification: 'illustrative',
    sourceUrl: shape ? BODY_SHAPE_SOURCE : object.source || null,
    credit: shape ? 'NASA/JPL NAIF reference ellipsoid; approximate surface tone' : 'Illustrative rendering',
    band: 'Appearance unresolved in this model', bandIt: 'Aspetto non risolto in questo modello',
    note: object.bodyKind === 'moon' ? 'No verified global albedo map is available in this model. A plain diffuse surface avoids inventing craters or geographic features.' : 'No resolved surface photograph is available in this catalogue. Colours, clouds and surface patterns are illustrative.',
    noteIt: object.bodyKind === 'moon' ? 'Nessuna mappa globale di albedo verificata disponibile in questo modello. Superficie opaca uniforme, senza crateri o dettagli geografici inventati.' : 'Nessuna fotografia risolta della superficie disponibile nel catalogo. Colori, nubi e dettagli della superficie sono illustrativi.',
  };
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
  uniform vec3 uLightDirection;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vEye;
  void main() {
    vec3 N = normalize(vNormal), V = normalize(vEye);
    vec3 L = normalize((viewMatrix * vec4(uLightDirection, 0.0)).xyz);
    float edge = 1.0 - max(dot(N, V), 0.0);
    float day = smoothstep(-0.10, 0.30, dot(N, L));
    float rim = pow(edge, 3.5) * day;
    gl_FragColor = vec4(uColor, rim * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function ellipsoidGeometry(radius, id, segments = 80) {
  const geometry = new THREE.SphereGeometry(radius, segments, segments / 2);
  geometry.scale(...bodyShapeScale(id));
  geometry.computeBoundingSphere();
  return geometry;
}

function atmosphere(radius, id, color, opacity, extent) {
  const material = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex, fragmentShader: atmosphereFragment,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uLightDirection: { value: new THREE.Vector3(-1, .2, .5).normalize() } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  material.userData.baseOpacity = opacity;
  const rim = new THREE.Mesh(ellipsoidGeometry(radius * extent, id, 64), material);
  rim.name = 'atmosphere';
  rim.renderOrder = 2;
  return rim;
}

const ringVertex = `
  uniform vec3 uLightDirection;
  varying vec3 vRingPosition;
  varying vec3 vLocalLight;
  void main() {
    vRingPosition = position;
    vLocalLight = vec3(dot(uLightDirection, normalize(modelMatrix[0].xyz)), dot(uLightDirection, normalize(modelMatrix[1].xyz)), dot(uLightDirection, normalize(modelMatrix[2].xyz)));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ringFragment = `
  #ifdef USE_RING_MAP
    uniform sampler2D uRingMap;
    uniform vec2 uRingMapBounds;
  #endif
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRadius;
  uniform float uPolarRatio;
  varying vec3 vRingPosition;
  varying vec3 vLocalLight;
  void main() {
    vec3 L = normalize(vLocalLight);
    // Ray to the star against the oblate planet; no shadow map per satellite.
    vec3 P = vRingPosition / uRadius;
    vec3 D = L;
    P.z /= uPolarRatio;
    D.z /= uPolarRatio;
    float a = dot(D,D), b = dot(P,D), c = dot(P,P) - 1.0;
    float discriminant = b*b - a*c;
    float shadow = (b < 0.0 && discriminant > 0.0) ? 1.0 : 0.0;
    float light = 0.018 + 0.98 * abs(L.z) * (1.0 - shadow);
    vec4 ringColor = vec4(uColor, 1.0);
    #ifdef USE_RING_MAP
      float radialUV = (length(vRingPosition.xy) - uRingMapBounds.x) / (uRingMapBounds.y - uRingMapBounds.x);
      ringColor *= texture2D(uRingMap, vec2(radialUV, 0.5));
    #endif
    gl_FragColor = vec4(ringColor.rgb * light, ringColor.a * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function ringMesh(radius, id, innerKm, outerKm, color, opacity, name) {
  const equatorialKm = BODY_SHAPES[id].radiiKm[0];
  const source = id === 'saturn' ? officialSurfaces.saturn : null;
  const mapped = Boolean(source?.ringMap && Number.isFinite(source.ringMapInnerKm) && Number.isFinite(source.ringMapOuterKm));
  const map = mapped ? texture(source.ringMap, true, false) : null;
  if (map) map.wrapS = THREE.ClampToEdgeWrapping;
  const material = new THREE.ShaderMaterial({
    vertexShader: ringVertex, fragmentShader: ringFragment,
    defines: mapped ? { USE_RING_MAP: 1 } : {},
    uniforms: {
      uColor: { value: new THREE.Color(mapped ? '#ffffff' : color) }, uOpacity: { value: mapped ? 1 : opacity },
      ...(mapped ? {
        uRingMap: { value: map },
        uRingMapBounds: { value: new THREE.Vector2(radius * source.ringMapInnerKm / equatorialKm, radius * source.ringMapOuterKm / equatorialKm) },
      } : {}),
      uRadius: { value: radius }, uPolarRatio: { value: BODY_SHAPES[id].radiiKm[2] / equatorialKm },
      uLightDirection: { value: new THREE.Vector3(-1, .2, .5).normalize() },
    },
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
  });
  material.userData.baseOpacity = mapped ? 1 : opacity;
  material.userData.ringSource = mapped ? source.ringMapSourceUrl || source.sourceUrl : null;
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * innerKm / equatorialKm, radius * outerKm / equatorialKm, 256, 1), material);
  ring.name = name;
  ring.rotation.x = -Math.PI / 2;
  ring.userData.radialBoundsKm = [innerKm, outerKm];
  return ring;
}

function planetaryRings(radius, id) {
  const group = new THREE.Group();
  group.name = `${id}-rings`;
  group.userData.sourceUrl = id === 'saturn' ? SATURN_RING_SOURCE : URANUS_RING_SOURCE;
  if (id === 'saturn') {
    for (const ring of SATURN_RINGS) group.add(ringMesh(radius, id, ring.innerKm, ring.outerKm, ring.color, ring.opacity, `saturn-ring-${ring.name}`));
    const source = officialSurfaces.saturn;
    if (source?.ringMap && source.ringMapInnerKm < SATURN_RINGS[0].innerKm) group.add(ringMesh(radius, id, source.ringMapInnerKm, SATURN_RINGS[0].innerKm, '#ffffff', 1, 'saturn-ring-inner-fringe'));
    if (source?.ringMap && source.ringMapOuterKm > SATURN_RINGS.at(-1).outerKm) group.add(ringMesh(radius, id, SATURN_RINGS.at(-1).outerKm, source.ringMapOuterKm, '#ffffff', 1, 'saturn-ring-F-region'));
  } else {
    for (const ring of URANUS_RINGS) group.add(ringMesh(radius, id, ring.radiusKm - ring.widthKm / 2, ring.radiusKm + ring.widthKm / 2, '#514d47', .55, `uranus-ring-${ring.name}`));
  }
  return group;
}

// Analytic attenuation by the measured main rings. This avoids a point-light
// shadow cubemap for every object while preserving shadows during XR transforms.
function addSaturnRingShadow(material, radius) {
  const equatorialKm = BODY_SHAPES.saturn.radiiKm[0];
  const bands = SATURN_RINGS.map(ring => ({ inner: ring.innerKm / equatorialKm, outer: ring.outerKm / equatorialKm, opacity: ring.opacity }));
  const source = officialSurfaces.saturn;
  const mapped = Boolean(source?.ringMap && Number.isFinite(source.ringMapInnerKm) && Number.isFinite(source.ringMapOuterKm));
  material.uniforms = { uLightDirection: { value: new THREE.Vector3(-1, .2, .5).normalize() } };
  material.onBeforeCompile = shader => {
    shader.uniforms.uRingShadowLight = material.uniforms.uLightDirection;
    shader.uniforms.uPlanetRadius = { value: radius };
    if (mapped) {
      shader.uniforms.uSaturnRingMap = { value: texture(source.ringMap, true, false) };
      shader.uniforms.uSaturnRingBounds = { value: new THREE.Vector2(source.ringMapInnerKm / equatorialKm, source.ringMapOuterKm / equatorialKm) };
    }
    const declarations = `uniform vec3 uRingShadowLight;
      uniform float uPlanetRadius;
      varying vec3 vRingShadowPosition;
      varying vec3 vRingShadowDirection;\n`;
    shader.vertexShader = declarations + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vRingShadowPosition = transformed / uPlanetRadius;
      vRingShadowDirection = vec3(dot(uRingShadowLight, normalize(modelMatrix[0].xyz)), dot(uRingShadowLight, normalize(modelMatrix[1].xyz)), dot(uRingShadowLight, normalize(modelMatrix[2].xyz)));`);
    shader.fragmentShader = declarations + (mapped ? 'uniform sampler2D uSaturnRingMap;\nuniform vec2 uSaturnRingBounds;\n' : '') + shader.fragmentShader;
    const opacityBands = mapped ? `float ringUV = (ringDistance - uSaturnRingBounds.x) / (uSaturnRingBounds.y - uSaturnRingBounds.x);
      if (ringUV >= 0.0 && ringUV <= 1.0) ringOpacity = texture2D(uSaturnRingMap, vec2(ringUV, 0.5)).a;` : bands.map(ring => `if (ringDistance >= ${ring.inner.toFixed(9)} && ringDistance <= ${ring.outer.toFixed(9)}) ringOpacity = ${ring.opacity.toFixed(6)};`).join('\n');
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      vec3 ringRay = normalize(vRingShadowDirection);
      float ringTransmission = 1.0;
      if (abs(ringRay.y) > 0.0001) {
        float ringT = -vRingShadowPosition.y / ringRay.y;
        if (ringT > 0.0) {
          float ringDistance = length((vRingShadowPosition + ringT * ringRay).xz);
          float ringOpacity = 0.0;
          ${opacityBands}
          ringTransmission = pow(1.0 - ringOpacity, 1.0 / max(abs(ringRay.y), 0.03));
        }
      }
      reflectedLight.directDiffuse *= ringTransmission;
      reflectedLight.directSpecular *= ringTransmission;`);
  };
  material.customProgramCacheKey = () => mapped ? 'nasa-saturn-ring-shadow-map-v2' : 'nasa-saturn-ring-shadow-v1';
}

// NASA's educational Neptune map has enhanced blue colour. Replace only its
// display hue, preserving the source's relative linear-light luminance details.
// The target is a restrained approximation informed by natural-colour Hubble
// observations, NOT a spectrally calibrated recolouring. 0.31362255 is the mean
// linear Rec.709 luminance of the bundled source map (documented in the manifest).
function addNeptuneDisplayHue(material) {
  material.userData.colorAdjustment = 'pale-blue-green-approximation';
  material.onBeforeCompile = shader => {
    shader.uniforms.uNeptuneDisplayHue = { value: new THREE.Color('#adc9d1') };
    shader.fragmentShader = 'uniform vec3 uNeptuneDisplayHue;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float neptuneLuminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = uNeptuneDisplayHue * (neptuneLuminance / 0.31362255);`);
  };
  material.customProgramCacheKey = () => 'nasa-neptune-display-hue-v1';
}

// NASA PIA23791 describes mostly white sulfuric-acid clouds. The existing
// visualization map supplies only a subdued cloud pattern; this display colour
// adjustment does not turn its orange/UV-derived pattern into calibrated RGB.
function addVenusDisplayClouds(material) {
  material.userData.colorAdjustment = 'pale-cloud-visible-approximation';
  material.onBeforeCompile = shader => {
    shader.uniforms.uVenusDisplayHue = { value: new THREE.Color('#e7e3da') };
    shader.fragmentShader = 'uniform vec3 uVenusDisplayHue;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float venusLuminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      // Mean linear-sRGB luminance of the unmodified NASA visualization map.
      float venusCloudContrast = mix(1.0, venusLuminance / 0.80537588, 0.15);
      diffuseColor.rgb = uVenusDisplayHue * venusCloudContrast;`);
  };
  material.customProgramCacheKey = () => 'nasa-venus-visible-clouds-v1';
}

// A photosphere is luminous, with limb darkening. This small-scale modulation is
// explicitly illustrative granulation, never a fabricated observation/sunspot map.
function stellarMaterial(object) {
  const temperature = object.id === 'sun' ? 5772 : Number(object.stellarTemperatureK ?? object.effectiveTemperatureK);
  const color = stellarColor(temperature);
  const material = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vNormal; varying vec3 vEye; varying vec3 vPosition;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vEye=-p.xyz; vPosition=normalize(position); gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vNormal; varying vec3 vEye; varying vec3 vPosition;
      void main(){float mu=max(dot(normalize(vNormal),normalize(vEye)),0.0); float limb=.42+.58*mu; float grain=.99+.01*sin(vPosition.x*380.0)*sin(vPosition.z*420.0); gl_FragColor=vec4(uColor*limb*grain,uOpacity);
      #include <colorspace_fragment>
      }`,
    uniforms: { uColor: { value: color }, uOpacity: { value: 1 } }, toneMapped: false,
  });
  material.userData.baseOpacity = 1;
  material.userData.temperatureK = Number.isFinite(temperature) && temperature > 0 ? temperature : null;
  return material;
}

/** Approximate display colour only; never feed planetary equilibrium temperature. */
export function stellarColor(temperatureK) {
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) return new THREE.Color('#ffffff');
  // Broad stellar colour bins, deliberately restrained (not a spectrophotometer).
  if (temperatureK < 3500) return new THREE.Color('#ffd0ad');
  if (temperatureK < 5000) return new THREE.Color('#ffe4c9');
  if (temperatureK < 6500) return new THREE.Color('#ffffff');
  if (temperatureK < 10000) return new THREE.Color('#e0e9ff');
  return new THREE.Color('#cbdcff');
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
  uniform float uRimStrength;
  uniform float uOpacity;
  uniform vec3 uLightDirection;
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
    vec3 L = normalize((viewMatrix * vec4(uLightDirection, 0.0)).xyz);
    float day = max(dot(N, L), 0.0);
    float light = 0.018 + 0.96 * day;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    color = color * light + uAccent * rim * uRimStrength * smoothstep(-0.08, 0.25, dot(N, L));
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
      uRimStrength: { value: 0.09 },
      uOpacity: { value: 1 },
      uLightDirection: { value: new THREE.Vector3(-1, .2, .5).normalize() },
    },
    transparent: true,
  });
  material.userData.baseOpacity = 1;
  return material;
}

/** Reconstruct the source mesh without changing its topology or UV mapping.
 * Models own their GPU geometry; only immutable downloaded JSON is shared.
 */
export function createOfficialBodyGeometry(data, radius = 1) {
  const { positions, normals, uvs, indices } = data;
  if (!Array.isArray(positions) || positions.length < 9 || positions.length % 3 || positions.length > 900000 || !positions.every(Number.isFinite)) throw new Error('Invalid body model positions');
  const count = positions.length / 3;
  if (!Array.isArray(uvs) || uvs.length !== count * 2 || !uvs.every(Number.isFinite)) throw new Error('Invalid body model texture coordinates');
  if (!Array.isArray(indices) || indices.length % 3 || indices.length < 3 || !indices.every(index => Number.isInteger(index) && index >= 0 && index < count)) throw new Error('Invalid body model indices');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  if (Array.isArray(normals) && normals.length === positions.length && normals.every(Number.isFinite)) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  geometry.center();
  geometry.computeBoundingSphere();
  const extent = geometry.boundingSphere.radius;
  if (!Number.isFinite(extent) || extent <= 0) { geometry.dispose(); throw new Error('Empty body model'); }
  geometry.scale(radius / extent, radius / extent, radius / extent);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function loadModel(file) {
  if (!models.has(file)) {
    const controller = new AbortController();
    modelRequests.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    const pending = fetch(`${import.meta.env?.BASE_URL || '/'}models/${file}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`Body model unavailable: ${response.status}`); return response.json(); })
      .catch(error => { models.delete(file); throw error; })
      .finally(() => { clearTimeout(timer); modelRequests.delete(controller); });
    models.set(file, pending);
  }
  return models.get(file);
}

function attachOfficialModel(group, mesh, appearance, radius) {
  group.userData.modelLoadStatus = 'ellipsoid';
  group.userData.modelReady = Promise.resolve(false);
  let disposed = false;
  group.userData.dispose = () => { disposed = true; };
  if (!appearance.model || typeof document === 'undefined') return;
  group.userData.modelLoadStatus = 'loading';
  group.userData.modelReady = loadModel(appearance.model).then(data => {
    if (disposed) return false;
    const geometry = createOfficialBodyGeometry(data, radius);
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    if (appearance.map) {
      mesh.material.map = texture(appearance.map, true, appearance.flipY !== false);
      mesh.material.color.set('#ffffff');
    }
    mesh.material.needsUpdate = true;
    group.userData.modelLoadStatus = 'ready';
    return true;
  }).catch(() => {
    // A missing asset must leave a usable, scientifically identified ellipsoid.
    group.userData.modelLoadStatus = disposed ? 'disposed' : 'fallback';
    return false;
  });
}

/** Build a centered body. Its parent owns placement, orbit and focus transforms. */
export function createPlanetVisual(object) {
  const radius = Math.max(0.01, Number(object.size) || 0.45);
  const moon = object.bodyKind === 'moon';
  const star = object.id === 'sun' || object.bodyKind === 'star';
  const shape = BODY_SHAPES[object.id];
  const appearance = getBodyAppearance(object);
  const group = new THREE.Group();
  group.name = 'planet-' + object.id;
  const axialTilt = new THREE.Group();
  axialTilt.name = 'body-axis';
  const surface = new THREE.Group();
  axialTilt.rotation.z = THREE.MathUtils.degToRad(shape?.tiltDeg || 0);
  axialTilt.add(surface);
  group.add(axialTilt);
  const atmosphereDefinition = ATMOSPHERES[object.id];
  Object.assign(group.userData, {
    bodyId: object.id, surface, radius, bodyRadius: radius,
    visualRadius: radius * (object.id === 'saturn' ? 2.34 : object.id === 'uranus' ? 2.01 : atmosphereDefinition?.[2] || 1),
    illustrative: appearance.classification === 'illustrative', appearance,
  });
  Object.assign(surface.userData, {
    rotationPeriodHours: shape?.rotationPeriodHours || null,
    tidallyLocked: shape?.tidallyLocked || false,
    // Moon orbits are static schematic phases: do not break their tidal locks.
    staticOrientation: moon || !shape,
  });

  let material;
  if (object.id === 'sun') material = createSolarPhotosphere(texture(solarObservation.map, false));
  else if (star) material = stellarMaterial(object);
  else if (!shape && !moon) material = exoplanetMaterial(object);
  else {
    const map = appearance.map && !appearance.model ? texture(appearance.map, true, appearance.flipY !== false) : null;
    material = new THREE.MeshStandardMaterial({
      map, color: map ? '#ffffff' : appearance.surfaceColor || NEUTRAL_COLORS[object.id] || object.color || '#aaa7a2',
      roughness: object.id === 'earth' ? .9 : 1, metalness: 0,
      emissive: '#000000', emissiveIntensity: 0,
    });
    // Only a documented elevation map can drive topographic shading. Physical
    // km-per-gray-range converts to display units, without relief exaggeration.
    if (appearance.bumpMap && Number.isFinite(appearance.bumpScaleKm) && shape) {
      material.bumpMap = texture(appearance.bumpMap, false, appearance.flipY !== false);
      material.bumpScale = radius * appearance.bumpScaleKm / Math.max(...shape.radiiKm);
      material.userData.reliefSource = appearance.bumpSourceUrl || appearance.sourceUrl;
      material.userData.reliefExaggeration = 1;
    }
    material.userData.surfaceSource = appearance.sourceUrl;
  }
  material.userData.baseOpacity = 1;
  if (object.id === 'saturn') addSaturnRingShadow(material, radius);
  if (object.id === 'neptune' && material.map) addNeptuneDisplayHue(material);
  if (object.id === 'venus' && material.map) addVenusDisplayClouds(material);
  const mesh = new THREE.Mesh(ellipsoidGeometry(radius, object.id, moon ? 64 : 96), material);
  mesh.name = 'planet-surface';
  surface.add(mesh);
  attachOfficialModel(group, mesh, appearance, radius);
  if (object.id === 'earth') surface.rotation.y = -.3;
  if (moon && shape?.tidallyLocked && Number.isFinite(object.phase)) surface.rotation.y = Math.PI - object.phase;

  // Clouds are a separate shell only when the surface source provides a matching
  // cloud-free image and a traceable cloud alpha map. Never double-bake clouds.
  if (object.id === 'earth' && officialSurfaces.earth?.cloudMap) {
    const cloudMap = texture(officialSurfaces.earth.cloudMap, false);
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff', alphaMap: cloudMap, transparent: true, opacity: .88,
      roughness: 1, depthWrite: false, emissive: '#000000', emissiveIntensity: 0,
    });
    cloudMaterial.userData.baseOpacity = .88;
    const clouds = new THREE.Mesh(ellipsoidGeometry(radius * 1.002, object.id, 72), cloudMaterial);
    clouds.name = 'earth-clouds';
    surface.add(clouds);
    group.userData.clouds = clouds;
  }
  if (object.id === 'saturn' || object.id === 'uranus') axialTilt.add(planetaryRings(radius, object.id));
  if (atmosphereDefinition) axialTilt.add(atmosphere(radius, object.id, ...atmosphereDefinition));
  group.userData.lightingMaterials = [];
  group.traverse(node => {
    if (node.material?.uniforms?.uLightDirection) group.userData.lightingMaterials.push(node.material);
  });
  return group;
}

/** Direction FROM body TOWARD the illuminating star, in world coordinates.
 * Root transforms must be applied by the caller. Camera/XR-eye changes are handled
 * in the shaders through viewMatrix; moving the viewer does not move the Sun.
 * Standard surfaces are illuminated by the scene's matching point/directional light.
 */
export function updatePlanetVisualLighting(visual, worldDirectionTowardStar) {
  if (!worldDirectionTowardStar || !Number.isFinite(worldDirectionTowardStar.lengthSq()) || worldDirectionTowardStar.lengthSq() < 1e-12) return;
  for (const material of visual.userData.lightingMaterials || []) material.uniforms.uLightDirection.value.copy(worldDirectionTowardStar).normalize();
}

/** Textures are shared across scale changes. Dispose only when the atlas closes. */
export function disposePlanetTextures() {
  for (const map of textures.values()) map.dispose();
  textures.clear();
  for (const controller of modelRequests) controller.abort();
  modelRequests.clear();
  models.clear();
}
