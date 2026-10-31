import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCelestialCatalogue} from '../src/celestial-catalog-data.js';
import {setLanguage} from '../src/i18n.js';
function mockGlobal(t,name,value){const old=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});t.after(()=>{if(old)Object.defineProperty(globalThis,name,old);else delete globalThis[name];});}
const snapshots=['nasa-hipparcos.json','nasa-stars.json','nasa-nebulae.json'].map(file=>{const data=JSON.parse(readFileSync(new URL('../public/catalog/'+file,import.meta.url)));const key=data.stars?'stars':'objects';return {...data,[key]:data[key].slice(0,8)};});

test('worker loading is shared, acknowledges each bounded message, preserves identity and terminates',async t=>{
 const instances=[],star={id:'hip-1',hip:1,bodyKind:'catalog-star'},nebula={id:'ngc-1',bodyKind:'nebula'};
 class Worker{
  constructor(url,options){this.url=url;this.options=options;this.messages=[];this.next=0;instances.push(this);}
  postMessage(message){this.messages.push(message);const data=message.type==='load'?{type:'header',metadata:{starCount:1,nebulaCount:1}}:++this.next===1?{type:'batch',kind:'stars',objects:[star]}:this.next===2?{type:'batch',kind:'nebulae',objects:[nebula]}:{type:'done'};queueMicrotask(()=>this.onmessage({data}));}
  terminate(){this.terminated=true;}
 }
 mockGlobal(t,'Worker',Worker);mockGlobal(t,'location',{href:'https://example.test/universe_visualizer/'});
 setLanguage('it');
 const {loadCelestialCatalog}=await import('../src/celestial-catalog.js?worker-test');
 const first=loadCelestialCatalog();assert.equal(loadCelestialCatalog(),first);
 const data=await first;assert.equal(instances.length,1);assert.equal(instances[0].terminated,true);
 assert.equal(instances[0].messages[0].language,'it');assert.equal(instances[0].options.type,'module');
 assert.equal(instances[0].messages.filter(m=>m.type==='next').length,3);
 assert.equal(data.byHip.get(1),data.stars[0]);assert.equal(data.byId.get('ngc-1'),data.nebulae[0]);assert.equal(data.objects.length,2);
 setLanguage('en');
});

test('worker data errors reject and clear the cached attempt for retry',async t=>{
 let calls=0,terminations=0;
 class Worker{postMessage(){calls++;queueMicrotask(()=>this.onmessage({data:{type:'error',error:'Unavailable catalogue'}}));}terminate(){terminations++;}}
 mockGlobal(t,'Worker',Worker);mockGlobal(t,'location',{href:'https://example.test/'});
 const {loadCelestialCatalog}=await import('../src/celestial-catalog.js?worker-retry');
 await assert.rejects(loadCelestialCatalog(),/Unavailable catalogue/);await assert.rejects(loadCelestialCatalog(),/Unavailable catalogue/);
 assert.equal(calls,2);assert.equal(terminations,2);
});

test('when workers cannot start, cooperative loading returns the same scientific data',async t=>{
 class Worker{constructor(){throw new Error('Worker blocked');}}
 mockGlobal(t,'Worker',Worker);
 t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>structuredClone(snapshots[url.endsWith('nasa-hipparcos.json')?0:url.endsWith('nasa-stars.json')?1:2])}));
 const {loadCelestialCatalog}=await import('../src/celestial-catalog.js?worker-fallback');
 const result=await loadCelestialCatalog();assert.deepEqual(result,buildCelestialCatalogue(...snapshots));
});
