import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Exercises real shaders and framebuffer alpha. This simulates a room image
// beneath an AR canvas; it cannot validate a Quest's passthrough compositor.
const base=process.env.ENGINE_TEST_URL || process.env.TEST_URL || 'http://localhost:5173';
const output='test-results/immersive-surround';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],report={checkpoints:[],directions:[]};
const checkpoint=name=>{assert.deepEqual(errors,[],name+': browser errors');report.checkpoints.push(name);console.log('PASS: '+name);};
let page;
try {
  page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  page.setDefaultTimeout(60000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+'/tests/fixtures/immersive-environment.html',{waitUntil:'networkidle',timeout:90000});
  await page.waitForFunction(()=>window.fixture?.ready);
  const catalogue=await page.evaluate(()=>({stars:fixture.catalogue.stars.length,nebulae:fixture.catalogue.nebulae.length,measuredNebulae:fixture.catalogue.nebulae.filter(object=>Number.isFinite(object.raDeg)&&Number.isFinite(object.decDeg)&&Math.abs(object.decDeg)<=90&&Number.isFinite(object.angularSizeArcmin)&&object.angularSizeArcmin>0).length,...fixture.environment.diagnostics}));
  assert.ok(catalogue.starCount>=118000,'Full NASA star catalogue reaches immersive background');
  assert.equal(catalogue.nebulaCount,catalogue.nebulae,'Every nebular centre is represented');
  assert.equal(catalogue.nebulaPatchCount,catalogue.measuredNebulae,'Every known nebular angular extent is represented');
  assert.equal(catalogue.angularReferenceOnly,true,'Distant reference preserves angular coordinates without invented distances');
  report.catalogue=catalogue;
  for(const [name,direction] of [['front',[0,0,-1]],['right',[1,0,0]],['back',[0,0,1]],['left',[-1,0,0]],['up',[0,1,-.001]],['down',[0,-1,-.001]]]){
    const detail=await page.evaluate(direction=>{
      const {camera,environment,THREE}=fixture;
      camera.up.set(0,1,0);camera.lookAt(camera.position.clone().add(new THREE.Vector3(...direction)));fixture.render();
      const stars=environment.group.getObjectByName('immersive-catalogue-background');
      const positions=stars.geometry.attributes.position;
      const point=new THREE.Vector3();let inView=0;
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyQuaternion(camera.quaternion.clone().invert()).applyMatrix4(camera.projectionMatrix);
        if(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z>=-1&&point.z<=1)inView++;
      }
      const gl=fixture.renderer.getContext(),data=new Uint8Array(innerWidth*innerHeight*4);
      gl.readPixels(0,0,innerWidth,innerHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);
      let lit=0;for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>30)lit++;
      return {inView,lit};
    },direction);
    assert.ok(detail.inView>1500,name+' has catalogue stars in its field of view');
    assert.ok(detail.lit>500,name+' produces visible star pixels, not just geometry');
    await page.screenshot({path:output+'/sky-'+name+'.png'});report.directions.push({name,...detail});
  }
  checkpoint('The actual NASA catalogue renders in all six viewing directions');

  const translated=await page.evaluate(()=>{
    const {environment,camera}=fixture;
    const stars=environment.group.getObjectByName('immersive-catalogue-background');
    const before=Array.from(stars.geometry.attributes.position.array);
    const orientation=environment.group.quaternion.toArray();
    const pixelsBefore=fixture.renderer.domElement.toDataURL();
    camera.position.add(new fixture.THREE.Vector3(2,.3,-1));fixture.render();
    return {unchanged:before.every((v,i)=>v===stars.geometry.attributes.position.array[i]),
      orientation,afterOrientation:environment.group.quaternion.toArray(),
      samePixels:pixelsBefore===fixture.renderer.domElement.toDataURL()};
  });
  assert.equal(translated.unchanged,true);assert.deepEqual(translated.orientation,translated.afterOrientation);
  assert.equal(translated.samePixels,true,'Translating the viewer leaves the distant angular sky unchanged');
  checkpoint('Walking does not move star directions or fabricate near-field stellar parallax');

  await page.evaluate(()=>{
    document.body.classList.add('room');
    const {environment,camera,foreground}=fixture;camera.position.set(0,1.65,0);camera.up.set(0,1,0);camera.lookAt(0,1.65,-1);foreground.visible=true;
    environment.configure({active:true,mode:'mr',blendMode:'alpha-blend',dim:0,stars:false,nebulae:false,skyVisible:false});fixture.settle();
  });
  const before=await page.evaluate(()=>({body:fixture.rgba(640,400),room:fixture.rgba(40,40)}));
  await page.screenshot({path:output+'/mr-room-undimmed.png'});
  await page.evaluate(()=>{fixture.environment.configure({dim:.58});fixture.settle();});
  const after=await page.evaluate(()=>({body:fixture.rgba(640,400),room:fixture.rgba(40,40),diagnostics:fixture.environment.diagnostics}));
  assert.deepEqual(after.body,before.body,'Room dimming does not darken an opaque body nearer than the enclosure');
  assert.equal(before.room[3],0,'Unmodified passthrough starts transparent');
  assert.ok(after.room[3]>=130&&after.room[3]<=170,'The alpha canvas contains requested moderate darkening');
  assert.deepEqual(after.room.slice(0,3),[0,0,0]);
  assert.equal(after.diagnostics.dimSupported,true);
  await page.screenshot({path:output+'/mr-room-dimmed.png'});
  report.compositing={before,after};
  checkpoint('MR alpha darkens the simulated room while preserving opaque foreground bodies');

  const stereo=await page.evaluate(()=>{
    const {THREE,renderer,scene,camera}=fixture;
    const eyes=[-.032,.032].map((offset,index)=>{
      const eye=new THREE.PerspectiveCamera(72,innerWidth/2/innerHeight,.01,1500);
      eye.position.copy(camera.position);eye.position.x+=offset;eye.quaternion.copy(camera.quaternion);
      eye.viewport=new THREE.Vector4(index*innerWidth/2,0,innerWidth/2,innerHeight);eye.updateMatrixWorld(true);return eye;
    });
    const stereoCamera=new THREE.ArrayCamera(eyes);renderer.render(scene,stereoCamera);
    const gl=renderer.getContext();return eyes.map((eye,index)=>{
      const data=new Uint8Array(4);gl.readPixels(index*innerWidth/2+40,40,1,1,gl.RGBA,gl.UNSIGNED_BYTE,data);return Array.from(data);
    });
  });
  assert.deepEqual(stereo[0],after.room);assert.deepEqual(stereo[1],after.room);
  await page.screenshot({path:output+'/mr-stereo-composition.png'});
  checkpoint('Both stereo viewports receive the same passthrough attenuation');

  await page.evaluate(()=>{fixture.environment.configure({blendMode:'additive'});fixture.render();});
  const additive=await page.evaluate(()=>({room:fixture.rgba(40,40),diagnostics:fixture.environment.diagnostics}));
  assert.equal(additive.diagnostics.dimSupported,false);assert.equal(additive.diagnostics.effectiveDim,0);
  assert.equal(additive.room[3],0,'Unsupported additive devices are not presented as dimmed');
  checkpoint('Additive displays explicitly report that passthrough dimming is unsupported');

  const disposed=await page.evaluate(()=>{
    const resources=new Set(),released=new Set(),group=fixture.environment.group;
    group.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const mat of node.material?(Array.isArray(node.material)?node.material:[node.material]):[]){resources.add(mat);if(mat.map)resources.add(mat.map);}});
    for(const resource of resources)resource.addEventListener('dispose',()=>released.add(resource));
    fixture.environment.dispose();return {resources:resources.size,released:released.size,detached:group.parent===null};
  });
  assert.ok(disposed.resources>0);assert.equal(disposed.resources,disposed.released);assert.equal(disposed.detached,true);
  checkpoint('The surrounding environment releases its GPU resources');
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));
} catch(error){if(page&&!page.isClosed())await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();}