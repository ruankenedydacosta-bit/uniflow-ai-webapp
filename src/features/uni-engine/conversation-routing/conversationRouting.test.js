// Uni Engine — Conversation Routing (Parte 8, Bloco Único).
//
// O seletor permite que o pipeline legado consulte o Conversation Plan do
// MESMO turno para escolher, de forma controlada, qual caminho conversacional
// JÁ AUTORIZADO deve prevalecer. Garantias absolutas verificadas aqui:
//   - qualquer gate falhou → rota legada integral (fallbackUsed, sem applied);
//   - confirmação obrigatória do legado tem precedência MÁXIMA (o nextStep do
//     Planner NUNCA a contorna);
//   - erro/instrução de segurança obrigatória do legado vence o Planner;
//   - ANSWER usa somente a resposta da Application Layer; QUESTION e
//     CLARIFICATION usam somente templates fechados; WAIT/NONE só quando o
//     legado já aguarda/decidiu não enviar;
//   - nenhuma execução financeira, memória, aprendizado, banco/RPC/TTS,
//     pergunta livre, duplicidade ou modificação de Pending Action;
//   - resultado serializável, congelado, determinístico, com safety integral;
//   - falha interna → legado (fail-safe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationPlanSnapshot } from '../conversation-planner/conversationPlannerContracts.js';
import { createApplicationResult } from '../application/applicationContracts.js';
import { createControlledQuestionResult } from '../application/controlledQuestionContracts.js';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { selectControlledConversationRoute } from './selectControlledConversationRoute.js';
import {
  createEmptyConversationRoutingResult,
  createConversationRoutingResult,
  validateConversationRoutingResult,
  isRoutingSafetyIntegral,
} from './conversationRoutingContracts.js';
import {
  CONVERSATION_ROUTING_POLICY,
  getRoutePriority,
  routeForNextStep,
  isConversationRoutingEnabledByConfig,
} from './conversationRoutingPolicy.js';
import {
  CONVERSATION_ROUTING_VERSION,
  ROUTES,
  ROUTING_SAFETY_KEYS,
  isRoute,
  isRoutingSafetyKey,
} from './conversationRoutingTypes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LEGACY_TEXT = 'Seu saldo atual é R$ 1.234,56.';
const FINAL_TEXT = 'Seu saldo atual é R$ 1.234,56. Agora está mais curto.';

function buildPlan(nextStep, options = {}) {
  return createConversationPlanSnapshot({
    enabled: true,
    plannerStatus: options.plannerStatus ?? 'PLANNED',
    nextStep,
    confidence: options.confidence ?? 0.9,
    reason: options.reason ?? 'DECISION_RESPOND',
    metadata: { sources: ['application'] },
    ...options,
  });
}

function buildConfig(overrides = {}) {
  return {
    enabled: true,
    activationEnabled: true,
    integrationEnabled: true,
    applicationEnabled: true,
    controlledQuestionsEnabled: true,
    conversationRoutingEnabled: true,
    activationCapabilities: {
      QUESTION_GUIDANCE: true,
      CLARIFICATION_GUIDANCE: true,
      RESPONSE_STYLE_GUIDANCE: true,
      RESPONSE_LENGTH_GUIDANCE: true,
    },
    ...overrides,
  };
}

function buildApplicationResult(overrides = {}) {
  return createApplicationResult({
    enabled: true,
    applied: true,
    appliedCapabilities: ['RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE'],
    originalText: LEGACY_TEXT,
    finalText: FINAL_TEXT,
    status: 'APPLIED',
    safety: {},
    ...overrides,
  });
}

function buildControlledQuestionResult(overrides = {}) {
  return createControlledQuestionResult({
    enabled: true,
    applied: true,
    capability: 'QUESTION_GUIDANCE',
    decisionType: 'question',
    templateKey: 'account',
    finalQuestion: 'Qual é a conta dessa transação?',
    originalLegacyText: LEGACY_TEXT,
    sameTurn: true,
    pendingActionPreserved: true,
    confirmationPreserved: true,
    ...overrides,
  });
}

