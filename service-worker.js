const CACHE_NAME = 'cartom-shell-v5';
// Cache séparé et non versionné avec le shell : les tuiles orthophoto (millésime
// 2011-2014, fixe) ne changent jamais, donc pas besoin de les invalider à chaque
// déploiement de l'app.
const ORTHO_CACHE_NAME = 'cartom-ortho-tiles-v1';
const ORTHO_HOSTNAME = 'geolittoral.din.developpement-durable.gouv.fr';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/tide.js',
  './js/points.js',
  './data/tidedata.json',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([CACHE_NAME, ORTHO_CACHE_NAME]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first pour les ressources de l'app (même origine) et pour les tuiles
// orthophoto marée basse (millésime fixe, jamais périmé). Les autres tuiles de
// carte (OSM/OpenSeaMap, autre origine) passent directement par le réseau : une
// connexion est nécessaire pour afficher ces fonds de carte.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isOrtho = url.hostname === ORTHO_HOSTNAME;
  if (url.origin !== self.location.origin && !isOrtho) return;

  const cacheName = isOrtho ? ORTHO_CACHE_NAME : CACHE_NAME;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(cacheName).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
