import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const base = process.env.ENGINE_TEST_URL || 'http://localhost:5173';
const phase = process.env.BODY_AUDIT_PHASE || 'final';
assert.match(phase, /^[a-z0-9_-]+$/);
const output = resolve('test-results/body-audit', phase);
const referenceCache = resolve('test-results/body-audit/references');
await mkdir(output, { recursive: true }); await mkdir(referenceCache, { recursive: true });
const readJson = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; } };
const audit = await readJson('src/body-appearance-audit.json');
const surfaces = await readJson('src/official-surfaces.json');
const missingReferenceCache = await readJson('test-results/official-source-cache/missing-refs.json');
const existingReferenceCache = await readJson('test-results/moon-audit/references.json');
const planetReferenceCache = await readJson('test-results/planet-reference-audit/references.json');
const solarObservation = await readJson('src/solar-observation.json');
const views = [{longitude:0,hemisphere:'north'},{longitude:90,hemisphere:'north'},{longitude:180,hemisphere:'north'},{longitude:270,hemisphere:'north'},{longitude:0,hemisphere:'south'},{longitude:180,hemisphere:'south'}];
const bodyIds = process.env.BODY_AUDIT_IDS?.split(',').filter(Boolean);
const errors = [], requestErrors = [], captures = [], referenceErrors = [];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const file = path => relative(output, path).replaceAll('\\', '/');
let page;
try {
  page = await browser.newPage({ viewport: { width: 512, height: 512 }, reducedMotion: 'reduce', locale: 'en-US' });
  page.setDefaultTimeout(90000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => requestErrors.push({url:request.url(),error:request.failure()?.errorText}));
  page.on('response', response => { if (response.status() >= 400) requestErrors.push({url:response.url(),status:response.status()}); });
  await page.goto(base + '/tests/fixtures/body-audit.html', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => window.auditReady);
  let objects = await page.evaluate(() => window.audit.objects);
  if (bodyIds) objects = objects.filter(object => bodyIds.includes(object.id));
  else assert.equal(objects.length, 37, 'Audit covers the Sun, all eight planets and all 28 curated moons');
  if (phase === 'final') for (const object of objects) assert.ok(audit[object.id]?.reference?.url, object.id + ' has a reviewed official observation');
  for (const object of objects) {
    for (const {longitude,hemisphere} of views) {
      const result = await page.evaluate(({id,longitude,hemisphere}) => window.audit.capture(id,longitude,hemisphere), {id:object.id,longitude,hemisphere});
      const { png, ...record } = result;
      record.image = object.id + '-' + hemisphere + '-' + longitude + '.png';
      await writeFile(resolve(output, record.image), Buffer.from(png.split(',')[1], 'base64'));
      captures.push(record);
      assert.ok(result.foregroundPixels > 10000 && result.renderedColours > 20, object.id + ' has a real illuminated GPU rendering');
      assert.ok(result.projectedBounds.min.every(value => value > -1) && result.projectedBounds.max.every(value => value < 1), object.id + ' is not clipped at longitude ' + longitude);
      const source = surfaces[object.id];
      if (source?.model) {
        assert.equal(result.modelState, 'ready', object.id + ' renders its actual official mesh');
        assert.equal(result.vertices, source.vertexCount, object.id + ' retains native mesh topology');
        assert.ok(result.maxRadius <= 1.00001, object.id + ' native geometry remains inside its focus radius');
      }
      if (source?.map) {
        const rendered = result.maps.find(map => map.url?.endsWith('/textures/' + source.map));
        assert.ok(rendered && rendered.width > 0 && rendered.height > 0, object.id + ' actually uses its decoded observation texture');
        assert.equal(rendered.flipY, source.flipY !== false, object.id + ' preserves the source UV convention');
      }
      if (phase === 'final' && object.bodyKind === 'moon' && object.id !== 'nereid') {
        const loadedMap = Boolean(source?.map && result.maps.some(map=>map.url?.endsWith('/textures/'+source.map)));
        const loadedShape = Boolean(source?.model && result.modelState==='ready' && result.vertices===source.vertexCount);
        assert.ok(loadedMap || loadedShape, object.id + ' renders observation-derived appearance or measured geometry rather than a plain placeholder');
        assert.ok(!['fallback','loading'].includes(result.modelState), object.id + ' is not silently using incomplete geometry');
      }
    }
    console.log('CAPTURED: ' + object.id + ' (six views: four northern longitudes and two southern views)');
  }
  await page.evaluate(() => window.audit.dispose());
  assert.deepEqual(errors, [], 'No runtime or shader compilation errors');
  assert.deepEqual(requestErrors, [], 'No failed local models or textures');
  const references = {};
  for (const object of objects) {
    const reference = audit[object.id]?.reference;
    if (!reference?.imageUrl) continue;
    const cacheImage = resolve(referenceCache, object.id + '.jpg');
    const cacheMeta = resolve(referenceCache, object.id + '.json');
    try {
      const old = await readJson(cacheMeta);
      if (old.url !== reference.imageUrl || !existsSync(cacheImage)) {
        const known = missingReferenceCache[object.id];
        const ownerCache = resolve('test-results/official-source-cache', object.id + '-reference.jpg');
        const existing = existingReferenceCache[object.id], existingCache = resolve('test-results/moon-audit',object.id+'-reference.jpg');
        const planet = planetReferenceCache[object.id], planetCache = resolve('test-results/planet-reference-audit',object.id+'.jpg');
        const solarCache = solarObservation.referenceMap && resolve('public/textures',solarObservation.referenceMap);
        if (object.id === 'sun' && solarObservation.assetUrl === reference.imageUrl && solarCache && existsSync(solarCache)) await copyFile(solarCache,cacheImage);
        else if (planet?.imageUrl === reference.imageUrl && existsSync(planetCache)) await copyFile(planetCache,cacheImage);
        else if (existing?.imageUrl === reference.imageUrl && existsSync(existingCache)) await copyFile(existingCache,cacheImage);
        else if (known?.referenceImageUrl === reference.imageUrl && existsSync(ownerCache)) await copyFile(ownerCache, cacheImage);
        else {
          const response = await fetch(reference.imageUrl, {signal:AbortSignal.timeout(60000)});
          if (!response.ok) throw Error('HTTP ' + response.status);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 30*1024*1024) throw Error('Reference image exceeds 30 MB');
          await writeFile(cacheImage, bytes);
        }
        const bytes = await readFile(cacheImage);
        await writeFile(cacheMeta, JSON.stringify({url:reference.imageUrl,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length},null,2)+'\n');
      }
      references[object.id] = {...reference,image:file(cacheImage)};
    } catch (error) { referenceErrors.push({id:object.id,url:reference.imageUrl,error:error.message}); }
  }
  const groups = [
    ['solar','Sun and planets',object=>!object.parentId],
    ['inner-moons','Earth and Mars moons',object=>['earth','mars'].includes(object.parentId)],
    ['jupiter','Jupiter moons',object=>object.parentId==='jupiter'],
    ['saturn','Saturn moons',object=>object.parentId==='saturn'],
    ['uranus','Uranus moons',object=>object.parentId==='uranus'],
    ['neptune','Neptune moons',object=>object.parentId==='neptune'],
  ];
  const figure = (image,caption) => `<figure><a href="${escape(image)}"><img src="${escape(image)}" alt="${escape(caption)}"></a><figcaption>${escape(caption)}</figcaption></figure>`;
  const card = object => {
    const entries=captures.filter(capture=>capture.id===object.id), record=audit[object.id], reference=references[object.id];
    const observation=reference?figure(reference.image,'NASA reference: '+(reference.archiveId||reference.title)):'<div class="pending">Reference pending in baseline capture</div>';
    return `<article><h3>${escape(object.name)} <span>${escape(record?.status || phase)}</span></h3><div class="images">${observation}${entries.map(entry=>figure(entry.image,(entry.hemisphere==='south'?'Southern':'Northern')+' view, '+entry.longitudeDeg+' degrees')).join('')}<div class="key">Same exposure and daylight phase. Each body is enlarged independently. Orientation and observing date differ from the reference.</div></div><p>${escape(record?.finding||entries[0].appearance.note)}</p>${record?.limitations?'<p class="limitations">'+escape(Array.isArray(record.limitations)?record.limitations.join(' '):record.limitations)+'</p>':''}${reference?'<p><a href="'+escape(reference.url)+'">'+escape(reference.title)+'</a> &middot; '+escape(reference.credit)+'<br>'+escape(reference.band)+'</p>':''}</article>`;
  };
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Solar System body appearance audit</title><style>*{box-sizing:border-box}body{margin:0;background:#10171d;color:#e5eced;font:14px system-ui,sans-serif}header{padding:24px 30px;max-width:1500px}h1{font-size:26px;margin:0 0 12px}p{line-height:1.45;margin:10px 0}a{color:#8fdacf}section{padding:20px 24px;width:1600px}h2{margin:0 0 16px;font-size:24px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}article{border:1px solid #4c5962;background:#17222b;padding:12px}h3{margin:0 0 12px;font-size:20px}h3 span{font-size:12px;font-weight:400;color:#b0c4c9;margin-left:8px}.images{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}figure{margin:0;min-width:0}img{width:100%;height:157px;object-fit:contain;background:#080c11;display:block}figcaption{font-size:11px;min-height:29px;margin-top:4px;overflow-wrap:anywhere}.key,.pending{font-size:12px;line-height:1.45;padding:10px;color:#afc2c8}.limitations{color:#d6c9ab}article p{font-size:12px}footer{padding:24px}</style></head><body><header><h1>Solar System body appearance audit</h1><p>${objects.length} bodies, six model views each (four northern longitudes and two southern views). Official observations are shown in their original framing. This is a visual review, not a pixel comparison: phase, orientation, wavelength, exposure, resolution and observation date differ.</p><p>Capture: ${escape(phase)}. Body sizes are normalized separately for inspection; image brightness is not a measurement of absolute albedo. Click any image to inspect its full resolution. Missing or unresolved surfaces remain explicitly documented.</p></header>${groups.filter(([, ,filter])=>objects.some(filter)).map(([id,title,filter])=>'<section data-group="'+id+'"><h2>'+escape(title)+'</h2><div class="cards">'+objects.filter(filter).map(card).join('')+'</div></section>').join('')}<footer>Renderer evidence: <a href="evidence.json">evidence.json</a>. Reference image copyrights and credits belong to their stated NASA source records.</footer></body></html>`;
  await writeFile(resolve(output,'report.html'),html);
  const reportPage=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  await reportPage.goto('file://'+resolve(output,'report.html'),{waitUntil:'load'});
  const brokenImages=await reportPage.locator('img').evaluateAll(images=>images.filter(image=>!image.complete||!image.naturalWidth).map(image=>image.src));
  assert.deepEqual(brokenImages,[],'Every model and reference image decodes in the review report');
  for(const [id] of groups) if(await reportPage.locator('section[data-group="'+id+'"]').count()) await reportPage.locator('section[data-group="'+id+'"]').screenshot({path:resolve(output,'contact-'+id+'.png')});
  const sourceCodeSha256={};
  for(const path of ['src/planet-visuals.js','src/body-shape-data.js','src/solar-photosphere.js','tests/fixtures/body-audit.html'])if(existsSync(path))sourceCodeSha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
  const evidence={phase,sourceCodeSha256,workingTreeChanges:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),manifestSha256:createHash('sha256').update(await readFile('src/official-surfaces.json')).digest('hex'),settings:{light:'white directional 3.2 + neutral ambient 0.07',views,bodyRadius:1,imageSize:[512,512],cameraPositionInBodyAxes:{north:[0,2.2,5],south:[0,-2.2,5]}},bodyCount:objects.length,renderCount:captures.length,captures,references,errors,requestErrors,referenceErrors};
  await writeFile(resolve(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  if(phase==='final') {
    assert.equal(Object.keys(references).length,objects.length,'Every audited body has a downloaded official observation');
    assert.deepEqual(referenceErrors,[],'No official observation downloads failed');
  }
  console.log('PASS: '+objects.length+' bodies / '+captures.length+' actual GPU renders; report '+relative(process.cwd(),resolve(output,'report.html')));
} catch(error) {
  console.error('Body audit failures:',{errors,requestErrors,referenceErrors});
  if(page&&!page.isClosed())await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
  throw error;
} finally {await browser.close();}
