// Uni Engine — Context Bridge (Fase 11, Bloco 3): validação operacional interna.
//
// Cenários operacionais validados contra o pipeline REAL (runUniEngineGateway)
// e o builder da ponte (buildEngineResponseContext), sem qualquer navegador:
//   1. Mensagem comum (rollout padrão OFF)  → ponte OFF, legado integral.
//   2. Consulta simples de saldo            → nunca gera texto factual.
//   3. Cadastro incompleto ("Gastei R$ 50") → Pending Action soberana; decisões
//      observacionais apenas via templates fechados.
//   4. Continuação ("Nubank")               → nenhuma execução financeira.
//   5. Confirmação ("Confirmar")            → CONFIRMATION_MANDATORY vence tudo.
//   6. Erro interno simulado                → ERROR_SAFE, legado integral.
//   7. Rollout OFF                          → ponte OFF (comportamento atual).
//   8. Rollout SHADOW                       → ponte FALLBACK, nunca influencia.
//   9. INTERNAL autorizado                  → influência permitida (estilo,
//      comprimento, decisões, rota), sem texto factual e sem execução.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  runUniEngineGateway,
  buildEngineResponseContext,
  buildGuidanceSnapshot,
  runControlledGuidanceApplication,
  buildConversationPlanSnapshot,
  buildCognitiveOrchestratorSnapshot,
} from '../index.js';
import { selectControlledConversationRoute } from '../conversation-routing/selectControlledConversationRoute.js';
import { buildRolloutSnapshot } from '../rollout/buildRolloutSnapshot.js';
import { CONTEXT_BRIDGE_POLICY } from './contextBridgePolicy.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const TEST_USER = 'uni-test-user';

function fullConfig(overrides = {}) {
  return {
    enabled: true,
    integrationEnabled: true,
    activationEnabled: true,
    applicationEnabled: true,
    conversationRoutingEnabled: true,
    controlledQuestionsEnabled: true,
    cognitiveOrchestratorEnabled: true,
    rolloutEnabled: true,
    contextBridgeEnabled: true,
    activationEnvironments: ['development'],
    activationTestUserIds: [TEST_USER],
    rolloutStage: 'ROLLOUT_OFF',
    environment: 'development',
    activationCapabilities: {
      RESPONSE_STYLE_GUIDANCE: true,
      RESPONSE_LENGTH_GUIDANCE: true,
      QUESTION_GUIDANCE: true,
      CLARIFICATION_GUIDANCE: true,
    },
    ...overrides,
  };
}

function gatewayFor(text, turnId, overrides = {}) {
  return runUniEngineGateway({
    conversationHistory: [],
    conversationId: 'conv-op',
    currentRoute: 'uni-chat',
    financialSnapshot: null,
    legacyText: `Legado: ${text}`,
    source: 'text',
    text,
    turnId,
    userPreferences: { conversationStyle: 'balanced', workspaceType: 'personal' },
    userId: TEST_USER,
    config: fullConfig(),
    ...overrides,
  });
}

// Réplica fiel da cadeia do app (applyEngineGuidanceToResponse → PARTE 5/7/8/9):
// Application → Planner → Routing → Orchestrator, consumindo os snapshots reais
// do pipeline do MESMO turno (gateway + integração do gateway).
function orchestratorFor(gatewayResult, text, config, options = {}) {
  const legacy = { text: `Legado: ${text}`, responseType: 'generic', status: null };
  const integration = gatewayResult.integrationResult;
  const guidance = buildGuidanceSnapshot({
    legacy,
    engineResult: null,
    context: { environment: 'development', isDev: true },
  });
  const application = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: null,
    guidance,
    context: {
      environment: 'development',
      userId: TEST_USER,
      isDev: true,
      telemetryAdapter: null,
      activationDecisions: [],
      confidence: 0.92,
      risk: 'LOW',
      circuitBreakerOpen: false,
    },
  });
  const plan = buildConversationPlanSnapshot({
    observationSnapshot: gatewayResult.engineContext?.observationSnapshot ?? null,
    decisionSnapshot: null,
    decisionReadinessSnapshot: null,
    capabilityReadinessSnapshot: null,
    executionReadinessSnapshot: null,
    applicationResult: application,
    context: { environment: 'development', isDev: true },
  });
  const route = selectControlledConversationRoute({
    config,
    environment: 'development',
    authorized: true,
    conversationPlan: plan,
    sameTurn: plan !== null,
    legacyText: `Legado: ${text}`,
    legacyResponse: legacy,
    applicationResult: application,
    isDev: true,
  });
  const orchestrator = buildCognitiveOrchestratorSnapshot({
    config,
    environment: 'development',
    authorized: true,
    isDev: true,
    observation: gatewayResult.engineContext?.observationSnapshot ?? { mode: 'observational', legacyPreserved: true, serializable: true },
    guidance,
    decision: { mode: 'observational', legacyPreserved: true, serializable: true },
    capabilityReadiness: { mode: 'observational', legacyPreserved: true, serializable: true },
    executionReadiness: { mode: 'observational', legacyPreserved: true, serializable: true },
    application,
    conversationPlan: plan,
    conversationRoute: route,
  });
  return {
    orchestrator,
    application,
    plan,
    route,
    integration,
    ...options,
  };
}

