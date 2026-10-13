export const NOTIFICATION_TYPES = Object.freeze([
  'financeiro',
  'metas',
  'agenda',
  'crm',
  'sistema',
  'uni',
]);

const TYPE_LABELS = Object.freeze({
  financeiro: 'Financeiro',
  metas: 'Metas',
  agenda: 'Agenda',
  crm: 'CRM',
  sistema: 'Sistema',
  uni: 'Uni',
});

export function getNotificationTypeLabel(type) {
  return TYPE_LABELS[type] ?? 'Sistema';
}

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
 * Data relativa curta (hoje/ontem/dd/mm) para a lista de notificações.
 * Determinística via `now` injetável -- mesmo padrão de funções puras de
 * data já usado no repositório (ex.: calcReportsWindowStart).
 */
export function formatNotificationDate(createdAt, now = new Date()) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Ontem';

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * Hora do compromisso para a notificação da Agenda ("Às 13:15"). A descrição
 * do evento fica de fora: a que vem do Google Agenda costuma trazer o convite
 * inteiro da reunião (links, senha, rodapé), e a notificação vira um bloco de
 * texto. `timeZone` injetável só para teste; no app vale a do navegador.
 */
export function formatAgendaNotificationTime(startsAt, { timeZone } = {}) {
  if (!startsAt) return '';
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return '';
  const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone });
  return `Às ${hora}`;
}

/**
 * Texto da linha de baixo no painel. Notificação da Agenda mostra só a hora,
 * inclusive as gravadas antes desta regra, que guardam a descrição em
 * `message`.
 */
export function getNotificationMessage(notification, options) {
  if (notification?.type === 'agenda') {
    const hora = formatAgendaNotificationTime(notification.metadata?.agenda_starts_at, options);
    if (hora) return hora;
  }
  return notification?.message ?? '';
}
