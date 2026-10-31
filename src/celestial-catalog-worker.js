import {buildCelestialCatalogue} from './celestial-catalog-data.js';
import {setLanguage,t} from './i18n.js';
let catalogue,kind='stars',offset=0;
self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){
      setLanguage(data.language);
      const snapshots=await Promise.all(['nasa-hipparcos.json','nasa-stars.json','nasa-nebulae.json'].map(async file=>{
        const response=await fetch(data.base+'catalog/'+file);
        if(!response.ok)throw new Error(t('NASA catalogue unavailable. Retry loading the catalogue.','Catalogo NASA non disponibile. Riprova a caricare il catalogo.'));
        return response.json();
      }));
      catalogue=buildCelestialCatalogue(...snapshots);
      if(data.includeGaia){
        const {mergeGaiaCatalog}=await import('./gaia-catalog.js');
        const response=await fetch(data.base+'catalog/gaia-dr3.json');
        if(!response.ok)throw new Error(t('Gaia DR3 snapshot unavailable.','Snapshot Gaia DR3 non disponibile.'));
        catalogue=mergeGaiaCatalog(catalogue,await response.json());
      }
      // The receiver builds its own indices. Release worker records as each
      // chunk is handed off instead of keeping a second complete catalogue.
      catalogue={stars:catalogue.stars,nebulae:catalogue.nebulae,metadata:catalogue.metadata};
      self.postMessage({type:'header',metadata:catalogue.metadata});
    }else if(data.type==='next'&&catalogue){
      if(offset>=catalogue[kind].length){if(kind==='stars'){kind='nebulae';offset=0;}else{self.postMessage({type:'done'});catalogue=null;return;}}
      const objects=catalogue[kind].slice(offset,offset+256);
      catalogue[kind].fill(null,offset,offset+objects.length);offset+=objects.length;
      self.postMessage({type:'batch',kind,objects});
    }
  }catch(error){self.postMessage({type:'error',error:error.message});}
};
