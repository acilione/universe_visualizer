// Compact native J2016 astrometry from the existing ESA Gaia archive snapshot.
import {readFileSync,writeFileSync} from 'node:fs';
const catalogue = new URL('../public/catalog/',import.meta.url);
const {stars} = JSON.parse(readFileSync(new URL('gaia-dr3.json',catalogue),'utf8'));
const fields = ['sourceId','raDeg','decDeg','gMag','bpRp','parallaxMas','parallaxErrorMas','ruwe','inQsoCandidates','inGalaxyCandidates'];
const rows = stars.filter(star=>star.gMag!=null && star.gMag<=5.5).map(star=>fields.map(key=>star[key]));
writeFileSync(new URL('gaia-dr3-overview.json',catalogue),JSON.stringify({release:'Gaia DR3',epoch:2016,fields,rows}));
