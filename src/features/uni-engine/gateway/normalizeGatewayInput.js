// src/features/uni-engine/gateway/normalizeGatewayInput.js
//
// Normaliza a entrada da conversa em um único formato comum para o gateway:
// - ids do turno preservados (turnId do chamador ou correlationId gerado);
// - contexto deepfreeze via deepFreezeSafe e histórico limitado por
//   GATEWAY_POLICY.MAX_HISTORY_LENGTH;
// - funcões removidas (deepRemoveFunctions), map e set removidos e
//   circularidade tratada via WeakSet de rastreamento;
// - snapshot financeiro sanitizado: segredo não aparece e token não
//   aparece em nenhum campo do input normalizado.
import { GATEWAY_POLICY } from './gatewayPolicy.js';
import { createCorrelationId } from '../uniEngineContracts.js';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepRemoveFunctions(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (typeof value === 'function') {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepRemoveFunctions(item, seen));
  }

  const result = {};
  for (const [key, val] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    result[key] = deepRemoveFunctions(val, seen);
  }

  seen.delete(value);
  return result;
}

function deepSanitizeFinancialSnapshot(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[sanitized]';
  }
  seen.add(value);

  const result = {};
  for (const [key, val] of Object.entries(value)) {
    if (key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('email') ||
        key.toLowerCase().includes('phone') ||
        key.toLowerCase().includes('bank')) {
      result[key] = '[sanitized]';
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) => deepSanitizeFinancialSnapshot(item, seen));
    } else if (isObject(val)) {
      result[key] = deepSanitizeFinancialSnapshot(val, seen);
    } else {
      result[key] = val;
    }
  }

  seen.delete(value);
  return result;
}

function deepFreezeSafe(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.map((item) => deepFreezeSafe(item, seen));
    seen.delete(value);
    return Object.freeze(result);
  }

  const entries = Object.entries(value);
  const result = {};
  for (const [key, val] of entries) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    result[key] = deepFreezeSafe(val, seen);
  }

  seen.delete(value);
  return Object.freeze(result);
}

const { MAX_HISTORY_LENGTH } = GATEWAY_POLICY;

function limitHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-MAX_HISTORY_LENGTH);
}

export function normalizeGatewayInput(input) {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'INPUT_NOT_OBJECT', data: null };
  }

  const source = input.source || 'text';
  if (!GATEWAY_POLICY.ALLOWED_SOURCES.includes(source)) {
    return { valid: false, error: 'INVALID_SOURCE', data: null };
  }

  let text = '';
  let transcript = null;

  if (source === 'text') {
    if (input.text) {
      text = String(input.text);
      if (text.length > GATEWAY_POLICY.MAX_INPUT_LENGTH) {
        return { valid: false, error: 'INPUT_TOO_LONG', data: null };
      }
    }
  } else if (source === 'voice') {
    if (input.transcript) {
      transcript = String(input.transcript);
      if (!transcript.trim()) {
        return { valid: false, error: 'EMPTY_TRANSCRIPT', data: null };
      }
    }
  }

  if (!text.trim() && !transcript?.trim()) {
    return { valid: false, error: 'EMPTY_INPUT', data: null };
  }

  const turnId = input.turnId || createCorrelationId();

  const normalizedInput = {
    turnId,
    source,
    text: text.trim() || null,
    transcript: transcript ? transcript.trim() : null,
    userId: input.userId || null,
    workspaceId: input.workspaceId || null,
    conversationId: input.conversationId || null,
    currentRoute: input.currentRoute || null,
    pendingAction: input.pendingAction || null,
    conversationHistory: limitHistory(input.conversationHistory),
    financialSnapshot: deepSanitizeFinancialSnapshot(input.financialSnapshot || null),
    userPreferences: input.userPreferences || null,
    config: input.config || null,
    environment: input.environment || null,
  };

  const sanitizedInput = deepRemoveFunctions(normalizedInput);
  const frozenInput = deepFreezeSafe(sanitizedInput);

  return {
    valid: true,
    data: frozenInput,
    error: null,
  };
}
