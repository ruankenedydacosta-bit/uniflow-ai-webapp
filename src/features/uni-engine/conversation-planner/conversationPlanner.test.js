// Uni Engine — Conversation Planner (Parte 7, Bloco Único).
//
// A camada determina, de forma estritamente observacional, QUAL deve ser o
// próximo passo lógico da conversa (NEXT_STEP_*) consumindo SOMENTE snapshots
// já existentes (Observation, Guidance, Decision, Capability Readiness,
// Execution Readiness e Application) — sem nunca gerar texto, sem nunca
// responder, sem nunca executar e sem nunca alterar o pipeline legado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationPlanSnapshot } from './buildConversationPlanSnapshot.js';
import {
  createEmptyConversationPlanSnapshot,
  createConversationPlanSnapshot,
  validateConversationPlanSnapshot,
  isConversationPlanSnapshotSerializable,
} from './conversationPlannerContracts.js';
import {
  createConversationPlannerDiagnostic,
} from './buildConversationPlannerDiagnostics.js';
import {
  CONVERSATION_PLANNER_VERSION,
  NEXT_STEPS,
  PLANNER_STATUSES,
  PLANNER_REASONS,
  isNextStep,
  isPlannerStatus,
  isPlannerReason,
} from './conversationPlannerTypes.js';
import {
  NEXT_STEP_PRIORITY,
  CONVERSATION_PLANNER_POLICY,
  clamp01,
  getNextStepPriority,
} from './conversationPlannerPolicy.js';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { buildObservationSnapshot } from '../observation/buildObservationSnapshot.js';
import { runUniEngineIntegration } from '../integration/runUniEngineIntegration.js';
import { buildGuidanceSnapshot } from '../guidance/buildGuidanceSnapshot.js';
import { runControlledGuidanceApplication } from '../application/runControlledGuidanceApplication.js';
import {
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
  buildIntegrationConfig,
} from '../integration/testFixtures.js';
import { findFunctionsInValue } from '../uniEngineContracts.js';

function buildPlannerConfig() {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_CLARIFICATION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
    },
  });
}

// Fluxo real: Integration → Guidance → Observation (Partes 1/2). O legado é
// uma clarificação em andamento; o motor recomenda a pergunta (ask).
function buildObservation({ missingFields = ['account'] } = {}) {
  const legacy = legacyClarification();
  const engine = buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields, agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, shadowMode: true, environment: 'development', decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
  });
  const integrationSnapshot = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy,
    engineResult: engine,
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy,
    engineResult: engine,
    context: { isDev: true },
  });
  const observationSnapshot = buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engine.activation,
    context: { isDev: true, environment: 'development' },
  });
  return { legacy, engine, observationSnapshot };
}

function buildRealApplicationResult({ legacy, engine }) {
  return runControlledGuidanceApplication({
    config: buildPlannerConfig(),
    legacy,
    engineResult: engine,
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });
}

