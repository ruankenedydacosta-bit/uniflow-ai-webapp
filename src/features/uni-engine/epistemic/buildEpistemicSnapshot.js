// Snapshot do Motor Epistêmico
// Gera um snapshot serializável de estado para auditoria e debugging

import { EPISTEMIC_VERSION, createEpistemicTelemetry } from './epistemicContracts.js';
import { buildEpistemicDiagnostics } from './buildEpistemicDiagnostics.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreeze));
  }

  const entries = Object.entries(value);
  const sortedEntries = entries.sort(([a], [b]) => a.localeCompare(b));

  const frozen = {};
  for (const [key, val] of sortedEntries) {
    frozen[key] = deepFreeze(val);
  }

  return Object.freeze(frozen);
}

function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function calculateConfidenceBand(knowledge) {
  if (knowledge.length === 0) return { average: 0, max: 0, band: 'none' };

  const average = knowledge.reduce((sum, k) => sum + k.confidence, 0) / knowledge.length;
  const max = Math.max(...knowledge.map((k) => k.confidence));
  const band = average >= 0.8 ? 'high' : average >= 0.6 ? 'medium' : average >= 0.4 ? 'low' : 'very_low';

  return { average, max, band };
}

function calculatePriorityBand(knowledge) {
  return {
    CRITICAL: knowledge.filter((k) => k.priority === 'CRITICAL').length,
    HIGH: knowledge.filter((k) => k.priority === 'HIGH').length,
    MEDIUM: knowledge.filter((k) => k.priority === 'MEDIUM').length,
    LOW: knowledge.filter((k) => k.priority === 'LOW').length,
    IGNORE: knowledge.filter((k) => k.priority === 'IGNORE').length,
    UNDETERMINED: knowledge.filter((k) => k.priority === 'UNDETERMINED').length,
  };
}

function calculateRiskBand(knowledge) {
  return {
    HIGH: knowledge.filter((k) => k.risk === 'HIGH').length,
    CRITICAL: knowledge.filter((k) => k.risk === 'CRITICAL').length,
    MEDIUM: knowledge.filter((k) => k.risk === 'MEDIUM').length,
    LOW: knowledge.filter((k) => k.risk === 'LOW').length,
    UNDETERMINED: knowledge.filter((k) => k.risk === 'UNDETERMINED').length,
  };
}

export function createEpistemicSnapshot(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};

  const knowledge = Array.isArray(safe.knowledge)
    ? safe.knowledge.map(createKnowledgeContract)
    : [];

  const signals = Array.isArray(safe.signals) ? safe.signals : [];

  const diagnostics = buildEpistemicDiagnostics({
    ...seed,
    knowledge,
    signals,
  });

  const telemetry = createEpistemicTelemetry({
    ...seed,
    knowledge,
    signals,
  });

  const security = {
    financialExecution: false,
    memoryWrite: false,
    learningApplied: false,
    confirmationSkipped: false,
    pendingActionModifiedUnsafely: false,
    databaseCalled: false,
    rpcCalled: false,
    networkCalled: false,
    openAiCalled: false,
    freeTextGenerated: false,
    responseModified: false,
    pendingActionModified: false,
  };

  const snapshot = {
    version: EPISTEMIC_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: typeof safe.fallbackReason === 'string' ? safe.fallbackReason : null,
    errorCode: typeof safe.errorCode === 'string' ? safe.errorCode : null,
    reflectionTriggered: Boolean(safe.reflectionTriggered),
    outcome: ['UNKNOWN', 'SUCCESS', 'NEEDS_EVIDENCE', 'CONFLICT'].includes(safe.outcome) ? safe.outcome : 'UNKNOWN',
    knowledge,
    signals: safe.signals?.slice(0, 50) || [],
    reviews: safe.reviews?.slice(0, 20) || [],
    learningCandidates: safe.learningCandidates?.slice(0, 20) || [],
    conflicts: safe.conflicts || [],
    risks: safe.risks || [],
    diagnostics,
    suggestions: safe.suggestions?.slice(0, 10) || [],
    recommendedNextStep: safe.recommendedNextStep || 'NO_ACTION',
    confidenceSummary: {
      average: 0,
      max: 0,
      band: 'none',
    },
    prioritySummary: {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      IGNORE: 0,
      UNDETERMINED: 0,
    },
    riskSummary: {
      HIGH: 0,
      CRITICAL: 0,
      MEDIUM: 0,
      LOW: 0,
      UNDETERMINED: 0,
    },
    shadow: {
      shadowMode: Boolean(safe.shadow?.shadowMode ?? true),
      appliedToDecision: Boolean(safe.shadow?.appliedToDecision ?? false),
      appliedToResponse: Boolean(safe.shadow?.appliedToResponse ?? false),
      executed: Boolean(safe.shadow?.executed ?? false),
      persisted: Boolean(safe.shadow?.persisted ?? false),
      changedBehavior: Boolean(safe.shadow?.changedBehavior ?? false),
      voiceTouched: Boolean(safe.shadow?.voiceTouched ?? false),
      databaseCalled: Boolean(safe.shadow?.databaseCalled ?? false),
      memoryModified: Boolean(safe.shadow?.memoryModified ?? false),
    },
    latencyMs: typeof safe.latencyMs === 'number' ? Number(safe.latencyMs.toFixed(2)) : 0,
    telemetry,
  };

  return deepFreeze(snapshot);
}
