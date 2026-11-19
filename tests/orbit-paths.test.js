import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {catalog} from '../src/data.js';
import {solarMoons,updateSolarPositions} from '../src/moons.js';
import {planetOrbit,orbitPoint,planetOrientation} from '../src/planet-ephemeris.js';
import {circularOrbitPath,orbitPath} from '../src/orbit-paths.js';
import {createCombinedMap} from '../src/combined-map.js';
import {Universe} from '../src/universe.js';
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.hypot(...a.map((value,index)=>value-b[index]))<tolerance,`${a} does not match ${b}`);

test('all eight planetary orbit lines pass through their bodies and close around the Sun',()=>{
 const planets=catalog.solar.filter(body=>body.orbit);
 assert.equal(planets.length,8);
 for(const planet of planets){
  const path=orbitPath(planet);
  near(path[0],planet.position);near(path.at(-1),path[0]);
  for(const position of path) {
    const r=Math.hypot(...position)/planet.orbit;
    assert.ok(r>=1-planet.ephemeris.e-1e-9 && r<=1+planet.ephemeris.e+1e-9);
  }
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

test('current planetary vectors agree with independent JPL Horizons barycentre vectors',()=>{
 // Geometric heliocentric ecliptic J2000 vectors in AU. JD 2461363.5 TDB.
 const utc=Date.UTC(2026,10,19), tilt=23.43928*Math.PI/180;
 const reference={
   mercury:[-.2091772138701024,.2512743392884215,.03972013742212285],
   venus:[.2247000832700414,.6849311700794607,-.003552290781607994],
   earth:[.5486093616292061,.8222097593460469,-.00005427918529884808],
   mars:[-.5222008749238755,1.525180932102134,.04476647274665582],
   jupiter:[-3.764998838498385,3.761635880959925,.06861107859818151],
   saturn:[9.188847201575083,2.033734781789820,-.4011914409469188],
   uranus:[8.757418603099227,17.34712980963397,-.04912358593551135],
   neptune:[29.82878477377468,1.534568618637375,-.7189998915979015],
 };
 for (const [id,[x,y,z]] of Object.entries(reference)) {
   const expected=new THREE.Vector3(x,y*Math.sin(tilt)+z*Math.cos(tilt),z*Math.sin(tilt)-y*Math.cos(tilt));
   const computed=new THREE.Vector3(...orbitPoint(planetOrbit(id,utc)));
   assert.ok(computed.angleTo(expected)<.2*Math.PI/180,id+' heliocentric direction');
   if (['mercury','venus','earth','mars'].includes(id)) near(computed.toArray(),expected.toArray(),.0003);
   assert.ok(computed.distanceTo(new THREE.Vector3(...orbitPoint(planetOrbit(id,utc+86400000))))>.002);
 }
});

test('axial spin is absolute and preserves the sign of retrograde rotation',()=>{
 const t=Date.UTC(2026,10,19);
 for (const [id,rate] of Object.entries({venus:-1.4813688,uranus:-501.1600928,earth:360.9856235,jupiter:870.536})) {
   const delta=planetOrientation(id,t+3600000).angle-planetOrientation(id,t).angle;
   assert.ok(Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta))-rate/24*Math.PI/180)<1e-8);
 }
});

test('combined-map clock updates move moons and pick targets with their parent and reuse the orbit buffer',()=>{
 const bodies=[...catalog.solar,...solarMoons], initial=catalog.solar[1].ephemeris.utcMs;
 const combined=createCombinedMap({planets:bodies});
 try {
   const engine=Object.assign(Object.create(Universe.prototype),{index:9,combinedView:combined,bodyVisuals:new Map()});
   combined.group.traverse(node=>{if(node.userData.bodyId)engine.registerBodyVisual(node);});
   const geometry=combined.group.getObjectByName('combined-solar-orbits').geometry;
   const positions=geometry.attributes.position;
   const t=Date.UTC(2027,0,5);
   engine.updatePlanetMotion(t);
   const earth=catalog.solar.find(body=>body.id==='earth'), moon=solarMoons.find(body=>body.id==='moon');
   for(const body of [earth,moon]){
     const hit=combined.group.getObjectByName('combined-target-'+body.id);
     near(hit.parent.position.toArray(),body.position);
     near(hit.userData.object.position,body.position);
   }
   near(moon.position.map((v,i)=>v-earth.position[i]),moon.localPosition);
   near(new THREE.Vector3().fromBufferAttribute(positions,2*480).toArray(),earth.position);
   near(new THREE.Vector3().fromBufferAttribute(positions,8*480).toArray(),moon.position);
   assert.equal(geometry.attributes.position,positions);
   const before=positions.version;
   engine.updatePlanetMotion(t+1000);
   assert.equal(positions.version,before);
 } finally {
   updateSolarPositions(initial);
   combined.group.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});
 }
});
