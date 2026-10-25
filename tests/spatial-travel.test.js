import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Universe } from '../src/universe.js';
import { createCombinedMap } from '../src/combined-map.js';
import { createDesktopImmersive } from '../src/desktop-immersive.js';
import { exoplanets } from '../src/planets.js';
import { catalog } from '../src/data.js';

function universeFixture() {
  const focused = [], selections = [], views = [];
  const nasa = {id:'hip-reference',bodyKind:'catalog-star',nasaCatalogue:'hipparcos',raDeg:30,decDeg:20,name:'Reference star',source:'https://heasarc.gsfc.nasa.gov/',mag:1};
  const gaia = {id:'gaia-reference',bodyKind:'catalog-star',gaiaCatalogue:'dr3',raDeg:270,decDeg:-10,name:'Gaia reference',mag:3};
  const nebula = {id:'nebula-reference',bodyKind:'nebula',nasaCatalogue:'ngc2000',raDeg:80,decDeg:-5,angularSizeArcmin:60,name:'Reference nebula'};
  const data = {stars:[nasa,gaia],nebulae:[nebula],byId:new Map([nasa,gaia,nebula].map(object=>[object.id,object]))};
  const engine = Object.create(Universe.prototype);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(2,1.7,3); camera.rotation.y=.4;
  Object.assign(engine, {
    index:0, objects:[], catalogueData:data, bodyVisuals:new Map(), viewRequest:0,
    camera, targets:[], environment:{group:new THREE.Group(),targets:[]},
    xr:{isPresenting:true,focusObject(object,extent){focused.push({object,extent});return true;}},
    preview:{isActive:false},
    selectObject(object){this.selected=object;selections.push(object);}, updateMoonOrbits(){},
    buildView(index,objects,context){this.index=index;this.objects=objects;this.viewContext=context;views.push(index);},
    buildCombinedMap(catalogue){
      this.combinedView=createCombinedMap({catalogue,planets:[],exoplanets:[],quality:'low'});
      this.index=9;this.objects=this.combinedView.objects;views.push(9);return true;
    },
  });
  return {engine,focused,selections,views,data,nasa,gaia,nebula,camera};
}

for(const kind of ['nasa','gaia','nebula'])test(`surrounding ${kind} travel resolves its catalogue ID into the canonical map position`,()=>{
  const h=universeFixture(), source=h[kind];
  const before=[...h.camera.position.toArray(),...h.camera.quaternion.toArray()];
  const proxy={id:source.id,environmentReference:true,position:[999,888,777]};
  assert.equal(h.engine.travelToObject(proxy),true);
  assert.equal(h.engine.index,9);
  const canonical=h.engine.combinedView.getObject(source.id);
  assert.equal(h.focused[0].object,canonical);
  assert.deepEqual(h.focused[0].object.position,canonical.position);
  assert.notDeepEqual(canonical.position,proxy.position,'viewer-relative proxy coordinates must never become map coordinates');
  assert.equal(h.focused[0].object.nasaCatalogue||h.focused[0].object.gaiaCatalogue,source.nasaCatalogue||source.gaiaCatalogue);
  assert.deepEqual([...h.camera.position.toArray(),...h.camera.quaternion.toArray()],before);
});

test('an exoplanet marker enters its host and focuses the actual orbit coordinate',()=>{
  const h=universeFixture();h.engine.index=9;
  const planet=exoplanets.find(object=>object.host==='TRAPPIST-1')||exoplanets[0];
  const proxy={...planet,position:[60,0,0]};
  assert.equal(h.engine.travelToObject(proxy),true);
  assert.equal(h.engine.index,5);assert.equal(h.engine.systemHost,planet.host);
  const canonical=h.engine.objects.find(object=>object.id===planet.id);
  assert.equal(h.focused[0].object,canonical);
  assert.deepEqual(canonical.position,planet.position);
  assert.notDeepEqual(canonical.position,proxy.position);
  assert.ok(h.engine.objects.some(object=>object.bodyKind==='star'));
  assert.ok(h.engine.objects.filter(object=>object.bodyKind==='exoplanet').length>0);
  assert.equal(h.engine.focusedPlanet.id,planet.id);
  const existingViews=h.views.length;
  h.engine.travelToObject({...planet,position:[100,0,0]});
  assert.equal(h.views.length,existingViews,'hopping within the current host does not rebuild the system');
  assert.equal(h.focused.at(-1).object,canonical);
});

