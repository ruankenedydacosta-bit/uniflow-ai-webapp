// ---------------------------------------------------------------------------
// Cognitive Orchestrator (Parte 9) — testes e validações do fluxo completo
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUniEngineConfig,
  runUniEngineIntegration,
  buildGuidanceSnapshot,
  buildObservationSnapshot,
  buildDecisionReadinessSnapshot,
  buildCapabilityReadinessSnapshot,
  buildExecutionReadinessSnapshot,
  runControlledGuidanceApplication,
  buildConversationPlanSnapshot,
  selectControlledConversationRoute,
  buildCognitiveOrchestratorSnapshot,
  createEmptyCognitiveOrchestratorSnapshot,
} from '../index.js';
import { buildCognitiveOrchestratorDiagnostics } from './buildCognitiveOrchestratorDiagnostics.js';
import { buildConversationPlannerDiagnostics } from '../conversation-planner/buildConversationPlannerDiagnostics.js';
import { buildConversationRoutingDiagnostics } from '../conversation-routing/buildConversationRoutingDiagnostics.js';

function createIntegrationConfig() {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED: 'true',
      VITE_UNI_ENGINE_CONVERSATION_ROUTING_ENABLED: 'true',
      VITE_UNI_ENGINE_CONTROLLED_QUESTION_TEMPLATE_ACCOUNT: 'true',
    },
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SHORT_FORM_SOURCE_TEXT =
  'Entendi que pode ser um lançamento financeiro, mas não consegui identificar todos os detalhes. '
  + 'Pode reformular dizendo o valor e do que se trata? Por exemplo: "Gastei R$ 50 no mercado."';

function createLegacy(userId, context, decisions = []) {
  return {
    userId,
    text: context.text ?? null,
    responseType: 'generic',
    status: 'ready',
    risk: 'LOW',
    conversationStyle: null,
    context: {
      conversationId: context.conversationId ?? 'test-conv',
      workspaceId: context.workspaceId ?? 'test-ws',
      environment: context.environment ?? 'development',
      metadata: context.metadata ?? {},
    },
    activation: {
      enabled: true,
      shadowMode: false,
      environment: 'development',
      decisions,
    },
  };
}

function buildEngineResult({ decisionLayer, activation, capabilities = [] } = {}) {
  return {
    decisionLayer: decisionLayer ?? {
      decisionType: 'ask',
      nextDecisionType: 'ask',
      risk: 'LOW',
      confidence: 0.9,
    },
    activation: activation ?? {
      enabled: true,
      shadowMode: false,
      environment: 'development',
      decisions: capabilities.map((c) => ({ capability: c, activationStatus: 'ACTIVE_TEST' })),
    },
    capabilityReadiness: {
      enabled: true,
      shadowMode: true,
      plannerStatus: 'PLANNED',
      evaluatedCapabilities: capabilities,
      eligibleCapabilities: capabilities,
      blockedCapabilities: [],
      missingDependencies: [],
      nextRecommendedCapability: null,
      diagnostics: [],
      legacyPreserved: true,
      applied: false,
      serializable: true,
    },
  };
}

const REQUIRED_ACTIVATION_GATES = Object.freeze([
  'ENGINE_ENABLED',
  'ACTIVATION_ENABLED',
  'CAPABILITY_ENABLED',
  'ENVIRONMENT_ALLOWED',
  'CONFIDENCE_THRESHOLD',
  'RISK_THRESHOLD',
  'WORKSPACE_COMPATIBLE',
  'DATA_SUFFICIENCY',
  'CAPABILITY_POLICY',
  'CIRCUIT_BREAKER',
]);

