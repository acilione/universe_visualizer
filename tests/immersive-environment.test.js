import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createImmersiveEnvironment, supportsPassthroughDimming } from '../src/immersive-environment.js';
import { equatorialVector } from '../src/sky-math.js';

const catalogue = {
  stars: [
    {id:'east',name:'Measured east',bodyKind:'catalog-star',raDeg:0,decDeg:0,mag:1,colorIndex:.4},
    {id:'front',name:'Measured front',bodyKind:'catalog-star',raDeg:90,decDeg:0,mag:2,colorIndex:1.1},
    {id:'north',name:'Measured north',bodyKind:'catalog-star',raDeg:30,decDeg:90,mag:4},
    {id:'south',name:'Measured south',bodyKind:'catalog-star',raDeg:220,decDeg:-90,mag:6},
    {id:'unknown',bodyKind:'catalog-star',raDeg:null,decDeg:2,mag:1},
  ],
  nebulae: [
    {id:'nebula',bodyKind:'nebula',raDeg:180,decDeg:15,angularSizeArcmin:80},
    {id:'no-extent',bodyKind:'nebula',raDeg:215,decDeg:-20,angularSizeArcmin:null},
    {id:'invalid',bodyKind:'nebula',raDeg:45,decDeg:91,angularSizeArcmin:2},
  ],
};
function setup(options = {}) {
  const scene = new THREE.Scene(), environment = createImmersiveEnvironment({parent:scene});
  environment.setCatalogue(catalogue); environment.configure({active:true,...options});
  environment.update(.1,new THREE.Vector3(0,1.6,0));
  return {scene,environment};
}
function settle(environment) { for (let i=0;i<120;i++) environment.update(.1); }

test('only observed directions enter the surrounding sky, without mutating catalogue records',()=>{
  const before = structuredClone(catalogue), {environment} = setup();
  const points = environment.group.getObjectByName('immersive-catalogue-background');
  for (let index=0;index<4;index++) {
    const object = catalogue.stars[index], actual = new THREE.Vector3().fromBufferAttribute(points.geometry.attributes.position,index).normalize();
    const expected = new THREE.Vector3(...equatorialVector(object.raDeg,object.decDeg));
    assert.ok(actual.distanceTo(expected)<1e-6);
  }
  assert.equal(environment.diagnostics.starCount,4);
  assert.equal(environment.diagnostics.nebulaCount,2);
  assert.equal(environment.diagnostics.nebulaPatchCount,1);
  assert.deepEqual(catalogue,before);
  assert.equal(environment.objects.some(object=>object.id==='unknown'||object.id==='invalid'),false);
  assert.ok(environment.objects.every(object=>object.positionKind==='sky-projection'&&object.environmentReference));
  environment.dispose();
});

test('passthrough attenuation requires reported alpha blend and preserves a visible room',()=>{
  assert.equal(supportsPassthroughDimming({mode:'mr',blendMode:'alpha-blend'}),true);
  for (const mode of ['vr','desktop']) assert.equal(supportsPassthroughDimming({mode,blendMode:'alpha-blend'}),false);
  for (const blendMode of ['opaque','additive',undefined]) assert.equal(supportsPassthroughDimming({mode:'mr',blendMode}),false);
  const {environment} = setup({mode:'mr',blendMode:'alpha-blend',dim:.58});
  assert.ok(environment.diagnostics.effectiveDim>0&&environment.diagnostics.effectiveDim<.58);
  settle(environment); assert.ok(Math.abs(environment.diagnostics.effectiveDim-.58)<1e-6);
  environment.configure({dim:50}); settle(environment); assert.ok(environment.diagnostics.effectiveDim<=.8);
  environment.configure({blendMode:'additive'});
  assert.equal(environment.diagnostics.effectiveDim,0);
  assert.equal(environment.group.getObjectByName('immersive-passthrough-dimmer').visible,false);
  environment.configure({blendMode:'alpha-blend',dim:0}); settle(environment);
  assert.equal(environment.diagnostics.effectiveDim,0);
  environment.dispose();
});

test('hand rays still select the same catalogue star after the observer walks',()=>{
  const {scene,environment} = setup(), raycaster = new THREE.Raycaster();
  for (const position of [new THREE.Vector3(0,1.6,0),new THREE.Vector3(8,2.2,-4)]) {
    environment.update(.1,position); scene.updateMatrixWorld(true);
    raycaster.set(position,new THREE.Vector3(0,0,-1));
    const hits = raycaster.intersectObjects(environment.targets,false);
    assert.equal(hits[0]?.dataObject.id,'front');
    assert.ok(Math.abs(hits[0].distance-environment.radius)<.3);
    assert.ok(hits[0].object.userData.pickStats.candidates<=catalogue.stars.length);
  }
  environment.configure({stars:false});
  assert.equal(raycaster.intersectObjects(environment.targets,false).length,0);
  environment.dispose();
});

