// Edge Function: agenda-push-decision
//
// AGPUSH1: registra a decisao do usuario para a pergunta "quer que eu te
// lembre?" de UM compromisso -- offset de 30/60 minutos ou "nao precisa".
// Nunca reperguntar depois de decidido (guarda reminder_decision_at IS
// NULL em ambos os caminhos abaixo -- primeira decisao vence, silenciosa e
// idempotente).
//
// Dois caminhos de autenticacao, pela mesma razao que useWebPush.js/
// push-notifications-bridge.js precisam de dois caminhos de UI (Android
// actions vs iPhone fallback):
//
// 1. Sessao de usuario (Authorization: Bearer <jwt>) -- usada pelo modal
//    de escolha dentro do app (fallback iPhone, ou reabrir a pergunta pelo
//    deep link). RLS decide ownership (agenda_push_reminders_update_own,
//    migration 043) -- a Edge Function so repassa o JWT do proprio
//    chamador ao PostgREST, nunca usa service role aqui.
//
// 2. Token de posse (`token` no corpo) -- usado pelo Service Worker ao
//    processar uma acao de notificacao (30min/1h/Nao precisa) EM
//    BACKGROUND, sem sessao de usuario disponivel (localStorage nao e
//    acessivel de um Service Worker). O token e o decision_token opaco
//    gerado pela linha em agenda_push_reminders e entregue SOMENTE dentro
//    do payload de push (criptografado ponta-a-ponta pelo proprio
//    protocolo Web Push) -- nunca visivel por nenhuma outra API. So
//    permite mudar a decisao do MESMO compromisso a que pertence, nunca
//    nada alem disso; usa service role internamente porque nao ha sessao
//    para o RLS avaliar.
//
// offsets aceitos: somente '30', '60' ou 'none' -- qualquer outro valor e
// rejeitado antes de qualquer chamada ao banco.

function getEnv(name: string) {
  return Deno.env.get(name) ?? '';
}

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_OFFSETS = new Set(['30', '60', 'none']);

function offsetToMinutes(offset: string): number | null {
  return offset === 'none' ? null : Number.parseInt(offset, 10);
}

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

// Caminho 1: sessao de usuario -- repassa o JWT do proprio chamador,
// deixando a RLS (agenda_push_reminders_update_own) decidir ownership.
// Nunca usa service role.
async function applyDecisionAsUser({
  supabaseUrl, anonKey, authorization, agendaItemId, offsetMinutes,
}: {
  supabaseUrl: string; anonKey: string; authorization: string; agendaItemId: string; offsetMinutes: number | null;
}) {
  const params = new URLSearchParams({
    agenda_item_id: `eq.${agendaItemId}`,
    reminder_decision_at: 'is.null',
    select: 'id',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/agenda_push_reminders?${params}`, {
    method: 'PATCH',
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      reminder_offset_minutes: offsetMinutes,
      reminder_decision_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

// Caminho 2: token de posse (Service Worker, sem sessao) -- service role,
// mas restrito ao MESMO agenda_item_id + decision_token da linha, nunca
// um user_id/workspace_id vindo do chamador.
async function applyDecisionWithToken({
  supabaseUrl, serviceRoleKey, agendaItemId, token, offsetMinutes,
}: {
  supabaseUrl: string; serviceRoleKey: string; agendaItemId: string; token: string; offsetMinutes: number | null;
}) {
  const params = new URLSearchParams({
    agenda_item_id: `eq.${agendaItemId}`,
    decision_token: `eq.${token}`,
    reminder_decision_at: 'is.null',
    select: 'id',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/agenda_push_reminders?${params}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      reminder_offset_minutes: offsetMinutes,
      reminder_decision_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (origin && !isAllowedOrigin(origin)) {
    return jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED', 'Origem nao autorizada.'), origin);
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, errorBody('METHOD_NOT_ALLOWED', 'Metodo nao permitido.'), origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, errorBody('INVALID_BODY', 'Corpo da requisicao invalido.'), origin);
  }

  const agendaItemId = typeof body.agenda_item_id === 'string' ? body.agenda_item_id : '';
  const offset = typeof body.offset === 'string' ? body.offset : '';
  const token = typeof body.token === 'string' ? body.token : '';

  if (!UUID_RE.test(agendaItemId)) {
    return jsonResponse(400, errorBody('INVALID_ITEM', 'agenda_item_id invalido.'), origin);
  }
  if (!VALID_OFFSETS.has(offset)) {
    return jsonResponse(400, errorBody('INVALID_OFFSET', 'offset deve ser 30, 60 ou none.'), origin);
  }

  const supabaseUrl = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Servico nao esta configurado.'), origin);
  }

  const offsetMinutes = offsetToMinutes(offset);
  const authorization = request.headers.get('Authorization') ?? '';

  let applied = false;

  if (authorization.startsWith('Bearer ')) {
    const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
    if (!userId) return jsonResponse(401, errorBody('INVALID_SESSION', 'Sessao invalida.'), origin);
    applied = await applyDecisionAsUser({
      supabaseUrl, anonKey, authorization, agendaItemId, offsetMinutes,
    });
  } else if (UUID_RE.test(token)) {
    applied = await applyDecisionWithToken({
      supabaseUrl, serviceRoleKey, agendaItemId, token, offsetMinutes,
    });
  } else {
    return jsonResponse(401, errorBody('AUTH_REQUIRED', 'Sessao ou token de decisao obrigatorios.'), origin);
  }

  // AGPUSH1: nunca revela se o item nao existia, pertencia a outro usuario
  // ou ja tinha sido decidido -- todos respondem 200 com applied:false, o
  // mesmo comportamento externo para nao vazar nenhuma dessas distincoes.
  return jsonResponse(200, { applied }, origin);
});
