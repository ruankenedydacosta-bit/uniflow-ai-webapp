// PUSH1/AGPUSH1: extensao do Service Worker existente via importScripts
// (mesmo mecanismo ja usado por legacy-update-bridge.js) -- nunca reescreve
// o SW gerado pelo Workbox (vite.config.js). Adiciona SOMENTE os listeners
// push/notificationclick; skipWaiting/clientsClaim/cleanupOutdatedCaches/
// precache continuam exatamente como configurados no VitePWA (workbox),
// intocados por este arquivo.
(() => {
  const DEFAULT_TITLE = 'Uni ✦';
  const DEFAULT_URL = '/';

  // AGPUSH1: identificadores internos estaveis das actions (nunca o texto
  // visivel do botao) -- mapeados para o `offset` aceito por
  // agenda-push-decision ('30' | '60' | 'none').
  const AGENDA_ACTION_OFFSETS = {
    agenda_remind_30: '30',
    agenda_remind_60: '60',
    agenda_remind_none: 'none',
  };

  self.addEventListener('push', (event) => {
    // PUSH1: payload sempre vem do backend (push-send-test-notification /
    // agenda-push-dispatch), nunca de terceiros -- mesmo assim, parse
    // defensivo: um payload ausente/invalido nunca pode fazer a
    // notificacao falhar silenciosamente (o browser exige
    // showNotification() em resposta a todo evento push).
    let payload;
    try {
      payload = event.data ? event.data.json() : {};
    } catch {
      payload = {};
    }

    const title = typeof payload.title === 'string' && payload.title ? payload.title : DEFAULT_TITLE;
    const body = typeof payload.body === 'string' ? payload.body : '';
    const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : DEFAULT_URL;
    // AGPUSH1: actions so chegam no payload quando o backend ja decidiu que
    // a plataforma suporta (push_subscriptions.platform === 'android', ver
    // agenda-push-dispatch/index.ts) -- este arquivo nunca decide isso
    // sozinho, so repassa o que o payload trouxe.
    const actions = Array.isArray(payload.actions) ? payload.actions : undefined;

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/uniflow-icon-192.png',
        badge: '/uniflow-icon-192.png',
        data: { ...(payload.data ?? {}), url },
        ...(actions ? { actions } : {}),
      }),
    );
  });

  // AGPUSH1: URL absoluta da API Supabase -- este arquivo e servido de
  // public/ (nunca passa pelo processamento de env do Vite, diferente de
  // src/**), entao nao ha import.meta.env aqui. Mesmo projeto referenciado
  // por VITE_SUPABASE_URL/supabaseClient.js e pela migration 043
  // (net.http_post do pg_cron) -- URL publica do endpoint, nunca um
  // segredo.
  const SUPABASE_FUNCTIONS_URL = 'https://ikulazofzufeblzrhtif.supabase.co/functions/v1';

  // AGPUSH1: registra a decisao de uma action (30min/1h/Nao precisa)
  // diretamente pela Edge Function, com o decision_token do proprio
  // payload -- SEM sessao de usuario (localStorage nao e acessivel de um
  // Service Worker) e, quando a plataforma permite, SEM abrir/focar janela
  // nenhuma (a acao e processada inteiramente em background).
  async function submitAgendaDecision(data, offset) {
    if (!data?.agenda_item_id || !data?.decision_token) return;
    try {
      await fetch(`${SUPABASE_FUNCTIONS_URL}/agenda-push-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agenda_item_id: data.agenda_item_id,
          token: data.decision_token,
          offset,
        }),
      });
    } catch {
      // Falha de rede em background nunca deve gerar um erro nao tratado
      // no Service Worker -- sem retry nesta fase (mesma cautela de
      // "nada de complexidade alem do pedido").
    }
  }

  async function focusOrOpen(url) {
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
  }

  self.addEventListener('notificationclick', (event) => {
    const data = event.notification?.data ?? {};
    const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : DEFAULT_URL;
    const action = event.action;
    event.notification.close();

    const agendaOffset = action ? AGENDA_ACTION_OFFSETS[action] : undefined;

    if (agendaOffset) {
      // AGPUSH1: acao de agenda -- so registra a decisao em background,
      // nunca abre/foca janela (evita interromper o que o usuario estava
      // fazendo por causa de um toque rapido num botao da notificacao).
      event.waitUntil(submitAgendaDecision(data, agendaOffset));
      return;
    }

    // Toque simples (sem action, ou plataforma sem suporte a actions):
    // sempre abre/foca a UniFlow no deep link do payload.
    event.waitUntil(focusOrOpen(url));
  });
})();
