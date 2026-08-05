// Uni Engine — Fase 20: Tool Calling (base). Contratos.
//
// Contrato interno de tool call e resultado padronizado (ToolResult).
// Nenhuma chamada de rede própria, nenhum cliente OpenAI, nenhum handler
// acessível aqui. Tudo JSON-safe e sem IDs crus na telemetria.
import { TOOL_CALLING_VERSION, TOOL_CALL_STATUSES } from '../types/index.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isSerializableValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return true;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  if (type === 'number') return Number.isFinite(value);
  if (type === 'function' || type === 'symbol' || type === 'bigint') return false;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => isSerializableValue(item, seen));
  if (isPlainObject(value)) {
    return Object.keys(value).every((key) => isSerializableValue(value[key], seen));
  }
  return false;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreeze));
  const frozen = {};
  for (const key of Object.keys(value).sort()) frozen[key] = deepFreeze(value[key]);
  return Object.freeze(frozen);
}

export function createEmptyToolResult({
  toolCallId = null,
  toolName = null,
  status = 'idle',
  authorized = false,
  executionAllowed = false,
} = {}) {
  const safeId = typeof toolCallId === 'string' ? toolCallId : null;
  const safeName = typeof toolName === 'string' ? toolName : null;
  const safeStatus = TOOL_CALL_STATUSES.includes(status) ? status : 'idle';
  return deepFreeze({
    version: TOOL_CALLING_VERSION,
    toolCallId: safeId,
    toolName: safeName,
    status: safeStatus,
    executed: false,
    authorized: Boolean(authorized),
    executionAllowed: Boolean(executionAllowed),
    idempotent: false,
    data: null,
    error: null,
    safety: {
      executionAllowed: Boolean(executionAllowed),
      authorized: Boolean(authorized),
      financialMutation: false,
      networkAccessed: false,
      wrote: false,
      persisted: false,
      externalServiceCalled: false,
      duplicatedExecution: false,
    },
    latencyMs: 0,
    timestamp: null,
    serializable: true,
  });
}

export function validateToolCall(toolCall) {
  if (!toolCall || typeof toolCall !== 'object') {
    return { valid: false, errors: ['TOOL_CALL_INVALID'] };
  }
  const errors = [];
  if (typeof toolCall.id !== 'string' || toolCall.id.trim() === '') {
    errors.push('TOOL_CALL_ID_MISSING');
  }
  if (typeof toolCall.name !== 'string' || toolCall.name.trim() === '') {
    errors.push('TOOL_CALL_NAME_MISSING');
  }
  if (toolCall.arguments !== undefined && toolCall.arguments !== null) {
    if (!isPlainObject(toolCall.arguments) && !Array.isArray(toolCall.arguments)) {
      errors.push('TOOL_CALL_ARGUMENTS_INVALID');
    } else if (!isSerializableValue(toolCall.arguments)) {
      errors.push('TOOL_CALL_ARGUMENTS_NOT_SERIALIZABLE');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function createToolResult({
  toolCallId = null,
  toolName = null,
  status = 'error',
  executed = false,
  authorized = false,
  executionAllowed = false,
  idempotent = false,
  data = null,
  error = null,
  safety = {},
  latencyMs = 0,
} = {}) {
  const base = createEmptyToolResult({ toolCallId, toolName, status, authorized, executionAllowed });
  const safeData = isSerializableValue(data) ? deepFreeze(data) : null;
  const safeError =
    error && isPlainObject(error) && typeof error.code === 'string'
      ? deepFreeze({
          code: error.code,
          message: typeof error.message === 'string' ? error.message : error.code,
        })
      : null;
  const safeStatus = TOOL_CALL_STATUSES.includes(status) ? status : base.status;
  return deepFreeze({
    ...base,
    status: safeStatus,
    executed: Boolean(executed),
    idempotent: Boolean(idempotent),
    data: safeData,
    error: safeError,
    safety: deepFreeze({
      executionAllowed: Boolean(executionAllowed),
      authorized: Boolean(authorized),
      financialMutation: Boolean(safety.financialMutation),
      networkAccessed: Boolean(safety.networkAccessed),
      wrote: Boolean(safety.wrote),
      persisted: Boolean(safety.persisted),
      externalServiceCalled: Boolean(safety.externalServiceCalled),
      duplicatedExecution: Boolean(safety.duplicatedExecution),
    }),
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : 0,
    timestamp: new Date().toISOString(),
    serializable: true,
  });
}

export function isToolResultSerializable(result) {
  if (!result || typeof result !== 'object') return false;
  try {
    JSON.stringify(result);
    return true;
  } catch {
    return false;
  }
}
