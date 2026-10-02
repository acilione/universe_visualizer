import test from 'node:test';
import assert from 'node:assert/strict';
import { planetCameraFraming, overviewDistance } from '../src/planet-navigation.js';
import { exoplanets, findPlanet, hostView, planetsForHost, planetCatalogMetadata } from '../src/planets.js';

test('planet zoom can approach small bodies while keeping the camera outside the surface',()=>{
 for(const size of [.38,.53,1.05]){
  const frame=planetCameraFraming(size);
  assert.ok(frame.minDistance>size);
  assert.ok(frame.minDistance<4,'remove the previous four-unit zoom floor');
  assert.ok(frame.focusDistance>frame.minDistance);
  assert.ok(frame.focusDistance<9*size);
 }
 assert.throws(()=>planetCameraFraming(0),RangeError);
});
test('planet and Saturn ring framing fit narrow mobile screens and immersive layouts',()=>{
 for(const dimensions of [{width:390,height:844,fov:59},{width:1440,height:960,fov:44}]){
  const normal=planetCameraFraming(.95,{...dimensions,rings:true});
  const plain=planetCameraFraming(.95,dimensions);
  assert.ok(normal.focusDistance>plain.focusDistance*2);
  const free=planetCameraFraming(.95,{...dimensions,immersive:true});
  assert.ok(free.focusDistance<plain.focusDistance);
  assert.ok(overviewDistance(23,dimensions)>normal.focusDistance);
 }
});
test('every confirmed planet is searchable and opens in its own host system',()=>{
 assert.equal(exoplanets.length,planetCatalogMetadata.planetCount);
 const hosts=new Set();
 for(const planet of exoplanets){
  assert.equal(findPlanet(planet.id),planet);
  assert.ok(planet.position.every(Number.isFinite));
  assert.ok(planet.size>0&&planet.orbit>planet.size);
  hosts.add(planet.host);
 }
 let total=0;
 for(const host of hosts){
  const planets=planetsForHost(host);total+=planets.length;
  const view=hostView(planets[0]);
  assert.equal(view.context.name,host);
  assert.equal(view.objects.length,planets.length+1);
  assert.ok(view.objects.slice(1).every(p=>p.host===host));
 }
 assert.equal(total,exoplanets.length);
});
test('missing astronomical measurements remain unknown in the mapped catalog',()=>{
 const missing=exoplanets.filter(p=>p.distancePc===null);
 assert.equal(missing.length,planetCatalogMetadata.missingDistanceCount);
 for(const planet of missing)assert.match(planet.distance,/unknown/);
 for(const planet of exoplanets.filter(p=>p.radiusEarth===null))assert.match(planet.detail,/unknown/);
 const trappist=exoplanets.find(p=>p.name==='TRAPPIST-1 e');
 assert.ok(trappist);
 assert.equal(planetsForHost(trappist.host).length,7);
});

test('explicit visual bounds frame extended rings and never reduce the surface safety radius',()=>{
 for(const dimensions of [{width:380,height:800,fov:59},{width:1440,height:960,fov:44}]){
  const radius=.65, ringRadius=radius*2.01;
  const frame=planetCameraFraming(radius,{...dimensions,visualRadius:ringRadius});
  assert.ok(frame.extent>ringRadius);
  assert.ok(frame.focusDistance>planetCameraFraming(radius,dimensions).focusDistance);
  assert.ok(frame.minDistance>radius);
  const malformed=planetCameraFraming(radius,{...dimensions,visualRadius:NaN});
  assert.deepEqual(malformed,planetCameraFraming(radius,dimensions));
  assert.ok(planetCameraFraming(radius,{...dimensions,visualRadius:.01}).extent>=radius);
 }
});
