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
