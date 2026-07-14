export const VALID_CONTEXTS = Object.freeze(['PF', 'PJ']);

export const NOTIFICATION_STATES = Object.freeze([
  'none',
  'unread',
  'important',
  'disabled',
  'permission-pending',
  'loading',
]);

export function getContextGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Bom dia,';
  if (hour < 18) return 'Boa tarde,';
  return 'Boa noite,';
}

export function normalizeHeaderInitials(initials) {
  const normalized = String(initials || 'UF').replace(/[^A-Za-zÀ-ÿ0-9]/g, '');
  return normalized.slice(0, 2).toUpperCase() || 'UF';
}
