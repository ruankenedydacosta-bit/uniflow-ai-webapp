// Edge Function: google-calendar-disconnect (issue #99, épico #98)
//
// POST {workspace_id} -> {disconnected: true, revoked?}. Idempotente: sem
// conexão, devolve {disconnected: true, revoked: false}.
//
// Para os canais de webhook, revoga o token no Google só se nenhuma outra
// conexão ativa usa o mesmo e-mail (revogar derruba o grant da conta inteira
// com este OAuth client) e apaga a conexão. O trigger da tabela apaga o
// segredo do Vault e o cascade leva os calendários. Os itens da agenda e os
// vínculos ficam; o calendário UniFlow e os eventos ficam no Google.
//
// Só mexe na conexão do dono do JWT. Não exige ser membro do espaço: quem
// saiu do espaço ainda pode desconectar a própria conta.

import { chamarGoogleAgenda } from '../_shared/googleCalendar/api.ts';
import { chamarBanco, chamarRpc, ok } from '../_shared/googleCalendar/banco.ts';
import { origemPermitida } from '../_shared/googleCalendar/oauth.js';
import { obterAccessTokenGoogle, revogarTokenNoGoogle } from '../_shared/googleCalendar/tokens.ts';

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
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Google Agenda não configurado.'), origin);
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, errorBody('INVALID_SESSION', 'Sessão inválida.'), origin);

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

  const config = { supabaseUrl, serviceRoleKey };

  const busca = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id,account_email',
      user_id: `eq.${userId}`,
      workspace_id: `eq.${workspaceId}`,
      provider: 'eq.google',
      limit: '1',
    },
  });
  if (!ok(busca.status) || !Array.isArray(busca.json)) {
    return jsonResponse(500, errorBody('DISCONNECT_FAILED', 'Não foi possível desconectar agora.'), origin);
  }
  const conexao = busca.json[0];
  if (!conexao) return jsonResponse(200, { disconnected: true, revoked: false }, origin);

  // Canais de webhook ativos (#101): para no Google antes de apagar.
  const canais = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connection_calendars',
    query: {
      select: 'channel_id,channel_resource_id',
      connection_id: `eq.${conexao.id}`,
      channel_id: 'not.is.null',
    },
  });
  const listaDeCanais = Array.isArray(canais.json)
    ? canais.json.filter((canal) => canal?.channel_id && canal?.channel_resource_id)
    : [];
  if (listaDeCanais.length > 0) {
    const token = await obterAccessTokenGoogle({ supabaseUrl, serviceRoleKey, connectionId: conexao.id });
    if ('accessToken' in token) {
      for (const canal of listaDeCanais) {
        await chamarGoogleAgenda(token.accessToken, {
          metodo: 'POST',
          caminho: '/channels/stop',
          corpo: { id: canal.channel_id, resourceId: canal.channel_resource_id },
        });
      }
    }
  }

  // O token é lido antes do DELETE (o trigger apaga o segredo junto com a
  // linha) e só é revogado depois que a conexão saiu. Se o DELETE falhar, a
  // conexão continua inteira e funcionando.
  const outras = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id',
      provider: 'eq.google',
      status: 'eq.active',
      account_email: `eq.${conexao.account_email ?? ''}`,
      id: `neq.${conexao.id}`,
      limit: '1',
    },
  });
  const haOutraConexao = !ok(outras.status) || !Array.isArray(outras.json) || outras.json.length > 0;
  let refreshToken = '';
  if (!haOutraConexao && conexao.account_email) {
    const segredo = await chamarRpc(config, 'calendar_connection_get_refresh_token', { p_connection_id: conexao.id });
    refreshToken = ok(segredo.status) && typeof segredo.json === 'string' ? segredo.json : '';
  }

  const remocao = await chamarBanco(config, {
    metodo: 'DELETE',
    caminho: '/rest/v1/calendar_connections',
    query: { id: `eq.${conexao.id}`, user_id: `eq.${userId}` },
    prefer: 'return=minimal',
  });
  if (!ok(remocao.status)) {
    console.error('google-calendar-disconnect: falha ao apagar a conexão', remocao.status);
    return jsonResponse(500, errorBody('DISCONNECT_FAILED', 'Não foi possível desconectar agora.'), origin);
  }

  const revoked = refreshToken ? await revogarTokenNoGoogle(refreshToken) : false;

  return jsonResponse(200, { disconnected: true, revoked }, origin);
});