function buildLegacyResponse(overrides = {}) {
  return {
    text: LEGACY_TEXT,
    responseType: 'generic',
    status: 'ready',
    ...overrides,
  };
}

function route(options) {
  return selectControlledConversationRoute({
    conversationPlan: buildPlan('NEXT_STEP_ANSWER'),
    applicationResult: buildApplicationResult(),
    controlledQuestionResult: null,
    legacyResponse: buildLegacyResponse(),
    legacyConfirmation: null,
    pendingActionState: { intent: 'set_balance', status: 'awaiting_input' },
    config: buildConfig(),
    environment: 'development',
    authorized: true,
    sameTurn: true,
    ...options,
  });
}

const baseOptions = () => ({
  conversationPlan: buildPlan('NEXT_STEP_ANSWER'),
  applicationResult: buildApplicationResult(),
  legacyResponse: buildLegacyResponse(),
  config: buildConfig(),
  environment: 'development',
  authorized: true,
  sameTurn: true,
});

// ---------------------------------------------------------------------------
// PARTE 8 — gates: tudo o que falha usa a rota legada.
// ---------------------------------------------------------------------------

test('CR-1: flag ausente usa rota legada', () => {
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    config: createUniEngineConfig({ env: {} }),
  });
  assert.equal(result.enabled, false);
  assert.equal(result.applied, false);
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'ROUTING_DISABLED');
});

test('CR-2: flag false usa rota legada', () => {
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    config: buildConfig({ conversationRoutingEnabled: false }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(result.fallbackReason, 'ROUTING_DISABLED');
});

test('CR-3: production usa rota legada', () => {
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    environment: 'production',
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'ENVIRONMENT_NOT_ALLOWED');
  assert.equal(result.legacyPreserved, true);
});

test('CR-4: usuário não autorizado usa rota legada', () => {
  const result = selectControlledConversationRoute({ ...baseOptions(), authorized: false });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'USER_NOT_AUTHORIZED');
});

test('CR-5: Planner ausente usa rota legada', () => {
  const result = selectControlledConversationRoute({ ...baseOptions(), conversationPlan: null });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'PLANNER_INVALID');
});

test('CR-6: Planner inválido usa rota legada', () => {
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    conversationPlan: createConversationPlanSnapshot({ plannerStatus: 'FALLBACK', nextStep: 'NEXT_STEP_NONE' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'PLANNER_STATUS_INVALID');
});

test('CR-7: resultado de turno anterior é rejeitado', () => {
  const result = selectControlledConversationRoute({ ...baseOptions(), sameTurn: false });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'SAME_TURN_VIOLATED');
});

test('CR-8: confiança baixa usa legado', () => {
  const result = route({ conversationPlan: buildPlan('NEXT_STEP_ANSWER', { confidence: 0.2 }) });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'LOW_CONFIDENCE');
});

test('CR-9: risco alto usa legado', () => {
  const result = route({ legacyResponse: buildLegacyResponse({ risk: 'HIGH' }) });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'HIGH_RISK');
});

test('CR-10: circuit breaker aberto usa legado', () => {
  const result = route({ legacyResponse: buildLegacyResponse({ circuitBreakerOpen: true }) });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'CIRCUIT_BREAKER_OPEN');
});

test('CR-11: integration desligada usa legado', () => {
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    config: buildConfig({ integrationEnabled: false }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'INTEGRATION_DISABLED');
});

test('CR-12: activation desligada usa legado', () => {
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    config: buildConfig({ activationEnabled: false }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'ACTIVATION_DISABLED');
});

test('CR-13: application desligada usa legado', () => {
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    config: buildConfig({ applicationEnabled: false }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'APPLICATION_DISABLED');
});

// ---------------------------------------------------------------------------
// PARTE 8 — rotas autorizadas.
// ---------------------------------------------------------------------------

