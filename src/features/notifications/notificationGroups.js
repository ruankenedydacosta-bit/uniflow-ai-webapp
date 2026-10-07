// Fase 3 do redesign (#90): a página de notificações (tela 13) agrupa a
// lista por dia (Hoje, Ontem, depois a data) e mostra só a hora em cada
// item. Funções puras, com `now` injetável, no mesmo padrão de
// formatNotificationDate.

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatNotificationTime(createdAt) {
  const date = parseDate(createdAt);
  if (!date) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function resolveNotificationDayLabel(createdAt, now = new Date()) {
  const date = parseDate(createdAt);
  if (!date) return 'Sem data';
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * Agrupa preservando a ordem recebida (a lista já vem da mais recente para
 * a mais antiga). Cada grupo: { key, label, items }.
 */
export function groupNotificationsByDay(notifications = [], now = new Date()) {
  const groups = new Map();
  for (const notification of notifications) {
    const date = parseDate(notification?.created_at);
    const key = date ? startOfDay(date).toISOString() : 'sem-data';
    const group = groups.get(key) ?? {
      key,
      label: resolveNotificationDayLabel(notification?.created_at, now),
      items: [],
    };
    group.items.push(notification);
    groups.set(key, group);
  }
  return [...groups.values()];
}