function buildPlan(options = {}) {
  return buildConversationPlanSnapshot({
    observationSnapshot: null,
    guidanceSnapshot: null,
    decisionSnapshot: null,
    decisionReadinessSnapshot: null,
    capabilityReadinessSnapshot: null,
    executionReadinessSnapshot: null,
    applicationResult: null,
    context: { isDev: true, environment: 'development' },
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Plano a partir do fluxo real (integração)
// ---------------------------------------------------------------------------

test('CP-1: plano é construído a partir do fluxo real (Observation + Decision + Application)', () => {
  const { legacy, engine, observationSnapshot } = buildObservation({ missingFields: ['account'] });
  const applicationResult = buildRealApplicationResult({ legacy, engine });
  const snapshot = buildPlan({
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult,
  });
  assert.equal(snapshot.version, CONVERSATION_PLANNER_VERSION);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.plannerStatus, 'PLANNED');
  assert.equal(snapshot.nextStep, 'NEXT_STEP_QUESTION');
  assert.equal(snapshot.reason, 'MISSING_INFORMATION');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.shadowMode, true);
  const validation = validateConversationPlanSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

// ---------------------------------------------------------------------------
// Serialização, imutabilidade e determinismo
// ---------------------------------------------------------------------------

test('CP-2: resultado serializável — round-trip JSON, sem funções, sem Map/Set', () => {
  const snapshot = buildPlan({
    decisionSnapshot: { decisionType: 'ANSWER', confidence: 0.9 },
  });
  const json = JSON.stringify(snapshot);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(isConversationPlanSnapshotSerializable(snapshot), true);
  assert.equal(findFunctionsInValue(snapshot).length, 0);
});

test('CP-3: resultado imutável — Object.freeze em profundidade', () => {
  const snapshot = buildPlan({
    decisionSnapshot: { decisionType: 'ANSWER', confidence: 0.9 },
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.diagnostics), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
  assert.equal(Object.isFrozen(snapshot.metadata.sources), true);
});

test('CP-4: determinismo — mesmas entradas, mesmo resultado (JSON idêntico)', () => {
  const first = buildPlan({
    decisionSnapshot: { decisionType: 'ask', confidence: 0.9 },
    executionReadinessSnapshot: {
      executionAvailable: true,
      executionBlockedReasons: [],
    },
  });
  const second = buildPlan({
    decisionSnapshot: { decisionType: 'ask', confidence: 0.9 },
    executionReadinessSnapshot: {
      executionAvailable: true,
      executionBlockedReasons: [],
    },
  });
  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.equal(first.nextStep, 'NEXT_STEP_QUESTION');
});

// ---------------------------------------------------------------------------
// Snapshot vazio e falha segura
// ---------------------------------------------------------------------------

test('CP-5: snapshot vazio — NEXT_STEP_NONE, status EMPTY, valid e applied=false', () => {
  const empty = createEmptyConversationPlanSnapshot();
  assert.equal(empty.version, CONVERSATION_PLANNER_VERSION);
  assert.equal(empty.mode, 'observational');
  assert.equal(empty.plannerStatus, 'EMPTY');
  assert.equal(empty.nextStep, 'NEXT_STEP_NONE');
  assert.equal(empty.confidence, 0);
  assert.equal(empty.reason, 'NO_SIGNAL');
  assert.equal(empty.legacyPreserved, true);
  assert.equal(empty.applied, false);
  assert.equal(empty.serializable, true);
  const validation = validateConversationPlanSnapshot(empty);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('CP-6: falha segura — erro interno produz snapshot vazio FALLBACK', () => {
  const exploding = {};
  Object.defineProperty(exploding, 'serializable', {
    get() {
      throw new Error('boom');
    },
  });
  const snapshot = buildPlan({ observationSnapshot: exploding });
  assert.equal(snapshot.plannerStatus, 'FALLBACK');
  assert.equal(snapshot.nextStep, 'NEXT_STEP_NONE');
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.serializable, true);
  assert.equal(validateConversationPlanSnapshot(snapshot).valid, true);
});

// ---------------------------------------------------------------------------
// Próximo passo: cada sinal observacional
// ---------------------------------------------------------------------------

test('CP-7: CONFIRM da Decision Layer → NEXT_STEP_CONFIRMATION', () => {
  const snapshot = buildPlan({
    decisionSnapshot: { decisionType: 'CONFIRM', confidence: 0.9 },
  });
  assert.equal(snapshot.nextStep, 'NEXT_STEP_CONFIRMATION');
  assert.equal(snapshot.reason, 'CONFIRMATION_PENDING');
});

test('CP-8: clarificationDecision (Application) → NEXT_STEP_CLARIFICATION', () => {
  const snapshot = buildPlan({
    applicationResult: {
      clarificationDecision: { shouldClarify: true, ambiguousFields: ['account'], confidence: 0.85 },
    },
  });
  assert.equal(snapshot.nextStep, 'NEXT_STEP_CLARIFICATION');
  assert.equal(snapshot.reason, 'CLARIFICATION_REQUIRED');
});

test('CP-9: questionDecision (Application) → NEXT_STEP_QUESTION', () => {
  const snapshot = buildPlan({
    applicationResult: {
      questionDecision: { shouldAsk: true, missingInformation: ['amount'], confidence: 0.8 },
    },
  });
  assert.equal(snapshot.nextStep, 'NEXT_STEP_QUESTION');
  assert.equal(snapshot.reason, 'MISSING_INFORMATION');
});

test('CP-10: Execution Readiness bloqueada (circuito aberto) → NEXT_STEP_WAIT', () => {
  const snapshot = buildPlan({
    executionReadinessSnapshot: {
      executionAvailable: false,
      executionBlockedReasons: ['CIRCUIT_BREAKER_OPEN'],
    },
  });
  assert.equal(snapshot.nextStep, 'NEXT_STEP_WAIT');
  assert.equal(snapshot.reason, 'CIRCUIT_BREAKER_OPEN');
});

test('CP-11: WAIT da Decision Layer → NEXT_STEP_WAIT (DECISION_WAIT)', () => {
  const snapshot = buildPlan({
    decisionSnapshot: { decisionType: 'WAIT', confidence: 0.7 },
  });
  assert.equal(snapshot.nextStep, 'NEXT_STEP_WAIT');
  assert.equal(snapshot.reason, 'DECISION_WAIT');
});

test('CP-12: ANSWER da Decision Layer → NEXT_STEP_ANSWER', () => {
  const snapshot = buildPlan({
    decisionSnapshot: { decisionType: 'ANSWER', confidence: 0.9 },
  });
  assert.equal(snapshot.nextStep, 'NEXT_STEP_ANSWER');
  assert.equal(snapshot.reason, 'DECISION_RESPOND');
});

test('CP-13: nenhum sinal → NEXT_STEP_NONE (NO_SIGNAL)', () => {
  const snapshot = buildPlan();
  assert.equal(snapshot.nextStep, 'NEXT_STEP_NONE');
  assert.equal(snapshot.reason, 'NO_SIGNAL');
  assert.equal(snapshot.confidence, 0);
  assert.ok(snapshot.diagnostics.some((entry) => entry.code === 'NO_NEXT_STEP_PLANNED'));
});

// ---------------------------------------------------------------------------
// Prioridade determinística
// ---------------------------------------------------------------------------

test('CP-14: clarificação vence pergunta (mesma ordem da Application)', () => {
  const snapshot = buildPlan({
    decisionSnapshot: { decisionType: 'ask', confidence: 0.9 },
    applicationResult: {
      clarificationDecision: { shouldClarify: true, ambiguousFields: ['intent'] },
      questionDecision: { shouldAsk: true, missingInformation: ['amount'] },
    },
  });
  assert.equal(snapshot.nextStep, 'NEXT_STEP_CLARIFICATION');
});

test('CP-15: confirmação vence tudo', () => {
  const snapshot = buildPlan({
    decisionSnapshot: { decisionType: 'CONFIRM', confidence: 0.9 },
    applicationResult: {
      clarificationDecision: { shouldClarify: true, ambiguousFields: ['account'] },
      questionDecision: { shouldAsk: true, missingInformation: ['amount'] },
    },
  });
  assert.equal(snapshot.nextStep, 'NEXT_STEP_CONFIRMATION');
});

test('CP-16: ordem fechada da prioridade (1=CONFIRMATION … 6=NONE)', () => {
  assert.equal(NEXT_STEP_PRIORITY.NEXT_STEP_CONFIRMATION, 1);
  assert.equal(NEXT_STEP_PRIORITY.NEXT_STEP_CLARIFICATION, 2);
  assert.equal(NEXT_STEP_PRIORITY.NEXT_STEP_QUESTION, 3);
  assert.equal(NEXT_STEP_PRIORITY.NEXT_STEP_WAIT, 4);
  assert.equal(NEXT_STEP_PRIORITY.NEXT_STEP_ANSWER, 5);
  assert.equal(NEXT_STEP_PRIORITY.NEXT_STEP_NONE, 6);
  assert.equal(getNextStepPriority('NEXT_STEP_CONFIRMATION'), 1);
  assert.equal(getNextStepPriority('NEXT_STEP_ANSWER'), 5);
  assert.equal(getNextStepPriority('INVALID'), Number.MAX_SAFE_INTEGER);
});

// ---------------------------------------------------------------------------
// Confiança, shadowMode, metadata e diagnósticos
// ---------------------------------------------------------------------------

test('CP-17: confiança clamps em 0..1 e prioriza a decisão consumida', () => {
  assert.equal(clamp01(1.5), 1);
  assert.equal(clamp01(-1), 0);
  const fromDecision = buildPlan({ decisionSnapshot: { decisionType: 'ANSWER', confidence: 0.45 } });
  assert.equal(fromDecision.confidence, 0.45);
  const fromQuestion = buildPlan({
    applicationResult: {
      questionDecision: { shouldAsk: true, missingInformation: ['amount'], confidence: 1.4 },
    },
  });
  assert.equal(fromQuestion.confidence, 1);
  assert.equal(buildPlan().confidence, 0);
});

test('CP-18: shadowMode default true e contexto pode desligar', () => {
  assert.equal(buildPlan().shadowMode, true);
  const off = buildPlan({ context: { isDev: true, shadowMode: false } });
  assert.equal(off.shadowMode, false);
});

test('CP-19: metadata reflete fontes consumidas e agregados técnicos', () => {
  const snapshot = buildPlan({
    observationSnapshot: { serializable: true },
    guidanceSnapshot: { capabilitiesComputed: ['QUESTION_GUIDANCE'] },
    decisionSnapshot: { decisionType: 'ask', confidence: 0.9 },
    capabilityReadinessSnapshot: { nextRecommendedCapability: 'QUESTION_GUIDANCE' },
    executionReadinessSnapshot: { executionAvailable: true, executionBlockedReasons: [] },
    applicationResult: { questionDecision: { shouldAsk: true, missingInformation: ['account'] } },
  });
  assert.ok(snapshot.metadata.sources.includes('observation'));
  assert.ok(snapshot.metadata.sources.includes('guidance'));
  assert.ok(snapshot.metadata.sources.includes('decision'));
  assert.ok(snapshot.metadata.sources.includes('capability-readiness'));
  assert.ok(snapshot.metadata.sources.includes('execution-readiness'));
  assert.ok(snapshot.metadata.sources.includes('application'));
  assert.equal(snapshot.metadata.signalSource, 'question');
  assert.equal(snapshot.metadata.decisionType, 'ASK');
});

test('CP-20: diagnósticos — códigos fechados e redigidos (nunca texto)', () => {
  const snapshot = buildPlan({
    decisionSnapshot: { decisionType: 'ANSWER', confidence: 0.9 },
  });
  assert.ok(snapshot.diagnostics.some((entry) => entry.code === 'CONVERSATION_PLAN_COMPUTED'));
  assert.ok(snapshot.diagnostics.some((entry) => entry.code === 'NEXT_STEP_ANSWER_PLANNED'));
  assert.ok(snapshot.diagnostics.some((entry) => entry.code === 'SHADOW_MODE'));
  assert.ok(snapshot.diagnostics.some((entry) => entry.code === 'LEGACY_PRESERVED'));
  assert.ok(snapshot.diagnostics.some((entry) => entry.code === 'NOTHING_APPLIED'));
  for (const entry of snapshot.diagnostics) {
    assert.equal(entry.observational, true);
    assert.equal(entry.module, 'conversation-planner');
    assert.ok(Object.isFrozen(entry));
  }
  const noObservation = buildPlan();
  assert.ok(noObservation.diagnostics.some((entry) => entry.code === 'NO_OBSERVATION_SNAPSHOT'));
  const diagnostic = createConversationPlannerDiagnostic({
    code: 'NEXT_STEP_QUESTION_PLANNED',
    severity: 'INFO',
    nextStep: 'NEXT_STEP_QUESTION',
  });
  assert.equal(diagnostic.code, 'NEXT_STEP_QUESTION_PLANNED');
  assert.equal(diagnostic.nextStep, 'NEXT_STEP_QUESTION');
});

// ---------------------------------------------------------------------------
// Helpers, enums e validação
// ---------------------------------------------------------------------------

test('CP-21: helpers e enums fechados', () => {
  for (const step of NEXT_STEPS) assert.equal(isNextStep(step), true);
  assert.equal(isNextStep('NEXT_STEP_FOO'), false);
  for (const status of PLANNER_STATUSES) assert.equal(isPlannerStatus(status), true);
  assert.equal(isPlannerStatus('BOGUS'), false);
  for (const reason of PLANNER_REASONS) assert.equal(isPlannerReason(reason), true);
  assert.equal(isPlannerReason('BOGUS'), false);
  assert.equal(CONVERSATION_PLANNER_POLICY.minimumConfidence, 0.7);
});

test('CP-22: validação rejeita snapshots inválidos', () => {
  const snapshot = createConversationPlanSnapshot({
    nextStep: 'NEXT_STEP_ANSWER',
    confidence: 0.9,
    reason: 'DECISION_RESPOND',
  });
  assert.equal(validateConversationPlanSnapshot(snapshot).valid, true);
  assert.equal(validateConversationPlanSnapshot(null).valid, false);
  assert.equal(validateConversationPlanSnapshot({ ...snapshot, applied: true }).valid, false);
  assert.equal(validateConversationPlanSnapshot({ ...snapshot, legacyPreserved: false }).valid, false);
  assert.equal(validateConversationPlanSnapshot({ ...snapshot, nextStep: 'BOGUS' }).valid, false);
});

test('CP-23: plano construído nunca vira texto ou resposta', () => {
  const snapshot = buildPlan({
    decisionSnapshot: { decisionType: 'ANSWER', confidence: 0.9 },
  });
  const json = JSON.stringify(snapshot);
  assert.ok(!json.includes('resposta:'));
  assert.ok(!json.includes('"text"'));
  assert.ok(!json.includes('finalText'));
  assert.ok(!json.includes('originalLegacyText'));
});
