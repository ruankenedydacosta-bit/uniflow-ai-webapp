const DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeParserText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(DIACRITICS_PATTERN, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeParserEntity(value, type) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const display = value.trim().replace(/\s+/g, ' ');
  return Object.freeze({
    type,
    normalized: normalizeParserText(display),
    display,
  });
}

export function normalizeParserAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : null;
  }
  if (typeof value !== 'string') return null;
  const compact = value.toLowerCase().replace(/r\$|reais?|\s/g, '');
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null;
}

function shiftDate(referenceDate, days) {
  if (!ISO_DATE_PATTERN.test(referenceDate ?? '')) return null;
  const date = new Date(`${referenceDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isValidIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeParserDate(value, referenceDate = null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = normalizeParserText(value);
  if (isValidIsoDate(normalized)) return normalized;
  if (normalized === 'hoje') return shiftDate(referenceDate, 0);
  if (normalized === 'ontem') return shiftDate(referenceDate, -1);
  if (normalized === 'amanha') return shiftDate(referenceDate, 1);

  const shortDate = normalized.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!shortDate) return null;
  const year = shortDate[3] ?? referenceDate?.slice(0, 4);
  if (!year) return null;
  const candidate = `${year}-${shortDate[2].padStart(2, '0')}-${shortDate[1].padStart(2, '0')}`;
  return isValidIsoDate(candidate) ? candidate : null;
}

export function normalizeParserEntityList(value, type) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const unique = new Map();
  values.forEach((item) => {
    const entity = normalizeParserEntity(item, type);
    if (entity) unique.set(entity.normalized, entity);
  });
  return Object.freeze([...unique.values()]);
}

export function normalizeParserAmountList(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return Object.freeze(values.map(normalizeParserAmount).filter((amount) => amount !== null));
}

export function normalizeParserDateList(value, referenceDate = null) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return Object.freeze(values.map((date) => normalizeParserDate(date, referenceDate)).filter(Boolean));
}
