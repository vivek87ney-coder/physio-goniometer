// 3D Movement Mechanics service worker – cache-first, full offline after first load.
const V = 'mechanics-v1', C = V + '-core', H = V + '-pose';
const CORE = ['./', './index.html', './style.css', './app.js', './model.js', './cam.js', './manifest.json', './icon.svg', './icon-maskable.svg',
  '../biomech/vendor/three.module.min.js', '../biomech/vendor/OrbitControls.js', '../biomech/vendor/jspdf.umd.min.js', '../biomech/vendor/vision_bundle.mjs'];
const HEAVY = ['../biomech/vendor/pose_landmarker_lite.task', '../biomech/vendor/wasm/vision_wasm_internal.js', '../biomech/vendor/wasm/vision_wasm_internal.wasm',
  '../biomech/vendor/wasm/vision_wasm_nosimd_internal.js', '../biomech/vendor/wasm/vision_wasm_nosimd_internal.wasm'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('mechanics-') && !k.startsWith(V)) await caches.delete(k);
  await self.clients.claim();
  const c = await caches.open(H); for (const u of HEAVY) { if (!(await c.match(u))) { try { await c.add(u); } catch (_) { } } } // camera assets in background
})()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(n => {
    if (n.ok && new URL(e.request.url).origin === location.origin) { const cp = n.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return n;
  }).catch(() => e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
