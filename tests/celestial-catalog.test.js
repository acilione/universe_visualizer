import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCelestialCatalogue, propagateHipparcos, angularSeparationArcsec, normalizeCelestialSearch, findNasaStarForObject } from '../src/celestial-catalog.js';
import { celestialMeasurements, celestialSourceLinks } from '../src/celestial-info.js';
const read = file => JSON.parse(readFileSync(new URL('../public/catalog/' + file, import.meta.url), 'utf8'));
const hip = read('nasa-hipparcos.json'), bsc = read('nasa-stars.json'), nebula = read('nasa-nebulae.json');
const data = buildCelestialCatalogue(hip, bsc, nebula);

test('merging retains every NASA Hipparcos and stellar HR entry and every nebula', () => {
  const hipIds = hip.stars.map(row => row[hip.columns.indexOf('hip')]);
  const hrIds = bsc.stars.map(row => row[bsc.columns.indexOf('hr')]);
  assert.deepEqual(new Set(data.stars.filter(row => row.hip).map(row => row.hip)), new Set(hipIds));
  assert.deepEqual(new Set(data.stars.filter(row => row.hr).map(row => row.hr)), new Set(hrIds));
  assert.equal(data.nebulae.length, nebula.objects.length);
  assert.equal(data.byId.size, data.objects.length);
  assert.ok(data.stars.every(row => Number.isFinite(row.raDeg) && Number.isFinite(row.decDeg)));
  assert.equal(data.stars.length, hip.stars.length + bsc.stars.length - data.metadata.matchedBrightStars);
});
test('requested named stars and nebula aliases resolve to distinct NASA identities', () => {
  for (const [hipId, hr, name] of [[106481,8252,'Rho Cygni'],[113881,8775,'Scheat'],[92420,7106,'Sheliak']]) {
    const star = data.byHip.get(hipId);
    assert.equal(star.hr, hr); assert.equal(star.name, name); assert.ok(star.sources.every(url => url.startsWith('https://heasarc.gsfc.nasa.gov/')));
  }
  assert.equal(normalizeCelestialSearch('Rho Cigny'), 'rho cygni');
  assert.equal(normalizeCelestialSearch('HR8252'), 'hr 8252');
  assert.equal(normalizeCelestialSearch('\u03c1 Cygni'), 'rho cygni');
  assert.equal(data.nebulae.find(row => row.aliases.includes('M42')).id, 'ngc-1976');
  assert.match(data.byId.get('ngc-6720').searchText, /ring nebula/);
});
test('Hipparcos proper motion is propagated from J1991.25 with the RA cosine term already included', () => {
  const moved = propagateHipparcos({raDeg:0,decDeg:0,pmRaMasYr:1000,pmDecMasYr:0});
  assert.ok(Math.abs(moved.raDeg - 8.75 / 3600) < 1e-9);assert.equal(moved.decDeg,0);assert.equal(moved.positionEpoch,2000);
  const polar = propagateHipparcos({raDeg:150,decDeg:90,pmRaMasYr:1200,pmDecMasYr:-1800});
  assert.ok(Number.isFinite(polar.raDeg)&&Number.isFinite(polar.decDeg)&&Math.abs(polar.decDeg)<=90);
  const stationaryUnknown = propagateHipparcos({raDeg:22,decDeg:13,pmRaMasYr:null,pmDecMasYr:1});
  assert.equal(stationaryUnknown.positionEpoch,1991.25);assert.equal(stationaryUnknown.raDeg,22);
  assert.ok(angularSeparationArcsec({raDeg:359.999,decDeg:0},{raDeg:.001,decDeg:0})<7.21);
});
test('distance estimates require positive parallax and a quantified signal-to-noise ratio of five', () => {
  for (const star of data.stars) {
    if (star.distanceEstimate) {
      assert.ok(star.parallaxMas>0&&star.parallaxErrorMas>0&&star.parallaxErrorMas/star.parallaxMas<=.2);
      assert.ok(Math.abs(star.distanceLy-3261.563777/star.parallaxMas)<1e-8);
    } else assert.equal(star.distanceLy,null);
  }
  assert.ok(data.stars.some(star=>star.parallaxMas<0&&star.distanceLy===null));
  assert.ok(data.nebulae.some(object=>object.distanceLy===null));
});
test('NASA information matches an existing HYG identity without modifying its rendered coordinates', () => {
  const object={id:'hyg-example',hip:106481,raDeg:1,decDeg:2,position:[3,4,5]};
  const before=JSON.stringify(object);
  assert.equal(findNasaStarForObject(data,object).name,'Rho Cygni');assert.equal(JSON.stringify(object),before);
  const info={...object,nasaInfo:data.byHip.get(106481),source:'https://github.com/astronexus/HYG-Database'};
  assert.match(celestialMeasurements(info,true),/NASA HEASARC/);assert.match(celestialMeasurements(info,true),/Map coordinates: HYG/);
  assert.match(celestialSourceLinks(info),/hipparcos.html/);
});
test('scientific panels escape source data and preserve missing or negative measurements', () => {
  const star={...data.byHip.get(106481),spectralType:'<img src=x onerror=alert(1)>',parallaxMas:-2,parallaxErrorMas:.5,mag:0};
  const markup=celestialMeasurements(star,true);
  assert.ok(!markup.includes('<img'));assert.match(markup,/&lt;img/);assert.match(markup,/-2 \u00b1 0.5 mas/);
  const unknown={bodyKind:'nebula',nasaCatalogue:'ngc2000',raDeg:1,decDeg:2,mag:null,angularSizeArcmin:null};
  assert.match(celestialMeasurements(unknown),/Not available/);
  assert.equal(celestialSourceLinks({...star,source:'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/hipparcos.html',sources:['javascript:alert(1)']}),'');
});

test('source-specific photometry, dynamical parallaxes and coordinate precision remain explicit', () => {
  assert.equal(data.byId.get('bsc-5506').magnitudeBand,'HR');
  assert.match(celestialMeasurements(data.byId.get('bsc-5506')), /MAGNITUDE \u00b7 HR/);
  const rho = data.byHip.get(106481);
  assert.equal(rho.radialVelocityCatalogue,'bsc5p');assert.equal(rho.radialVelocityKmS,rho.bscData.radialVelocityKmS);
  assert.match(celestialMeasurements(rho,true), /RADIAL VELOCITY \u00b7 BSC/);
  assert.match(celestialMeasurements(data.byId.get('bsc-4731'),true), /DYNAMICAL PARALLAX/);
  assert.match(celestialMeasurements(data.byHip.get(421),true), /SOURCE POSITION PRECISION/);
  const sheliak=data.byHip.get(92420), markup=celestialMeasurements(sheliak,true);
  assert.equal(sheliak.spectralType,'A8:V comp SB');assert.match(markup,/B8IIpe/);
});
