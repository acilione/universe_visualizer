import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Supply a trusted certificate to open an immersive WebXR session over the LAN.
const cert=process.env.TLS_CERT;
const key=process.env.TLS_KEY;
if(Boolean(cert)!==Boolean(key)) throw new Error('Impostare sia TLS_CERT sia TLS_KEY.');
export default defineConfig({
  server:{host:'0.0.0.0',port:5173,https:cert&&key?{cert:readFileSync(cert),key:readFileSync(key)}:undefined},
  build:{rollupOptions:{output:{manualChunks:{three:['three'],icons:['lucide']}}}},
});
