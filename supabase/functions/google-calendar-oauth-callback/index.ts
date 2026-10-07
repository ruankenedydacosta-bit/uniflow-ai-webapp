// Edge Function: google-calendar-oauth-callback (issue #99, épico #98)
//
// GET chamado pelo Google depois do consentimento. verify_jwt = false: quem
// autentica é o state de uso único (DELETE ... RETURNING, válido por 10 min)
// mais o PKCE. Responde 302 para
// {origem}{return_path}?google_agenda=conectado|negado|escopo_insuficiente|erro.
//
// Ao conectar:
// - guarda o refresh token no Vault (calendar_connection_set_refresh_token);
// - reaproveita o calendário "UniFlow · <nome do espaço>" pelo app_calendar_id
//   guardado ou, depois de um disconnect, pela marca com o id do espaço na
//   descrição. Só cria quando não acha nenhum dos dois (um por espaço);
// - atualiza a lista de calendários e marca leitura e destino.
//
// A conexão fica com status 'error' até o último passo. Se algo falhar no
// meio, a tela mostra "Conectar de novo" em vez de uma conexão que parece
// saudável.
//
// Nenhum token sai desta função: nem na resposta, nem no log.

import { chamarGoogleAgenda } from '../_shared/googleCalendar/api.ts';
import { chamarBanco, chamarRpc, ok } from '../_shared/googleCalendar/banco.ts';
import { atualizarListaDeCalendarios, listarCalendariosDoGoogle } from '../_shared/googleCalendar/calendarios.ts';
import { lerEscoposConcedidos, temTodosOsEscopos } from '../_shared/googleCalendar/escopos.js';
import {
  acharCalendarioDoEspaco,
  descricaoDoCalendarioDoEspaco,
  escolherDestino,
  listaParaFiltroIn,
} from '../_shared/googleCalendar/listaDeCalendarios.js';
import {
  GOOGLE_TOKEN_URL,
  hashDoState,
  montarUrlDeRetorno,
  nomeDoCalendarioDoEspaco,
  origemPermitida,
  RESULTADOS_CONEXAO,
  resultadoDoErroDoGoogle,
  RETURN_PATH_PADRAO,
  usuarioNaAllowlist,
} from '../_shared/googleCalendar/oauth.js';
import { revogarTokenNoGoogle } from '../_shared/googleCalendar/tokens.ts';

type Config = { supabaseUrl: string; serviceRoleKey: string };

interface StateConsumido {
  user_id: string;
  workspace_id: string;
  code_verifier: string;
  return_path: string;
  origin: string;
}

function respostaDeTexto(status: number, mensagem: string) {
  return new Response(mensagem, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function redirecionar(url: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

// State inválido ou vencido não diz de qual origem veio. Volta para a
// primeira origem de APP_ALLOWED_ORIGINS, para a pessoa não ficar presa numa
// página de texto no domínio do Supabase.
function voltarSemState() {
  const origem = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
    .split(',').map((item) => item.trim()).find((item) => item.startsWith('https://'));
  if (!origem) {
    return respostaDeTexto(400, 'Este link de conexão expirou. Volte ao UniFlow e tente conectar de novo.');
  }
  return redirecionar(montarUrlDeRetorno({ origem, returnPath: RETURN_PATH_PADRAO, resultado: RESULTADOS_CONEXAO.ERRO }));
}

async function consumirState(config: Config, state: string): Promise<StateConsumido | null> {
  const resposta = await chamarBanco(config, {
    metodo: 'DELETE',
    caminho: '/rest/v1/calendar_oauth_states',
    query: {
      state_hash: `eq.${await hashDoState(state)}`,
      expires_at: `gt.${new Date().toISOString()}`,
      select: 'user_id,workspace_id,code_verifier,return_path,origin',
    },
    prefer: 'return=representation',
  });
  if (!ok(resposta.status) || !Array.isArray(resposta.json) || resposta.json.length !== 1) return null;
  return resposta.json[0] as StateConsumido;
}

async function trocarCodigo({
  code, codeVerifier, clientId, clientSecret, redirectUri,
}: { code: string; codeVerifier: string; clientId: string; clientSecret: string; redirectUri: string }) {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });
    const corpo = await response.json().catch(() => null);
    if (!response.ok || typeof corpo?.access_token !== 'string') {
      // Só o código de erro do OAuth (ex.: invalid_grant), nunca o corpo.
      const codigoDoErro = typeof corpo?.error === 'string' ? corpo.error.slice(0, 40) : '';
      console.error('google-calendar-oauth-callback: troca do código recusada', response.status, codigoDoErro);
      return null;
    }
    return {
      accessToken: corpo.access_token as string,
      refreshToken: typeof corpo.refresh_token === 'string' ? corpo.refresh_token as string : '',
      escopos: lerEscoposConcedidos(corpo.scope),
    };
  } catch {
    console.error('google-calendar-oauth-callback: falha de rede na troca do código');
    return null;
  }
}