test('a Galactic Solar System link opens the system without trying to magnify the outgoing marker',()=>{
  const h=universeFixture();h.engine.index=2;
  const solarSystem=catalog.galaxy.find(object=>object.id==='solar-system');
  assert.equal(h.engine.travelToObject(solarSystem),true);
  assert.equal(h.engine.index,0);
  assert.ok(h.engine.objects.some(object=>object.id==='earth'));
  assert.equal(h.focused.length,0);
});

test('outward navigation visits the combined map, nearby stars, Galaxy, Local Group and universe',()=>{
  const h=universeFixture();h.engine.index=5;
  for(const expected of [9,1,2,3,4]){
    h.engine.navigateSpatialOut();assert.equal(h.engine.index,expected);
    assert.equal(h.engine.focusedPlanet,null);assert.equal(h.engine.focusedMoonSystem,null);
  }
  h.engine.navigateSpatialOut();assert.equal(h.engine.index,4);
  assert.deepEqual(h.camera.position.toArray(),[2,1.7,3]);
});

test('scene targets include the surrounding catalogue only while its environment is active',()=>{
  const h=universeFixture();const foreground=new THREE.Object3D(),sky=new THREE.Object3D();
  h.engine.targets=[foreground];h.engine.environment.targets=[sky];h.engine.environment.group.visible=false;
  assert.deepEqual(h.engine.spatialTargets(),[foreground]);
  h.engine.environment.group.visible=true;assert.deepEqual(h.engine.spatialTargets(),[foreground,sky]);
});

class Events {
  listeners=new Map();
  addEventListener(type,callback){this.listeners.set(type,[...(this.listeners.get(type)||[]),callback]);}
  removeEventListener(type,callback){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==callback));}
  fire(type,detail={}){const event={target:this,preventDefault(){},stopImmediatePropagation(){},...detail};for(const callback of this.listeners.get(type)||[])callback(event);}
}
function desktopFixture() {
  const win=new Events(),doc=new Events(),canvas=new Events();
  doc.defaultView=win;doc.querySelector=()=>null;doc.activeElement=null;canvas.ownerDocument=doc;canvas.style={};canvas.clientHeight=600;
  const camera=new THREE.PerspectiveCamera(50,1,.01,1000);camera.position.set(4,5,6);
  const controls={enabled:true,autoRotate:false,target:new THREE.Vector3()};
  const parent=new THREE.Group();parent.position.set(3,1,-2);parent.rotation.y=.4;parent.scale.setScalar(2);
  const mapRoot=new THREE.Group();parent.add(mapRoot);
  const object={id:'body',position:[4,.5,-3],size:.2};
  const target=new THREE.Object3D();target.position.fromArray(object.position);target.userData.object=object;mapRoot.add(target);
  const preview=createDesktopImmersive({canvas,camera,controls,mapRoot,getBoundsRadius:()=>30,getTargets:()=>[target]});
  preview.enter({directTravel:true}); for(let frame=0;frame<10;frame++)preview.update(.05);
  return {preview,camera,mapRoot,target,object,canvas};
}

