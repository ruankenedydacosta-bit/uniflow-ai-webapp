// Tela 13 v2: a lista de notificações (painel do sino e página do Mais)
// agrupa por dia de chegada em Hoje, Ontem e Anteriores. Funções puras,
// com `now` injetável, no mesmo padrão de formatNotificationDate.

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveNotificationDayLabel(createdAt, now = new Date()) {
  const date = parseDate(createdAt);
  if (!date) return 'Anteriores';
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays <= 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return 'Anteriores';
}

/**
 * Agrupa preservando a ordem recebida (a lista já vem da mais recente para
 * a mais antiga). Cada grupo: { key, label, items }.
 */
export function groupNotificationsByDay(notifications = [], now = new Date()) {
  const groups = new Map();
  for (const notification of notifications) {
    const label = resolveNotificationDayLabel(notification?.created_at, now);
    const group = groups.get(label) ?? { key: label, label, items: [] };
    group.items.push(notification);
    groups.set(label, group);
  }
  return [...groups.values()];
}
