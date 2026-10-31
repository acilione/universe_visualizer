import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCombinedMap} from '../src/combined-map.js';
import {createImmersiveEnvironment} from '../src/immersive-environment.js';
import {consumeSteps} from '../src/cooperative.js';
const stars=Array.from({length:12000},(_,i)=>({id:'s'+i,name:'Star '+i,bodyKind:'catalog-star',raDeg:i*137.508%360,decDeg:Math.asin(i/6000-1)*180/Math.PI,mag:i/1200}));
const nebulae=[{id:'n1',bodyKind:'nebula',raDeg:83,decDeg:-5,angularSizeArcmin:100},{id:'n2',bodyKind:'nebula',raDeg:null,decDeg:null}];
const catalogue={stars,nebulae,byId:new Map([...stars,...nebulae].map(object=>[object.id,object]))};
const dispose=view=>{view.cancelLoading?.();view.group.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});};

test('cooperative tasks yield, report intermediate work and cancel before further writes',async()=>{
 let count=0,batches=0,cancelled=false;
 function* steps(){while(count<10){count++;yield;}return true;}
 const result=await consumeSteps(steps(),{budget:0,onBatch:()=>{batches++;if(count===3)cancelled=true;},cancelled:()=>cancelled});
 assert.equal(result,false);assert.equal(count,3);assert.equal(batches,3);
});

test('progressive sky retains every source in one star batch, respects layer changes and lazy selection',async()=>{
 const progress=[];
 const view=createCombinedMap({catalogue,progressive:true,quality:'high',onProgress:p=>progress.push(p)});
 try{
  const cloud=view.group.getObjectByName('combined-star-points');
  assert.equal(view.loading,true);assert.equal(cloud.geometry.drawRange.count,0);assert.equal(view.objects.length,0);
  const future=view.getObject('s11999');assert.ok(future.position);assert.equal(view.objects.length,0);
  view.setLayer('stars',false);view.setQuality('low',1.25);
  assert.equal(await view.ready,true);
  assert.equal(view.getObject('s11999'),future);
  assert.equal(view.objects.length,12001);assert.equal(view.byId.size,12002);
  assert.equal(view.context.renderedStarCount,12000);assert.equal(view.context.unplacedCounts.nebulae,1);
  assert.equal(cloud.geometry.drawRange.count,12000);assert.equal(view.layers.stars.visible,false);
  assert.equal(view.targets.length,3);assert.equal(view.group.getObjectsByProperty('name','combined-star-points').length,1);
  assert.equal(cloud.material.uniforms.uPixelRatio.value,1.25);
  assert.equal(view.group.getObjectByName('combined-nebula-patches').userData.segments,4);
  assert.ok(progress.some(p=>p.loading&&p.stars>0&&p.stars<12000));assert.equal(progress.at(-1).loading,false);
  view.setLayer('stars',true);view.group.updateMatrixWorld(true);
  const target=view.getObject('s4000'),ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(...target.position).normalize());
  assert.equal(ray.intersectObjects([cloud],false)[0].dataObject,target);
  assert.ok(cloud.userData.pickStats.candidates<500);
 }finally{dispose(view);}
});

test('leaving a progressively populated map stops its tasks without recreating removed GPU resources',async()=>{
 let view;
 view=createCombinedMap({catalogue,progressive:true,onProgress:()=>view.cancelLoading()});
 assert.equal(await view.ready,false);
 const count=view.objects.length;await new Promise(resolve=>setTimeout(resolve,20));assert.equal(view.objects.length,count);assert.ok(count<12001);dispose(view);
});

test('immersive sky is deferred until visible, fills progressively and preserves tracked placement',async()=>{
 const parent=new THREE.Group(),environment=createImmersiveEnvironment({parent,progressive:true});
 environment.setCatalogue(catalogue);
 assert.equal(environment.diagnostics.pending,true);assert.equal(environment.targets.length,0);
 environment.configure({active:true,skyVisible:false,quality:'low'});assert.equal(environment.targets.length,0);
 environment.configure({skyVisible:true});environment.group.position.set(2,3,4);
 assert.equal(environment.diagnostics.loading,true);assert.equal(environment.diagnostics.starCount,0);
 assert.equal(await environment.ready,true);
 assert.equal(environment.diagnostics.starCount,12000);assert.equal(environment.diagnostics.nebulaCount,1);
 assert.deepEqual(environment.group.position.toArray(),[2,3,4]);assert.equal(environment.targets.length,2);
 const geometry=environment.targets[0].geometry;environment.setCatalogue(catalogue);assert.equal(environment.targets[0].geometry,geometry);
 environment.setCatalogue({...catalogue,stars:stars.slice(0,100)});environment.dispose();assert.equal(await environment.ready,false);assert.equal(environment.group.parent,null);
});
