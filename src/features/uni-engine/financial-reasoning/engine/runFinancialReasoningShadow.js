// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Bloco 7: Shadow Runtime.
//
// runFinancialReasoningShadow(...) executa, em paralelo observacional, a
// pipeline do motor financeiro:
//
//   entrada → snapshot → diagnóstico → inferência → planejamento → comparador
//            → telemetria → descartar
//
// Garantias absolutas:
//   - NUNCA altera o fluxo principal (resposta visível, pending actions ou
//     confirmações permanecem 100% legados);
//   - `influenceApplied` é SEMPRE false e `discarded` SEMPRE true;
//   - sem OpenAI, sem Asaas, sem rede, sem banco, sem gravação — síncrono e
//     puramente em memória;
//   - cada turno (turnId) executa no máximo uma vez por chamada (o chamador
//     deduplica por mensagem; o motor também não se auto-invoca);
//   - qualquer erro interno → resultado vazio fail-safe (nunca lança).
import { buildFinancialReasoningSnapshot } from '../snapshot/buildFinancialSnapshot.js';
import { buildFinancialDiagnostics } from '../diagnostics/buildFinancialDiagnostics.js';
import { buildFinancialInference } from '../inference/buildFinancialInference.js';
import { buildFinancialPlanner } from '../planner/buildFinancialPlanner.js';
import { compareFinancialPipelines } from '../comparison/buildFinancialComparison.js';
import {
  createEmptyFinancialReasoningResult,
  createEmptyFinancialStageResults,
} from '../contracts/financialReasoningContracts.js';
import { FINANCIAL_REASONING_VERSION } from '../types/financialReasoningTypes.js';
import {
  createFinancialTelemetryStore,
  buildFinancialTelemetryEntry,
  recordFinancialTelemetry,
} from '../telemetry/financialTelemetry.js';

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function nowIso() {
  return typeof Date === 'function' ? new Date().toISOString() : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreeze));
  }
  const frozen = {};
  for (const key of Object.keys(value).sort()) {
    frozen[key] = deepFreeze(value[key]);
  }
  return Object.freeze(frozen);
}

function buildSafety() {
  return Object.freeze({
    influenceApplied: false,
    executed: false,
    persisted: false,
    networkAccessed: false,
    apiCalled: false,
    financialMutation: false,
    responseModified: false,
    memoryWrite: false,
    databaseCalled: false,
    rpcCalled: false,
  });
}

function markStage(stages, key, status = 'ok') {
  if (!stages || typeof stages[key] !== 'object') return;
  stages[key] = Object.freeze({ present: true, executed: true, status, errorCode: null });
}

function markStageError(stages) {
  const errorStages = {};
  for (const key of Object.keys(stages)) {
    errorStages[key] = Object.freeze({ present: false, executed: false, status: 'error', errorCode: null });
  }
  return errorStages;
}

// Store de telemetria global (temporário, só na memória da sessão).
let globalFinancialReasoningTelemetryStore = createFinancialTelemetryStore();

export function getGlobalFinancialReasoningTelemetryStore() {
  return globalFinancialReasoningTelemetryStore;
}

export function setGlobalFinancialReasoningTelemetryStore(store) {
  globalFinancialReasoningTelemetryStore = store && typeof store === 'object'
    ? store
    : createFinancialTelemetryStore();
  return globalFinancialReasoningTelemetryStore;
}

export function resetGlobalFinancialReasoningTelemetryStore() {
  globalFinancialReasoningTelemetryStore = createFinancialTelemetryStore();
  return globalFinancialReasoningTelemetryStore;
}

function buildEmptyStages() {
  const frozen = createEmptyFinancialStageResults();
  const mutable = {};
  for (const key of Object.keys(frozen)) {
    mutable[key] = { ...frozen[key] };
  }
  return mutable;
}

// Consolida o resultado final congelado e serializável.
function finalizeResult({
  status,
  turnId,
  messageId,
  shadowMode,
  stages,
  snapshot,
  diagnostics,
  inferences,
  plan,
  comparison,
  telemetry,
  latencyMs,
}) {
  return deepFreeze({
    version: FINANCIAL_REASONING_VERSION,
    turnId,
    messageId,
    mode: 'shadow',
    status,
    shadowMode,
    influenceApplied: false,
    legacyPreserved: true,
    executed: false,
    persisted: false,
    discarded: true,
    stages,
    snapshot,
    diagnostics,
    inferences,
    plan,
    comparison,
    telemetry,
    safety: buildSafety(),
    latencyMs,
    timestamp: nowIso(),
    serializable: true,
  });
}

