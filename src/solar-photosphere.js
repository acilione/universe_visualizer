import * as THREE from 'three';
import observation from './solar-observation.json' with { type: 'json' };

export const solarObservation = Object.freeze(observation);
export function solarPhotosphereAppearance() {
  return {
    ...observation, kind: 'observed-hemisphere', classification: 'observed',
    note: 'White visible-light photosphere with sunspots from the dated SDO/HMI observation of 21 September 2026. NASA\u2019s orange and gold solar images use assigned display colours. Exposure and limb darkening are modelled; this is not live solar activity.',
    noteIt: 'Fotosfera bianca in luce visibile con macchie solari dall\u2019osservazione SDO/HMI del 21 settembre 2026. Le immagini NASA arancioni e dorate usano colori di visualizzazione assegnati. Esposizione e oscuramento al bordo modellati; non sono dati solari in tempo reale.',
    shapeNote: 'Only the observed hemisphere carries measured image detail. The far side and cropped outer limb retain a smooth photosphere; no mirrored spots or invented active regions. Orientation is schematic.',
    shapeNoteIt: 'Solo l\u2019emisfero osservato contiene dettagli misurati. Il lato opposto e il bordo esterno escluso mantengono una fotosfera liscia, senza macchie duplicate o regioni attive inventate. Orientamento schematico.',
  };
}

/** Source-image orthographic coordinates are fixed to the Sun, not the camera. */
export function solarObservationProjection(position) {
  const direction = new THREE.Vector3(...position).normalize();
  const sourceRadius = Math.hypot(direction.x, direction.y);
  return {
    uv: [.5 + direction.x * observation.diskRadiusUv, .5 + direction.y * observation.diskRadiusUv],
    covered: direction.z > 0 && sourceRadius <= .96,
  };
}

export function createSolarPhotosphere(map) {
  const material = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vNormal; varying vec3 vEye; varying vec3 vSolarPosition;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vEye = -p.xyz;
        vSolarPosition = normalize(position);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `uniform sampler2D uSolarObservation; uniform float uDiskRadius;
      uniform float uOpacity; uniform float uObservationReady; varying vec3 vNormal; varying vec3 vEye; varying vec3 vSolarPosition;
      void main() {
        vec3 sourceDirection = normalize(vSolarPosition);
        vec2 sourceUv = vec2(0.5) + sourceDirection.xy * uDiskRadius;
        vec4 observed = texture2D(uSolarObservation, sourceUv);
        // A disk photo covers one hemisphere. Never repeat it on the far side.
        float coverage = uObservationReady * observed.a * smoothstep(0.28, 0.40, sourceDirection.z);
        float contrast = mix(1.0, observed.r * (255.0 / 128.0), coverage);
        float mu = max(dot(normalize(vNormal), normalize(vEye)), 0.0);
        float limb = 0.42 + 0.58 * mu;
        gl_FragColor = vec4(vec3(clamp(contrast * limb * 0.92, 0.0, 1.0)), uOpacity);
        #include <colorspace_fragment>
      }`,
    uniforms: { uSolarObservation: { value: map }, uDiskRadius: { value: observation.diskRadiusUv }, uOpacity: { value: 1 }, uObservationReady: { value: 0 } },
    toneMapped: false,
  });
  material.onBeforeRender = () => { material.uniforms.uObservationReady.value = map.image?.width > 0 ? 1 : 0; };
  material.name = 'Observed SDO HMI photosphere';
  material.userData.baseOpacity = 1;
  material.userData.temperatureK = 5772;
  material.userData.surfaceSource = observation.assetUrl;
  material.userData.observationDateUtc = observation.observationDateUtc;
  material.userData.coverage = 'observed hemisphere';
  return material;
}
