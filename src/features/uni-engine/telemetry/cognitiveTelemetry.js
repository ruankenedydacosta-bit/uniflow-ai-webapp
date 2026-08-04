// Uni Engine — Cognitive Telemetry (Fase 14, Bloco 4).
//
// Telemetria cognitiva TÉCNICA, temporária, sanitizada e EXCLUSIVAMENTE em
// memória para avaliar o shadow mode. Regras absolutas:
//   - buffer limitado (ring buffer — descarta o registro mais antigo);
//   - dados sanitizados (nunca texto completo, nomes, e-mails, telefones,
//     CPF/CNPJ, tokens, senhas, chaves, dados bancários, áudio, URLs
//     assinadas ou payloads brutos de Supabase/OpenAI/Asaas/ElevenLabs);
//   - sem Supabase, sem localStorage, sem sessionStorage, sem banco, sem
//     rede e sem persistência entre recarregamentos;
//   - reset controlado;
//   - snapshot de diagnóstico serializável.
//
// O buffer é global no módulo (dura apenas enquanto a página está carregada)
// e pode ser substituído por instâncias próprias nos testes.
import { COGNITIVE_AGREEMENT_STATUSES } from '../cognitive-comparison/cognitiveComparisonTypes.js';
import { COGNITIVE_COMPARISON_REASON_CODES } from '../cognitive-comparison/cognitiveComparisonTypes.js';

export const COGNITIVE_TELEMETRY_VERSION = '1.0';
export const COGNITIVE_TELEMETRY_DEFAULT_MAX_ENTRIES = 32;
export const COGNITIVE_TELEMETRY_MAX_ENTRIES_LIMIT = 256;

// Chaves de segurança permitidas no registro (allowlist — nada além disso
// sobrevive à sanitização).
const SAFETY_KEYS = Object.freeze([
  'responseModified',
  'financialExecution',
  'memoryWrite',
  'learningApplied',
  'ttsTriggered',
  'persistenceWritten',
  'databaseCalled',
  'rpcCalled',
  'influenceApplied',
  'pendingActionModified',
  'confirmationModified',
]);

// Chaves de flags permitidas (subconjunto fechado do config).
const FLAG_KEYS = Object.freeze([
  'enabled',
  'shadowMode',
  'telemetryEnabled',
  'epistemicEnabled',
  'epistemicShadowMode',
  'integrationEnabled',
  'conversationRoutingEnabled',
  'cognitiveOrchestratorEnabled',
  'rolloutEnabled',
]);

export function createCognitiveTelemetryStore(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const requested = Number(safe.maxEntries ?? COGNITIVE_TELEMETRY_DEFAULT_MAX_ENTRIES);
  const maxEntries = Number.isFinite(requested)
    ? Math.max(1, Math.min(COGNITIVE_TELEMETRY_MAX_ENTRIES_LIMIT, Math.round(requested)))
    : COGNITIVE_TELEMETRY_DEFAULT_MAX_ENTRIES;
  return {
    entries: [],
    maxEntries,
    created: 0,
  };
}

function sanitizeFlags(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const flags = {};
  for (const key of FLAG_KEYS) {
    flags[key] = Boolean(safe[key]);
  }
  return flags;
}

function sanitizeSafety(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const safety = {};
  for (const key of SAFETY_KEYS) {
    safety[key] = Boolean(safe[key]);
  }
  return safety;
}

function sanitizeLayers(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const summary = {
    present: 0,
    executed: 0,
    disabled: 0,
    errors: {},
    latencyMs: null,
  };
  if (safe.summary && typeof safe.summary === 'object') {
    const s = safe.summary;
    if (Number.isFinite(s.layersPresent)) summary.present = Number(s.layersPresent);
    if (Number.isFinite(s.layersExecuted)) summary.executed = Number(s.layersExecuted);
    if (Number.isFinite(s.layersDisabled)) summary.disabled = Number(s.layersDisabled);
  }
  const latencyMs = Number(safe.latencyMs);
  if (Number.isFinite(latencyMs)) summary.latencyMs = Number(latencyMs.toFixed(2));
  if (safe.layers && typeof safe.layers === 'object') {
    for (const [layer, entry] of Object.entries(safe.layers)) {
      if (entry && typeof entry === 'object' && entry.errorCode) {
        summary.errors[layer] = entry.errorCode;
      }
    }
  }
  return summary;
}