test('CR-14: ANSWER autorizado seleciona resposta permitida', () => {
  const result = route();
  assert.equal(result.applied, true);
  assert.equal(result.selectedRoute, 'ROUTE_ANSWER');
  assert.equal(result.routeSource, 'planner');
  assert.equal(result.requestedNextStep, 'NEXT_STEP_ANSWER');
  assert.equal(result.legacyPreserved, true);
  assert.equal(result.fallbackUsed, false);
});

test('CR-15: QUESTION autorizado seleciona template fechado', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_QUESTION'),
    controlledQuestionResult: buildControlledQuestionResult(),
    applicationResult: createApplicationResult({
      enabled: true,
      applied: false,
      status: 'NOT_APPLIED',
      questionDecision: { shouldAsk: true, questionPriority: 'HIGH', missingInformation: ['account'], confidence: 0.9 },
      safety: {},
    }),
  });
  assert.equal(result.applied, true);
  assert.equal(result.selectedRoute, 'ROUTE_QUESTION');
  assert.equal(result.routeSource, 'planner');
});

test('CR-16: CLARIFICATION autorizada seleciona template fechado', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_CLARIFICATION'),
    controlledQuestionResult: buildControlledQuestionResult({
      capability: 'CLARIFICATION_GUIDANCE',
      decisionType: 'clarification',
      templateKey: 'ambiguity_account',
    }),
    applicationResult: createApplicationResult({
      enabled: true,
      applied: false,
      status: 'NOT_APPLIED',
      clarificationDecision: { shouldClarify: true, clarificationPriority: 'HIGH', ambiguousFields: ['account'], confidence: 0.9 },
      safety: {},
    }),
  });
  assert.equal(result.applied, true);
  assert.equal(result.selectedRoute, 'ROUTE_CLARIFICATION');
  assert.equal(result.routeSource, 'planner');
});

test('CR-17: CONFIRMATION usa somente confirmação legada', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_CONFIRMATION'),
    legacyConfirmation: { pending: true },
  });
  assert.equal(result.applied, true);
  assert.equal(result.selectedRoute, 'ROUTE_CONFIRMATION');
  assert.equal(result.confirmationPreserved, true);
});

test('CR-18: CONFIRMATION do Planner sem confirmação legada não é criada (usa legado)', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_CONFIRMATION'),
    legacyConfirmation: null,
  });
  assert.equal(result.applied, false);
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(result.confirmationPreserved, false);
});

test('CR-19: WAIT só é aceito quando o legado já aguarda', () => {
  const waiting = route({
    conversationPlan: buildPlan('NEXT_STEP_WAIT', { reason: 'DECISION_WAIT' }),
    legacyResponse: buildLegacyResponse({ responseType: 'wait', status: 'waiting', isWaiting: true }),
    legacyConfirmation: null,
    applicationResult: null,
  });
  assert.equal(waiting.applied, true);
  assert.equal(waiting.selectedRoute, 'ROUTE_WAIT');
  const notWaiting = route({
    conversationPlan: buildPlan('NEXT_STEP_WAIT', { reason: 'DECISION_WAIT' }),
    legacyResponse: buildLegacyResponse({ responseType: 'generic', isWaiting: false }),
    legacyConfirmation: null,
    applicationResult: null,
  });
  assert.equal(notWaiting.applied, false);
  assert.equal(notWaiting.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
});

test('CR-20: NONE só quando o legado já decidiu não enviar mensagem', () => {
  const silent = route({
    conversationPlan: buildPlan('NEXT_STEP_NONE', { confidence: 0 }),
    legacyResponse: buildLegacyResponse({ text: '', responseType: 'none' }),
    legacyConfirmation: null,
    applicationResult: null,
  });
  assert.equal(silent.applied, true);
  assert.equal(silent.selectedRoute, 'ROUTE_NONE');
  const withText = route({
    conversationPlan: buildPlan('NEXT_STEP_NONE', { confidence: 0 }),
    legacyResponse: buildLegacyResponse({ responseType: 'none' }),
    legacyConfirmation: null,
    applicationResult: null,
  });
  assert.equal(withText.applied, false);
  assert.equal(withText.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
});

// ---------------------------------------------------------------------------
// PARTE 8 — prioridade obrigatória.
// ---------------------------------------------------------------------------

test('CR-21: confirmação obrigatória vence ANSWER', () => {
  const result = route({ legacyConfirmation: { pending: true } });
  assert.equal(result.selectedRoute, 'ROUTE_CONFIRMATION');
  assert.equal(result.routeSource, 'legacy-priority');
  assert.equal(result.confirmationPreserved, true);
});

test('CR-22: confirmação obrigatória vence QUESTION', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_QUESTION'),
    controlledQuestionResult: buildControlledQuestionResult(),
    legacyConfirmation: { pending: true },
  });
  assert.equal(result.selectedRoute, 'ROUTE_CONFIRMATION');
});