async function membroAtivo(config: Config, userId: string, workspaceId: string) {
  const resposta = await chamarBanco(config, {
    caminho: '/rest/v1/workspace_members',
    query: {
      select: 'workspace_id',
      workspace_id: `eq.${workspaceId}`,
      user_id: `eq.${userId}`,
      status: 'eq.active',
      limit: '1',
    },
  });
  return ok(resposta.status) && Array.isArray(resposta.json) && resposta.json.length === 1;
}

async function nomeDoEspaco(config: Config, workspaceId: string) {
  const resposta = await chamarBanco(config, {
    caminho: '/rest/v1/workspaces',
    query: { select: 'name', id: `eq.${workspaceId}`, limit: '1' },
  });
  const linha = Array.isArray(resposta.json) ? resposta.json[0] : null;
  return typeof linha?.name === 'string' ? linha.name : '';
}

// Revogar derruba o grant da conta Google inteira com este OAuth client. Só
// revoga quando nenhuma outra conexão ativa usa o mesmo e-mail.
async function revogarSeNinguemMaisUsa(config: Config, token: string, email: string, exceto: string) {
  if (!token || !email) return;
  const outras = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id',
      provider: 'eq.google',
      status: 'eq.active',
      account_email: `eq.${email}`,
      id: `neq.${exceto}`,
      limit: '1',
    },
  });
  if (ok(outras.status) && Array.isArray(outras.json) && outras.json.length === 0) {
    await revogarTokenNoGoogle(token);
  }
}

// Grant recusado (escopo faltando ou pessoa fora do espaço): revoga para não
// deixar acesso órfão na conta Google. Só quando a pessoa não tem nenhuma
// conexão Google, porque o token novo carrega os escopos já concedidos.
async function descartarGrant(config: Config, userId: string, token: string) {
  const conexoes = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: { select: 'id', user_id: `eq.${userId}`, provider: 'eq.google', limit: '1' },
  });
  if (ok(conexoes.status) && Array.isArray(conexoes.json) && conexoes.json.length === 0) {
    await revogarTokenNoGoogle(token);
  }
}