export function runFinancialReasoningShadow({
  config = null,
  turnId = null,
  messageId = null,
  input = null,
  legacy = null,
  referenceDate = null,
  telemetryStore = null,
  reserveMonths = null,
} = {}) {
  const started = nowMillis();
  const safeConfig = config && typeof config === 'object' ? config : {};
  const safeTurnId = typeof turnId === 'string' ? turnId : null;
  const safeMessageId = typeof messageId === 'string' ? messageId : null;
  const safeInput = input && typeof input === 'object' ? input : {};

  const buildEmpty = () => {
    const empty = createEmptyFinancialReasoningResult({
      turnId: safeTurnId,
      messageId: safeMessageId,
    });
    return deepFreeze({
      ...empty,
      stages: buildEmptyStages(),
      latencyMs: Number((nowMillis() - started).toFixed(2)),
      timestamp: nowIso(),
    });
  };

  try {
    // Estágio: entrada — motor só roda quando a flag explícita está ligada.
    if (safeConfig.financialReasoningEnabled !== true) {
      return buildEmpty();
    }

    const shadowMode = safeConfig.financialReasoningShadowMode !== false;
    const telemetryEnabled = safeConfig.financialReasoningTelemetryEnabled === true;
    const stages = buildEmptyStages();
    markStage(stages, 'entry');

    // Estágio: snapshot financeiro serializável.
    const snapshotOptions = { ...safeInput };
    if (referenceDate !== null && referenceDate !== undefined) {
      snapshotOptions.referenceDate = referenceDate;
    }
    if (Number.isFinite(Number(reserveMonths))) {
      snapshotOptions.reserveMonths = Number(reserveMonths);
    }
    const snapshot = buildFinancialReasoningSnapshot(snapshotOptions);
    markStage(stages, 'snapshot');

    if (snapshot.hasData !== true) {
      return finalizeResult({
        status: 'no_financial_data',
        turnId: safeTurnId,
        messageId: safeMessageId,
        shadowMode,
        stages,
        snapshot,
        diagnostics: [],
        inferences: [],
        plan: null,
        comparison: null,
        telemetry: null,
        latencyMs: Number((nowMillis() - started).toFixed(2)),
      });
    }

    // Estágio: diagnóstico.
    const diagnostics = buildFinancialDiagnostics(snapshot);
    markStage(stages, 'diagnostics');

    // Estágio: inferência.
    const inferences = buildFinancialInference({ snapshot, diagnostics });
    markStage(stages, 'inference');

    // Estágio: planejamento interno.
    const plan = buildFinancialPlanner({ snapshot, diagnostics, inferences });
    markStage(stages, 'planning');

    // Estágio: comparador (legado × motor).
    const comparison = compareFinancialPipelines({
      legacy,
      engineSnapshot: snapshot,
      engineDiagnostics: diagnostics,
    });
    markStage(stages, 'comparison');

    // Estágio: telemetria sanitizada (opcional, sempre em memória).
    let telemetry = null;
    if (telemetryEnabled) {
      const store = telemetryStore || globalFinancialReasoningTelemetryStore;
      telemetry = recordFinancialTelemetry(
        store,
        buildFinancialTelemetryEntry({
          status: 'shadow_completed',
          turnKey: safeMessageId ?? safeTurnId,
          diagnostics,
          inferences,
          comparison,
          stages,
          flags: safeConfig,
        }),
      );
    }
    markStage(stages, 'telemetry');

    return finalizeResult({
      status: 'shadow_completed',
      turnId: safeTurnId,
      messageId: safeMessageId,
      shadowMode,
      stages,
      snapshot,
      diagnostics,
      inferences,
      plan,
      comparison,
      telemetry,
      latencyMs: Number((nowMillis() - started).toFixed(2)),
    });
  } catch (error) {
    // Fail-safe: o motor observacional jamais quebra o chat.
    const disposition = createEmptyFinancialReasoningResult({
      turnId: safeTurnId,
      messageId: safeMessageId,
    });
    return deepFreeze({
      ...disposition,
      status: 'shadow_fallback',
      stages: markStageError(buildEmptyStages()),
      latencyMs: Number((nowMillis() - started).toFixed(2)),
      timestamp: nowIso(),
    });
  }
}