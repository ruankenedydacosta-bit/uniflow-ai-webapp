// Edge Function: google-calendar-oauth-callback (issue #99, épico #98)
//
// GET chamado pelo Google depois do consentimento. verify_jwt = false: quem
// autentica é o state de uso único (DELETE ... RETURNING, válido por 10 min)
// mais o PKCE. Responde 302 para
// {origem}{return_path}?google_agenda=confirmar&pendente=<id>, ou
// ?google_agenda=negado|escopo_insuficiente|erro.
//
// Esta função não ativa a conexão. Ela troca o código e grava uma pendência
// (linha à parte com status 'pending', token no Vault e o hash de um id de
// confirmação de uso único que vale 10 minutos). A conexão que já existia no
// espaço continua intacta até a confirmação. A ativação é da
// google-calendar-confirm, chamada pela tela com a sessão de quem está no
// navegador. Se a URL de autorização foi repassada a outra pessoa, a
// confirmação falha e a conta Google dela não fica ligada ao espaço de quem
// mandou.
//
// Nenhum token sai desta função: nem na resposta, nem no log.

import { chamarGoogleAgenda, registrarFalhaDoGoogle } from '../_shared/googleCalendar/api.ts';
import { chamarBanco, chamarRpc, membroAtivoDoEspaco, ok } from '../_shared/googleCalendar/banco.ts';
import { VALIDADE_DA_PENDENCIA_MS } from '../_shared/googleCalendar/confirmacao.js';
import { lerEscoposConcedidos, temTodosOsEscopos } from '../_shared/googleCalendar/escopos.js';
import {
  gerarSegredoAleatorio,
  GOOGLE_TOKEN_URL,
  hashDoState,
  montarUrlDeRetorno,
  origemPermitida,
  RESULTADOS_CONEXAO,
  resultadoDoErroDoGoogle,
  RETURN_PATH_PADRAO,
  usuarioNaAllowlist,
} from '../_shared/googleCalendar/oauth.js';
import { descartarPendencia } from '../_shared/googleCalendar/pendencias.ts';
import { revogarSeNinguemMaisUsa, revogarTokenNoGoogle } from '../_shared/googleCalendar/tokens.ts';

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
// primeira origem https de APP_ALLOWED_ORIGINS, para a pessoa não ficar presa
// numa página de texto no domínio do Supabase.
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

// Grava a conexão como pendente e devolve o id de confirmação (ou null).
// Grava a pendência numa linha à parte e devolve o id de confirmação. A
// conexão que já existe no espaço não é tocada: troca de conta, calendários
// e token antigo só mudam na google-calendar-confirm, depois que a pessoa
// certa confirmar.
async function prepararPendencia(config: Config, state: StateConsumido, accessToken: string, refreshToken: string, escopos: string[]) {
  const { user_id: userId, workspace_id: workspaceId } = state;

  // E-mail da conta: id do calendário primário (sem openid/email).
  const primario = await chamarGoogleAgenda(accessToken, { caminho: '/users/me/calendarList/primary' });
  if (primario.status !== 200 || typeof primario.json?.id !== 'string') {
    const semEscopo = registrarFalhaDoGoogle('google-calendar-oauth-callback: calendário principal', primario);
    return { resultado: semEscopo ? RESULTADOS_CONEXAO.ESCOPO_INSUFICIENTE : RESULTADOS_CONEXAO.ERRO };
  }
  const accountEmail = primario.json.id as string;

  // Uma pendência por pessoa e espaço: a anterior sai. O token dela só é
  // revogado se for de outra conta Google; da mesma conta, revogar
  // derrubaria o grant que acabou de ser concedido.
  const anteriores = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id,account_email',
      user_id: `eq.${userId}`,
      workspace_id: `eq.${workspaceId}`,
      provider: 'eq.google',
      status: 'eq.pending',
    },
  });
  if (!ok(anteriores.status) || !Array.isArray(anteriores.json)) return { resultado: RESULTADOS_CONEXAO.ERRO };
  for (const anterior of anteriores.json) {
    await descartarPendencia(config, anterior, { revogar: anterior.account_email !== accountEmail });
  }

  const pendente = gerarSegredoAleatorio(32);
  const agora = Date.now();
  const gravacao = await chamarBanco(config, {
    metodo: 'POST',
    caminho: '/rest/v1/calendar_connections',
    query: { select: 'id' },
    corpo: {
      user_id: userId,
      workspace_id: workspaceId,
      provider: 'google',
      account_email: accountEmail,
      granted_scopes: escopos,
      status: 'pending',
      confirmation_hash: await hashDoState(pendente),
      confirmation_expires_at: new Date(agora + VALIDADE_DA_PENDENCIA_MS).toISOString(),
      connected_at: new Date(agora).toISOString(),
    },
    prefer: 'return=representation',
  });
  const pendenciaId = Array.isArray(gravacao.json) ? gravacao.json[0]?.id : null;
  if (!ok(gravacao.status) || typeof pendenciaId !== 'string') {
    console.error('google-calendar-oauth-callback: falha ao gravar a pendência', gravacao.status);
    return { resultado: RESULTADOS_CONEXAO.ERRO };
  }

  const segredo = await chamarRpc(config, 'calendar_connection_set_refresh_token', {
    p_connection_id: pendenciaId,
    p_refresh_token: refreshToken,
  });
  if (!ok(segredo.status)) {
    console.error('google-calendar-oauth-callback: falha ao guardar o token no Vault', segredo.status);
    await descartarPendencia(config, { id: pendenciaId, account_email: accountEmail }, { revogar: false });
    await revogarSeNinguemMaisUsa(config, { token: refreshToken, email: accountEmail, exceto: pendenciaId });
    return { resultado: RESULTADOS_CONEXAO.ERRO };
  }

  return { resultado: RESULTADOS_CONEXAO.CONFIRMAR, pendente };
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

  const voltar = (resultado: string, pendente: string | null = null) => redirecionar(
    montarUrlDeRetorno({ origem: state.origin, returnPath: state.return_path, resultado, pendente }),
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

  if (!(await membroAtivoDoEspaco(config, state.user_id, state.workspace_id))) {
    await descartarGrant(config, state.user_id, grantRecebido);
    return voltar(RESULTADOS_CONEXAO.ERRO);
  }

  const { resultado, pendente } = await prepararPendencia(
    config, state, tokens.accessToken, tokens.refreshToken, tokens.escopos,
  );
  // Sem pendência gravada, nada no banco aponta para o grant recém-emitido.
  if (!pendente) await descartarGrant(config, state.user_id, grantRecebido);
  return voltar(resultado, pendente ?? null);
});
