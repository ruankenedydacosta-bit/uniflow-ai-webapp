// OAuth do Google Agenda, separado do login (issue #99).
//
// Lógica pura: roda no Deno (Edge Functions) e no node --test. Usa só Web
// Crypto (globalThis.crypto), presente nos dois runtimes.
//
// Fluxo: google-calendar-connect grava state (só o hash) + PKCE em
// calendar_oauth_states e devolve a URL de autorização. O Google volta em
// google-calendar-oauth-callback, que consome o state uma vez só e redireciona
// para {origem}{return_path}?google_agenda=<resultado>.

import { ESCOPOS_GOOGLE_AGENDA } from './escopos.js';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const RETURN_PATH_PADRAO = '/app/conta/google-agenda';
export const PARAMETRO_DE_RETORNO = 'google_agenda';
export const VALIDADE_DO_STATE_MS = 10 * 60 * 1000;

export const RESULTADOS_CONEXAO = Object.freeze({
  // O callback devolve "confirmar" com o id da pendência; quem devolve
  // "conectado" é a tela, depois da google-calendar-confirm.
  CONFIRMAR: 'confirmar',
  CONECTADO: 'conectado',
  NEGADO: 'negado',
  ESCOPO_INSUFICIENTE: 'escopo_insuficiente',
  ERRO: 'erro',
});

const RESULTADOS_VALIDOS = new Set(Object.values(RESULTADOS_CONEXAO));

// return_path só aceita caminho interno do app (/app/...). Sem query, sem
// fragmento, sem "//" (URL relativa ao protocolo) e sem "..".
export function normalizarReturnPath(valor) {
  if (valor === undefined || valor === null || valor === '') return RETURN_PATH_PADRAO;
  if (typeof valor !== 'string' || valor.length > 200) return null;
  if (!/^\/app\/[A-Za-z0-9\-_/]+$/.test(valor)) return null;
  if (valor.includes('//') || valor.includes('..')) return null;
  return valor;
}

export function montarUrlDeAutorizacao({ clientId, redirectUri, state, codeChallenge }) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', ESCOPOS_GOOGLE_AGENDA.join(' '));
  // offline + consent: o Google só devolve refresh_token com os dois.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function montarUrlDeRetorno({ origem, returnPath, resultado, pendente = null }) {
  const caminho = normalizarReturnPath(returnPath) ?? RETURN_PATH_PADRAO;
  let valor = RESULTADOS_VALIDOS.has(resultado) ? resultado : RESULTADOS_CONEXAO.ERRO;
  if (valor === RESULTADOS_CONEXAO.CONFIRMAR && !pendente) valor = RESULTADOS_CONEXAO.ERRO;
  const url = new URL(caminho, origem);
  url.searchParams.set(PARAMETRO_DE_RETORNO, valor);
  if (valor === RESULTADOS_CONEXAO.CONFIRMAR) url.searchParams.set('pendente', pendente);
  return url.toString();
}

// O Google manda `error=access_denied` quando a pessoa recusa o consentimento.
export function resultadoDoErroDoGoogle(erro) {
  return erro === 'access_denied' ? RESULTADOS_CONEXAO.NEGADO : RESULTADOS_CONEXAO.ERRO;
}

// GOOGLE_CALENDAR_ALLOWED_USER_IDS: lista de user ids separados por vírgula.
// "*" libera para todos (depois da verificação do app no Google, #103).
// Vazio ou ausente: ninguém conecta.
export function usuarioNaAllowlist(userId, valor) {
  if (!userId || typeof valor !== 'string') return false;
  const ids = valor.split(',').map((item) => item.trim()).filter(Boolean);
  return ids.includes('*') || ids.includes(userId);
}

// Mesma regra das demais Edge Functions: origem exata de APP_ALLOWED_ORIGINS
// ou localhost em desenvolvimento.
export function origemPermitida(origem, valor) {
  if (!origem || typeof origem !== 'string') return false;
  const permitidas = new Set(
    String(valor ?? '').split(',').map((item) => item.trim()).filter(Boolean),
  );
  if (permitidas.has(origem)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origem);
}

export function nomeDoCalendarioDoEspaco(nomeDoEspaco) {
  const nome = typeof nomeDoEspaco === 'string' ? nomeDoEspaco.trim() : '';
  return `UniFlow · ${(nome || 'Meu espaço').slice(0, 80)}`;
}

export function base64Url(bytes) {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function gerarSegredoAleatorio(tamanho = 32) {
  const bytes = new Uint8Array(tamanho);
  globalThis.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(texto) {
  const dados = new TextEncoder().encode(texto);
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', dados));
}

// RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier)).
export async function desafioPkce(codeVerifier) {
  return base64Url(await sha256(codeVerifier));
}

// O banco guarda só o hash do state. Quem lê a tabela não consegue montar um
// callback válido.
export async function hashDoState(state) {
  const bytes = await sha256(state);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
