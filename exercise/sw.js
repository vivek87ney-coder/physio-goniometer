const C='exercise-v1';
const ASSETS=['./index.html','./app.js','./engine.js','./data.js','./reports.js','./manifest.json','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./favicon-32.png','./vendor/vision_bundle.mjs','./vendor/wasm/vision_wasm_internal.js','./vendor/wasm/vision_wasm_internal.wasm','./vendor/pose_landmarker_lite.task','./vendor/jspdf.umd.min.js','./vendor/xlsx.full.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x.startsWith('exercise-')).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;
 e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(n=>{if(n.ok){const cp=n.clone();caches.open(C).then(c=>c.put(e.request,cp))}return n}).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):Response.error())))});