// Sanitização do registro: allowlist estrita + limites de tamanho. Nunca
// armazena texto, IDs sensíveis, payloads ou credenciais.
export function sanitizeCognitiveTelemetryEntry(entry) {
  const safe = entry && typeof entry === 'object' ? entry : {};
  const reasonInput = Array.isArray(safe.reasonCodes) ? safe.reasonCodes : [];
  const agreementStatus = COGNITIVE_AGREEMENT_STATUSES.includes(safe.agreementStatus)
    ? safe.agreementStatus
    : null;

  const record = {
    version: COGNITIVE_TELEMETRY_VERSION,
    turnId: typeof safe.turnId === 'string' ? safe.turnId.slice(0, 64) : null,
    messageId: typeof safe.messageId === 'string' ? safe.messageId.slice(0, 64) : null,
    agreementStatus,
    agreement: Boolean(safe.agreement),
    divergenceType: typeof safe.divergenceType === 'string' ? safe.divergenceType : null,
    divergenceSeverity: typeof safe.divergenceSeverity === 'string' ? safe.divergenceSeverity : null,
    reasonCodes: reasonInput
      .filter((code) => COGNITIVE_COMPARISON_REASON_CODES.includes(code))
      .slice(0, 12),
    engineSkipped: Boolean(safe.engineSkipped),
    engineErrorCode: typeof safe.engineErrorCode === 'string' ? safe.engineErrorCode : null,
    fallbackUsed: Boolean(safe.fallbackUsed),
    rollbackStatus: typeof safe.rollbackStatus === 'string' ? safe.rollbackStatus : null,
    flags: sanitizeFlags(safe.flags),
    layers: sanitizeLayers(safe.layers),
    safety: sanitizeSafety(safe.safety),
    latencyMs:
      typeof safe.latencyMs === 'number' && Number.isFinite(safe.latencyMs)
        ? Number(safe.latencyMs.toFixed(2))
        : null,
    timestamp: typeof safe.timestamp === 'string' ? safe.timestamp : null,
  };

  return Object.freeze(record);
}

export function recordIntoTelemetry(store, entry) {
  const safeStore = store && typeof store === 'object' ? store : null;
  if (!safeStore || !Array.isArray(safeStore.entries)) return null;
  const sanitized = sanitizeCognitiveTelemetryEntry(entry);
  safeStore.entries.push(sanitized);
  safeStore.created += 1;
  while (safeStore.entries.length > safeStore.maxEntries) {
    safeStore.entries.shift();
  }
  return sanitized;
}

function summarize(store) {
  const entries = store.entries;
  const summary = {
    turnsObserved: entries.length,
    executionsCompleted: 0,
    executionsIgnored: 0,
    fallbacks: 0,
    agreements: 0,
    partialAgreements: 0,
    divergences: 0,
    insufficientData: 0,
    engineErrors: 0,
    skipped: 0,
    errorsByLayer: {},
    latencyMsByLayer: {},
    influenceApplied: false,
    persistenceWritten: false,
    ttsTriggered: false,
    financialExecutions: 0,
    flags: {
      lastTurnFlags: entries.length > 0 ? sanitizeFlags(entries[entries.length - 1].flags) : {},
    },
    rollbackStatus: entries.length > 0 ? entries[entries.length - 1].rollbackStatus : null,
  };

  for (const entry of entries) {
    switch (entry.agreementStatus) {
      case 'agreement':
        summary.agreements += 1;
        break;
      case 'partial_agreement':
        summary.partialAgreements += 1;
        break;
      case 'divergence':
        summary.divergences += 1;
        break;
      case 'insufficient_data':
        summary.insufficientData += 1;
        break;
      case 'engine_error':
        summary.engineErrors += 1;
        break;
      case 'skipped':
        summary.skipped += 1;
        break;
      default:
        break;
    }
    if (entry.fallbackUsed) summary.fallbacks += 1;
    if (entry.engineSkipped || entry.agreementStatus === 'skipped') {
      summary.executionsIgnored += 1;
    } else if (entry.agreementStatus) {
      summary.executionsCompleted += 1;
    }
    if (entry.safety?.influenceApplied) summary.influenceApplied = true;
    if (entry.safety?.persistenceWritten) summary.persistenceWritten = true;
    if (entry.safety?.ttsTriggered) summary.ttsTriggered = true;
    if (entry.safety?.financialExecution) summary.financialExecutions += 1;
    if (entry.layers?.errors && Object.keys(entry.layers.errors).length > 0) {
      for (const [layer, code] of Object.entries(entry.layers.errors)) {
        summary.errorsByLayer[layer] = code;
      }
    }
    if (entry.layers?.latencyMs != null) {
      summary.latencyMsByLayer.turn = entry.layers.latencyMs;
    }
  }

  return summary;
}

export function getTelemetrySnapshot(store) {
  const safeStore = store && typeof store === 'object' ? store : null;
  if (!safeStore || !Array.isArray(safeStore.entries)) {
    return {
      version: COGNITIVE_TELEMETRY_VERSION,
      enabled: false,
      maxEntries: 0,
      count: 0,
      summary: summarize({ entries: [] }),
      oldest: null,
      last: null,
      serializable: true,
    };
  }
  return {
    version: COGNITIVE_TELEMETRY_VERSION,
    enabled: true,
    maxEntries: safeStore.maxEntries,
    count: safeStore.entries.length,
    summary: summarize(safeStore),
    oldest: safeStore.entries[0] ?? null,
    last: safeStore.entries[safeStore.entries.length - 1] ?? null,
    serializable: true,
  };
}

export function resetTelemetryStore(store) {
  const safeStore = store && typeof store === 'object' ? store : null;
  if (!safeStore) return;
  safeStore.entries = [];
}

// Instância global (vive apenas enquanto o módulo está carregado na página).
export const globalCognitiveTelemetryStore = createCognitiveTelemetryStore();

export function recordCognitiveTelemetry(entry) {
  return recordIntoTelemetry(globalCognitiveTelemetryStore, entry);
}

export function getCognitiveTelemetrySnapshot() {
  return getTelemetrySnapshot(globalCognitiveTelemetryStore);
}

export function resetCognitiveTelemetry() {
  resetTelemetryStore(globalCognitiveTelemetryStore);
}