// Edge Function: google-calendar-confirm (issue #99, épico #98)
//
// POST {pendente} -> {connected: true, workspace_id}
// Erro sempre em {error: {code, message}}.
//
// O callback do OAuth deixa a conexão com status 'pending' e manda o
// navegador ao app com ?google_agenda=confirmar&pendente=<id>. A tela chama
// esta função com a sessão de quem está no navegador. Ela só ativa se essa
// pessoa é a mesma que iniciou o fluxo (user_id gravado pelo connect).
//
// - Outra pessoa ou id vencido: revoga o token no Google, apaga a pendência
//   e devolve erro. Nada é conectado.
// - Id já usado ou inexistente: erro, sem efeito.
// - Mesma pessoa: consome o id (uso único, DELETE da pendência) e aplica o
//   token e a conta à conexão do espaço, que até aqui não foi tocada. Se a
//   conta Google mudou, os calendários da anterior saem e o token dela é
//   revogado. Depois vêm os passos finais. A agenda
//   "UniFlow · <espaço>" é reaproveitada pelo app_calendar_id ou pela marca do
//   espaço na descrição e só é criada quando não existe. Depois a lista de
//   calendários é atualizada, os vínculos de fora da conta saem, o destino é
//   marcado e o status vira 'active'.
//
// Nenhum token sai desta função: nem na resposta, nem no log.

import { chamarGoogleAgenda, registrarFalhaDoGoogle } from '../_shared/googleCalendar/api.ts';
import { chamarBanco, chamarRpc, membroAtivoDoEspaco, ok } from '../_shared/googleCalendar/banco.ts';
import { atualizarListaDeCalendarios, listarCalendariosDoGoogle } from '../_shared/googleCalendar/calendarios.ts';
import {
  classificarConfirmacao,
  ERRO_DA_CONFIRMACAO,
  idDePendenciaValido,
  SITUACOES_DA_CONFIRMACAO,
} from '../_shared/googleCalendar/confirmacao.js';
import {
  acharCalendarioDoEspaco,
  descricaoDoCalendarioDoEspaco,
  escolherDestino,
  listaParaFiltroIn,
} from '../_shared/googleCalendar/listaDeCalendarios.js';
import {
  hashDoState,
  nomeDoCalendarioDoEspaco,
  origemPermitida,
  usuarioNaAllowlist,
} from '../_shared/googleCalendar/oauth.js';
import {
  agendarLimpezaDePendencias,
  descartarPendencia,
  lerTokenDaPendencia,
} from '../_shared/googleCalendar/pendencias.ts';
import { obterAccessTokenGoogle, revogarSeNinguemMaisUsa } from '../_shared/googleCalendar/tokens.ts';

type Config = { supabaseUrl: string; serviceRoleKey: string };

interface Pendencia {
  id: string;
  user_id: string;
  workspace_id: string;
  status: string;
  account_email: string | null;
  granted_scopes: string[] | null;
  confirmation_expires_at: string | null;
}

interface Conexao {
  id: string;
  user_id: string;
  workspace_id: string;
  app_calendar_id: string | null;
  destination_calendar_id: string | null;
}

const CAMPOS_DA_PENDENCIA = 'id,user_id,workspace_id,status,account_email,granted_scopes,confirmation_expires_at';

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

async function nomeDoEspaco(config: Config, workspaceId: string) {
  const resposta = await chamarBanco(config, {
    caminho: '/rest/v1/workspaces',
    query: { select: 'name', id: `eq.${workspaceId}`, limit: '1' },
  });
  const linha = Array.isArray(resposta.json) ? resposta.json[0] : null;
  return typeof linha?.name === 'string' ? linha.name : '';
}

type Finalizacao = 'conectado' | 'escopo_insuficiente' | 'reconectar' | 'erro';

