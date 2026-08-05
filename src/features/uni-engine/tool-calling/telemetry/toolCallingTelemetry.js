// Uni Engine — Fase 20: Tool Calling (base). Telemetria sanitizada.
//
// Telemetria em memória, apenas com metadados sanitizados. NUNCA armazena
// argumentos brutos, conteúdo retornado bruto ou IDs crus. Buffer limitado.
export const TOOL_CALLING_TELEMETRY_VERSION = '20.0';

export const TOOL_CALLING_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'timestamp',
  'environment',
  'toolName',
  'toolCallIdHash',
  'status',
  'decision',
  'reason',
  'authorized',
  'executionAllowed',
  'writes',
  'idempotent',
  'latencyMs',
  'hasError',
  'errorCode',
  'version',
  'telemetryVersion',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreeze));
  const frozen = {};
  for (const key of Object.keys(value).sort()) frozen[key] = deepFreeze(value[key]);
  return Object.freeze(frozen);
}

function isString(value) { return typeof value === 'string'; }
function isNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
function isBoolean(value) { return typeof value === 'boolean'; }

// Hash determinístico de uma tool call id — nunca armazena o id cru.
export function hashToolCallId(id) {
  if (typeof id !== 'string' || id === '') return null;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

export function buildToolCallingTelemetryEntry(payload = {}) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  return deepFreeze({
    timestamp: isNumber(safe.timestamp) ? safe.timestamp : Date.now(),
    environment: isString(safe.environment) ? safe.environment : 'unknown',
    toolName: isString(safe.toolName) ? safe.toolName : null,
    toolCallIdHash: hashToolCallId(safe.toolCallId),
    status: isString(safe.status) ? safe.status : null,
    decision: isString(safe.decision) ? safe.decision : null,
    reason: isString(safe.reason) ? safe.reason : null,
    authorized: isBoolean(safe.authorized) ? safe.authorized : false,
    executionAllowed: isBoolean(safe.executionAllowed) ? safe.executionAllowed : false,
    writes: isBoolean(safe.writes) ? safe.writes : false,
    idempotent: isBoolean(safe.idempotent) ? safe.idempotent : false,
    latencyMs: isNumber(safe.latencyMs) ? safe.latencyMs : 0,
    hasError: isBoolean(safe.hasError) ? safe.hasError : false,
    errorCode: isString(safe.errorCode) ? safe.errorCode : null,
    version: isString(safe.version) ? safe.version : TOOL_CALLING_TELEMETRY_VERSION,
    telemetryVersion: TOOL_CALLING_TELEMETRY_VERSION,
  });
}

export function createToolCallingTelemetryStore({ enabled = true, maxEntries = 100 } = {}) {
  const store = [];

  function recordEntry(payload = {}) {
    if (enabled !== true) return null;
    const entry = buildToolCallingTelemetryEntry(payload);
    store.push(entry);
    if (store.length > maxEntries) {
      store.splice(0, store.length - maxEntries);
    }
    return entry;
  }

  function getSnapshot() {
    return [...store];
  }

  function reset() {
    store.splice(0, store.length);
    return { ok: true };
  }

  function size() {
    return store.length;
  }

  return { recordEntry, getSnapshot, reset, size };
}
