import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {catalog} from '../src/data.js';
import {solarMoons} from '../src/moons.js';
import {circularOrbitPath} from '../src/orbit-paths.js';
import {createCombinedMap} from '../src/combined-map.js';
import {Universe} from '../src/universe.js';
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.hypot(...a.map((value,index)=>value-b[index]))<tolerance,`${a} does not match ${b}`);

test('all eight planetary orbit lines pass through their bodies and close around the Sun',()=>{
 const planets=catalog.solar.filter(body=>body.orbit);
 assert.equal(planets.length,8);
 for(const planet of planets){
  const path=circularOrbitPath(planet);
  near(path[0],planet.position);near(path.at(-1),path[0]);
  for(const position of path){assert.ok(Math.abs(Math.hypot(...position)-planet.orbit)<1e-10);assert.equal(position[1],0);}
 }
});

test('moon guides are centred on their own planets and use the same inclination convention',()=>{
 for(const moon of solarMoons){
  const parent=catalog.solar.find(body=>body.id===moon.parentId);
  const path=circularOrbitPath(moon,parent.position);
  near(path[0],moon.position);
  for(const point of path)assert.ok(Math.abs(Math.hypot(...point.map((value,index)=>value-parent.position[index]))-moon.orbitRadius)<1e-10);
 }
 const tilted={bodyKind:'moon',orbitRadius:2,orbitInclinationRad:Math.PI/2,position:[3,6,5]};
 const path=circularOrbitPath(tilted,[3,4,5]);near(path[0],tilted.position);near(path[60],[1,4,5]);
});

test('Solar System and combined views use matching paths under room-scale map transforms',()=>{
 const bodies=[...catalog.solar,...solarMoons];
 const engine=Object.create(Universe.prototype);Object.assign(engine,{index:0,objects:bodies,layers:{grid:true},particleCloud:()=>new THREE.Group()});
 const solar=engine.makeSolar(),combined=createCombinedMap({planets:bodies,planetVisual:()=>new THREE.Group()});
 try{
  const orbits=solar.getObjectByName('orbits');assert.equal(orbits.children.length,8);
  const batched=combined.group.getObjectByName('combined-solar-orbits').geometry.attributes.position;
  const transform=new THREE.Matrix4().compose(new THREE.Vector3(2,1.5,-3),new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,.6,-.1)),new THREE.Vector3(.04,.04,.04));
  orbits.children.forEach((line,index)=>{
   const body=catalog.solar.find(body=>body.id===line.userData.orbitBodyId),points=line.geometry.attributes.position;
   const bodyWorld=new THREE.Vector3(...body.position).applyMatrix4(transform);
   near(new THREE.Vector3().fromBufferAttribute(points,0).applyMatrix4(transform).toArray(),bodyWorld.toArray());
   for(let vertex=0;vertex<240;vertex++)near(new THREE.Vector3().fromBufferAttribute(points,vertex).toArray(),new THREE.Vector3().fromBufferAttribute(batched,index*480+vertex*2).toArray());
  });
 }finally{for(const group of [solar,combined.group])group.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});}
});