// Aplica a pendência à conexão do espaço (cria se não houver). Devolve a
// conexão para os passos finais, ou null se não conseguiu gravar.
async function aplicarPendencia(config: Config, pendencia: Pendencia, token: string): Promise<Conexao | null> {
  const existente = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id,account_email,app_calendar_id,destination_calendar_id',
      user_id: `eq.${pendencia.user_id}`,
      workspace_id: `eq.${pendencia.workspace_id}`,
      provider: 'eq.google',
      status: 'neq.pending',
      limit: '1',
    },
  });
  if (!ok(existente.status) || !Array.isArray(existente.json)) return null;
  const anterior = existente.json[0] ?? null;
  const trocouDeConta = Boolean(anterior) && anterior.account_email !== pendencia.account_email;

  // Fica 'error' até o último passo: se algo falhar, a tela oferece conectar de novo.
  const dados = {
    account_email: pendencia.account_email,
    granted_scopes: pendencia.granted_scopes ?? [],
    status: 'error',
    last_error_code: null,
    last_error_at: null,
    connected_at: new Date().toISOString(),
  };

  let conexao: Conexao;
  let tokenDaContaAnterior = '';
  if (anterior) {
    if (trocouDeConta) {
      tokenDaContaAnterior = await lerTokenDaPendencia(config, anterior.id);
      const limpeza = await chamarBanco(config, {
        metodo: 'DELETE',
        caminho: '/rest/v1/calendar_connection_calendars',
        query: { connection_id: `eq.${anterior.id}` },
        prefer: 'return=minimal',
      });
      if (!ok(limpeza.status)) return null;
    }
    const atualizacao = await chamarBanco(config, {
      metodo: 'PATCH',
      caminho: '/rest/v1/calendar_connections',
      query: { id: `eq.${anterior.id}` },
      corpo: {
        ...dados,
        ...(trocouDeConta
          ? { app_calendar_id: null, destination_calendar_id: null, exportacao_inicial_em: null, last_synced_at: null }
          : {}),
      },
      prefer: 'return=minimal',
    });
    if (!ok(atualizacao.status)) return null;
    conexao = {
      id: anterior.id,
      user_id: pendencia.user_id,
      workspace_id: pendencia.workspace_id,
      app_calendar_id: trocouDeConta ? null : anterior.app_calendar_id,
      destination_calendar_id: trocouDeConta ? null : anterior.destination_calendar_id,
    };
  } else {
    const criacao = await chamarBanco(config, {
      metodo: 'POST',
      caminho: '/rest/v1/calendar_connections',
      query: { select: 'id' },
      corpo: { ...dados, user_id: pendencia.user_id, workspace_id: pendencia.workspace_id, provider: 'google' },
      prefer: 'return=representation',
    });
    const id = Array.isArray(criacao.json) ? criacao.json[0]?.id : null;
    if (!ok(criacao.status) || typeof id !== 'string') return null;
    conexao = {
      id,
      user_id: pendencia.user_id,
      workspace_id: pendencia.workspace_id,
      app_calendar_id: null,
      destination_calendar_id: null,
    };
  }

  const segredo = await chamarRpc(config, 'calendar_connection_set_refresh_token', {
    p_connection_id: conexao.id,
    p_refresh_token: token,
  });
  if (!ok(segredo.status)) {
    console.error('google-calendar-confirm: falha ao guardar o token no Vault', segredo.status);
    return null;
  }

  if (trocouDeConta) {
    await revogarSeNinguemMaisUsa(config, { token: tokenDaContaAnterior, email: anterior.account_email, exceto: conexao.id });
  }
  return conexao;
}

