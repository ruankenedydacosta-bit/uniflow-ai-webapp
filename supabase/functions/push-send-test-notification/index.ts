// Edge Function: push-send-test-notification
//
// PUSH1: fundacao de Web Push (Fase 1) -- envia a UNICA notificacao de
// teste permitida nesta fase, SEMPRE para as proprias subscriptions ativas
// do usuario autenticado. Nunca aceita titulo/corpo/alvo do corpo da
// requisicao -- o payload e fixo (definido abaixo), e o destinatario e
// sempre resolvido a partir do proprio JWT (nunca de um user_id/workspace_id
// vindo do cliente) -- elimina qualquer possibilidade de um cliente
// disparar push arbitrario para outro usuario.
//
// Criptografia Web Push (VAPID JWT + RFC 8291 aes128gcm): usa a biblioteca
// oficial `web-push` via npm: specifier (suportado pelo Deno/Edge Runtime)
// em vez de reimplementar a criptografia a mao -- diferente das demais
// Edge Functions deste projeto (que evitam dependencias externas), aqui o
// risco de reimplementar HKDF/ECDH/AES-GCM incorretamente (falha
// silenciosa em dispositivos reais, dificil de depurar) supera o beneficio
// de "zero dependencias". Fonte oficial: https://github.com/web-push-libs/web-push
//
// Segredos exigidos (Supabase Edge Function secrets, NUNCA no frontend):
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: ou https:
// de contato, exigido pelo protocolo VAPID).

import webpush from 'npm:web-push@3.6.7';

function getAllowedOrigins() {
  return new Set(
    (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (getAllowedOrigins().has(origin)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

interface ActivePushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function listActiveSubscriptions({
  authorization, supabaseUrl, anonKey, userId,
}: { authorization: string; supabaseUrl: string; anonKey: string; userId: string }): Promise<ActivePushSubscription[]> {
  const params = new URLSearchParams({
    select: 'id,endpoint,p256dh,auth', user_id: `eq.${userId}`, revoked_at: 'is.null',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

// PUSH1: marca uma subscription como revogada quando o proprio push
// service confirma que o endpoint morreu (404/410) -- via Authorization do
// PROPRIO usuario (RLS permite, mesma linha), nunca service role.
async function revokeSubscription({
  authorization, supabaseUrl, anonKey, subscriptionId,
}: { authorization: string; supabaseUrl: string; anonKey: string; subscriptionId: string }) {
  await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
}

// PUSH1: payload fixo -- a UNICA notificacao permitida nesta fase (ver
// tarefa). Nao ha campo de titulo/corpo/url vindo do cliente em nenhum
// lugar deste arquivo.
const TEST_NOTIFICATION_PAYLOAD = JSON.stringify({
  title: 'Uni ✦',
  body: 'Notificações ativadas. A Uni pode te lembrar do que realmente importa.',
  url: '/',
});

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (!isAllowedOrigin(origin)) {
    return jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED', 'Origem nao autorizada.'), origin);
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') {
    return jsonResponse(405, errorBody('METHOD_NOT_ALLOWED', 'Metodo nao permitido.'), origin);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse(401, errorBody('AUTH_REQUIRED', 'Sessao obrigatoria.'), origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? '';
  if (!supabaseUrl || !anonKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Servico de push nao esta configurado.'), origin);
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, errorBody('INVALID_SESSION', 'Sessao invalida.'), origin);

  const subscriptions = await listActiveSubscriptions({ authorization, supabaseUrl, anonKey, userId });
  if (subscriptions.length === 0) {
    return jsonResponse(404, errorBody('NO_ACTIVE_SUBSCRIPTION', 'Nenhuma subscription ativa para este usuario.'), origin);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let sent = 0;
  let revoked = 0;
  let failed = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        TEST_NOTIFICATION_PAYLOAD,
      );
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await revokeSubscription({ authorization, supabaseUrl, anonKey, subscriptionId: subscription.id });
        revoked += 1;
      } else {
        failed += 1;
      }
    }
  }));

  return jsonResponse(200, { sent, revoked, failed }, origin);
});
