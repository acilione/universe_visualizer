// Yield an actual task, not a microtask, so input and rendering can run.
export const yieldToMain = () => globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(resolve=>setTimeout(resolve,0));

// Normal timer tasks let pending input and paints run. Boosted scheduler.yield
// continuations can otherwise keep ordinary UI tasks behind an entire catalogue.
const yieldForPaint=()=>new Promise(resolve=>setTimeout(resolve,0));

export async function consumeSteps(steps,{cancelled=()=>false,onBatch=()=>{},budget=4}={}){
  await yieldForPaint();
  while(!cancelled()){
    const start=performance.now();let result;
    do{result=steps.next();if(result.done){onBatch();return result.value;}}while(performance.now()-start<budget&&!cancelled());
    if(cancelled())break;
    onBatch();await yieldForPaint();
  }
  steps.return?.();return false;
}
