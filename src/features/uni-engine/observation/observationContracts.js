// Uni Engine — Observação da conversa (Parte 2, Bloco 3).
//
// Camada observacional que consolida os snapshots produzidos pela integração
// (Parte 1), pelo guidance (Bloco 2) e pela Activation (Fase 9) em UM único
// estado TÉCNICO da conversa. Este módulo é a fonte da forma: versiona,
// sanitiza, redige e congela cada sub-snapshot antes de montar o consolidado.
//
// Garantias do snapshot consolidado:
//   - SOMENTE em memória: nenhuma função, nenhum cliente externo, nenhuma
//     referência circular — sempre serializável;
//   - `mode` é SEMPRE 'observational' e `legacyPreserved` é SEMPRE true (a
//     observação nunca altera a resposta);
//   - determínístico: dadas as mesmas entradas, o JSON é idêntico (nenhuma
//     chamada a Date.now/aleatoriedade aqui);
//   - todo objeto é Object.freeze() em profundidade;
//   - NENHUM texto é embedado: finalText, legacyResult e suggestedText são
//     redigidos; nada de IDs, valores, contas, categorias ou memória.
import { isSerializableValue } from '../uniEngineContracts.js';

export const OBSERVATION_VERSION = '1.0';

export const OBSERVATION_MODES = Object.freeze(['observational']);

export function isObservationMode(value) {
  return OBSERVATION_MODES.includes(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(3))
    : null;
}

// Congela em profundidade. Reentrante e idempotente: objetos já congelados
// (e compartilhados) não são varridos de novo — evita loops em DAGs.
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

// Sanitização genérica recursiva: devolve uma cópia JSON-safe e determinística
// de qualquer valor. Descarta funções, símbolos, bigint, Map/Set e quebra
// referências circulares (um objeto já visitado vira null). Nunca lança.
function sanitizeValue(value, seen) {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  if (type === 'function' || type === 'symbol' || type === 'bigint') return null;
  if (type === 'object') {
    if (value instanceof Map || value instanceof Set) return null;
    if (seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) {
        const sanitized = sanitizeValue(item, seen);
        if (sanitized !== undefined && sanitized !== null) result.push(sanitized);
      }
      seen.delete(value);
      return result;
    }
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const sanitized = sanitizeValue(item, seen);
      if (sanitized === undefined || sanitized === null) continue;
      result[key] = sanitized;
    }
    seen.delete(value);
    return Object.keys(result).length > 0 ? result : null;
  }
  return null;
}

function sanitizeStringList(list, max) {
  if (!Array.isArray(list)) return [];
  const result = [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item === 'string' && !seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length >= max) break;
    }
  }
  return result;
}

// Chaves de texto NUNCA embedadas pela observação.
const INTEGRATION_REDACTED_KEYS = Object.freeze(['finalText', 'legacyResult']);
const GUIDANCE_REDACTED_KEYS = Object.freeze(['suggestedText']);

const GUIDANCE_SNAPSHOT_KEYS = Object.freeze([
  'questionGuidance',
  'clarificationGuidance',
  'styleGuidance',
  'lengthGuidance',
]);