function buildActiveActivationDecision(capability) {
  return {
    version: '1.0',
    enabled: true,
    shadowMode: false,
    environment: 'development',
    capability,
    requested: true,
    eligible: true,
    activationStatus: 'ACTIVE_TEST',
    rolloutMode: 'TEST_USERS',
    rolloutBucket: 1,
    confidence: 0.9,
    confidenceThreshold: 0.6,
    risk: 'LOW',
    workspaceType: 'personal',
    dataSufficient: true,
    gates: REQUIRED_ACTIVATION_GATES.map((name) => ({
      name,
      passed: true,
      reasonCode: `${name}_OK`,
      severity: 'none',
      metadata: {},
    })),
    applied: true,
    appliedEffect: {
      applied: true,
      effect: 'guidance',
      fields: [],
      blockedBy: null,
    },
    fallbackUsed: false,
    fallbackReason: null,
    comparison: null,
    diagnostics: [],
    telemetry: null,
    shadow: {
      shadowMode: false,
      appliedToDecision: false,
      appliedToResponse: true,
      executed: false,
      persisted: false,
      changedBehavior: false,
      memoryModified: false,
      databaseCalled: false,
      voiceTouched: false,
    },
    latencyMs: 1.2,
  };
}

function buildActiveEngineResult(capabilities = []) {
  return {
    engineVersion: '2.0',
    revision: '10.0',
    enabled: true,
    skipped: false,
    correlationId: 'ue_orchestrator_test',
    decisionLayer: {
      decisionType: 'respond',
      nextDecisionType: 'respond',
      risk: 'LOW',
      confidence: 0.9,
    },
    classification: {
      primaryIntent: 'register_expense',
      ambiguities: [],
      confidence: 0.9,
    },
    comparison: {
      missingFields: [],
      agreementMetrics: { divergenceCount: 0 },
    },
    activation: {
      enabled: true,
      shadowMode: false,
      environment: 'development',
      decisions: capabilities.map(buildActiveActivationDecision),
    },
    capabilityReadiness: {
      enabled: true,
      shadowMode: true,
      plannerStatus: 'PLANNED',
      evaluatedCapabilities: capabilities,
      eligibleCapabilities: capabilities,
      blockedCapabilities: [],
      missingDependencies: [],
      nextRecommendedCapability: null,
      diagnostics: [],
      legacyPreserved: true,
      applied: false,
      serializable: true,
    },
  };
}

function buildApplicationResult(legacy = { text: 'legacy' }, capabilities = ['RESPONSE_STYLE_GUIDANCE']) {
  return {
    enabled: true,
    applied: true,
    fallbackUsed: false,
    factualContentPreserved: true,
    originalText: legacy.text,
    finalText: 'styled and shortened',
    appliedCapabilities: capabilities,
    safety: {
      financialExecution: false,
      memoryWrite: false,
      learningApplied: false,
      confirmationSkipped: false,
      pendingActionModifiedUnsafely: false,
      databaseCalled: false,
      rpcCalled: false,
      duplicateMessageCreated: false,
      freeTextGenerated: false,
    },
    diagnostics: [],
    metadata: { sources: [] },
    serializable: true,
    legacyPreserved: true,
    shadowMode: true,
  };
}

function buildControlledQuestionResult(templateKey = 'account', finalQuestion = 'Qual conta?') {
  return {
    enabled: true,
    applied: true,
    fallbackUsed: false,
    decisionType: 'question',
    templateKey,
    finalQuestion,
    sameTurn: true,
    pendingActionPreserved: true,
    confirmationPreserved: true,
    safety: {
      financialExecution: false,
      memoryWrite: false,
      learningApplied: false,
      confirmationSkipped: false,
      pendingActionModifiedUnsafely: false,
      databaseCalled: false,
      rpcCalled: false,
      duplicateMessageCreated: false,
      freeTextGenerated: false,
    },
    capability: 'QUESTION_GUIDANCE',
    diagnostics: [],
    metadata: { sources: [] },
    serializable: true,
    legacyPreserved: true,
    shadowMode: true,
  };
}

function betweenMarkers(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) return '';
  return text.slice(startIndex, endIndex);
}

async function readPage() {
  const { readFile } = await import('node:fs/promises');
  const path = new URL('../../uni-chat/UniChatPage.jsx', import.meta.url);
  return readFile(path, 'utf8');
}