async function finalizar(config: Config, conexao: Conexao): Promise<Finalizacao> {
  const { id: connectionId, user_id: userId, workspace_id: workspaceId } = conexao;

  const token = await obterAccessTokenGoogle({ ...config, connectionId });
  if ('erro' in token) return token.erro === 'conexao_revogada' ? 'reconectar' : 'erro';
  const accessToken = token.accessToken;

  const lista = await listarCalendariosDoGoogle(accessToken);
  if ('erro' in lista) {
    if (lista.erro === 'escopo_insuficiente') return 'escopo_insuficiente';
    return lista.erro === 'conexao_revogada' ? 'reconectar' : 'erro';
  }
  const primario = lista.itens.find((item) => item.primary === true);

  // Um calendário por espaço: o app_calendar_id guardado, senão a marca do
  // espaço na descrição, senão um calendário novo.
  const appCalendarGuardado = conexao.app_calendar_id;
  let appCalendarId = appCalendarGuardado;
  let calendarioNovo = null;
  if (appCalendarId && !lista.itens.some((item) => item.id === appCalendarId)) {
    const atual = await chamarGoogleAgenda(accessToken, { caminho: `/calendars/${encodeURIComponent(appCalendarId)}` });
    if (atual.status === 404 || atual.status === 410) appCalendarId = null;
    else if (atual.status !== 200) return registrarFalhaDoGoogle('google-calendar-confirm: agenda do espaço', atual) ? 'escopo_insuficiente' : 'erro';
  }
  if (!appCalendarId) {
    appCalendarId = acharCalendarioDoEspaco(lista.itens, workspaceId)?.id ?? null;
  }
  if (!appCalendarId) {
    const summary = nomeDoCalendarioDoEspaco(await nomeDoEspaco(config, workspaceId));
    const fusoHorario = typeof primario?.timeZone === 'string' ? primario.timeZone : undefined;
    const criado = await chamarGoogleAgenda(accessToken, {
      metodo: 'POST',
      caminho: '/calendars',
      corpo: {
        summary,
        description: descricaoDoCalendarioDoEspaco(workspaceId),
        ...(fusoHorario ? { timeZone: fusoHorario } : {}),
      },
    });
    if (criado.status !== 200 || typeof criado.json?.id !== 'string') return registrarFalhaDoGoogle('google-calendar-confirm: criar agenda do espaço', criado) ? 'escopo_insuficiente' : 'erro';
    appCalendarId = criado.json.id as string;
    calendarioNovo = { id: appCalendarId, summary, timeZone: fusoHorario, accessRole: 'owner' };
  }

  if (appCalendarId !== appCalendarGuardado) {
    const vinculo = await chamarBanco(config, {
      metodo: 'PATCH',
      caminho: '/rest/v1/calendar_connections',
      query: { id: `eq.${connectionId}` },
      corpo: { app_calendar_id: appCalendarId },
      prefer: 'return=minimal',
    });
    if (!ok(vinculo.status)) return 'erro';
  }

  const atualizacao = await atualizarListaDeCalendarios({
    supabaseUrl: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
    connectionId,
    accessToken,
    appCalendarId,
    calendarioDoEspaco: calendarioNovo,
    itensDoGoogle: lista.itens,
  });
  if ('erro' in atualizacao) {
    console.error('google-calendar-confirm: falha ao atualizar os calendários', atualizacao.erro);
    return atualizacao.erro === 'escopo_insuficiente' ? 'escopo_insuficiente' : 'erro';
  }

  // Vínculos que apontam para calendário fora desta conta (outra conta,
  // calendário apagado, conexão anterior ao disconnect) não alcançam mais o
  // evento. Os itens ficam no app; só o vínculo sai.
  const calendariosDaConta = atualizacao.linhas.map((linha) => linha.external_calendar_id);
  const vinculos = await chamarBanco(config, {
    metodo: 'DELETE',
    caminho: '/rest/v1/agenda_item_links',
    query: {
      user_id: `eq.${userId}`,
      workspace_id: `eq.${workspaceId}`,
      provider: 'eq.google',
      ...(calendariosDaConta.length > 0 ? { calendar_id: `not.in.${listaParaFiltroIn(calendariosDaConta)}` } : {}),
    },
    prefer: 'return=minimal',
  });
  if (!ok(vinculos.status)) return 'erro';

  const destino = escolherDestino({
    destinoAtual: conexao.destination_calendar_id,
    appCalendarId,
    linhas: atualizacao.linhas,
  });
  const ativacao = await chamarBanco(config, {
    metodo: 'PATCH',
    caminho: '/rest/v1/calendar_connections',
    query: { id: `eq.${connectionId}` },
    // exportacao_inicial_em volta a null: o export (#100) reenvia os itens
    // futuros, inclusive o que mudou enquanto a conexão estava com erro.
    corpo: { destination_calendar_id: destino, status: 'active', last_error_code: null, last_error_at: null, exportacao_inicial_em: null },
    prefer: 'return=minimal',
  });
  return ok(ativacao.status) ? 'conectado' : 'erro';
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
  const config = { supabaseUrl, serviceRoleKey };

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, errorBody('INVALID_SESSION', 'Sessão inválida.'), origin);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, errorBody('INVALID_BODY', 'Corpo inválido.'), origin);
  }
  const pendente = body?.pendente;
  if (!idDePendenciaValido(pendente)) {
    const erro = ERRO_DA_CONFIRMACAO[SITUACOES_DA_CONFIRMACAO.INEXISTENTE];
    return jsonResponse(erro.status, errorBody(erro.code, erro.message), origin);
  }
  const hash = await hashDoState(pendente as string);

  const busca = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: { select: CAMPOS_DA_PENDENCIA, confirmation_hash: `eq.${hash}`, limit: '1' },
  });
  if (!ok(busca.status) || !Array.isArray(busca.json)) {
    return jsonResponse(500, errorBody('CONFIRM_FAILED', 'Não foi possível confirmar agora.'), origin);
  }
  const pendencia = (busca.json[0] ?? null) as Pendencia | null;

  const situacao = classificarConfirmacao({ linha: pendencia, userId });
  if (situacao !== SITUACOES_DA_CONFIRMACAO.OK) {
    if (pendencia && situacao !== SITUACOES_DA_CONFIRMACAO.INEXISTENTE) {
      await descartarPendencia(config, pendencia);
    }
    await agendarLimpezaDePendencias(config);
    const erro = ERRO_DA_CONFIRMACAO[situacao];
    return jsonResponse(erro.status, errorBody(erro.code, erro.message), origin);
  }

  // A pessoa pode ter saído do espaço ou da allowlist entre o connect e aqui.
  const autorizada = usuarioNaAllowlist(userId, Deno.env.get('GOOGLE_CALENDAR_ALLOWED_USER_IDS') ?? '')
    && await membroAtivoDoEspaco(config, userId, pendencia!.workspace_id);
  if (!autorizada) {
    await descartarPendencia(config, pendencia!);
    return jsonResponse(403, errorBody('FORBIDDEN', 'Sem acesso a este espaço.'), origin);
  }

  // Uso único: o token é lido e só um pedido consegue apagar a pendência.
  const token = await lerTokenDaPendencia(config, pendencia!.id);
  const consumo = await chamarBanco(config, {
    metodo: 'DELETE',
    caminho: '/rest/v1/calendar_connections',
    query: {
      confirmation_hash: `eq.${hash}`,
      user_id: `eq.${userId}`,
      status: 'eq.pending',
      confirmation_expires_at: `gt.${new Date().toISOString()}`,
      select: 'id',
    },
    prefer: 'return=representation',
  });
  const consumiu = ok(consumo.status) && Array.isArray(consumo.json) && consumo.json.length === 1;
  if (!consumiu || !token) {
    const erro = ERRO_DA_CONFIRMACAO[SITUACOES_DA_CONFIRMACAO.INEXISTENTE];
    return jsonResponse(erro.status, errorBody(erro.code, erro.message), origin);
  }

  const conexao = await aplicarPendencia(config, pendencia!, token);
  if (!conexao) {
    await revogarSeNinguemMaisUsa(config, { token, email: pendencia!.account_email, exceto: pendencia!.id });
    return jsonResponse(500, errorBody('CONFIRM_FAILED', 'Não foi possível concluir a conexão agora.'), origin);
  }

  const resultado = await finalizar(config, conexao);
  await agendarLimpezaDePendencias(config);

  if (resultado === 'conectado') {
    return jsonResponse(200, { connected: true, workspace_id: conexao.workspace_id }, origin);
  }
  if (resultado === 'escopo_insuficiente') {
    return jsonResponse(403, errorBody('SCOPE_INSUFFICIENT', 'Faltam permissões do Google.'), origin);
  }
  if (resultado === 'reconectar') {
    return jsonResponse(409, errorBody('RECONNECT_REQUIRED', 'O Google recusou o acesso. Conecte de novo.'), origin);
  }
  return jsonResponse(502, errorBody('GOOGLE_UNAVAILABLE', 'Não foi possível concluir a conexão agora.'), origin);
});
