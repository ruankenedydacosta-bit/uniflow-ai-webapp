// Edge Function: google-calendar-sync-now (issue #101, épico #98)
//
// POST {workspace_id}. verify_jwt = true. Sincroniza agora a conexão do dono
// do JWT naquele espaço: lista de calendários uma vez, canais e sync de cada
// calendário lido.
//
// Sucesso: {sincronizado_em, calendarios: [{external_calendar_id, inseridos,
// atualizados, cancelados, status: 'ok' | 'skipped' | 'erro'}]}.
// Passada há menos de 30 s: 200 com todos os calendários 'skipped'.
// Erros: NOT_CONNECTED (404), RECONNECT_REQUIRED (409), GOOGLE_UNAVAILABLE (502).

import { chamarBanco, ok } from '../_shared/googleCalendar/banco.ts';
import { origemPermitida } from '../_shared/googleCalendar/oauth.js';
import {
  lerCalendariosDaConexao,
  sincronizarConexao,
  type ErroDaConexao,
} from '../_shared/googleCalendar/sincronizarCalendario.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERVALO_MINIMO_MS = 30 * 1000;

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

const RESPOSTA_DO_ERRO: Record<ErroDaConexao, { status: number; code: string; message: string }> = {
  fora_do_espaco: { status: 404, code: 'NOT_CONNECTED', message: 'Sua conta não pode adicionar compromissos neste espaço.' },
  conexao_revogada: { status: 409, code: 'RECONNECT_REQUIRED', message: 'Conecte o Google Agenda de novo.' },
  sem_token: { status: 409, code: 'RECONNECT_REQUIRED', message: 'Conecte o Google Agenda de novo.' },
  escopo_insuficiente: { status: 409, code: 'RECONNECT_REQUIRED', message: 'Conecte o Google Agenda de novo e autorize todas as permissões.' },
  google_indisponivel: { status: 502, code: 'GOOGLE_UNAVAILABLE', message: 'O Google Agenda não respondeu. Tente de novo em alguns minutos.' },
  banco_indisponivel: { status: 502, code: 'GOOGLE_UNAVAILABLE', message: 'Não foi possível sincronizar agora. Tente de novo em alguns minutos.' },
};

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
      select: 'id,user_id,workspace_id,app_calendar_id,status,last_synced_at',
      user_id: `eq.${userId}`,
      workspace_id: `eq.${workspaceId}`,
      provider: 'eq.google',
      status: 'neq.pending',
      limit: '1',
    },
  });
  if (!ok(busca.status) || !Array.isArray(busca.json)) {
    return jsonResponse(502, errorBody('GOOGLE_UNAVAILABLE', 'Não foi possível sincronizar agora. Tente de novo em alguns minutos.'), origin);
  }
  const conexao = busca.json[0];
  if (!conexao) {
    return jsonResponse(404, errorBody('NOT_CONNECTED', 'O Google Agenda não está conectado neste espaço.'), origin);
  }
  if (conexao.status !== 'active') {
    return jsonResponse(409, errorBody('RECONNECT_REQUIRED', 'Conecte o Google Agenda de novo.'), origin);
  }

  const ultima = Date.parse(conexao.last_synced_at ?? '');
  if (!Number.isNaN(ultima) && Date.now() - ultima < INTERVALO_MINIMO_MS) {
    const calendarios = (await lerCalendariosDaConexao(config, conexao.id)) ?? [];
    return jsonResponse(200, {
      sincronizado_em: new Date(ultima).toISOString(),
      calendarios: calendarios
        .filter((calendario) => calendario.is_read)
        .map((calendario) => ({
          external_calendar_id: calendario.external_calendar_id,
          inseridos: 0,
          atualizados: 0,
          cancelados: 0,
          status: 'skipped',
        })),
    }, origin);
  }

  const resultado = await sincronizarConexao({ config, conexao });
  if ('erro' in resultado) {
    const resposta = RESPOSTA_DO_ERRO[resultado.erro] ?? RESPOSTA_DO_ERRO.google_indisponivel;
    return jsonResponse(resposta.status, errorBody(resposta.code, resposta.message), origin);
  }

  return jsonResponse(200, {
    sincronizado_em: resultado.sincronizado_em,
    calendarios: resultado.calendarios.map(({ erro: _erro, ...calendario }) => calendario),
  }, origin);
});