function source(page) {
  return readPage();
}

// ---------------------------------------------------------------------------
// Cognitive Orchestrator MÓDULO (integração UniChat + fluxo completo)
// ---------------------------------------------------------------------------

test('Cognitive Orchestrator importado e ref existe ao lado dos demais', async () => {
  const page = await readPage();
  const importLine = page.match(/import \{[\s\S]*?\} from '\.\.\/uni-engine\/index\.js';/)[0];
  assert.match(importLine, /buildCognitiveOrchestratorSnapshot/);
  const refBlock = betweenMarkers(
    page,
    'const lastConversationRoutingSnapshotRef = useRef(null);',
    'useEffect(() => {',
  );
  assert.match(refBlock, /const lastCognitiveOrchestratorSnapshotRef = useRef\(null\);/);
});

test('Cognitive Orchestrator orquestra todas as camadas - fluxo completo', async () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED: 'true',
      VITE_UNI_ENGINE_CONVERSATION_ROUTING_ENABLED: 'true',
      VITE_UNI_ENGINE_CONTROLLED_QUESTION_TEMPLATE_ACCOUNT: 'true',
      VITE_UNI_ENGINE_COGNITIVE_ORCHESTRATOR_ENABLED: 'true',
    },
  });

  const legacy = createLegacy('test-user-1', {
    conversationId: 'conv-1',
    workspaceId: 'ws-1',
    environment: 'development',
    metadata: {},
  });

  const engine = buildEngineResult({
    capabilities: ['QUESTION_GUIDANCE', 'RESPONSE_STYLE_GUIDANCE'],
  });

  const integrationSnapshot = runUniEngineIntegration({
    config,
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

  const decisionReadinessSnapshot = buildDecisionReadinessSnapshot({
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult: null,
    context: { isDev: true, environment: 'development' },
  });

  const capabilityReadinessSnapshot = buildCapabilityReadinessSnapshot({
    activation: engine.activation,
    capability: 'QUESTION_GUIDANCE',
    context: { isDev: true, environment: 'development' },
  });

  const executionReadinessSnapshot = buildExecutionReadinessSnapshot({
    decisionSnapshot: engine.decisionLayer,
    activation: engine.activation,
    context: { isDev: true, environment: 'development' },
  });

  const applicationResult = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });

  const plan = buildConversationPlanSnapshot({
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult,
    context: { isDev: true, environment: 'development' },
  });

  const routing = selectControlledConversationRoute({
    config,
    environment: 'development',
    authorized: true,
    conversationPlan: plan,
    sameTurn: true,
    legacyText: legacy.text,
    legacyResponse: { text: legacy.text },
    applicationResult,
    controlledQuestionResult: buildControlledQuestionResult(),
    isDev: true,
  });

  const orchestrator = buildCognitiveOrchestratorSnapshot({
    config,
    environment: 'development',
    isDev: true,
    observation: observationSnapshot,
    guidance: guidanceSnapshot,
    decision: engine.decisionLayer,
    capabilityReadiness: capabilityReadinessSnapshot,
    executionReadiness: executionReadinessSnapshot,
    application: applicationResult,
    conversationPlan: plan,
    conversationRoute: routing,
  });

  assert.equal(orchestrator.orchestratorStatus, 'ORCHESTRATED');
  assert.equal(orchestrator.enabled, true);
  assert.equal(orchestrator.shadowMode, true);
  assert.equal(orchestrator.legacyPreserved, true);
  assert.equal(orchestrator.applied, false);
  assert.equal(orchestrator.observation, observationSnapshot);
  assert.equal(orchestrator.guidance, guidanceSnapshot);
  assert.equal(orchestrator.decision, engine.decisionLayer);
  assert.equal(orchestrator.capabilityReadiness, capabilityReadinessSnapshot);
  assert.equal(orchestrator.executionReadiness, executionReadinessSnapshot);
  assert.equal(orchestrator.application, applicationResult);
  assert.equal(orchestrator.conversationPlan, plan);
  assert.equal(orchestrator.conversationRoute, routing);
  assert(Array.isArray(orchestrator.diagnostics));
  assert.equal(orchestrator.serializable, true);
  assert.equal(Object.isFrozen(orchestrator), true);
});

