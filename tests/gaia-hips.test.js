import test from 'node:test';
import assert from 'node:assert/strict';
import { planGaiaTiles, parseGaiaTile, validateGaiaMetadata, createGaiaTileStream, GAIA_DR3_HIPS } from '../src/gaia-hips.js';
import { vec2pix_nest } from '@hscmap/healpix';

const props = `creator_did = ivo://CDS/I/355/gaiadr3\ndataproduct_type = catalog\nhips_frame = equatorial\nhips_tile_format = tsv\nhips_cat_nrows = 1811709771\nhips_order_min = 1\nhips_order = 11\nhips_service_url = ${GAIA_DR3_HIPS.baseUrl}`;
const metadata = `<VOTABLE><COOSYS system="ICRS" epoch="2016.0"/><FIELD name="Source" datatype="long"/>${[['RAdeg','deg'],['DEdeg','deg'],['Gmag','mag'],['Plx','mas'],['e_Plx','mas'],['pmRA','mas/yr'],['pmDE','mas/yr']].map(([name,unit])=>`<FIELD name="${name}" unit="${unit}"/>`).join('')}</VOTABLE>`;
const head = 'Source\tRAdeg\tDEdeg\tGmag\tPlx\te_Plx\tpmRA\tpmDE\tBP-RP\tHIP\tdHIP\tnHIP\tf_HIP\tRAJ2000\tDEJ2000';
const tile = (id='9007199254740993',ra=45,dec=0,g=10,ra2000='') => head+`\n${id}\t${ra}\t${dec}\t${g}\t-1\t0.5\t2\t3\t1.2\t13954\t0.156405\t1\t72\t${ra2000}\t${ra2000===''?'':dec}\n`;
const waitFor = async condition => { const start=performance.now();while(!condition()){if(performance.now()-start>4000)throw new Error('Timed out waiting for Gaia stream.');await new Promise(resolve=>setTimeout(resolve,5));} };
const fixture = handler => async (url,options) => {
  if(url.endsWith('/properties'))return new Response(props);
  if(url.endsWith('/metadata.xml'))return new Response(metadata);
  return handler(url,options);
};

test('Gaia HEALPix planning covers wrap, poles and full sky with bounded additive ancestors',()=>{
  for(const [raDeg,decDeg,radiusDeg] of [[359.999,0,.01],[0,90,.1],[180,-90,.1],[45,30,20],[0,0,180]]){
    const plan=planGaiaTiles({raDeg,decDeg,radiusDeg,order:11});assert.ok(plan.tiles.length<=80);assert.ok(plan.tiles.length>0);
    const keys=new Set(plan.tiles.map(v=>v.key));
    for(const entry of plan.tiles)if(entry.order>1)assert.ok(keys.has(`${entry.order-1}/${Math.floor(entry.npix/4)}`));
    const a=raDeg*Math.PI/180,d=decDeg*Math.PI/180;
    const pixel=vec2pix_nest(2**plan.order,[Math.cos(d)*Math.cos(a),Math.cos(d)*Math.sin(a),Math.sin(d)]);
    assert.ok(keys.has(`${plan.order}/${pixel}`));
  }
  assert.equal(planGaiaTiles({raDeg:0,decDeg:0,radiusDeg:180,order:11}).tiles.length,48);
  assert.throws(()=>planGaiaTiles({raDeg:NaN,decDeg:0,radiusDeg:1}));
});

test('Gaia TSV keeps 64-bit identities, nulls, negative parallaxes and native epochs',()=>{
  const rows=parseGaiaTile('# comment\n'+tile());assert.equal(rows[0].sourceId,'9007199254740993');assert.equal(rows[0].parallaxMas,-1);assert.equal(rows[0].bpMag,null);assert.equal(rows[0].refEpoch,2016);
  assert.equal(rows[0].hipMatches[0].angularDistanceArcsec,.156405);
  assert.equal(parseGaiaTile(tile()+tile().split('\n')[1]+'\n').length,1);
  assert.throws(()=>parseGaiaTile(tile('9223372036854775808')));
  assert.throws(()=>parseGaiaTile(tile().replace('45\t0\t10','45\t91\t10')));
  assert.throws(()=>parseGaiaTile(head+'\n123\t4'));
  assert.throws(()=>parseGaiaTile(tile()+tile('9007199254740993',46).split('\n')[1]+'\n'));
});

