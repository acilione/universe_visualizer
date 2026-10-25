import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const figures=JSON.parse(readFileSync(new URL('../public/catalog/constellations.json',import.meta.url),'utf8'));
const stars=JSON.parse(readFileSync(new URL('../public/catalog/stars.json',import.meta.url),'utf8'));
const observer={latitude:38.11443888888889,longitude:15.65,dateIso:'2026-12-11T19:00:00Z'};

test('selection loading validates identifiers, deduplicates them and preserves an explicitly empty selection',async t=>{
  const requests=[];
  t.mock.method(globalThis,'fetch',async url=>{requests.push(url);return {ok:true,json:async()=>structuredClone(url.endsWith('constellations.json')?figures:stars)};});
  const {loadConstellationSelection,loadConstellation}=await import('../src/constellation-catalog.js?selection-unit');
  const selected=await loadConstellationSelection(['Ori','UMa','Ori'],{observer});
  assert.deepEqual(selected.ids,['Ori','UMa']);assert.deepEqual(selected.figures.map(figure=>figure.id),selected.ids);
  assert.equal(selected.figure.id,'Ori');assert.equal(selected.mode,'space');assert.equal(selected.catalog.stars.length,119625);
  assert.deepEqual(selected.observer,{...observer,dateIso:new Date(observer.dateIso).toISOString()});
  const empty=await loadConstellationSelection([],{observer});
  assert.deepEqual(empty.ids,[]);assert.deepEqual(empty.figures,[]);assert.equal(empty.figure,null);assert.equal(empty.catalog,selected.catalog);
  const single=await loadConstellation('Sgr',{observer});
  assert.deepEqual(single.ids,['Sgr']);assert.equal(single.figure.id,'Sgr');assert.equal(single.catalog,selected.catalog);
  assert.equal(requests.length,2,'changes reuse the shared constellation and star catalogues');
  await assert.rejects(loadConstellationSelection(['Ori','invalid'],{observer}),RangeError);
  await assert.rejects(loadConstellationSelection('Ori',{observer}),TypeError);
  await assert.rejects(loadConstellationSelection(['Ori',null],{observer}),TypeError);
  await assert.rejects(loadConstellationSelection([''],{observer}),TypeError);
  await assert.rejects(loadConstellationSelection(['Ori'],{observer,mode:'invalid'}),RangeError);
  await assert.rejects(loadConstellationSelection(['Ori'],{observer:{...observer,latitude:91}}),RangeError);
});
