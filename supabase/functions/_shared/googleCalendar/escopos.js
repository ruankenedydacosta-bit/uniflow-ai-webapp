// Escopos do Google Agenda pedidos juntos ao conectar (épico #98).
//
// - calendar.app.created: criar o calendário "UniFlow · <espaço>" e gravar nele.
// - calendar.calendarlist.readonly: listar calendários e access_role. O e-mail
//   da conta sai do calendário primário, sem openid/email.
// - calendar.events.owned: ler e acompanhar calendários próprios e gravar em
//   destino que não seja o UniFlow.
//
// Lógica pura: roda no Deno (Edge Functions) e no node --test.

export const ESCOPOS_GOOGLE_AGENDA = Object.freeze([
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.owned',
]);

// O Google devolve os escopos concedidos separados por espaço, no campo
// `scope` da troca do código (e na query do callback).
export function lerEscoposConcedidos(valor) {
  if (Array.isArray(valor)) return [...new Set(valor.filter((item) => typeof item === 'string' && item))];
  if (typeof valor !== 'string') return [];
  return [...new Set(valor.split(/\s+/).filter(Boolean))];
}

export function escoposQueFaltam(concedidos) {
  const lista = new Set(lerEscoposConcedidos(concedidos));
  return ESCOPOS_GOOGLE_AGENDA.filter((escopo) => !lista.has(escopo));
}

export function temTodosOsEscopos(concedidos) {
  return escoposQueFaltam(concedidos).length === 0;
}

// Motivos de um erro da Calendar API: `error.errors[].reason` (formato v3) e
// o `reason` do ErrorInfo em `error.details`. Serve para o log; não traz token.
export function motivosDoErroDoGoogle(json) {
  const erro = json?.error;
  const itens = [
    ...(Array.isArray(erro?.errors) ? erro.errors : []),
    ...(Array.isArray(erro?.details) ? erro.details : []),
  ];
  return [...new Set(itens.map((item) => item?.reason).filter((motivo) => typeof motivo === 'string' && motivo))];
}

// O Google devolve 403 por vários motivos: escopo faltando, Calendar API
// desativada no projeto (accessNotConfigured), cota estourada
// (rateLimitExceeded) e outros. Só o primeiro pede que a pessoa conecte de
// novo; os demais são configuração ou falha passageira. O cabeçalho
// WWW-Authenticate com insufficient_scope cobre o 403 sem corpo.
const MOTIVOS_DE_ESCOPO = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT']);

export function faltouEscopo(status, json, wwwAuthenticate = null) {
  if (status !== 403) return false;
  if (typeof wwwAuthenticate === 'string' && /insufficient_scope/i.test(wwwAuthenticate)) return true;
  return motivosDoErroDoGoogle(json).some((motivo) => MOTIVOS_DE_ESCOPO.has(motivo));
}
