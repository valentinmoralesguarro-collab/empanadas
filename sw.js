/* Empanadas Convi — Copyright (c) 2026 Felipe. Todos los derechos reservados. */
// Cache de la cáscara para abrir sin señal. SUBIR VERSION EN CADA CAMBIO (si no, los teléfonos nunca lo reciben).
const VERSION = 'empanadas-v1.3.0';
const PREFIJO = 'empanadas-v';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'apple-touch-icon.png', 'backend.js', 'demo.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIJO) && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Red primero (recibe actualizaciones), caché si no hay conexión.
// Solo GET del mismo origen: el backend (script.google.com) nunca se cachea.
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\.webmanifest$|\/icons\/|apple-touch-icon|oauth\.html$/.test(url.pathname)) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
