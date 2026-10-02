import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { solarObservation, solarObservationProjection, createSolarPhotosphere, solarPhotosphereAppearance } from '../src/solar-photosphere.js';
import { appearanceInformation } from '../src/appearance-info.js';
import { setLanguage } from '../src/i18n.js';

test('HMI observation and derived image match pinned archive and processing checksums', () => {
  for (const [file, hash] of [[solarObservation.referenceMap, solarObservation.sourceSha256], [solarObservation.map, solarObservation.mapSha256]]) {
    const bytes = readFileSync(new URL('../public/textures/' + file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  }
  assert.match(solarObservation.assetUrl, /2026\/09\/21\/20260921_151038_1024_HMII\.jpg$/);
  assert.equal(solarObservation.observationDateUtc, '2026-09-21T15:10:38Z');
});

test('a single disk observation covers only its front hemisphere, never mirrored spots on the back', () => {
  assert.deepEqual(solarObservationProjection([0,0,3]), {uv:[.5,.5],covered:true});
  for (const x of [-.8,0,.8]) for (const y of [-.2,0,.2]) {
    const z = Math.sqrt(1 - x*x - y*y);
    const front = solarObservationProjection([x,y,z]);
    const back = solarObservationProjection([x,y,-z]);
    assert.equal(front.covered, true);
    assert.deepEqual(front.uv, back.uv);
    assert.equal(back.covered, false);
    assert.ok(front.uv.every(value => value > 0 && value < 1));
  }
  assert.equal(solarObservationProjection([1,0,0]).covered, false);
  assert.equal(solarObservationProjection([.98,0,.1]).covered, false);
});

test('solar texture loading and a failed image keep the neutral photosphere fallback available', () => {
  const map = new THREE.Texture(); const material = createSolarPhotosphere(map);
  try {
    material.onBeforeRender(); assert.equal(material.uniforms.uObservationReady.value, 0);
    map.image = {width:1024,height:1024}; material.onBeforeRender();
    assert.equal(material.uniforms.uObservationReady.value, 1);
    assert.equal(material.uniforms.uSolarObservation.value, map);
    assert.equal(material.uniforms.uOpacity.value, 1);
    assert.equal(material.userData.baseOpacity, 1);
    map.image = {width:0,height:0}; material.onBeforeRender();
    assert.equal(material.uniforms.uObservationReady.value, 0);
    assert.equal(material.toneMapped, false);
    assert.equal(solarPhotosphereAppearance().classification, 'observed');
  } finally { material.dispose(); map.dispose(); }
});

test('object details link to the exact reviewed NASA photograph in either language without an image overlay', () => {
  try {
    setLanguage('en'); const english = appearanceInformation({id:'janus',bodyKind:'moon'}, true);
    assert.match(english, /NASA reference photograph/);
    assert.match(english, /PIA14607/);
    assert.doesNotMatch(english, /<img/);
    setLanguage('it'); const italian = appearanceInformation({id:'sun',bodyKind:'star'}, true);
    assert.match(italian, /Fotografia NASA di riferimento/);
    assert.match(italian, /20260921_151038_1024_HMII/);
    assert.doesNotMatch(italian, /<img/);
  } finally { setLanguage('en'); }
});