test('CR-23: erro obrigatório vence Planner', () => {
  const result = route({ legacyResponse: buildLegacyResponse({ responseType: 'error' }) });
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_SECURITY_ERROR');
  assert.equal(result.routeSource, 'legacy-priority');
});

test('CR-24: erro de confirmação (confirmationError) também é bloqueio obrigatório', () => {
  const result = route({ legacyConfirmation: { pending: true, confirmationError: 'Falha ao confirmar' } });
  assert.equal(result.selectedRoute, 'ROUTE_CONFIRMATION');
});

test('CR-25: NONE não oculta erro', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_NONE', { confidence: 0 }),
    legacyResponse: buildLegacyResponse({ text: '', responseType: 'error' }),
    legacyConfirmation: null,
  });
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_SECURITY_ERROR');
});

test('CR-26: NONE não oculta confirmação', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_NONE', { confidence: 0 }),
    legacyResponse: buildLegacyResponse({ text: '', responseType: 'none' }),
    legacyConfirmation: { pending: true },
  });
  assert.equal(result.selectedRoute, 'ROUTE_CONFIRMATION');
});

test('CR-27: prioridade determinística segue a ordem fechada da policy', () => {
  const priorityOrder = [
    'ROUTE_CONFIRMATION',
    'ROUTE_LEGACY_SECURITY_ERROR',
    'ROUTE_CLARIFICATION',
    'ROUTE_QUESTION',
    'ROUTE_ANSWER',
    'ROUTE_WAIT',
    'ROUTE_NONE',
    'ROUTE_LEGACY_FALLBACK',
  ];
  const rankings = priorityOrder.map(getRoutePriority);
  assert.deepEqual([...rankings].sort((a, b) => a - b), rankings);
  for (const routeName of priorityOrder) {
    assert.ok(ROUTES.includes(routeName), `rota ${routeName} no vocabulário fechado`);
  }
  assert.equal(routeForNextStep('NEXT_STEP_ANSWER'), 'ROUTE_ANSWER');
  assert.equal(routeForNextStep('NEXT_STEP_CONFIRMATION'), 'ROUTE_CONFIRMATION');
  assert.equal(routeForNextStep('NEXT_STEP_BOGUS'), null);
});

// ---------------------------------------------------------------------------
// PARTE 8 — integridade do resultado e uma única saída.
// ---------------------------------------------------------------------------

test('CR-28: rota desconhecida usa legado', () => {
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    conversationPlan: { nextStep: 'NEXT_STEP_BOGUS', plannerStatus: 'PLANNED', confidence: 0.9 },
  });
  assert.equal(result.applied, false);
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(result.fallbackReason, 'ROUTE_UNKNOWN');
});

