import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { catalog, scales, seededRandom } from './data.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { createXR } from './xr.js';

const GOLD = 0xd5b77e;
const vec = (a) => new THREE.Vector3(...a);
const ease = (t) => t*t*(3-2*t);

export class Universe {
  constructor({canvas,labelContainer,onSelect=()=>{},onScale=()=>{},onMessage=()=>{}}) {
    this.canvas=canvas; this.labelContainer=labelContainer;
    this.onSelect=onSelect;this.onScale=onScale;this.onMessage=onMessage;
    this.index=2;this.layers={labels:true,grid:true,particles:true};this.quality='high';
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.autoRotate=!this.reducedMotion;this.ready=false;this.elapsed=0;this.labels=[];this.targets=[];this.retiring=[];
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x080c11);this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.xr.enabled=true;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(44,1,.05,900);this.camera.position.set(0,27,41);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.055;
    this.controls.minDistance=4;this.controls.maxDistance=120;this.controls.autoRotate=this.autoRotate;this.controls.autoRotateSpeed=.15;
    this.controls.maxPolarAngle=Math.PI*.92;this.controls.enablePan=true;
    this.controls.addEventListener('start',()=>{this.cameraFlight=null;});
    this.mapRoot=new THREE.Group();this.scene.add(this.mapRoot);
    this.glowTexture=this.makeGlow();
    this.sky=this.makeSky();this.scene.add(this.sky);
    this.ambient=new THREE.AmbientLight(0xb7c7df,1.3);this.scene.add(this.ambient);
    this.sunLight=new THREE.PointLight(0xffd7a1,60,80,1.1);this.mapRoot.add(this.sunLight);
    this.xr=createXR({renderer:this.renderer,scene:this.scene,camera:this.camera,controls:this.controls,mapRoot:this.mapRoot,
      getTargets:()=>this.targets,onSelect:(o)=>this.selectObject(o),onScale:(delta)=>this.setScale(THREE.MathUtils.clamp(this.index+delta,0,4)),getScale:()=>this.index,onMessage});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);this.resize();
    this.pointerStart=null;
    canvas.addEventListener('pointerdown',this.onPointerDown=(e)=>{this.pointerStart={x:e.clientX,y:e.clientY,time:performance.now()};});
    canvas.addEventListener('pointerup',this.onPointerUp=(e)=>{if(!this.pointerStart||Math.hypot(e.clientX-this.pointerStart.x,e.clientY-this.pointerStart.y)>6||performance.now()-this.pointerStart.time>450)return;this.pick(e);});
    canvas.addEventListener('webglcontextlost',this.onContextLost=(e)=>{e.preventDefault();this.onMessage('Il contesto grafico è stato interrotto. Ricarica la pagina per riprendere.');});
    this.setScale(2,true);
    this.lastTime=performance.now();this.renderer.setAnimationLoop((time)=>this.animate(time));this.ready=true;
  }
  makeGlow(){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,251,233,1)');g.addColorStop(.045,'rgba(255,244,216,.95)');g.addColorStop(.13,'rgba(255,231,183,.45)');g.addColorStop(.4,'rgba(242,205,151,.07)');g.addColorStop(1,'rgba(255,220,173,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
  particleCloud(positions,colors,sizes,opacity=1){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
    geometry.setAttribute('aPhase',new THREE.Float32BufferAttribute(sizes.map((_,i)=>i*2.399),1));
    const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uPixelRatio:{value:this.renderer.getPixelRatio()},uOpacity:{value:opacity}}});
    material.userData.baseOpacity=opacity;const cloud=new THREE.Points(geometry,material);cloud.userData.particles=true;return cloud;
  }
  makeSky(){const random=seededRandom(7),p=[],c=[],s=[];for(let i=0;i<2200;i++){const a=random()*Math.PI*2,z=random()*2-1,r=150+random()*180,t=Math.sqrt(1-z*z);p.push(r*t*Math.cos(a),r*z,r*t*Math.sin(a));const tint=random();c.push(.35+tint*.28,.43+tint*.22,.51+tint*.2);s.push(1+random()*2.5);}return this.particleCloud(p,c,s,.72);}
  line(points,color=GOLD,opacity=.12,closed=false){const g=new THREE.BufferGeometry().setFromPoints(points);const m=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false});m.userData.baseOpacity=opacity;return closed?new THREE.LineLoop(g,m):new THREE.Line(g,m);}
  ring(radius,opacity=.15){return this.line(Array.from({length:241},(_,i)=>new THREE.Vector3(Math.cos(i/240*Math.PI*2)*radius,0,Math.sin(i/240*Math.PI*2)*radius)),GOLD,opacity);}
  makeGrid(){const g=new THREE.Group();g.name='grid';for(const r of [5,10,15,20,23])g.add(this.ring(r,r===23?.22:.09));
    for(let i=0;i<72;i++){const a=i/72*Math.PI*2,r=23,len=i%6===0?.6:.22;g.add(this.line([new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r),new THREE.Vector3(Math.cos(a)*(r+len),0,Math.sin(a)*(r+len))],GOLD,i%6===0?.38:.17));}
    for(let i=0;i<8;i++){const a=i*Math.PI/4;g.add(this.line([new THREE.Vector3(Math.cos(a)*2,0,Math.sin(a)*2),new THREE.Vector3(Math.cos(a)*23,0,Math.sin(a)*23)],GOLD,.07));}
    const meridian=this.ring(23,.065);meridian.rotation.x=Math.PI/2;g.add(meridian);const second=this.ring(23,.065);second.rotation.z=Math.PI/2;g.add(second);g.position.y=-.4;return g;
  }
  makeGalaxy(seed=81,count=38000,radius=18){
    const random=seededRandom(seed),p=[],c=[],s=[];const warm=new THREE.Color('#dbb87e'),blue=new THREE.Color('#86a7b7'),white=new THREE.Color('#f6e4b6');
    for(let i=0;i<count;i++){
      const bulge=i<count*.19;const r=bulge?Math.pow(random(),1.7)*radius*.27:Math.pow(random(),.65)*radius;
      const arm=i%4;const spread=(random()+random()+random()-1.5)*(bulge?2.2:.48);
      const a=arm*Math.PI*.5+r*.30+spread;let x=Math.cos(a)*r,z=Math.sin(a)*r;
      const y=(random()+random()+random()-1.5)*(bulge?1.6:Math.max(.15,.9-r*.038));
      if(bulge){x*=1.45;z*=.65;}
      p.push(x,y,z);const color=white.clone().lerp(r/radius>.4&&random()>.6?blue:warm,Math.min(1,r/radius+.1));color.multiplyScalar(.55+random()*.8);c.push(color.r,color.g,color.b);s.push((.32+Math.pow(random(),5)*2.2)*(bulge?1.2:1));
    }
    const g=new THREE.Group();g.add(this.particleCloud(p,c,s,.93));
    const hazeP=[],hazeC=[],hazeS=[];
    for(let i=0;i<1800;i++){const r=Math.pow(random(),.7)*radius,a=i%4*Math.PI*.5+r*.30+(random()-.5)*.36;hazeP.push(Math.cos(a)*r,(random()-.5)*.7,Math.sin(a)*r);hazeC.push(.27,.23,.15);hazeS.push(3+random()*6);}
    g.add(this.particleCloud(hazeP,hazeC,hazeS,.22));
    const core=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color:0xffdda3,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.82}));core.material.userData.baseOpacity=.82;core.scale.set(13,13,1);g.add(core);
    for(let arm=0;arm<4;arm++){const points=[];for(let i=0;i<170;i++){const r=2+i/170*(radius-2),a=arm*Math.PI*.5+r*.30;points.push(new THREE.Vector3(Math.cos(a)*r,.02,Math.sin(a)*r));}g.add(this.line(points,0xcfaf77,.10));}
    return g;
  }
  makeSolar(){const g=new THREE.Group();const random=seededRandom(5);const p=[],c=[],s=[];for(let i=0;i<2600;i++){const r=11.1+(random()-.5)*1.3,a=random()*Math.PI*2;p.push(Math.cos(a)*r,(random()-.5)*.2,Math.sin(a)*r);c.push(.46,.39,.28);s.push(.25+random()*.4);}g.add(this.particleCloud(p,c,s,.65));for(const o of catalog.solar){if(o.orbit)g.add(this.ring(o.orbit,.18));}return g;}
  makeLocal(){const g=new THREE.Group();for(const [i,o] of catalog.local.entries()){const galaxy=this.makeGalaxy(30+i,i<3?6500:600,i<3?1.5:.27);galaxy.position.copy(vec(o.position));galaxy.rotation.set(.2*i,.8*i,.4*i);g.add(galaxy);}return g;}
  makeStars(){const g=new THREE.Group(),p=[],c=[],s=[];for(const o of catalog.stars.slice(1)){if(o.measured){p.push(...o.position);const color=new THREE.Color(o.color);c.push(color.r,color.g,color.b);s.push(1.5+Math.max(0,8-(o.mag??8))*.18);}else{g.add(this.line([new THREE.Vector3(),vec(o.position)],0x839ba8,.11));const flat=vec(o.position);flat.y=0;g.add(this.line([flat,vec(o.position)],GOLD,.09));}}const measuredCloud=this.particleCloud(p,c,s,.95);measuredCloud.userData.particles=false;g.add(measuredCloud);return g;}
  makeCosmic(){const g=new THREE.Group(),random=seededRandom(103),p=[],c=[],s=[],nodes=[];
    for(let i=0;i<68;i++)nodes.push(new THREE.Vector3((random()-.5)*39,(random()-.5)*24,(random()-.5)*35));
    for(let i=0;i<nodes.length;i++){const neighbors=nodes.map((n,j)=>({n,j,d:n.distanceTo(nodes[i])})).filter(n=>n.j>i&&n.d<13).sort((a,b)=>a.d-b.d).slice(0,3);
      for(const {n} of neighbors){const start=nodes[i],mid=start.clone().lerp(n,.5).add(new THREE.Vector3((random()-.5)*3,(random()-.5)*3,(random()-.5)*3));const curve=new THREE.QuadraticBezierCurve3(start,mid,n);g.add(this.line(curve.getPoints(25),0xa78d69,.065));for(let k=0;k<260;k++){const t=random(),v=curve.getPoint(t),spread=.1+Math.sin(t*Math.PI)*.42;v.add(new THREE.Vector3((random()+random()-1)*spread,(random()+random()-1)*spread,(random()+random()-1)*spread));p.push(v.x,v.y,v.z);const warm=random()>.3;c.push(warm?.68:.38,warm?.51:.52,warm?.3:.66);s.push(.25+random()*1.15);}}
      for(let k=0;k<100;k++){const v=nodes[i].clone().add(new THREE.Vector3((random()+random()-1)*.8,(random()+random()-1)*.8,(random()+random()-1)*.8));p.push(v.x,v.y,v.z);c.push(.85,.72,.51);s.push(.4+random()*1.2);}
    }g.add(this.particleCloud(p,c,s,.85));return g;
  }
  makeMarker(o){
    const g=new THREE.Group();g.position.copy(vec(o.position));g.userData.object=o;
    const isPlanet=this.index===0;const size=isPlanet?(o.size||.3):this.index===3?.10:.10;
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(size,24,16),isPlanet&&o.id!=='sun'?new THREE.MeshStandardMaterial({color:o.color,roughness:.8,emissive:o.color,emissiveIntensity:.18}):new THREE.MeshBasicMaterial({color:o.color}));if(o.measured){mesh.geometry.dispose();mesh.material.dispose();}else g.add(mesh);
    const hit=new THREE.Mesh(new THREE.SphereGeometry(isPlanet?Math.max(size,.55):.5,12,8),new THREE.MeshBasicMaterial({visible:false}));hit.userData.object=o;g.add(hit);this.targets.push(hit);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color:o.color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:isPlanet?.8:.9}));glow.scale.setScalar(isPlanet?size*9:2.3);glow.material.userData.baseOpacity=glow.material.opacity;if(o.measured)glow.material.dispose();else g.add(glow);
    if(o.id==='saturn'){const ring=new THREE.Mesh(new THREE.RingGeometry(.82,1.28,64),new THREE.MeshBasicMaterial({color:0xd0b685,side:THREE.DoubleSide,transparent:true,opacity:.58}));ring.rotation.x=Math.PI*.42;g.add(ring);}
    this.content.add(g);
    const label=document.createElement('button');label.className='map-label'+(o.id==='solar-system'||o.id==='earth'?' home':'');label.textContent=o.name;label.setAttribute('aria-label',`Seleziona ${o.name}`);label.addEventListener('click',()=>this.selectObject(o));this.labelContainer.append(label);this.labels.push({element:label,object:g,data:o});
    return g;
  }
  setScale(index,initial=false){
    index=Math.round(THREE.MathUtils.clamp(index,0,4));if(!initial&&index===this.index)return;
    if(this.content){this.retiring.push({group:this.content,start:this.elapsed});}
    this.index=index;this.targets=[];this.labels.forEach(l=>l.element.remove());this.labels=[];
    this.content=new THREE.Group();this.mapRoot.add(this.content);this.content.userData.born=this.elapsed;
    const grid=this.makeGrid();grid.visible=this.layers.grid;this.content.add(grid);
    const map=[()=>this.makeSolar(),()=>this.makeStars(),()=>this.makeGalaxy(81,this.quality==='high'?38000:15000),()=>this.makeLocal(),()=>this.makeCosmic()][index]();map.name='map';this.content.add(map);
    for(const o of catalog[scales[index].id])this.makeMarker(o);
    this.selected=null;this.selectObject(catalog[scales[index].id][0]);this.setLayer('particles',this.layers.particles);
    if(!initial&&!this.renderer.xr.isPresenting)this.resetView();
    this.onScale(index);this.xr?.setInfo({...this.selected,scaleLabel:scales[index].name});
    if(initial)this.content.userData.born=-3;
  }
  setOpacity(group,opacity){group.traverse(o=>{if(!o.material)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.uniforms?.uOpacity)m.uniforms.uOpacity.value=(m.userData.baseOpacity??1)*opacity;else if(m.visible!==false){if(m.userData.baseOpacity===undefined)m.userData.baseOpacity=m.opacity;m.transparent=true;m.opacity=m.userData.baseOpacity*opacity;}}});}
  disposeGroup(group){group.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});group.removeFromParent();}
  selectObject(object){this.selected=object;for(const l of this.labels)l.element.classList.toggle('selected',l.data.id===object.id);this.onSelect(object);this.xr?.setInfo({...object,scaleLabel:scales[this.index].name});
    if(this.selectionRing){this.selectionRing.removeFromParent();this.selectionRing.geometry.dispose();this.selectionRing.material.dispose();}
    this.selectionRing=this.ring(this.index===0?(object.size||.4)*1.9:.62,.75);this.selectionRing.position.copy(vec(object.position));this.selectionRing.position.y+=.06;this.content.add(this.selectionRing);
  }
  focusObject(object){this.selectObject(object);if(this.renderer.xr.isPresenting)return;const target=vec(object.position);const direction=this.camera.position.clone().sub(this.controls.target).normalize();const distance=this.index===0?Math.max(4,(object.size||.3)*7):this.index===2&&object.id==='milkyway'?40:9;this.fly(target.clone().addScaledVector(direction,distance),target);}
  fly(position,target){this.cameraFlight={start:this.elapsed,from:this.camera.position.clone(),to:position,targetFrom:this.controls.target.clone(),targetTo:target,duration:this.reducedMotion?.05:1.65};}
  resetView(){if(this.renderer.xr.isPresenting)return;this.fly(new THREE.Vector3(0,27,41),new THREE.Vector3());}
  zoom(factor){if(this.renderer.xr.isPresenting)return;const offset=this.camera.position.clone().sub(this.controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,4,120));this.fly(this.controls.target.clone().add(offset),this.controls.target.clone());}
  setLayer(name,value){this.layers[name]=value;if(name==='labels')this.labelContainer.style.display=value?'':'none';if(name==='grid')this.content.getObjectByName('grid').visible=value;if(name==='particles'){this.sky.visible=value;this.content.traverse(o=>{if(o.userData.particles)o.visible=value;});}}
  setAutoRotate(value){this.autoRotate=value;this.controls.autoRotate=value;}
  setQuality(quality){if(this.quality===quality)return;this.quality=quality;this.renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='low'?1:1.75));const index=this.index;this.index=-1;this.setScale(index);this.resize();}
  enterVR(){this.cameraFlight=null;return this.xr.enter();}
  pick(event){const rect=this.canvas.getBoundingClientRect();const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);const hits=ray.intersectObjects(this.targets,false);if(hits[0])this.selectObject(hits[0].object.userData.object);}
  resize(){if(this.renderer.xr.isPresenting)return;const w=this.canvas.clientWidth,h=this.canvas.clientHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.fov=w<700?59:44;this.camera.updateProjectionMatrix();}
  updateLabels(){
    if(this.renderer.xr.isPresenting){this.labelContainer.style.visibility='hidden';return;}this.labelContainer.style.visibility='visible';if(!this.layers.labels)return;
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight,used=[];const center=new THREE.Vector3();
    const ordered=[...this.labels].sort((a,b)=>(b.data.id===this.selected?.id)-(a.data.id===this.selected?.id));
    for(const l of ordered){l.object.getWorldPosition(center);center.project(this.camera);const x=(center.x*.5+.5)*w+10,y=(-center.y*.5+.5)*h-10;const width=l.data.name.length*6.1+25;
      const inPanel=w>900&&(x<270||x+width>w-305);const visible=used.length<(w>900?12:6)&&center.z<1&&center.z>-1&&x>8&&x+width<w-10&&y>190&&y<h-180&&!inPanel&&!used.some(r=>x<r.x+r.w&&x+width>r.x&&Math.abs(y-r.y)<25);
      l.element.style.display=visible?'block':'none';if(visible){l.element.style.transform=`translate(${x}px,${y}px)`;used.push({x,y,w:width});}
    }
  }
  animate(time){
    const frameDelta=Math.max(0,(time-this.lastTime)/1000);const dt=Math.min(frameDelta,.06);this.lastTime=time;this.elapsed+=frameDelta;
    if(!this.renderer.xr.isPresenting){if(this.cameraFlight){const f=this.cameraFlight,t=THREE.MathUtils.clamp((this.elapsed-f.start)/f.duration,0,1);this.camera.position.lerpVectors(f.from,f.to,ease(t));this.controls.target.lerpVectors(f.targetFrom,f.targetTo,ease(t));if(t===1)this.cameraFlight=null;}this.controls.update(dt);}
    const born=this.content.userData.born;const progress=this.reducedMotion?1:THREE.MathUtils.clamp((this.elapsed-born)/1.5,0,1);this.setOpacity(this.content,ease(progress));this.content.scale.setScalar(.92+.08*ease(progress));
    for(let i=this.retiring.length-1;i>=0;i--){const r=this.retiring[i],t=(this.elapsed-r.start)/.85;if(t>=1||this.reducedMotion){this.disposeGroup(r.group);this.retiring.splice(i,1);}else{this.setOpacity(r.group,1-ease(t));r.group.scale.setScalar(1+t*.08);}}
    this.scene.traverse(o=>{if(o.material?.uniforms?.uTime)o.material.uniforms.uTime.value=this.reducedMotion?0:this.elapsed;});
    if(this.selectionRing&&!this.reducedMotion)this.selectionRing.material.opacity*=.7+Math.sin(this.elapsed*2)*.3;
    this.xr.update(dt);this.sunLight.intensity=60*Math.pow(this.mapRoot.scale.x,1.1);if(!this.lastLabelTime||this.elapsed-this.lastLabelTime>.05){this.updateLabels();this.lastLabelTime=this.elapsed;}this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.renderer.setAnimationLoop(null);this.resizeObserver.disconnect();this.controls.dispose();this.xr.dispose?.();this.disposeGroup(this.mapRoot);this.disposeGroup(this.sky);this.glowTexture.dispose();this.renderer.dispose();this.canvas.removeEventListener('pointerdown',this.onPointerDown);this.canvas.removeEventListener('pointerup',this.onPointerUp);this.canvas.removeEventListener('webglcontextlost',this.onContextLost);this.labels.forEach(l=>l.element.remove());}
}





