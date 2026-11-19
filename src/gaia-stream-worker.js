import { createGaiaTileStream } from './gaia-hips.js';
let stream,revision=0,overview;
function loadOverview() {
  const url=new URL(import.meta.env.BASE_URL+'catalog/gaia-dr3-overview.json',self.location.origin);
  return overview ||= fetch(url).then(async response=>{
    if (!response.ok) throw new Error('Gaia overview unavailable');
    const {rows,fields,release,epoch}=await response.json();
    if (release!=='Gaia DR3'||epoch!==2016) throw new Error('Unexpected overview');
    return rows.map(values=>Object.fromEntries(fields.map((key,i)=>[key,values[i]])));
  }).catch(()=>{overview=null;return [];});
}
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){
      stream?.dispose();revision=data.revision;const generation=revision;
      stream=createGaiaTileStream({...data.options,fallback:true,timeoutMs:8000,onUpdate:update=>self.postMessage({type:'update',update,revision:generation})});
      const current=stream;loadOverview().then(rows=>{if(stream===current)current.setOverview(rows);});
    }else if(data.type==='view')stream?.setView(data.view);
    else if(data.type==='retry')stream?.retry();
  }catch(error){self.postMessage({type:'error',error:error.message,revision});}
};