test('layer controls hide sky content without removing the MR room dimming',()=>{
  const {environment} = setup({mode:'mr',blendMode:'alpha-blend'}); settle(environment);
  environment.configure({stars:false,nebulae:false});
  assert.equal(environment.diagnostics.renderedStarCount,0);
  assert.equal(environment.diagnostics.drawCalls,1);
  environment.configure({stars:true,nebulae:true,skyVisible:false});
  assert.equal(environment.diagnostics.drawCalls,1);
  environment.configure({skyVisible:true});
  assert.equal(environment.diagnostics.drawCalls,4);
  environment.configure({active:false});
  assert.equal(environment.diagnostics.effectiveDim,0);
  assert.equal(environment.group.visible,false);
  assert.equal(environment.diagnostics.drawCalls,0);
  environment.dispose();
});

test('bounded catalogue batches replace resources and release them on repeated disposal',()=>{
  const {environment} = setup();
  let geometries=0,materials=0;
  function watch() { for (const object of environment.group.children) {object.geometry.addEventListener('dispose',()=>geometries++);object.material.addEventListener('dispose',()=>materials++);} }
  watch(); environment.setCatalogue({stars:[],nebulae:[]});
  assert.equal(geometries,3);assert.equal(materials,3);
  // The retained dimmer is already watched; count the three replacement batches.
  for (const object of environment.group.children.filter(object=>object.name!=='immersive-passthrough-dimmer')) {object.geometry.addEventListener('dispose',()=>geometries++);object.material.addEventListener('dispose',()=>materials++);}
  environment.dispose();environment.dispose();environment.configure({active:true});
  assert.equal(geometries,7);assert.equal(materials,7);
  assert.equal(environment.group.parent,null);assert.deepEqual(environment.targets,[]);
  assert.equal(environment.diagnostics.active,false);
});

test('invalid tracking or delta time cannot poison dimming and catalogue coordinates',()=>{
  const {environment} = setup({mode:'mr',blendMode:'alpha-blend'});
  const prior=environment.diagnostics;
  environment.configure({dim:NaN,pixelRatio:Infinity});
  environment.update(NaN,new THREE.Vector3(Infinity,NaN,0));
  environment.update(-3);environment.update(Infinity);
  assert.equal(environment.diagnostics.effectiveDim,prior.effectiveDim);
  assert.deepEqual(environment.diagnostics.viewer,prior.viewer);
  assert.ok(environment.group.position.toArray().every(Number.isFinite));
  environment.dispose();
});


test('close-up atmosphere stays fixed in the room while the observer walks',()=>{
  const {scene,environment} = setup({nearField:true});
  const field = scene.getObjectByName('immersive-local-field');
  const initial=field.position.clone(), scale=field.scale.clone();
  environment.update(.1,new THREE.Vector3(3,1.8,2));
  assert.deepEqual(field.position.toArray(),initial.toArray());
  assert.deepEqual(field.scale.toArray(),scale.toArray());
  assert.equal(environment.diagnostics.nearFieldActive,true);
  assert.equal(field.getObjectByName('immersive-holographic-effects').children.filter(object=>object.visible).length,2);
  environment.configure({nearField:false});
  assert.equal(field.getObjectByName('immersive-holographic-effects').visible,false);
  environment.configure({nearField:true});environment.update(.1,new THREE.Vector3(3,1.8,2));
  assert.deepEqual(field.position.toArray(),[3,1.8,2]);
  environment.dispose();assert.equal(field.parent,null);
});

test('reusing a loaded catalogue retains buffers and spatial picking index',()=>{
  const {environment}=setup();
  const points=environment.targets[0], geometry=points.geometry, index=points.userData.pickStats;
  environment.setCatalogue(catalogue);
  assert.equal(environment.targets[0],points);
  assert.equal(environment.targets[0].geometry,geometry);
  assert.equal(environment.targets[0].userData.pickStats,index);
  environment.dispose();
});


test('reduced motion applies room dimming and sky visibility without an animated fade',()=>{
  const {environment}=setup({mode:'mr',blendMode:'alpha-blend',dim:.56});
  environment.configure({reducedMotion:true});
  const material=environment.group.getObjectByName('immersive-catalogue-background').material;
  assert.equal(environment.diagnostics.effectiveDim,.56);
  assert.equal(material.uniforms.uSkyOpacity.value,1);
  environment.reveal();environment.update(.1);settle(environment);
  assert.equal(environment.diagnostics.effectiveDim,.56);
  assert.equal(material.uniforms.uSkyOpacity.value,1);
  environment.dispose();
});
