// PUSH1: extensao do Service Worker existente via importScripts (mesmo
// mecanismo ja usado por legacy-update-bridge.js) -- nunca reescreve o SW
// gerado pelo Workbox (vite.config.js). Adiciona SOMENTE os listeners
// push/notificationclick; skipWaiting/clientsClaim/cleanupOutdatedCaches/
// precache continuam exatamente como configurados no VitePWA (workbox),
// intocados por este arquivo.
(() => {
  const DEFAULT_TITLE = 'Uni ✦';
  const DEFAULT_URL = '/';

  self.addEventListener('push', (event) => {
    // PUSH1: payload sempre vem do backend (push-send-test-notification),
    // nunca de terceiros -- mesmo assim, parse defensivo: um payload
    // ausente/invalido nunca pode fazer a notificacao falhar silenciosamente
    // (o browser exige showNotification() em resposta a todo evento push).
    let payload;
    try {
      payload = event.data ? event.data.json() : {};
    } catch {
      payload = {};
    }

    const title = typeof payload.title === 'string' && payload.title ? payload.title : DEFAULT_TITLE;
    const body = typeof payload.body === 'string' ? payload.body : '';
    const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : DEFAULT_URL;

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/uniflow-icon-192.png',
        badge: '/uniflow-icon-192.png',
        data: { url },
      }),
    );
  });

  self.addEventListener('notificationclick', (event) => {
    const url = event.notification?.data?.url ?? DEFAULT_URL;
    event.notification.close();

    event.waitUntil(
      (async () => {
        const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = windowClients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });

        if (existing) {
          await existing.focus();
          if ('navigate' in existing && url !== DEFAULT_URL) {
            try {
              await existing.navigate(url);
            } catch {
              // Navegacao cross-origin ou nao suportada -- foco ja aconteceu,
              // sem erro fatal.
            }
          }
          return;
        }

        await self.clients.openWindow(url);
      })(),
    );
  });
})();