function internalRollout(gatewayResult, config) {
  return buildRolloutSnapshot({
    config,
    observationSnapshot: gatewayResult?.engineContext?.observationSnapshot ?? null,
    environment: 'development',
    userId: TEST_USER,
    requestedStage: 'ROLLOUT_INTERNAL',
    userAuthorized: true,
  });
}

function shadowRollout(gatewayResult, config) {
  return buildRolloutSnapshot({
    config,
    observationSnapshot: gatewayResult?.engineContext?.observationSnapshot ?? null,
    environment: 'development',
    userId: TEST_USER,
    requestedStage: 'ROLLOUT_SHADOW',
    userAuthorized: true,
  });
}

function bridgeInput(gatewayResult, rolloutSnapshot, overrides = {}) {
  return {
    config: fullConfig(),
    gatewayResult,
    integrationResult: gatewayResult.integrationResult,
    cognitiveSnapshot: gatewayResult.cognitiveSnapshot,
    rolloutSnapshot,
    operationalReadiness: gatewayResult.operationalReadiness,
    environment: 'development',
    userId: TEST_USER,
    isDev: true,
    sameTurn: true,
    pendingAction: null,
    confirmationState: null,
    circuitBreakerOpen: false,
    requestedInfluences: [
      'RESPONSE_STYLE_GUIDANCE',
      'RESPONSE_LENGTH_GUIDANCE',
      'QUESTION_GUIDANCE',
      'CLARIFICATION_GUIDANCE',
      'CONVERSATION_ROUTING',
    ],
    context: {
      confidence: 0.92,
      risk: 'LOW',
      responseStyle: 'detailed',
      responseLengthBand: 'short',
    },
    legacyResponse: { text: 'Legado: mensagem' },
    selectedRoute: 'ROUTE_ANSWER',
    ...overrides,
  };
}

test('cenário 1 — mensagem comum: ponte OFF (rollout padrão), legado integral', () => {
  const gatewayResult = gatewayFor('Bom dia!', 't-1');
  assert.equal(gatewayResult.accepted, true);

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, gatewayResult.rolloutSnapshot));

  assert.equal(bridge.influenceAllowed, false);
  assert.equal(bridge.fallbackUsed, true);
  assert.equal(bridge.fallbackReason, 'ROLLOUT_OFF');
  assert.equal(bridge.legacyPreserved, true);
  assert.equal(JSON.stringify(bridge).includes('Legado:'), false);
  assert.equal(bridge.safety.financialExecution, false);
});

test('cenário 2 — consulta simples de saldo: nunca gera texto factual', () => {
  const gatewayResult = gatewayFor('Qual é o meu saldo?', 't-2');
  const rollout = internalRollout(gatewayResult, fullConfig());
  const pipeline = orchestratorFor(gatewayResult, 'Qual é o meu saldo?', fullConfig());
  assert.equal(pipeline.orchestrator.orchestratorStatus, 'ORCHESTRATED');

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, rollout, {
    cognitiveSnapshot: pipeline.orchestrator,
    integrationResult: pipeline.integration,
  }));

  assert.equal(bridge.influenceAllowed, true);
  const json = JSON.stringify(bridge);
  assert.equal(json.includes('saldo'), false);
  assert.equal(/\bR\$\s?\d/.test(json), false);
  assert.equal(bridge.responseStyle, 'detailed');
  assert.equal(bridge.safety.responseModified, false);
});

