const FINANCIAL_TYPES = new Set(['income', 'expense', 'transfer', 'goal']);

export function normalizeMemoryText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeMemoryEntity(value, type) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const display = value.trim().replace(/\s+/g, ' ');
  return Object.freeze({ type, normalized: normalizeMemoryText(display), display });
}

export function normalizeFinancialType(value) {
  const normalized = normalizeMemoryText(value).replace(/\s/g, '_');
  return FINANCIAL_TYPES.has(normalized) ? normalized : null;
}

export function normalizeMemoryIdentifier(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 160 ? normalized : null;
}

export function readMemoryValue(value, keys) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return null;
}
