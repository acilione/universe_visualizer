import test from 'node:test';
import assert from 'node:assert/strict';
import { fadeDesktopView } from '../src/desktop-view-transition.js';

function element(opacity=''){
  const animations=[];
  return {style:{opacity,pointerEvents:'auto'},animations,animate(frames,options){
    let resolve;const animation={frames,options,cancelled:false,finished:new Promise(done=>{resolve=done;}),finish:()=>resolve(),cancel(){this.cancelled=true;}};
    animations.push(animation);return animation;
  }};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('projection handoff commits only while canvas and labels are invisible, then restores styles',async()=>{
  const previous=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=callback=>queueMicrotask(callback);
  const canvas=element('.8'),labels=element();let committed=false;
  try{
    const done=fadeDesktopView(canvas,labels,()=>{committed=true;assert.equal(canvas.style.opacity,'0');assert.equal(labels.style.opacity,'0');});
    assert.equal(committed,false);assert.equal(canvas.style.pointerEvents,'none');
    canvas.animations[0].finish();labels.animations[0].finish();await flush();
    assert.equal(committed,true);assert.equal(canvas.animations.length,2);
    canvas.animations[1].finish();labels.animations[1].finish();await done;
    assert.equal(canvas.style.opacity,'.8');assert.equal(labels.style.opacity,'');assert.equal(canvas.style.pointerEvents,'auto');
    assert.ok(canvas.animations.every(animation=>animation.cancelled));
  }finally{globalThis.requestAnimationFrame=previous;}
});

test('failed scene construction cannot leave the desktop black or unresponsive',async()=>{
  const canvas=element(),labels=element();const done=fadeDesktopView(canvas,labels,()=>{throw new Error('load failed');});
  const rejected=assert.rejects(done,/load failed/);canvas.animations[0].finish();labels.animations[0].finish();await rejected;
  assert.equal(canvas.style.opacity,'');assert.equal(canvas.style.pointerEvents,'auto');assert.equal(labels.style.opacity,'');
});

test('reduced motion switches directly without animation or input lock',async()=>{
  const canvas=element();let called=0;await fadeDesktopView(canvas,null,()=>called++,{reducedMotion:true});
  assert.equal(called,1);assert.equal(canvas.animations.length,0);assert.equal(canvas.style.pointerEvents,'auto');
});