test('desktop arrival uses world coordinates under a transformed parent and zoom preserves its anchor',()=>{
  const h=desktopFixture();
  try{
    const pose=[...h.camera.position.toArray(),...h.camera.quaternion.toArray()];
    assert.equal(h.preview.focusObject(h.object,.2),true);
    for(let i=0;i<12;i++)h.preview.update(.05);
    h.mapRoot.updateWorldMatrix(true,true);
    const anchor=h.target.getWorldPosition(new THREE.Vector3());
    const expected=h.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.35).add(h.camera.position);
    assert.ok(anchor.distanceTo(expected)<1e-8);
    const initialScale=h.mapRoot.getWorldScale(new THREE.Vector3()).x;
    assert.ok(Math.abs(initialScale*.2-.3)<1e-8);
    h.canvas.fire('wheel',{deltaY:-200});
    assert.ok(Math.abs(h.mapRoot.getWorldScale(new THREE.Vector3()).x-initialScale)<1e-8, 'wheel queues zoom without an immediate scale snap');
    for(let frame=0;frame<50;frame++)h.preview.update(.05);
    assert.ok(h.mapRoot.getWorldScale(new THREE.Vector3()).x>initialScale*1.9);
    assert.ok(h.target.getWorldPosition(new THREE.Vector3()).distanceTo(anchor)<1e-8);
    h.canvas.fire('wheel',{deltaY:200});for(let frame=0;frame<50;frame++)h.preview.update(.05);
    assert.ok(Math.abs(h.mapRoot.getWorldScale(new THREE.Vector3()).x-initialScale)<1e-8);
    assert.deepEqual([...h.camera.position.toArray(),...h.camera.quaternion.toArray()],pose);
    h.preview.navigateBack();for(let i=0;i<12;i++)h.preview.update(.05);
    assert.equal(h.preview.isInspecting,false);
    assert.deepEqual([...h.camera.position.toArray(),...h.camera.quaternion.toArray()],pose);
  }finally{h.preview.dispose();}
});


test('unavailable catalogue data falls back to nearby stars from every detailed view',()=>{
  for(const index of [0,5,6,7,8]){
    const h=universeFixture();h.engine.index=index;h.engine.catalogueData=null;
    h.engine.navigateSpatialOut();
    assert.equal(h.engine.index,1,`view ${index} must not jump to the observable universe`);
    assert.deepEqual(h.camera.position.toArray(),[2,1.7,3]);
  }
});

test('pixel, line and page wheel inputs produce equivalent zoom with the same physical scroll distance',()=>{
  const scales=[];
  for(const [deltaMode,deltaY] of [[0,-32],[1,-2],[2,-32/600]]){
    const h=desktopFixture();
    try{
      const initialScale=h.mapRoot.getWorldScale(new THREE.Vector3()).x;
      h.canvas.fire('wheel',{deltaY,deltaMode});for(let frame=0;frame<50;frame++)h.preview.update(.05);
      scales.push(h.mapRoot.getWorldScale(new THREE.Vector3()).x/initialScale);
    }finally{h.preview.dispose();}
  }
  for(const value of scales)assert.ok(Math.abs(value-Math.exp(32*.0035))<1e-8);
});

test('manual rotation cancels a pending hidden jump and settles without returning to its destination',()=>{
  const h=desktopFixture();
  try{
    h.preview.focusObject(h.object,.2);h.preview.update(.1);
    const before=h.mapRoot.getWorldQuaternion(new THREE.Quaternion());
    const oldPosition=h.mapRoot.getWorldPosition(new THREE.Vector3()).clone();
    h.preview.rotateMap(.4);
    assert.ok(before.angleTo(h.mapRoot.getWorldQuaternion(new THREE.Quaternion()))<1e-8, 'manual rotation is damped too');
    for(let frame=0;frame<50;frame++)h.preview.update(.05);
    assert.ok(oldPosition.distanceTo(h.mapRoot.getWorldPosition(new THREE.Vector3()))<1e-8, 'the cancelled destination is never applied');
    const after=h.mapRoot.getWorldQuaternion(new THREE.Quaternion());
    assert.ok(Math.abs(before.angleTo(after)-.4)<1e-8);
    const manuallyPlaced=h.mapRoot.matrixWorld.toArray();
    const pose=[...h.camera.position.toArray(),...h.camera.quaternion.toArray()];
    for(let frame=0;frame<20;frame++)h.preview.update(.05);
    h.mapRoot.updateWorldMatrix(true,true);
    assert.deepEqual(h.mapRoot.matrixWorld.toArray(),manuallyPlaced);
    assert.deepEqual([...h.camera.position.toArray(),...h.camera.quaternion.toArray()],pose);
  }finally{h.preview.dispose();}
});
