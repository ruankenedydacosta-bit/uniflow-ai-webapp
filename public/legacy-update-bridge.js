(() => {
  const BRIDGE_CACHE = 'uniflow-legacy-update-bridge-v1';
  const PENDING_MARKER = '/__uniflow_legacy_update_bridge_pending__';
  const COMPLETED_MARKER = '/__uniflow_legacy_update_bridge_completed__';

  self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
      const cache = await caches.open(BRIDGE_CACHE);
      const completed = await cache.match(COMPLETED_MARKER);
      if (completed) return;

      await cache.put(PENDING_MARKER, new Response('pending'));
      await self.skipWaiting();
    })());
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      const cache = await caches.open(BRIDGE_CACHE);
      const pending = await cache.match(PENDING_MARKER);
      if (!pending) return;

      await cache.put(COMPLETED_MARKER, new Response('completed'));
      await cache.delete(PENDING_MARKER);
    })());
  });
})();