test('cenário 3 — cadastro incompleto: Pending Action soberana, decisões de template fechado', () => {
  const gatewayResult = gatewayFor('Gastei R$ 50 no mercado', 't-3');
  const rollout = internalRollout(gatewayResult, fullConfig());
  const pipeline = orchestratorFor(gatewayResult, 'Gastei R$ 50 no mercado', fullConfig());
  const pendingAction = { intent: 'EXPENSE_REGISTRATION', status: 'pending' };

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, rollout, {
    cognitiveSnapshot: pipeline.orchestrator,
    integrationResult: pipeline.integration,
    pendingAction,
    context: {
      confidence: 0.9,
      risk: 'LOW',
      questionDecision: { shouldAsk: true, confidence: 0.8, priority: 'medium', reason: 'falta categoria', missingInformation: ['categoria'] },
      clarificationDecision: { shouldClarify: true, confidence: 0.75, priority: 'low', reason: 'ambiguidade', ambiguousFields: ['valor'] },
    },
  }));

  assert.equal(bridge.influenceAllowed, true);
  assert.equal(bridge.pendingActionPreserved, true);
  assert.deepEqual(Object.keys(bridge.questionDecision).sort(), [
    'confidence', 'missingInformation', 'priority', 'reason', 'shouldAsk',
  ]);
  assert.deepEqual(Object.keys(bridge.clarificationDecision).sort(), [
    'ambiguousFields', 'confidence', 'priority', 'reason', 'shouldClarify',
  ]);
  assert.equal(bridge.questionDecision.missingInformation.length <= CONTEXT_BRIDGE_POLICY.maxDecisionListItems, true);
});

test('cenário 4 — continuação ("Nubank"): nenhuma execução financeira, nenhum RPC', () => {
  const gatewayResult = gatewayFor('Nubank', 't-4');
  const rollout = internalRollout(gatewayResult, fullConfig());
  const pipeline = orchestratorFor(gatewayResult, 'Nubank', fullConfig());

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, rollout, {
    cognitiveSnapshot: pipeline.orchestrator,
    integrationResult: pipeline.integration,
    pendingAction: { intent: 'EXPENSE_REGISTRATION', status: 'awaiting_merchant' },
  }));

  assert.equal(bridge.influenceAllowed, true);
  assert.equal(bridge.pendingActionPreserved, true);
  assert.equal(bridge.safety.financialExecution, false);
  assert.equal(bridge.safety.rpcCalled, false);
  assert.equal(bridge.safety.databaseCalled, false);
  assert.equal(bridge.safety.memoryWrite, false);
});

test('cenário 5 — confirmação ("Confirmar"): CONFIRMATION_MANDATORY vence qualquer influência', () => {
  const gatewayResult = gatewayFor('Confirmar', 't-5');
  const rollout = internalRollout(gatewayResult, fullConfig());
  const pipeline = orchestratorFor(gatewayResult, 'Confirmar', fullConfig());

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, rollout, {
    cognitiveSnapshot: pipeline.orchestrator,
    integrationResult: pipeline.integration,
    confirmationState: { pending: true },
  }));

  assert.equal(bridge.influenceAllowed, false);
  assert.equal(bridge.fallbackReason, 'CONFIRMATION_MANDATORY');
  assert.equal(bridge.confirmationPreserved, true);
  assert.equal(bridge.safety.confirmationSkipped, false);
  assert.equal(bridge.safety.rpcCalled, false);
});

test('cenário 6 — erro interno simulado: ERROR_SAFE, legado integral preservado', () => {
  const gatewayResult = gatewayFor('Bom dia', 't-6');
  const rollout = internalRollout(gatewayResult, fullConfig());
  const brokenConfig = new Proxy(fullConfig(), {
    get() { throw new Error('falha interna simulada'); },
  });

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, rollout, {
    config: brokenConfig,
  }));

  assert.equal(bridge.influenceAllowed, false);
  assert.equal(bridge.fallbackUsed, true);
  assert.equal(bridge.fallbackReason, 'ERROR_SAFE');
  assert.equal(bridge.legacyPreserved, true);
  assert.equal(bridge.enabled, false);
});

test('cenário 7 — rollout OFF: comportamento atual preservado (ponte nunca influencia)', () => {
  const gatewayResult = gatewayFor('O que você sabe fazer?', 't-7');

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, gatewayResult.rolloutSnapshot));

  assert.equal(bridge.influenceAllowed, false);
  assert.equal(bridge.fallbackReason, 'ROLLOUT_OFF');
  assert.equal(bridge.allowedInfluences.length, 0);
  assert.equal(bridge.safety.responseModified, false);
});

