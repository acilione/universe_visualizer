/** Fade the complete desktop image before changing its projection or camera. */
export async function fadeDesktopView(canvas, labels, commit, { reducedMotion = false } = {}) {
  if(reducedMotion || !canvas.animate)return commit();
  const elements=[canvas,labels].filter(Boolean);
  const saved=elements.map(element=>({element,opacity:element.style.opacity,pointerEvents:element.style.pointerEvents}));
  const animations=[];
  const fade=async(from,to,duration)=>{
    const running=elements.map(element=>element.animate([{opacity:from},{opacity:to}],{duration,easing:'ease-in-out',fill:'forwards'}));
    animations.push(...running);await Promise.all(running.map(animation=>animation.finished));
    for(const element of elements)element.style.opacity=String(to);
    running.forEach(animation=>animation.cancel());
  };
  for(const element of elements)element.style.pointerEvents='none';
  try{
    await fade(1,0,180);
    await commit();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await fade(0,1,240);
  }finally{
    animations.forEach(animation=>animation.cancel());
    for(const {element,opacity,pointerEvents} of saved){element.style.opacity=opacity;element.style.pointerEvents=pointerEvents;}
  }
}
