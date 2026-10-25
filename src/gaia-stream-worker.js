import { createGaiaTileStream } from './gaia-hips.js';
let stream,revision=0;
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){
      stream?.dispose();revision=data.revision;const generation=revision;
      stream=createGaiaTileStream({...data.options,onUpdate:update=>self.postMessage({type:'update',update,revision:generation})});
    }else if(data.type==='view')stream?.setView(data.view);
    else if(data.type==='retry')stream?.retry();
  }catch(error){self.postMessage({type:'error',error:error.message,revision});}
};