async function conectar(config: Config, state: StateConsumido, accessToken: string, refreshToken: string, escopos: string[]) {
  const { user_id: userId, workspace_id: workspaceId } = state;

  // E-mail e fuso saem do calendário primário (sem openid/email).
  const primario = await chamarGoogleAgenda(accessToken, { caminho: '/users/me/calendarList/primary' });
  if (primario.status === 403) return RESULTADOS_CONEXAO.ESCOPO_INSUFICIENTE;
  if (primario.status !== 200 || typeof primario.json?.id !== 'string') return RESULTADOS_CONEXAO.ERRO;
  const accountEmail = primario.json.id as string;
  const fusoHorario = typeof primario.json.timeZone === 'string' ? primario.json.timeZone : undefined;

  const existente = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id,account_email,app_calendar_id,destination_calendar_id,exportacao_inicial_em,last_synced_at,last_error_code,last_error_at',
      user_id: `eq.${userId}`,
      workspace_id: `eq.${workspaceId}`,
      provider: 'eq.google',
      limit: '1',
    },
  });
  if (!ok(existente.status) || !Array.isArray(existente.json)) return RESULTADOS_CONEXAO.ERRO;
  const anterior = existente.json[0] ?? null;
  const mesmaConta = Boolean(anterior) && anterior.account_email === accountEmail;
  const trocouDeConta = Boolean(anterior) && !mesmaConta;

  // Troca de conta no mesmo espaço: o token da conta anterior é lido antes de
  // ser sobrescrito no Vault, para ser revogado depois.
  let tokenDaContaAnterior = '';
  if (trocouDeConta) {
    const segredoAnterior = await chamarRpc(config, 'calendar_connection_get_refresh_token', { p_connection_id: anterior.id });
    tokenDaContaAnterior = ok(segredoAnterior.status) && typeof segredoAnterior.json === 'string' ? segredoAnterior.json : '';
  }

  const gravacao = await chamarBanco(config, {
    metodo: 'POST',
    caminho: '/rest/v1/calendar_connections',
    query: { on_conflict: 'user_id,workspace_id,provider', select: 'id' },
    corpo: {
      user_id: userId,
      workspace_id: workspaceId,
      provider: 'google',
      account_email: accountEmail,
      granted_scopes: escopos,
      // Vira 'active' só no último passo.
      status: 'error',
      last_error_code: mesmaConta ? anterior.last_error_code : null,
      last_error_at: mesmaConta ? anterior.last_error_at : null,
      connected_at: new Date().toISOString(),
      app_calendar_id: mesmaConta ? anterior.app_calendar_id : null,
      destination_calendar_id: mesmaConta ? anterior.destination_calendar_id : null,
      exportacao_inicial_em: mesmaConta ? anterior.exportacao_inicial_em : null,
      last_synced_at: mesmaConta ? anterior.last_synced_at : null,
    },
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  const connectionId = Array.isArray(gravacao.json) ? gravacao.json[0]?.id : null;
  if (!ok(gravacao.status) || typeof connectionId !== 'string') {
    console.error('google-calendar-oauth-callback: falha ao gravar a conexão', gravacao.status);
    return RESULTADOS_CONEXAO.ERRO;
  }

  // Os calendários da conta anterior não valem mais.
  if (trocouDeConta) {
    const limpeza = await chamarBanco(config, {
      metodo: 'DELETE',
      caminho: '/rest/v1/calendar_connection_calendars',
      query: { connection_id: `eq.${connectionId}` },
      prefer: 'return=minimal',
    });
    if (!ok(limpeza.status)) return RESULTADOS_CONEXAO.ERRO;
  }

  const segredo = await chamarRpc(config, 'calendar_connection_set_refresh_token', {
    p_connection_id: connectionId,
    p_refresh_token: refreshToken,
  });
  if (!ok(segredo.status)) {
    console.error('google-calendar-oauth-callback: falha ao guardar o token no Vault', segredo.status);
    return RESULTADOS_CONEXAO.ERRO;
  }

  if (trocouDeConta) {
    await revogarSeNinguemMaisUsa(config, tokenDaContaAnterior, anterior.account_email, connectionId);
  }

  const lista = await listarCalendariosDoGoogle(accessToken);
  if ('erro' in lista) {
    return lista.erro === 'escopo_insuficiente' ? RESULTADOS_CONEXAO.ESCOPO_INSUFICIENTE : RESULTADOS_CONEXAO.ERRO;
  }

  // Um calendário por espaço: o app_calendar_id guardado, senão a marca do
  // espaço na descrição, senão um calendário novo.
  const appCalendarGuardado: string | null = mesmaConta ? anterior.app_calendar_id : null;
  let appCalendarId = appCalendarGuardado;
  let calendarioNovo = null;
  if (appCalendarId && !lista.itens.some((item) => item.id === appCalendarId)) {
    const atual = await chamarGoogleAgenda(accessToken, { caminho: `/calendars/${encodeURIComponent(appCalendarId)}` });
    if (atual.status === 404 || atual.status === 410) appCalendarId = null;
    else if (atual.status !== 200) return atual.status === 403 ? RESULTADOS_CONEXAO.ESCOPO_INSUFICIENTE : RESULTADOS_CONEXAO.ERRO;
  }
  if (!appCalendarId) {
    appCalendarId = acharCalendarioDoEspaco(lista.itens, workspaceId)?.id ?? null;
  }
  if (!appCalendarId) {
    const summary = nomeDoCalendarioDoEspaco(await nomeDoEspaco(config, workspaceId));
    const criado = await chamarGoogleAgenda(accessToken, {
      metodo: 'POST',
      caminho: '/calendars',
      corpo: {
        summary,
        description: descricaoDoCalendarioDoEspaco(workspaceId),
        ...(fusoHorario ? { timeZone: fusoHorario } : {}),
      },
    });
    if (criado.status === 403) return RESULTADOS_CONEXAO.ESCOPO_INSUFICIENTE;
    if (criado.status !== 200 || typeof criado.json?.id !== 'string') return RESULTADOS_CONEXAO.ERRO;
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
    if (!ok(vinculo.status)) return RESULTADOS_CONEXAO.ERRO;
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
    console.error('google-calendar-oauth-callback: falha ao atualizar os calendários', atualizacao.erro);
    return atualizacao.erro === 'escopo_insuficiente' ? RESULTADOS_CONEXAO.ESCOPO_INSUFICIENTE : RESULTADOS_CONEXAO.ERRO;
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
  if (!ok(vinculos.status)) return RESULTADOS_CONEXAO.ERRO;

  const destinoAtual = mesmaConta ? anterior.destination_calendar_id : null;
  const destino = escolherDestino({ destinoAtual, appCalendarId, linhas: atualizacao.linhas });
  const ativacao = await chamarBanco(config, {
    metodo: 'PATCH',
    caminho: '/rest/v1/calendar_connections',
    query: { id: `eq.${connectionId}` },
    corpo: { destination_calendar_id: destino, status: 'active', last_error_code: null, last_error_at: null },
    prefer: 'return=minimal',
  });
  if (!ok(ativacao.status)) return RESULTADOS_CONEXAO.ERRO;

  return RESULTADOS_CONEXAO.CONECTADO;
}

Deno.serve(async (request) => {
  if (request.method !== 'GET') return respostaDeTexto(405, 'Método não permitido.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) return respostaDeTexto(503, 'Google Agenda não configurado.');
  const config = { supabaseUrl, serviceRoleKey };

  const url = new URL(request.url);
  const stateRecebido = url.searchParams.get('state') ?? '';
  if (!stateRecebido || stateRecebido.length > 200) return voltarSemState();

  const state = await consumirState(config, stateRecebido);
  if (!state || !origemPermitida(state.origin, Deno.env.get('APP_ALLOWED_ORIGINS'))) return voltarSemState();

  const voltar = (resultado: string) => redirecionar(
    montarUrlDeRetorno({ origem: state.origin, returnPath: state.return_path, resultado }),
  );

  const erroDoGoogle = url.searchParams.get('error');
  if (erroDoGoogle) return voltar(resultadoDoErroDoGoogle(erroDoGoogle));

  const code = url.searchParams.get('code') ?? '';
  const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '';
  const redirectUri = Deno.env.get('GOOGLE_CALENDAR_REDIRECT_URI') ?? '';
  if (!code || !clientId || !clientSecret || !redirectUri) return voltar(RESULTADOS_CONEXAO.ERRO);

  if (!usuarioNaAllowlist(state.user_id, Deno.env.get('GOOGLE_CALENDAR_ALLOWED_USER_IDS') ?? '')) {
    return voltar(RESULTADOS_CONEXAO.ERRO);
  }

  const tokens = await trocarCodigo({
    code, codeVerifier: state.code_verifier, clientId, clientSecret, redirectUri,
  });
  if (!tokens) return voltar(RESULTADOS_CONEXAO.ERRO);

  const grantRecebido = tokens.refreshToken || tokens.accessToken;
  if (!temTodosOsEscopos(tokens.escopos)) {
    await descartarGrant(config, state.user_id, grantRecebido);
    return voltar(RESULTADOS_CONEXAO.ESCOPO_INSUFICIENTE);
  }
  if (!tokens.refreshToken) return voltar(RESULTADOS_CONEXAO.ERRO);

  if (!(await membroAtivo(config, state.user_id, state.workspace_id))) {
    await descartarGrant(config, state.user_id, grantRecebido);
    return voltar(RESULTADOS_CONEXAO.ERRO);
  }

  const resultado = await conectar(config, state, tokens.accessToken, tokens.refreshToken, tokens.escopos);
  return voltar(resultado);
});