test('Gaia survey validation rejects release, unit and coordinate-contract mismatches',()=>{
  assert.equal(validateGaiaMetadata(props,metadata).metadataValidated,true);
  assert.throws(()=>validateGaiaMetadata(props.replace('1811709771','10'),metadata));
  assert.throws(()=>validateGaiaMetadata(props,metadata.replace('epoch="2016.0"','epoch="2000.0"')));
  assert.throws(()=>validateGaiaMetadata(props,metadata.replace('datatype="long"','datatype="double"')));
  assert.throws(()=>validateGaiaMetadata(props,metadata.replace('name="Plx" unit="mas"','name="Plx" unit="deg"')));
});

test('Gaia streaming limits concurrency, deduplicates parent rows and filters in native J2016',async()=>{
  let active=0,peak=0;
  const stream=createGaiaTileStream({updateIntervalMs:0,fetchImpl:fixture(async()=>{
    active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;
    return new Response(tile('9007199254740993',45,0,10,200)+tile('9007199254740994',200,0,11,45).split('\n')[1]+'\n');
  })});
  stream.setView({raDeg:45,decDeg:0,radiusDeg:1,order:2});await waitFor(()=>!stream.snapshot().loading);
  assert.equal(peak,2);assert.equal(stream.snapshot().records.length,1);assert.equal(stream.snapshot().records[0].sourceId,'9007199254740993');assert.equal(stream.snapshot().metadataValidated,true);stream.dispose();
});

test('Gaia ignores obsolete late responses and cancels outstanding requests on disposal',async()=>{
  const requests=[];let updates=0;
  const stream=createGaiaTileStream({updateIntervalMs:0,onUpdate:()=>updates++,fetchImpl:fixture((url,options)=>new Promise(resolve=>requests.push({url,options,resolve})))});
  stream.setView({raDeg:45,decDeg:0,radiusDeg:1,order:1});await waitFor(()=>requests.length===2);
  const old=requests.slice();stream.setView({raDeg:225,decDeg:0,radiusDeg:1,order:1});await waitFor(()=>requests.length>=4);
  assert.ok(old.every(r=>r.options.signal.aborted));old.forEach(r=>r.resolve(new Response(tile())));
  stream.dispose();assert.ok(requests.every(r=>r.options.signal.aborted));const count=updates;
  requests.slice(2).forEach(r=>r.resolve(new Response(tile('9007199254740994',225))));await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(updates,count);assert.equal(stream.snapshot().cacheBytes,0);assert.deepEqual(stream.snapshot().records,[]);
});

test('Gaia reports truncation instead of exceeding the source or cache budget',async()=>{
  const body=tile()+tile('9007199254740994',45.001,0,11).split('\n')[1]+'\n';
  const stream=createGaiaTileStream({maxSources:1,maxCacheBytes:5000,updateIntervalMs:0,fetchImpl:fixture(async()=>new Response(body))});
  stream.setView({raDeg:45,decDeg:0,radiusDeg:2,order:3});await waitFor(()=>!stream.snapshot().loading);
  assert.equal(stream.snapshot().records.length,1);assert.equal(stream.snapshot().limited,true);assert.ok(stream.snapshot().cacheBytes<=5000);stream.dispose();
  const small=createGaiaTileStream({maxCacheBytes:1024,updateIntervalMs:0,fetchImpl:fixture(async()=>new Response(body))});
  small.setView({raDeg:45,decDeg:0,radiusDeg:2,order:1});await waitFor(()=>!small.snapshot().loading);
  assert.equal(small.snapshot().cacheBytes,0);assert.equal(small.snapshot().limited,true);small.dispose();
});