test('Cognitive Orchestrator com flag desligada usa snapshot vazio', async () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED: 'true',
      VITE_UNI_ENGINE_CONVERSATION_ROUTING_ENABLED: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTION_TEMPLATE_ACCOUNT: 'true',
    },
  });

  const orchestrator = buildCognitiveOrchestratorSnapshot({
    config,
    environment: 'development',
    isDev: true,
    observation: { mode: 'observational', legacyPreserved: true, serializable: true },
    guidance: null,
    decision: null,
    capabilityReadiness: null,
    executionReadiness: null,
    application: null,
    conversationPlan: null,
    conversationRoute: null,
  });

  assert.equal(orchestrator.orchestratorStatus, 'EMPTY');
  assert.equal(orchestrator.enabled, false);
  assert.equal(orchestrator.applied, false);
});

test('Cognitive Orchestrator snapshot vazio é válido e serializável', async () => {
  const empty = createEmptyCognitiveOrchestratorSnapshot({ orchestratorStatus: 'EMPTY' });
  assert.equal(empty.orchestratorStatus, 'EMPTY');
  assert.equal(empty.observation, null);
  assert.equal(empty.applied, false);
  assert.equal(empty.shadowMode, true);
  assert.equal(empty.legacyPreserved, true);
  assert.equal(empty.serializable, true);
  assert.equal(Object.isFrozen(empty), true);
  assert.doesNotThrow(() => JSON.stringify(empty));
});

test('Cognitive Orchestrator com aplicação inválida → ORCHESTRATED_PARCIAL', async () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED: 'true',
      VITE_UNI_ENGINE_CONVERSATION_ROUTING_ENABLED: 'true',
      VITE_UNI_ENGINE_CONTROLLED_QUESTION_TEMPLATE_ACCOUNT: 'true',
      VITE_UNI_ENGINE_COGNITIVE_ORCHESTRATOR_ENABLED: 'true',
    },
  });

  const orchestrator = buildCognitiveOrchestratorSnapshot({
    config,
    environment: 'development',
    isDev: true,
    observation: { mode: 'observational', legacyPreserved: true, serializable: true },
    guidance: null,
    decision: null,
    capabilityReadiness: null,
    executionReadiness: null,
    application: { applied: false, legacyPreserved: true, serializable: true },
    conversationPlan: null,
    conversationRoute: null,
  });

  assert.equal(orchestrator.orchestratorStatus, 'PARTIAL');
});

