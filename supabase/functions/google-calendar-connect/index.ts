// Edge Function: google-calendar-connect (issue #99, épico #98)
//
// POST {workspace_id, return_path?} -> {authorization_url}
// Erro sempre em {error: {code, message}}.
//
// Grava o state (só o hash) e o code_verifier do PKCE em
// calendar_oauth_states, válido por 10 minutos e de uso único, e devolve a URL
// de consentimento do Google. Quem conecta é sempre o dono do JWT; o espaço
// precisa ser um em que ele é membro ativo.
//
// Secrets: GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_REDIRECT_URI e
// GOOGLE_CALENDAR_ALLOWED_USER_IDS (allowlist até a verificação do app, #103).

import { chamarBanco, ok } from '../_shared/googleCalendar/banco.ts';
import { limparPendenciasVencidas } from '../_shared/googleCalendar/pendencias.ts';
import {
  desafioPkce,
  gerarSegredoAleatorio,
  hashDoState,
  montarUrlDeAutorizacao,
  normalizarReturnPath,
  origemPermitida,
  usuarioNaAllowlist,
  VALIDADE_DO_STATE_MS,
} from '../_shared/googleCalendar/oauth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: anonKey },
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user?.id === 'string' ? user.id : null;
  } catch {
    return null;
  }
}

// Leitura com o JWT da própria pessoa: a RLS de workspace_members decide.
async function hasWorkspaceMembership({
  authorization, supabaseUrl, anonKey, userId, workspaceId,
}: { authorization: string; supabaseUrl: string; anonKey: string; userId: string; workspaceId: string }) {
  const params = new URLSearchParams({
    select: 'workspace_id', workspace_id: `eq.${workspaceId}`, user_id: `eq.${userId}`, status: 'eq.active', limit: '1',
  });
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/workspace_members?${params}`, {
      headers: { Authorization: authorization, apikey: anonKey },
    });
    if (!response.ok) return false;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length === 1;
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (!origemPermitida(origin, Deno.env.get('APP_ALLOWED_ORIGINS'))) {
    return jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED', 'Origem não autorizada.'), origin);
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') {
    return jsonResponse(405, errorBody('METHOD_NOT_ALLOWED', 'Método não permitido.'), origin);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse(401, errorBody('AUTH_REQUIRED', 'Sessão obrigatória.'), origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
  const redirectUri = Deno.env.get('GOOGLE_CALENDAR_REDIRECT_URI') ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !clientId || !redirectUri) {
    return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Google Agenda não configurado.'), origin);
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, errorBody('INVALID_SESSION', 'Sessão inválida.'), origin);

  if (!usuarioNaAllowlist(userId, Deno.env.get('GOOGLE_CALENDAR_ALLOWED_USER_IDS') ?? '')) {
    return jsonResponse(403, errorBody('NOT_ALLOWED', 'Google Agenda indisponível para esta conta.'), origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, errorBody('INVALID_BODY', 'Corpo inválido.'), origin);
  }

  const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id : '';
  if (!UUID_RE.test(workspaceId)) {
    return jsonResponse(400, errorBody('INVALID_WORKSPACE', 'workspace_id inválido.'), origin);
  }

  const returnPath = normalizarReturnPath(body?.return_path);
  if (!returnPath) {
    return jsonResponse(400, errorBody('INVALID_RETURN_PATH', 'return_path precisa começar com /app/.'), origin);
  }

  const isMember = await hasWorkspaceMembership({ authorization, supabaseUrl, anonKey, userId, workspaceId });
  if (!isMember) return jsonResponse(403, errorBody('FORBIDDEN', 'Sem acesso a este espaço.'), origin);

  const config = { supabaseUrl, serviceRoleKey };
  const agora = Date.now();

  // States e pendências vencidos saem aqui mesmo, sem job à parte. A
  // pendência vencida tem o token revogado no Google.
  await chamarBanco(config, {
    metodo: 'DELETE',
    caminho: '/rest/v1/calendar_oauth_states',
    query: { expires_at: `lt.${new Date(agora).toISOString()}` },
    prefer: 'return=minimal',
  });
  await limparPendenciasVencidas(config);

  const state = gerarSegredoAleatorio(32);
  const codeVerifier = gerarSegredoAleatorio(48);
  const [stateHash, codeChallenge] = await Promise.all([hashDoState(state), desafioPkce(codeVerifier)]);

  const gravacao = await chamarBanco(config, {
    metodo: 'POST',
    caminho: '/rest/v1/calendar_oauth_states',
    corpo: {
      state_hash: stateHash,
      user_id: userId,
      workspace_id: workspaceId,
      provider: 'google',
      code_verifier: codeVerifier,
      return_path: returnPath,
      origin,
      created_at: new Date(agora).toISOString(),
      expires_at: new Date(agora + VALIDADE_DO_STATE_MS).toISOString(),
    },
    prefer: 'return=minimal',
  });
  if (!ok(gravacao.status)) {
    console.error('google-calendar-connect: falha ao gravar o state', gravacao.status);
    return jsonResponse(500, errorBody('STATE_FAILED', 'Não foi possível iniciar a conexão.'), origin);
  }

  const authorizationUrl = montarUrlDeAutorizacao({ clientId, redirectUri, state, codeChallenge });
  return jsonResponse(200, { authorization_url: authorizationUrl }, origin);
});
