import {
  TELEMETRY_ALLOWED_DATA_FIELDS,
  TELEMETRY_KINDS,
  deepFreezeTelemetry,
  isTelemetryKind,
} from './telemetryContracts.js';

const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;
const FORBIDDEN_KEY_PATTERN = /(audio|transcript|text|message|description|amount|balance|price|email|phone|cpf|name|token|secret|password|authorization|cookie|account|transaction|user|workspace|conversation|prompt|payload|content)/i;
const SENSITIVE_STRING_PATTERNS = Object.freeze([
  /\s/,
  /@/,
  /^https?:/i,
  /^bearer/i,
  /^eyJ[A-Za-z0-9_-]+\./,
  /\d{7,}/,
]);

function isSafeCode(value) {
  return SAFE_CODE_PATTERN.test(value)
    && !SENSITIVE_STRING_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeValue(field, value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0) return null;
    if (field.endsWith('Count') || field === 'count') return Math.trunc(value);
    return Number(value.toFixed(3));
  }
  if (typeof value === 'string' && isSafeCode(value)) return value;
  return null;
}

export function containsForbiddenTelemetryField(input) {
  if (!input || typeof input !== 'object') return false;
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) return true;
    if (value && typeof value === 'object' && containsForbiddenTelemetryField(value)) return true;
  }
  return false;
}

export function sanitizeTelemetryData(kind, input = {}) {
  if (!isTelemetryKind(kind)) return deepFreezeTelemetry({});
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const allowedFields = TELEMETRY_ALLOWED_DATA_FIELDS[kind] ?? [];
  const sanitized = {};

  for (const field of allowedFields) {
    if (!Object.hasOwn(source, field)) continue;
    const value = sanitizeValue(field, source[field]);
    if (value !== null) sanitized[field] = value;
  }

  if (kind === TELEMETRY_KINDS.METRIC && typeof sanitized.value !== 'number') {
    return deepFreezeTelemetry({});
  }

  return deepFreezeTelemetry(sanitized);
}

export function isSanitizedTelemetryData(kind, value) {
  if (!isTelemetryKind(kind) || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = TELEMETRY_ALLOWED_DATA_FIELDS[kind] ?? [];
  return Object.keys(value).every((field) => allowed.includes(field))
    && !containsForbiddenTelemetryField(value);
}
