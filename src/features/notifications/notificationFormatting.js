export const NOTIFICATION_TYPES = Object.freeze([
  'financeiro',
  'metas',
  'agenda',
  'crm',
  'sistema',
  'uni',
]);

export function isNotificationUnread(notification) {
  return !notification?.read_at;
}

export function countUnread(notifications = []) {
  return notifications.reduce((total, n) => total + (isNotificationUnread(n) ? 1 : 0), 0);
}

/**
 * Só permite navegação para uma rota INTERNA relativa (começa com uma única
 * barra, nunca "//" -- protocol-relative aponta para outro host). Bloqueia
 * qualquer URL absoluta (http:, https:, javascript:, mailto:, etc.) e
 * qualquer valor que não seja string.
 */
export function isSafeInternalUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  if (!url.startsWith('/')) return false;
  if (url.startsWith('//')) return false;
  return true;
}

/**
 * Hora em que a notificação chegou, na coluna da direita. Hoje e ontem
 * mostram a hora (o grupo da lista já diz o dia); mais antigas, dd/mm.
 * Determinística via `now` injetável -- mesmo padrão de funções puras de
 * data já usado no repositório (ex.: calcReportsWindowStart).
 */
export function formatNotificationDate(createdAt, now = new Date()) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (diffDays <= 1) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Dia do calendário no fuso pedido, como data UTC à meia-noite: permite
// contar dias e ler o dia da semana sem depender do fuso da máquina.
function diaNoFuso(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date);
  const parte = (tipo) => Number(parts.find((p) => p.type === tipo).value);
  return new Date(Date.UTC(parte('year'), parte('month') - 1, parte('day')));
}

/**
 * Dia e hora do compromisso para a notificação da Agenda ("Hoje às 09:00",
 * "Ter, 13 out às 09:00"). Só a hora não basta: a notificação fica na lista
 * nos dias seguintes. "Amanhã" cobre o lembrete que chegar antes do
 * compromisso. A descrição do evento fica de fora: a que vem do Google
 * Agenda costuma trazer o convite inteiro da reunião (links, senha, rodapé).
 * `now: null` devolve sempre a data, para o texto gravado no banco, que não
 * pode envelhecer. `timeZone` e `now` injetáveis para teste; no app valem o
 * fuso do navegador e a hora atual.
 */
export function formatAgendaNotificationTime(startsAt, { timeZone, now = new Date() } = {}) {
  if (!startsAt) return '';
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return '';
  const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone });

  const dia = diaNoFuso(date, timeZone);
  if (now) {
    const diffDays = Math.round((dia - diaNoFuso(now, timeZone)) / 86400000);
    if (diffDays === 0) return `Hoje às ${hora}`;
    if (diffDays === 1) return `Amanhã às ${hora}`;
  }

  const diaDoMes = String(dia.getUTCDate()).padStart(2, '0');
  return `${DIAS_DA_SEMANA[dia.getUTCDay()]}, ${diaDoMes} ${MESES[dia.getUTCMonth()]} às ${hora}`;
}

/**
 * Texto da linha de baixo no painel. Notificação da Agenda mostra o dia e a
 * hora do compromisso, inclusive as gravadas antes desta regra, que guardam
 * a descrição em `message`.
 */
export function getNotificationMessage(notification, options) {
  if (notification?.type === 'agenda') {
    const hora = formatAgendaNotificationTime(notification.metadata?.agenda_starts_at, options);
    if (hora) return hora;
  }
  return notification?.message ?? '';
}