test('Cognitive Orchestrator orquestra rota ANSWER', async () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED: 'true',
      VITE_UNI_ENGINE_CONVERSATION_ROUTING_ENABLED: 'true',
      VITE_UNI_ENGINE_COGNITIVE_ORCHESTRATOR_ENABLED: 'true',
    },
  });

  const legacy = createLegacy('test-user-1', {
    conversationId: 'conv-1',
    workspaceId: 'ws-1',
    environment: 'development',
    metadata: {},
    text: SHORT_FORM_SOURCE_TEXT,
  });

  const engine = buildActiveEngineResult([
    'QUESTION_GUIDANCE',
    'RESPONSE_STYLE_GUIDANCE',
  ]);

  const integrationSnapshot = runUniEngineIntegration({
    config: createIntegrationConfig(),
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

  const decisionReadinessSnapshot = buildDecisionReadinessSnapshot({
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult: null,
    context: { isDev: true, environment: 'development' },
  });

  const capabilityReadinessSnapshot = buildCapabilityReadinessSnapshot({
    activation: engine.activation,
    capability: 'QUESTION_GUIDANCE',
    context: { isDev: true, environment: 'development' },
  });

  const executionReadinessSnapshot = buildExecutionReadinessSnapshot({
    decisionSnapshot: engine.decisionLayer,
    activation: engine.activation,
    context: { isDev: true, environment: 'development' },
  });

  const applicationResult = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });

  const plan = buildConversationPlanSnapshot({
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult,
    context: { isDev: true, environment: 'development' },
  });

  const routing = selectControlledConversationRoute({
    config,
    environment: 'development',
    authorized: true,
    conversationPlan: plan,
    sameTurn: true,
    legacyText: legacy.text,
    legacyResponse: { text: legacy.text },
    applicationResult,
    controlledQuestionResult: null,
    isDev: true,
  });

  const orchestrator = buildCognitiveOrchestratorSnapshot({
    config,
    environment: 'development',
    isDev: true,
    observation: observationSnapshot,
    guidance: guidanceSnapshot,
    decision: engine.decisionLayer,
    capabilityReadiness: capabilityReadinessSnapshot,
    executionReadiness: executionReadinessSnapshot,
    application: applicationResult,
    conversationPlan: plan,
    conversationRoute: routing,
  });

  assert.equal(orchestrator.orchestratorStatus, 'ORCHESTRATED');
  assert.equal(orchestrator.conversationRoute.selectedRoute, routing.selectedRoute);
  assert.equal(orchestrator.conversationRoute.selectedRoute, 'ROUTE_ANSWER');
});

// ---------------------------------------------------------------------------
// Integração UniChatPage estrutural (testes entreMarcadores)
// ---------------------------------------------------------------------------

test('Cognitive Orchestrator consultado UMA vez no ponto único de saída do UniChatPage', async () => {
  const page = await readPage();
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  const occurrences = guidedBlock.match(/buildCognitiveOrchestratorSnapshot\(/g) ?? [];
  assert.equal(occurrences.length, 1, 'orquestrador consultado exatamente uma vez por mensagem');
  assert.match(guidedBlock, /sameTurn:/);
  assert.match(guidedBlock, /lastCognitiveOrchestratorSnapshotRef\.current/);
  assert.match(guidedBlock, /lastConversationPlannerSnapshotRef\.current/);
  assert.match(guidedBlock, /lastConversationRoutingSnapshotRef\.current/);
});

test('Cognitive Orchestrator resetado no novo turno e no catch', async () => {
  const page = await readPage();
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.match(sendBlock, /lastCognitiveOrchestratorSnapshotRef\.current = null;/);
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchStart = runBlock.indexOf('} catch {');
  const catchSlice = runBlock.slice(catchStart);
  assert.match(catchSlice, /lastCognitiveOrchestratorSnapshotRef\.current = null;/);
});

test('Cognitive Orchestrator nunca reexecuta observação/guidance/decision/activation/application/planner/routing', async () => {
  const page = await readPage();
  const obsBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  assert.match(
    obsBlock,
    /lastEngineAnalyzedMessageIdRef\.current === turn\.userMessageId/,
  );
});

test('Cognitive Orchestrator nunca executa camadas não autorizadas (sem financialExecution)', async () => {
  const page = await readPage();
  const financialBlock = betweenMarkers(
    page,
    'if (financialExecution || financialConversation.state.action?.intent ===',
    '  } else {',
  );
  assert.match(financialBlock, /if !enabled || !financialExecution/);
});

test('Cognitive Orchestrator aplica estilo/length quando autorizado, caso contrário vazio', async () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED: 'true',
      VITE_UNI_ENGINE_CONVERSATION_ROUTING_ENABLED: 'true',
      VITE_UNI_ENGINE_COGNITIVE_ORCHESTRATOR_ENABLED: 'true',
    },
  });

  const legacy = createLegacy('test-user-1', {
    conversationId: 'conv-1',
    workspaceId: 'ws-1',
    environment: 'development',
    metadata: {},
  });

  const engine = buildEngineResult({
    capabilities: ['RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE'],
  });

  const integrationSnapshot = runUniEngineIntegration({
    config: createIntegrationConfig(),
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

  const decisionReadinessSnapshot = buildDecisionReadinessSnapshot({
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult: null,
    context: { isDev: true, environment: 'development' },
  });

  const capabilityReadinessSnapshot = buildCapabilityReadinessSnapshot({
    activation: engine.activation,
    capability: 'RESPONSE_STYLE_GUIDANCE',
    context: { isDev: true, environment: 'development' },
  });

  const executionReadinessSnapshot = buildExecutionReadinessSnapshot({
    decisionSnapshot: engine.decisionLayer,
    activation: engine.activation,
    context: { isDev: true, environment: 'development' },
  });

  const applicationResult = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });

  const orchestrator = buildCognitiveOrchestratorSnapshot({
    config,
    environment: 'development',
    isDev: true,
    observation: observationSnapshot,
    guidance: guidanceSnapshot,
    decision: engine.decisionLayer,
    capabilityReadiness: capabilityReadinessSnapshot,
    executionReadiness: executionReadinessSnapshot,
    application: applicationResult,
    conversationPlan: null,
    conversationRoute: null,
  });

  assert.equal(orchestrator.orchestratorStatus, 'ORCHESTRATED');
  assert.equal(orchestrator.enabled, true);
  assert.equal(orchestrator.shadowMode, true);
  assert.equal(orchestrator.legacyPreserved, true);
  assert.equal(orchestrator.applied, false);
});