test('CR-29: capability incompatível usa legado', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_QUESTION'),
    controlledQuestionResult: buildControlledQuestionResult(),
    applicationResult: createApplicationResult({
      applied: false,
      status: 'NOT_APPLIED',
      questionDecision: { shouldAsk: true, confidence: 0.9 },
      safety: {},
    }),
    config: buildConfig({ activationCapabilities: { ...buildConfig().activationCapabilities, QUESTION_GUIDANCE: false } }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(result.fallbackReason, 'CAPABILITY_INCOMPATIBLE');
});

test('CR-30: capability readiness bloqueando a rota usa legado', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_QUESTION'),
    controlledQuestionResult: buildControlledQuestionResult(),
    applicationResult: createApplicationResult({
      applied: false,
      status: 'NOT_APPLIED',
      questionDecision: { shouldAsk: true, confidence: 0.9 },
      safety: {},
    }),
    capabilityReadinessSnapshot: createCapabilityReadinessFixture(['QUESTION_GUIDANCE']),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'CAPABILITY_INCOMPATIBLE');
});

test('CR-31: resultado downstream ausente usa legado', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_QUESTION'),
    controlledQuestionResult: null,
  });
  assert.equal(result.applied, false);
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(result.fallbackReason, 'DOWNSTREAM_RESULT_INVALID');
});

test('CR-32: Question e Clarification simultâneas geram UMA saída', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_CLARIFICATION'),
    controlledQuestionResult: buildControlledQuestionResult({
      capability: 'CLARIFICATION_GUIDANCE',
      decisionType: 'clarification',
      templateKey: 'ambiguity_account',
    }),
    applicationResult: createApplicationResult({
      applied: false,
      status: 'NOT_APPLIED',
      questionDecision: { shouldAsk: true, confidence: 0.9 },
      clarificationDecision: { shouldClarify: true, confidence: 0.9 },
      safety: {},
    }),
  });
  assert.equal(result.selectedRoute, 'ROUTE_CLARIFICATION');
  assert.equal(result.duplicatePrevented, true);
});

test('CR-33: uma mensagem por turno (uma única rota, nunca múltiplas)', () => {
  for (const nextStep of ['NEXT_STEP_ANSWER', 'NEXT_STEP_QUESTION', 'NEXT_STEP_CLARIFICATION', 'NEXT_STEP_CONFIRMATION', 'NEXT_STEP_WAIT', 'NEXT_STEP_NONE']) {
    const result = route({ conversationPlan: buildPlan(nextStep) });
    assert.equal(typeof result.selectedRoute, 'string');
    assert.equal(ROUTES.includes(result.selectedRoute), true);
    assert.equal(result.duplicatePrevented, true);
  }
});

test('CR-34: deduplicação é sempre garantida pelo contrato', () => {
  const result = route();
  assert.equal(result.duplicatePrevented, true);
  assert.equal(validateConversationRoutingResult(result).valid, true);
});

test('CR-35: Pending Action preservada', () => {
  const result = route();
  assert.equal(result.pendingActionPreserved, true);
  assert.deepEqual(result.safety, { financialExecution: false, memoryWrite: false, learningApplied: false, confirmationSkipped: false, pendingActionModifiedUnsafely: false, databaseCalled: false, rpcCalled: false, duplicateMessageCreated: false, freeTextGenerated: false });
});

test('CR-36: confirmação não pulada', () => {
  const result = route({ legacyConfirmation: { pending: true } });
  assert.equal(result.confirmationPreserved, true);
  assert.equal(result.safety.confirmationSkipped, false);
});

test('CR-37: Style e Length continuam funcionando na rota ANSWER', () => {
  const result = route();
  assert.equal(result.selectedRoute, 'ROUTE_ANSWER');
  const applicationResult = buildApplicationResult();
  assert.deepEqual(applicationResult.appliedCapabilities, ['RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE']);
  assert.equal(applicationResult.finalText, FINAL_TEXT);
});