test('Gaia bounds response bytes and requires retry after service failure',async()=>{
  let requests=0,healthy=false;
  const stream=createGaiaTileStream({maxTileBytes:1024,updateIntervalMs:0,fetchImpl:fixture(async()=>{requests++;return healthy?new Response(tile()):new Response('x'.repeat(1025));})});
  const view={raDeg:45,decDeg:0,radiusDeg:1,order:1};stream.setView(view);await waitFor(()=>!stream.snapshot().loading);
  assert.match(stream.snapshot().error,/budget/);const before=requests;
  stream.setView(view);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(requests,before);
  healthy=true;stream.retry();await waitFor(()=>!stream.snapshot().loading);assert.equal(stream.snapshot().error,null);assert.equal(stream.snapshot().records.length,1);stream.dispose();
});

test('Gaia treats absent tiles as empty and aborts timed-out requests without retry loops',async()=>{
  const missing=createGaiaTileStream({updateIntervalMs:0,fetchImpl:fixture(async()=>new Response('',{status:404}))});missing.setView({raDeg:45,decDeg:0,radiusDeg:1,order:1});await waitFor(()=>!missing.snapshot().loading);assert.equal(missing.snapshot().error,null);assert.deepEqual(missing.snapshot().records,[]);missing.dispose();
  let requests=0;
  const slow=createGaiaTileStream({timeoutMs:10,updateIntervalMs:0,fetchImpl:fixture((url,{signal})=>new Promise((resolve,reject)=>{requests++;signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});}))});
  slow.setView({raDeg:45,decDeg:0,radiusDeg:1,order:1});await waitFor(()=>!slow.snapshot().loading);assert.match(slow.snapshot().error,/timed out/);const before=requests;await new Promise(resolve=>setTimeout(resolve,30));assert.equal(requests,before);slow.dispose();
});

test('Gaia pauses the entire service on 429 and Retry cannot bypass Retry-After',async(t)=>{
  let now=Date.now(),requests=0,healthy=false;t.mock.method(Date,'now',()=>now);
  const stream=createGaiaTileStream({updateIntervalMs:0,fetchImpl:fixture(async()=>{requests++;return healthy?new Response(tile()):new Response('',{status:429,headers:{'Retry-After':'60'}});})});
  const view={raDeg:45,decDeg:0,radiusDeg:20,order:3};stream.setView(view);await waitFor(()=>stream.snapshot().retryAfterMs>0);
  assert.ok(requests<=2);assert.equal(stream.snapshot().loading,false);assert.equal(stream.snapshot().pending,0);assert.equal(stream.snapshot().retryAfterMs,60000);
  const before=requests;stream.retry();stream.setView({...view,raDeg:90});await new Promise(resolve=>setTimeout(resolve,15));assert.equal(requests,before);
  healthy=true;now+=60001;stream.retry();await waitFor(()=>!stream.snapshot().loading);assert.ok(requests>before);assert.equal(stream.snapshot().retryAfterMs,0);stream.dispose();
});

test('Gaia network failure applies a global cooldown, not one failure per queued tile',async()=>{
  let requests=0;
  const stream=createGaiaTileStream({updateIntervalMs:0,fetchImpl:fixture(async()=>{requests++;throw new TypeError('Network unavailable');})});
  stream.setView({raDeg:45,decDeg:0,radiusDeg:40,order:3});await waitFor(()=>stream.snapshot().retryAfterMs>0);
  assert.ok(requests<=2);assert.match(stream.snapshot().error,/Network unavailable/);assert.equal(stream.snapshot().pending,0);
  stream.retry();await new Promise(resolve=>setTimeout(resolve,15));assert.ok(requests<=2);stream.dispose();
});

test('Gaia distinguishes progressive detail from a source or memory cap',async()=>{
  const stream=createGaiaTileStream({updateIntervalMs:0,fetchImpl:fixture(async()=>new Response(tile()))});
  stream.setView({raDeg:45,decDeg:0,radiusDeg:1,order:1});await waitFor(()=>!stream.snapshot().loading);
  assert.equal(stream.snapshot().detailAvailable,true);assert.equal(stream.snapshot().limited,true);assert.equal(stream.snapshot().sourceLimited,false);assert.equal(stream.snapshot().cacheLimited,false);stream.dispose();
});
