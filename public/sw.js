/* Forkcount — SW mínimo para instalación PWA; sin cache agresivo de rutas dinámicas */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