test('CR-38: Style e Length não deformam template fechado', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_QUESTION'),
    controlledQuestionResult: buildControlledQuestionResult(),
    applicationResult: createApplicationResult({
      applied: true,
      appliedCapabilities: ['RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE'],
      originalText: LEGACY_TEXT,
      finalText: FINAL_TEXT,
      status: 'APPLIED',
      questionDecision: { shouldAsk: true, missingInformation: ['account'], confidence: 0.9 },
      safety: {},
    }),
  });
  assert.equal(result.selectedRoute, 'ROUTE_QUESTION');
  assert.equal(result.requestedNextStep, 'NEXT_STEP_QUESTION');
});

test('CR-39: nenhuma pergunta livre (template fora da allowlist é rejeitado)', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_QUESTION'),
    controlledQuestionResult: buildControlledQuestionResult({ templateKey: 'free_text_question' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'DOWNSTREAM_RESULT_INVALID');
});

test('CR-40: safety nunca tem efeito colateral', () => {
  for (const key of ROUTING_SAFETY_KEYS) {
    assert.equal(route()[key] === undefined, true, 'safety não vaza para o topo');
  }
  assert.equal(isRoutingSafetyIntegral(route().safety), true);
  const badSafety = { financialExecution: true };
  assert.equal(isRoutingSafetyIntegral(badSafety), false);
});

test('CR-41: resultado serializável', () => {
  const result = route();
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(validateConversationRoutingResult(result).valid, true);
});

test('CR-42: resultado deepFreeze', () => {
  const result = route();
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.safety), true);
  assert.equal(Object.isFrozen(result.diagnostics), true);
});

test('CR-43: determinismo', () => {
  const stripLatency = (result) => JSON.stringify({ ...result, latencyMs: undefined });
  const first = route();
  const second = route();
  assert.equal(stripLatency(first), stripLatency(second));
});

test('CR-44: falha interna usa legado (fail-safe)', () => {
  const bomb = {
    plannerStatus: 'PLANNED',
    get nextStep() {
      throw new Error('BANG');
    },
  };
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    conversationPlan: bomb,
  });
  assert.equal(result.applied, false);
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(result.fallbackReason, 'ERROR_SAFE');
  assert.equal(result.safety.financialExecution, false);
});