// ---------------------------------------------------------------------------
// Contrato e integridade do Cognitive Orchestrator
// ---------------------------------------------------------------------------

test('Cognitive Orchestrator snapshot vazio é válido e serializável', async () => {
  const empty = createEmptyCognitiveOrchestratorSnapshot({ orchestratorStatus: 'EMPTY' });
  assert.equal(empty.orchestratorStatus, 'EMPTY');
  assert.equal(empty.observation, null);
  assert.equal(empty.applied, false);
  assert.equal(empty.shadowMode, true);
  assert.equal(empty.legacyPreserved, true);
  assert.equal(empty.serializable, true);
  assert.equal(Object.isFrozen(empty), true);
  assert.doesNotThrow(() => JSON.stringify(empty));
});

test('Cognitive Orchestrator snapshot determinístico (segundo build identico)', async () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED: 'true',
      VITE_UNI_ENGINE_CONVERSATION_ROUTING_ENABLED: 'true',
    },
  });

  const snapshot1 = buildCognitiveOrchestratorSnapshot({
    config,
    environment: 'development',
    isDev: false,
    observation: { mode: 'observational', legacyPreserved: true, serializable: true },
    guidance: null,
    decision: null,
    capabilityReadiness: null,
    executionReadiness: null,
    application: null,
    conversationPlan: null,
    conversationRoute: null,
  });

  const snapshot2 = buildCognitiveOrchestratorSnapshot({
    config,
    environment: 'development',
    isDev: false,
    observation: { mode: 'observational', legacyPreserved: true, serializable: true },
    guidance: null,
    decision: null,
    capabilityReadiness: null,
    executionReadiness: null,
    application: null,
    conversationPlan: null,
    conversationRoute: null,
  });

  assert.equal(JSON.stringify(snapshot1), JSON.stringify(snapshot2));
});