// Cada guidance vira apenas chaves, bandas e razões — nunca texto livre.
function sanitizeGuidanceObject(value) {
  if (!isPlainObject(value)) return null;
  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (GUIDANCE_REDACTED_KEYS.includes(key)) continue;
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      const list = item.filter((entry) => typeof entry === 'string').slice(0, 8);
      if (list.length > 0) sanitized[key] = list;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

const DIAGNOSTIC_ALLOWED_KEYS = Object.freeze([
  'code',
  'severity',
  'module',
  'capability',
  'reason',
  'source',
  'observational',
  'recoverable',
  'fallbackRecommended',
  'shadowOnly',
  'metadata',
]);

function sanitizeDiagnostic(item) {
  if (!isPlainObject(item)) return null;
  const sanitized = {};
  for (const key of DIAGNOSTIC_ALLOWED_KEYS) {
    const value = item[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (key === 'metadata' && isPlainObject(value)) {
      const metadata = {};
      for (const [metaKey, metaValue] of Object.entries(value)) {
        if (metaValue === undefined || metaValue === null) continue;
        if (typeof metaValue === 'string' || typeof metaValue === 'number' || typeof metaValue === 'boolean') {
          metadata[metaKey] = metaValue;
        } else if (Array.isArray(metaValue)) {
          const list = metaValue
            .filter((entry) => typeof entry === 'string' || typeof entry === 'number')
            .slice(0, 5);
          if (list.length > 0) metadata[metaKey] = list;
        }
      }
      sanitized[key] = metadata;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeDiagnostics(list) {
  if (!Array.isArray(list)) return [];
  const result = [];
  for (const item of list) {
    const diagnostic = sanitizeDiagnostic(item);
    if (diagnostic) result.push(diagnostic);
    if (result.length >= 12) break;
  }
  return result;
}

const METADATA_ALLOWED_KEYS = Object.freeze([
  'sources',
  'integrationStatus',
  'integrationFallbackUsed',
  'integrationApplied',
  'guidanceCapabilitiesCount',
  'activationDecisionsCount',
  'environment',
]);

function sanitizeMetadata(value) {
  if (!isPlainObject(value)) return {};
  const sanitized = {};
  for (const key of METADATA_ALLOWED_KEYS) {
    const item = value[key];
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      const list = item.filter((entry) => typeof entry === 'string').slice(0, 8);
      if (list.length > 0) sanitized[key] = list;
    }
  }
  return sanitized;
}

function sanitizeTimestamps(value) {
  const safe = isPlainObject(value) ? value : {};
  return {
    recordedAt: typeof safe.recordedAt === 'string' ? safe.recordedAt : null,
    integrationLatencyMs: finiteOrNull(safe.integrationLatencyMs),
    guidanceLatencyMs: finiteOrNull(safe.guidanceLatencyMs),
  };
}

// Sub-snapshot da integração: redige texto (finalText, legacyResult,
// suggestedText) e mantém apenas o estado TÉCNICO da rodada.
export function sanitizeIntegrationSnapshot(value) {
  if (!isPlainObject(value)) return null;
  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (INTEGRATION_REDACTED_KEYS.includes(key)) continue;
    if (GUIDANCE_SNAPSHOT_KEYS.includes(key)) {
      const guidance = sanitizeGuidanceObject(item);
      if (guidance) redacted[key] = guidance;
      continue;
    }
    const sanitized = sanitizeValue(item, new Set());
    if (sanitized !== undefined && sanitized !== null) redacted[key] = sanitized;
  }
  return deepFreeze({
    version: typeof redacted.version === 'string' ? redacted.version : null,
    enabled: Boolean(redacted.enabled),
    shadowMode: Boolean(redacted.shadowMode),
    status: typeof redacted.status === 'string' ? redacted.status : 'UNKNOWN',
    applied: Boolean(redacted.applied),
    capabilitiesRequested: sanitizeStringList(redacted.capabilitiesRequested, 8),
    capabilitiesApplied: sanitizeStringList(redacted.capabilitiesApplied, 8),
    legacyPreserved: redacted.legacyPreserved !== false,
    questionGuidance: sanitizeGuidanceObject(value.questionGuidance),
    clarificationGuidance: sanitizeGuidanceObject(value.clarificationGuidance),
    styleGuidance: sanitizeGuidanceObject(value.styleGuidance),
    lengthGuidance: sanitizeGuidanceObject(value.lengthGuidance),
    diagnostics: sanitizeDiagnostics(redacted.diagnostics),
    fallbackUsed: Boolean(redacted.fallbackUsed),
    fallbackReason: typeof redacted.fallbackReason === 'string' ? redacted.fallbackReason : null,
    shadowComparison: isPlainObject(redacted.shadowComparison)
      ? sanitizeValue(redacted.shadowComparison, new Set())
      : null,
    telemetry: isPlainObject(redacted.telemetry)
      ? sanitizeValue(redacted.telemetry, new Set())
      : null,
    safety: isPlainObject(redacted.safety)
      ? sanitizeValue(redacted.safety, new Set())
      : null,
    latencyMs: finiteOrNull(redacted.latencyMs),
  });
}

// Sub-snapshot do guidance (Bloco 2): preserva a forma fechada e redige
// suggestedText — apenas chaves, bandas e razões observacionais.
export function sanitizeGuidanceSnapshot(value) {
  if (!isPlainObject(value)) return null;
  return deepFreeze({
    version: typeof value.version === 'string' ? value.version : null,
    mode: value.mode === 'observational' ? 'observational' : 'unknown',
    legacyPreserved: value.legacyPreserved !== false,
    capabilitiesComputed: sanitizeStringList(value.capabilitiesComputed, 8),
    questionGuidance: sanitizeGuidanceObject(value.questionGuidance),
    clarificationGuidance: sanitizeGuidanceObject(value.clarificationGuidance),
    styleGuidance: sanitizeGuidanceObject(value.styleGuidance),
    lengthGuidance: sanitizeGuidanceObject(value.lengthGuidance),
    diagnostics: sanitizeDiagnostics(value.diagnostics),
    serializable: true,
  });
}

// Sub-snapshot da Activation (Fase 9): aceita o objeto de activation do
// resultado da engine OU uma lista de decisões. Normaliza em agregados
// TÉCNICOS: contagens por status, capacidades e decisões redigidas (sem
// rolloutBucket derivado de identidade, sem gates, sem appliedEffect).
export function sanitizeActivationSnapshot(value) {
  let enabled = false;
  let shadowMode = false;
  let environment = null;
  let decisions;
  if (Array.isArray(value)) {
    decisions = value;
  } else if (isPlainObject(value)) {
    enabled = Boolean(value.enabled);
    shadowMode = Boolean(value.shadowMode);
    environment = typeof value.environment === 'string' ? value.environment : null;
    decisions = Array.isArray(value.decisions) ? value.decisions : [];
  } else {
    return null;
  }

  const redacted = [];
  const capabilities = new Set();
  let activeCount = 0;
  let shadowCount = 0;
  let blockedCount = 0;
  let errorCount = 0;

  for (const decision of decisions) {
    if (!isPlainObject(decision)) continue;
    const capability = typeof decision.capability === 'string' ? decision.capability : 'UNKNOWN';
    const activationStatus = typeof decision.activationStatus === 'string'
      ? decision.activationStatus
      : 'UNKNOWN';
    capabilities.add(capability);
    if (activationStatus === 'ACTIVE_TEST' || activationStatus === 'ACTIVE_ROLLOUT') {
      activeCount += 1;
    } else if (activationStatus === 'SHADOW_ONLY' || activationStatus === 'ELIGIBLE') {
      shadowCount += 1;
    } else if (activationStatus === 'ERROR_SAFE') {
      errorCount += 1;
    } else {
      blockedCount += 1;
    }
    redacted.push({
      capability,
      activationStatus,
      rolloutMode: typeof decision.rolloutMode === 'string' ? decision.rolloutMode : 'UNKNOWN',
      requested: Boolean(decision.requested),
      eligible: Boolean(decision.eligible),
      applied: Boolean(decision.applied),
      dataSufficient: Boolean(decision.dataSufficient),
      fallbackUsed: Boolean(decision.fallbackUsed),
      fallbackReason: typeof decision.fallbackReason === 'string' ? decision.fallbackReason : null,
      confidence: finiteOrNull(decision.confidence),
      confidenceThreshold: finiteOrNull(decision.confidenceThreshold),
      risk: typeof decision.risk === 'string' ? decision.risk : null,
      latencyMs: finiteOrNull(decision.latencyMs),
    });
  }

  return deepFreeze({
    enabled,
    shadowMode,
    environment,
    decisionsCount: redacted.length,
    activeCount,
    shadowCount,
    blockedCount,
    errorCount,
    capabilities: [...capabilities].sort(),
    decisions: redacted,
  });
}

function buildCapabilities({ integrationSnapshot, guidanceSnapshot, activationSnapshot }) {
  const capabilities = new Set();
  if (integrationSnapshot) {
    for (const capability of integrationSnapshot.capabilitiesRequested ?? []) capabilities.add(capability);
    for (const capability of integrationSnapshot.capabilitiesApplied ?? []) capabilities.add(capability);
  }
  if (guidanceSnapshot) {
    for (const capability of guidanceSnapshot.capabilitiesComputed ?? []) capabilities.add(capability);
  }
  if (activationSnapshot) {
    for (const capability of activationSnapshot.capabilities ?? []) capabilities.add(capability);
  }
  return [...capabilities].sort();
}

export function createEmptyObservationSnapshot(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  return deepFreeze({
    version: OBSERVATION_VERSION,
    mode: 'observational',
    legacyPreserved: true,
    shadowMode: Boolean(safe.shadowMode),
    integrationSnapshot: null,
    guidanceSnapshot: null,
    activationSnapshot: null,
    capabilities: [],
    diagnostics: [],
    timestamps: {
      recordedAt: null,
      integrationLatencyMs: null,
      guidanceLatencyMs: null,
    },
    metadata: {
      sources: [],
    },
    serializable: true,
  });
}

export function createObservationSnapshot(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const integrationSnapshot = sanitizeIntegrationSnapshot(safe.integrationSnapshot);
  const guidanceSnapshot = sanitizeGuidanceSnapshot(safe.guidanceSnapshot);
  const activationSnapshot = sanitizeActivationSnapshot(safe.activationSnapshot);
  const capabilities = buildCapabilities({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot,
  });
  return deepFreeze({
    version: OBSERVATION_VERSION,
    mode: 'observational',
    legacyPreserved: true,
    shadowMode: Boolean(safe.shadowMode),
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot,
    capabilities,
    diagnostics: sanitizeDiagnostics(safe.diagnostics),
    timestamps: sanitizeTimestamps(safe.timestamps),
    metadata: sanitizeMetadata(safe.metadata),
    serializable: true,
  });
}

export function isObservationSnapshotSerializable(value) {
  return isPlainObject(value)
    && value.serializable === true
    && isSerializableValue(value);
}

export { isSerializableValue };