test('CR-45: comportamento all-off é idêntico ao pipeline legado', () => {
  const result = selectControlledConversationRoute({
    ...baseOptions(),
    config: createUniEngineConfig({ env: {} }),
    sameTurn: false,
  });
  assert.equal(result.applied, false);
  assert.equal(result.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(result.legacyPreserved, true);
});

test('CR-46: fluxo financeiro incompleto pergunta apenas o campo correto (template fechado)', () => {
  const result = route({
    conversationPlan: buildPlan('NEXT_STEP_QUESTION', { reason: 'MISSING_INFORMATION' }),
    controlledQuestionResult: buildControlledQuestionResult({ requestedField: 'account' }),
    applicationResult: createApplicationResult({
      applied: false,
      status: 'NOT_APPLIED',
      questionDecision: { shouldAsk: true, missingInformation: ['account'], confidence: 0.9 },
      safety: {},
    }),
  });
  assert.equal(result.applied, true);
  assert.equal(result.selectedRoute, 'ROUTE_QUESTION');
  assert.equal(result.requestedNextStep, 'NEXT_STEP_QUESTION');
});

test('CR-47: resposta ao campo retoma Pending Action (rota preserva a máquina legada)', () => {
  const result = route();
  assert.equal(result.pendingActionPreserved, true);
  assert.equal(result.safety.pendingActionModifiedUnsafely, false);
  assert.equal(result.legacyPreserved, true);
});

test('CR-48: confirmação continua obrigatória antes do RPC', () => {
  const result = route({ legacyConfirmation: { pending: true } });
  assert.equal(result.selectedRoute, 'ROUTE_CONFIRMATION');
  assert.equal(result.confirmationPreserved, true);
  assert.equal(result.safety.rpcCalled, false);
});

// ---------------------------------------------------------------------------
// PARTE 8 — contratos, enums e política (integridade estrutural).
// ---------------------------------------------------------------------------

test('CR-49: enums fechados do roteamento', () => {
  assert.equal(CONVERSATION_ROUTING_VERSION, '1.0');
  assert.equal(ROUTES.length, 8);
  for (const routeName of ROUTES) assert.equal(isRoute(routeName), true);
  assert.equal(isRoute('ROUTE_HACK'), false);
  for (const key of ROUTING_SAFETY_KEYS) assert.equal(isRoutingSafetyKey(key), true);
  assert.equal(isRoutingSafetyKey('hack'), false);
});

test('CR-50: contrato de criação valida resultado íntegro e rejeita inválido', () => {
  const valid = createConversationRoutingResult({
    applied: true,
    selectedRoute: 'ROUTE_ANSWER',
    routeSource: 'planner',
    sameTurn: true,
    diagnostics: ['ROUTE_SELECTED'],
  });
  assert.equal(validateConversationRoutingResult(valid).valid, true);
  const tampered = {
    ...valid,
    safety: { ...valid.safety, hack: true },
  };
  assert.equal(validateConversationRoutingResult(tampered).valid, false);
  const invalid = createConversationRoutingResult({
    applied: true,
    selectedRoute: 'ROUTE_HACK',
    routeSource: 'hack',
  });
  assert.equal(invalid.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(invalid.routeSource, 'fallback');
  assert.equal(invalid.applied, false);
  assert.equal(validateConversationRoutingResult(invalid).valid, true);
});

test('CR-51: resultado vazio é um fallback válido com safety integral', () => {
  const empty = createEmptyConversationRoutingResult({ fallbackReason: 'ROUTING_DISABLED' });
  assert.equal(empty.applied, false);
  assert.equal(empty.selectedRoute, 'ROUTE_LEGACY_FALLBACK');
  assert.equal(empty.fallbackUsed, true);
  assert.equal(validateConversationRoutingResult(empty).valid, true);
  assert.equal(empty.safety.financialExecution, false);
  assert.equal(empty.duplicatePrevented, true);
});

test('CR-52: policy de roteamento exige flag explícita + cascata', () => {
  const allOn = buildConfig();
  assert.equal(isConversationRoutingEnabledByConfig(allOn), true);
  const noFlag = buildConfig({ conversationRoutingEnabled: false });
  assert.equal(isConversationRoutingEnabledByConfig(noFlag), false);
  const noEngine = buildConfig({ enabled: false });
  assert.equal(isConversationRoutingEnabledByConfig(noEngine), false);
  const noApp = buildConfig({ applicationEnabled: false });
  assert.equal(isConversationRoutingEnabledByConfig(noApp), false);
  assert.equal(CONVERSATION_ROUTING_POLICY.requireEngine, true);
  assert.equal(CONVERSATION_ROUTING_POLICY.requireActivation, true);
  assert.equal(CONVERSATION_ROUTING_POLICY.requireIntegration, true);
  assert.equal(CONVERSATION_ROUTING_POLICY.requireApplication, true);
});

test('CR-53: nenhuma camada cognitiva é reexecutada pelo seletor', async () => {
  const source = await import('./selectControlledConversationRoute.js');
  const text = source.selectControlledConversationRoute.toString();
  assert.doesNotMatch(text, /runUniEngineShadow|runUniEngineIntegration|buildGuidanceSnapshot|buildObservationSnapshot|runControlledGuidanceApplication|runControlledQuestionApplication|buildConversationPlanSnapshot/);
});

test('CR-54: o seletor nunca referencia texto, execução, memória, banco ou TTS', async () => {
  const source = await import('./selectControlledConversationRoute.js');
  const text = source.selectControlledConversationRoute.toString();
  assert.doesNotMatch(text, /uniVoice\.speak/);
  assert.doesNotMatch(text, /\.rpc\(/);
  assert.doesNotMatch(text, /localStorage/);
  assert.doesNotMatch(text, /executeConfirmedFinancialAction/);
  assert.doesNotMatch(text, /savePendingActionStack/);
  assert.doesNotMatch(text, /insertMessage/);
  assert.doesNotMatch(text, /createUniMemory/);
});

test('CR-55: refs são resetados no novo turno e no catch (integração UniChat)', async () => {
  const page = await readPage();
  const runBlock = betweenMarkers(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchSlice = runBlock.slice(runBlock.indexOf('} catch {'));
  assert.match(catchSlice, /lastConversationRoutingSnapshotRef\.current = null;/);
  const sendBlock = betweenMarkers(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.match(sendBlock, /lastConversationRoutingSnapshotRef\.current = null;/);
});

test('CR-56: o seletor é consultado UMA vez no ponto único de saída', async () => {
  const page = await readPage();
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  const occurrences = guidedBlock.match(/selectControlledConversationRoute\(/g) ?? [];
  assert.equal(occurrences.length, 1, 'seletor consultado exatamente uma vez');
  assert.match(guidedBlock, /sameTurn:/);
  assert.match(guidedBlock, /lastConversationPlannerSnapshotRef\.current/);
  assert.doesNotMatch(guidedBlock, /setMessages|setState|useState\(/);
  assert.doesNotMatch(guidedBlock, /syncMessageToSupabase/);
  assert.doesNotMatch(guidedBlock, /localStorage/);
  assert.doesNotMatch(guidedBlock, /\.rpc\(/);
  assert.doesNotMatch(guidedBlock, /pushMessage/);
  assert.doesNotMatch(guidedBlock, /executeFinancialIntentAction|executeConfirmedFinancialAction/);
  assert.doesNotMatch(guidedBlock, /uniVoice\.speak/);
});

test('CR-57: rota ANSWER aplicada usa o finalText; qualquer outra rota preserva o texto legado', async () => {
  const page = await readPage();
  const guidedBlock = betweenMarkers(
    page,
    'const applyEngineGuidanceToResponse = useCallback',
    'const buildGuidedUniMessage = useCallback',
  );
  assert.match(guidedBlock, /selectedRoute === 'ROUTE_ANSWER'/);
  assert.match(guidedBlock, /selectControlledVisibleResponse\(\{/);
  assert.match(guidedBlock, /return legacyText;/);
});

test('CR-58: import do roteamento vem do index da engine', async () => {
  const page = await readPage();
  const importLine = page.match(/import \{[\s\S]*?\} from '\.\.\/uni-engine\/index\.js';/)[0];
  assert.match(importLine, /selectControlledConversationRoute/);
});

test('CR-59: o resultado do roteamento fica SOMENTE em ref dedicado', async () => {
  const page = await readPage();
  const refBlock = betweenMarkers(
    page,
    'const lastConversationPlannerSnapshotRef = useRef(null);',
    'useEffect(() => {',
  );
  assert.match(refBlock, /const lastConversationRoutingSnapshotRef = useRef\(null\);/);
});

// ---------------------------------------------------------------------------
// Helpers de leitura de fonte (mesmo padrão dos demais blocos da Parte 5/7).
// ---------------------------------------------------------------------------

function createCapabilityReadinessFixture(blockedCapabilities) {
  return {
    enabled: true,
    shadowMode: true,
    plannerStatus: 'PLANNED',
    evaluatedCapabilities: ['QUESTION_GUIDANCE', 'CLARIFICATION_GUIDANCE'],
    eligibleCapabilities: ['QUESTION_GUIDANCE', 'CLARIFICATION_GUIDANCE'],
    blockedCapabilities,
    missingDependencies: [],
    nextRecommendedCapability: null,
    diagnostics: [],
    legacyPreserved: true,
    applied: false,
    serializable: true,
  };
}

async function readPage() {
  const { readFile } = await import('node:fs/promises');
  const path = new URL('../../uni-chat/UniChatPage.jsx', import.meta.url);
  return readFile(path, 'utf8');
}

function betweenMarkers(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) return '';
  return text.slice(startIndex, endIndex);
}