test('Cognitive Orchestrator aplica estilo/length quando autorizado, caso contrário vazio', async () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED: 'true',
      VITE_UNI_ENGINE_CONVERSATION_ROUTING_ENABLED: 'true',
      VITE_UNI_ENGINE_COGNITIVE_ORCHESTRATOR_ENABLED: 'true',
    },
  });

  const legacy = createLegacy('test-user-1', {
    conversationId: 'conv-1',
    workspaceId: 'ws-1',
    environment: 'development',
    metadata: {},
    text: SHORT_FORM_SOURCE_TEXT,
  });

  const engine = buildActiveEngineResult([
    'RESPONSE_STYLE_GUIDANCE',
    'RESPONSE_LENGTH_GUIDANCE',
  ]);

  const integrationSnapshot = runUniEngineIntegration({
    config: createIntegrationConfig(),
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

  const decisionReadinessSnapshot = buildDecisionReadinessSnapshot({
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult: null,
    context: { isDev: true, environment: 'development' },
  });

  const capabilityReadinessSnapshot = buildCapabilityReadinessSnapshot({
    activation: engine.activation,
    capability: 'RESPONSE_STYLE_GUIDANCE',
    context: { isDev: true, environment: 'development' },
  });

  const executionReadinessSnapshot = buildExecutionReadinessSnapshot({
    decisionSnapshot: engine.decisionLayer,
    activation: engine.activation,
    context: { isDev: true, environment: 'development' },
  });

  const applicationResult = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });

  const plan = buildConversationPlanSnapshot({
    observationSnapshot,
    decisionSnapshot: engine.decisionLayer,
    applicationResult,
    context: { isDev: true, environment: 'development' },
  });

  const routing = selectControlledConversationRoute({
    config,
    environment: 'development',
    authorized: true,
    conversationPlan: plan,
    sameTurn: true,
    legacyText: legacy.text,
    legacyResponse: { text: legacy.text },
    applicationResult,
    controlledQuestionResult: null,
    isDev: true,
  });

  const orchestrator = buildCognitiveOrchestratorSnapshot({
    config,
    environment: 'development',
    isDev: true,
    observation: observationSnapshot,
    guidance: guidanceSnapshot,
    decision: engine.decisionLayer,
    capabilityReadiness: capabilityReadinessSnapshot,
    executionReadiness: executionReadinessSnapshot,
    application: applicationResult,
    conversationPlan: plan,
    conversationRoute: routing,
  });

  assert.equal(orchestrator.orchestratorStatus, 'ORCHESTRATED');
  assert.equal(orchestrator.conversationRoute.selectedRoute, 'ROUTE_ANSWER');
});

// ---------------------------------------------------------------------------
// Proteção contra reexecução — nenhuma camada recriada dentro do orchestrator
// ---------------------------------------------------------------------------

test('Cognitive Orchestrator nunca reexecuta observação/guidance/decision/activation/application/planner/routing', async () => {
  const { buildCognitiveOrchestratorSnapshot } = await import('./buildCognitiveOrchestratorSnapshot.js');
  const source = buildCognitiveOrchestratorSnapshot.toString();
  assert.doesNotMatch(source, /buildGuidanceSnapshot/);
  assert.doesNotMatch(source, /buildObservationSnapshot/);
  assert.doesNotMatch(source, /buildDecisionReadinessSnapshot/);
  assert.doesNotMatch(source, /buildCapabilityReadinessSnapshot/);
  assert.doesNotMatch(source, /buildExecutionReadinessSnapshot/);
  assert.doesNotMatch(source, /runControlledGuidanceApplication/);
  assert.doesNotMatch(source, /buildConversationPlanSnapshot/);
  assert.doesNotMatch(source, /selectControlledConversationRoute/);
});

// ---------------------------------------------------------------------------
// No text, no execution, no memory, no database, no rpc, no voice within orchestrator
// ---------------------------------------------------------------------------

test('Cognitive Orchestrator jamais référence ni texte, ni exécution, ni mémoire, ni base, ni rpc, ni TTS', async () => {
  const { buildCognitiveOrchestratorSnapshot } = await import('./buildCognitiveOrchestratorSnapshot.js');
  const source = buildCognitiveOrchestratorSnapshot.toString();
  assert.doesNotMatch(source, /selectControlledVisibleResponse/);
  assert.doesNotMatch(source, /runControlledQuestionApplication/);
  assert.doesNotMatch(source, /savePendingActionStack/);
  assert.doesNotMatch(source, /executeFinancialIntentAction/);
  assert.doesNotMatch(source, /uniVoice\.speak/);
  assert.doesNotMatch(source, /\.rpc\(/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /syncMessageToSupabase/);
  assert.doesNotMatch(source, /pushMessage/);
});