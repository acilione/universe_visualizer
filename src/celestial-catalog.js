import {t,getLanguage} from './i18n.js';
import {celestialCatalogueSteps} from './celestial-catalog-data.js';
import {consumeSteps,yieldToMain} from './cooperative.js';
export * from './celestial-catalog-data.js';
let cataloguePromise,gaiaPromise,gaiaEnabled=false;
export function setGaiaCatalogueEnabled(value){gaiaEnabled=Boolean(value);}

export async function fetchCelestialSnapshots(base=import.meta.env?.BASE_URL||'/'){
  return Promise.all(['nasa-hipparcos.json','nasa-stars.json','nasa-nebulae.json'].map(async file=>{
    const response=await fetch(base+'catalog/'+file);
    if(!response.ok)throw new Error(t('NASA catalogue unavailable. Retry loading the catalogue.','Catalogo NASA non disponibile. Riprova a caricare il catalogo.'));
    return response.json();
  }));
}
async function fallbackCatalogue(includeGaia){
  const data=await consumeSteps(celestialCatalogueSteps(...await fetchCelestialSnapshots()));
  if(!includeGaia)return data;
  const {mergeGaiaCatalog}=await import('./gaia-catalog.js');
  const response=await fetch((import.meta.env?.BASE_URL||'/')+'catalog/gaia-dr3.json');
  if(!response.ok)throw new Error(t('Gaia DR3 snapshot unavailable.','Snapshot Gaia DR3 non disponibile.'));
  return mergeGaiaCatalog(data,await response.json());
}
function workerCatalogue(includeGaia){
  if(typeof Worker==='undefined')return fallbackCatalogue(includeGaia);
  return new Promise((resolve,reject)=>{
    let worker;
    try{worker=new Worker(new URL('./celestial-catalog-worker.js',import.meta.url),{type:'module'});}
    catch{resolve(fallbackCatalogue(includeGaia));return;}
    const data={stars:[],nebulae:[],objects:[],byId:new Map(),byHip:new Map(),metadata:{}};
    const fail=error=>{worker.terminate();reject(error);};
    worker.onerror=event=>{event.preventDefault();worker.terminate();resolve(fallbackCatalogue(includeGaia));};
    worker.onmessageerror=()=>fail(new Error('Unable to receive the celestial catalogue.'));
    worker.onmessage=async({data:message})=>{
      try{
        if(message.type==='error'){fail(new Error(message.error));return;}
        if(message.type==='header')data.metadata=message.metadata;
        if(message.type==='batch'){
          // Acknowledge only after this bounded chunk has been indexed and input
          // has had a chance to run. Never clone the whole catalogue at once.
          for(const object of message.objects){data[message.kind].push(object);data.objects.push(object);data.byId.set(object.id,object);if(object.hip)data.byHip.set(object.hip,object);}
        }
        if(message.type==='done'){worker.terminate();resolve(data);return;}
        await yieldToMain();worker.postMessage({type:'next'});
      }catch(error){fail(error);}
    };
    worker.postMessage({type:'load',language:getLanguage(),includeGaia,base:new URL(import.meta.env?.BASE_URL||'/',globalThis.location.href).href});
  });
}
export function loadCelestialCatalog({includeGaia=gaiaEnabled}={}){
  if(includeGaia)return gaiaPromise ||= workerCatalogue(true).catch(error=>{gaiaPromise=null;throw error;});
  return cataloguePromise ||= workerCatalogue(false).catch(error=>{cataloguePromise=null;throw error;});
}
