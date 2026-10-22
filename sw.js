// Offline cache: network-first for app files, fall back to cache when offline.
const CACHE = 'pastry-paladins-v9';
const CORE = ['./', './index.html', './css/style.css', './manifest.webmanifest', './assets/icon.svg',
  './src/main.js', './src/util.js', './src/config.js', './src/save.js', './src/audio.js', './src/input.js', './src/net.js', './src/menuscene.js', './src/perf.js',
  './src/data/heroes.js', './src/data/enemies.js', './src/data/levels.js', './src/data/perks.js', './src/data/skills.js',
  './src/game/world.js', './src/game/player.js', './src/game/render.js', './src/game/fx.js', './vendor/peerjs.min.js', './vendor/qrcode.js', './vendor/mqtt.min.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (new URL(req.url).origin === location.origin || req.url.includes('fonts.g'))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