test('cenário 8 — rollout SHADOW: ponte FALLBACK, nunca influencia a resposta', () => {
  const gatewayResult = gatewayFor('Como funcionam os cartões?', 't-8');
  const rollout = shadowRollout(gatewayResult, fullConfig());

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, rollout));

  assert.equal(bridge.influenceAllowed, false);
  assert.equal(bridge.fallbackReason, 'ROLLOUT_SHADOW');
  assert.equal(bridge.legacyPreserved, true);
  assert.equal(bridge.safety.responseModified, false);
});

test('cenário 9 — INTERNAL autorizado: influência controlada sem texto factual', () => {
  const gatewayResult = gatewayFor('Bom dia!', 't-9');
  const rollout = internalRollout(gatewayResult, fullConfig());
  const pipeline = orchestratorFor(gatewayResult, 'Bom dia!', fullConfig());

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, rollout, {
    cognitiveSnapshot: pipeline.orchestrator,
    integrationResult: pipeline.integration,
    context: {
      confidence: 0.92,
      risk: 'LOW',
      responseStyle: 'detailed',
      responseLengthBand: 'short',
      questionDecision: { shouldAsk: false, confidence: 0.6, priority: 'low', reason: 'nada a perguntar' },
      clarificationDecision: null,
    },
  }));

  assert.equal(bridge.influenceAllowed, true);
  assert.equal(bridge.enabled, true);
  assert.equal(bridge.sameTurn, true);
  assert.equal(bridge.responseStyle, 'detailed');
  assert.equal(bridge.responseLengthBand, 'short');
  assert.equal(bridge.selectedRoute, 'ROUTE_ANSWER');
  assert.equal(bridge.questionDecision.shouldAsk, false);
  assert.equal(bridge.clarificationDecision, null);
  assert.equal(bridge.legacyPreserved, true);
  assert.equal(bridge.serializable, true);
});

test('auditoria — ponte consome uma única execução por turno (sem duplicação)', () => {
  const first = gatewayFor('Mensagem um', 'turn-1');
  const second = gatewayFor('Mensagem dois', 'turn-2');

  assert.equal(first.turnId, 'turn-1');
  assert.equal(second.turnId, 'turn-2');

  const p1 = orchestratorFor(first, 'Mensagem um', fullConfig());
  const p2 = orchestratorFor(second, 'Mensagem dois', fullConfig());
  const b1 = buildEngineResponseContext(bridgeInput(first, internalRollout(first, fullConfig()), {
    cognitiveSnapshot: p1.orchestrator,
    integrationResult: p1.integration,
  }));
  const b2 = buildEngineResponseContext(bridgeInput(second, internalRollout(second, fullConfig()), {
    cognitiveSnapshot: p2.orchestrator,
    integrationResult: p2.integration,
  }));

  assert.equal(b1.sameTurn, true);
  assert.equal(b2.sameTurn, true);
  assert.equal(b1.fallbackUsed || b2.fallbackUsed, false);
});

test('auditoria — turno antigo rejeitado mesmo com rollout INTERNAL autorizado', () => {
  const gatewayResult = gatewayFor('Mensagem antiga', 'turn-stale');
  const rollout = internalRollout(gatewayResult, fullConfig());

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, rollout, {
    sameTurn: false,
  }));

  assert.equal(bridge.influenceAllowed, false);
  assert.equal(bridge.fallbackReason, 'SAME_TURN_VIOLATED');
  assert.equal(bridge.legacyPreserved, true);
});

test('auditoria — INTERNAL sem usuário autorizado: USER_NOT_AUTHORIZED', () => {
  const gatewayResult = gatewayFor('Mensagem', 'turn-auth');
  const rollout = internalRollout(gatewayResult, fullConfig());

  const bridge = buildEngineResponseContext(bridgeInput(gatewayResult, rollout, {
    userId: 'usuario-real-inesperado',
  }));

  assert.equal(bridge.influenceAllowed, false);
  assert.equal(bridge.fallbackReason, 'USER_NOT_AUTHORIZED');
});

test('auditoria — erros internos da ponte nunca estouram (pipeline legado intacto)', async () => {
  const gateway = await source('./buildEngineResponseContext.js');
  assert.match(gateway, /try \{/);
  assert.match(gateway, /ERROR_SAFE/);
  assert.match(gateway, /catch \(error\)/);
  assert.match(gateway, /createEmptyBridgeContext/);
});
