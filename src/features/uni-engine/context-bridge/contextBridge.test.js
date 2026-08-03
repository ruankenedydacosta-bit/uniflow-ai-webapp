// Uni Engine — Context Bridge (Fase 11, Bloco 2): testes.
//
// Cobre os 33 cenários mínimos do Bloco 2: gates (gateway ausente, turno
// antigo, rollout OFF/SHADOW/BLOCKED, ambiente, autorização, orchestrator,
// readiness, downstream, circuit breaker, confiança/risco, confirmação),
// capacidades (Style/Length/Question/Clarification/Routing), preservações
// (legado, Pending Action, confirmação), determinismo, serialização,
// deepFreeze, erro interno e ausência total de efeitos colaterais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEngineResponseContext,
  selectSafeEngineInfluence,
  CONTEXT_BRIDGE_FALLBACK_REASONS,
  ALLOWED_CONTEXT_INFLUENCES,
  CONTEXT_BRIDGE_POLICY,
  validateBridgeContext,
  isBridgeSafetyIntegral,
  isContextBridgeStatus,
} from './index.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildGatewayResult(overrides = {}) {
  return Object.freeze({
    version: '1.0.0',
    enabled: true,
    accepted: true,
    sameTurn: true,
    source: 'text',
    turnId: 'turn-1',
    normalizedInput: 'ola',
    engineContext: {},
    integrationResult: {},
    cognitiveSnapshot: {},
    rolloutSnapshot: {},
    operationalReadiness: {},
    fallbackUsed: false,
    fallbackReason: null,
    diagnostics: { engineUsed: true },
    safety: {},
    latencyMs: 1,
    legacyPreserved: true,
    serializable: true,
    ...overrides,
  });
}

function buildRolloutInternal() {
  return Object.freeze({
    effectiveStage: 'ROLLOUT_INTERNAL',
    userAuthorized: true,
    rolloutEnabled: true,
    sameTurn: true,
    circuitBreakerClosed: true,
    metadata: Object.freeze({ stage: 'ROLLOUT_INTERNAL', authorized: true }),
  });
}

function buildOrchestrator() {
  return Object.freeze({
    orchestratorStatus: 'ORCHESTRATED',
    sameTurn: true,
    legacyPreserved: true,
    layers: Object.freeze({
      application: Object.freeze({
        styleKey: 'simple',
        lengthBand: 'short',
        questionDecision: Object.freeze({
          shouldAsk: true,
          confidence: 0.9,
          missingInformation: ['amount'],
          junk: 'deve ser descartado',
        }),
        clarificationDecision: Object.freeze({
          shouldClarify: false,
          confidence: 0.85,
          ambiguousFields: [],
        }),
      }),
    }),
  });
}

const CONFIG = Object.freeze({
  contextBridgeEnabled: true,
  enabled: true,
  activationEnabled: true,
  integrationEnabled: true,
  applicationEnabled: true,
  rolloutEnabled: true,
  activationTestUserIds: ['tester'],
  activationCapabilities: Object.freeze({
    RESPONSE_STYLE_GUIDANCE: true,
    RESPONSE_LENGTH_GUIDANCE: true,
    QUESTION_GUIDANCE: true,
    CLARIFICATION_GUIDANCE: true,
    CONVERSATION_ROUTING: true,
  }),
});

function baseInput(overrides = {}) {
  return {
    gatewayResult: buildGatewayResult(),
    integrationResult: { applied: false, serializable: true },
    cognitiveSnapshot: buildOrchestrator(),
    rolloutSnapshot: buildRolloutInternal(),
    operationalReadiness: { integrationActive: false, orchestratorActive: true, rolloutActive: true },
    legacyResponse: { text: 'resposta legada' },
    pendingAction: { intent: 'expense', status: 'awaiting_details' },
    confirmationState: null,
    sameTurn: true,
    requestedInfluences: [...ALLOWED_CONTEXT_INFLUENCES],
    config: CONFIG,
    environment: 'development',
    userId: 'tester',
    isDev: true,
    selectedRoute: 'ROUTE_ANSWER',
    circuitBreakerOpen: false,
    context: { confidence: 0.9, risk: 'LOW' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1–5. Gates: gateway ausente / turno antigo / rollout OFF, SHADOW e BLOCKED.
// ---------------------------------------------------------------------------

test('1. gateway ausente → legado integral (influenceAllowed=false, legacyPreserved=true)', () => {
  const result = buildEngineResponseContext(baseInput({ gatewayResult: null }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'GATEWAY_ABSENT');
  assert.equal(result.legacyPreserved, true);
  assert.deepEqual(result.allowedInfluences, []);
});

test('2. turno antigo → legado integral (SAME_TURN_VIOLATED)', () => {
  const result = buildEngineResponseContext(baseInput({ sameTurn: false }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'SAME_TURN_VIOLATED');
  assert.equal(result.sameTurn, false);
  assert.equal(result.legacyPreserved, true);
});

test('2b. gateway com fallbackUsed=true não é aceito como mesmo turno', () => {
  const gateway = buildGatewayResult({ accepted: true, fallbackUsed: true });
  const result = buildEngineResponseContext(baseInput({ gatewayResult: gateway }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'SAME_TURN_VIOLATED');
});

test('3. rollout OFF → legado integral (ROLLOUT_OFF)', () => {
  const rollout = Object.freeze({ effectiveStage: 'ROLLOUT_OFF', userAuthorized: false, metadata: Object.freeze({ stage: 'ROLLOUT_OFF' }) });
  const result = buildEngineResponseContext(baseInput({ rolloutSnapshot: rollout }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'ROLLOUT_OFF');
  assert.equal(result.legacyPreserved, true);
});

test('4. rollout SHADOW → legado integral (ROLLOUT_SHADOW)', () => {
  const rollout = Object.freeze({ effectiveStage: 'ROLLOUT_SHADOW', userAuthorized: false, metadata: Object.freeze({ stage: 'ROLLOUT_SHADOW' }) });
  const result = buildEngineResponseContext(baseInput({ rolloutSnapshot: rollout }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'ROLLOUT_SHADOW');
  assert.equal(result.legacyPreserved, true);
});

test('5. rollout BLOCKED → legado integral (ROLLOUT_BLOCKED)', () => {
  const rollout = Object.freeze({ effectiveStage: 'ROLLOUT_BLOCKED', userAuthorized: false, metadata: Object.freeze({ stage: 'ROLLOUT_BLOCKED' }) });
  const result = buildEngineResponseContext(baseInput({ rolloutSnapshot: rollout }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'ROLLOUT_BLOCKED');
  assert.equal(result.legacyPreserved, true);
});

test('5b. rollout CANARY → legado integral (ROLLOUT_CANARY)', () => {
  const rollout = Object.freeze({ effectiveStage: 'ROLLOUT_CANARY', userAuthorized: true, metadata: Object.freeze({ stage: 'ROLLOUT_CANARY', authorized: true }) });
  const result = buildEngineResponseContext(baseInput({ rolloutSnapshot: rollout }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'ROLLOUT_CANARY');
});

test('5c. rollout INTERNAL sem usuário autorizado → USER_NOT_AUTHORIZED', () => {
  const rollout = Object.freeze({ effectiveStage: 'ROLLOUT_INTERNAL', userAuthorized: false, metadata: Object.freeze({ stage: 'ROLLOUT_INTERNAL', authorized: false }) });
  const result = buildEngineResponseContext(baseInput({ rolloutSnapshot: rollout }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'USER_NOT_AUTHORIZED');
});

// ---------------------------------------------------------------------------
// 6–10. INTERNAL autorizado permite as cinco influências.
// ---------------------------------------------------------------------------

test('6. INTERNAL autorizado permite Style (RESPONSE_STYLE_GUIDANCE)', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.equal(result.influenceAllowed, true);
  assert.ok(result.allowedInfluences.includes('RESPONSE_STYLE_GUIDANCE'));
  assert.equal(result.responseStyle, 'simple');
});

test('7. INTERNAL autorizado permite Length (RESPONSE_LENGTH_GUIDANCE)', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.equal(result.influenceAllowed, true);
  assert.ok(result.allowedInfluences.includes('RESPONSE_LENGTH_GUIDANCE'));
  assert.equal(result.responseLengthBand, 'short');
});

test('8. INTERNAL autorizado permite Question fechada (QUESTION_GUIDANCE)', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.equal(result.influenceAllowed, true);
  assert.ok(result.allowedInfluences.includes('QUESTION_GUIDANCE'));
  assert.deepEqual(result.questionDecision, {
    shouldAsk: true,
    confidence: 0.9,
    missingInformation: ['amount'],
  });
});

test('9. INTERNAL autorizado permite Clarification fechada (CLARIFICATION_GUIDANCE)', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.equal(result.influenceAllowed, true);
  assert.ok(result.allowedInfluences.includes('CLARIFICATION_GUIDANCE'));
  assert.equal(result.clarificationDecision.shouldClarify, false);
});

test('10. INTERNAL autorizado permite Routing válido (CONVERSATION_ROUTING)', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.equal(result.influenceAllowed, true);
  assert.ok(result.allowedInfluences.includes('CONVERSATION_ROUTING'));
  assert.equal(result.selectedRoute, 'ROUTE_ANSWER');
});

test('10b. rota desconhecida nunca aparece no resultado (sanitização)', () => {
  const result = buildEngineResponseContext(baseInput({ selectedRoute: 'ROUTE_HACK' }));
  assert.equal(result.selectedRoute, null);
});

test('10c. ambiente produção → ENVIRONMENT_NOT_ALLOWED', () => {
  const result = buildEngineResponseContext(baseInput({ environment: 'production' }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'ENVIRONMENT_NOT_ALLOWED');
});

// ---------------------------------------------------------------------------
// 11–12. Capabilities individuais.
// ---------------------------------------------------------------------------

test('11. capability desabilitada é bloqueada individualmente', () => {
  const config = {
    ...CONFIG,
    activationCapabilities: { ...CONFIG.activationCapabilities, QUESTION_GUIDANCE: false },
  };
  const result = buildEngineResponseContext(baseInput({ config }));
  assert.equal(result.influenceAllowed, true);
  assert.ok(result.blockedInfluences.includes('QUESTION_GUIDANCE'));
  assert.ok(!result.allowedInfluences.includes('QUESTION_GUIDANCE'));
  assert.equal(result.questionDecision, null);
});

test('12. capability desconhecida é bloqueada (nunca autorizada)', () => {
  const result = buildEngineResponseContext(baseInput({
    requestedInfluences: ['TOTALLY_UNKNOWN_CAPABILITY', 'RESPONSE_STYLE_GUIDANCE'],
  }));
  assert.equal(result.influenceAllowed, true);
  assert.ok(result.blockedInfluences.includes('TOTALLY_UNKNOWN_CAPABILITY'));
  assert.ok(result.allowedInfluences.includes('RESPONSE_STYLE_GUIDANCE'));
});

test('12b. influência bloqueada por política (FINANCIAL_EXECUTION) nunca é autorizada', () => {
  const result = buildEngineResponseContext(baseInput({
    requestedInfluences: ['FINANCIAL_EXECUTION'],
  }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'NO_ALLOWED_INFLUENCE');
  assert.ok(result.blockedInfluences.includes('FINANCIAL_EXECUTION'));
});

test('12c. todas as influências bloqueadas → NO_ALLOWED_INFLUENCE', () => {
  const config = {
    ...CONFIG,
    activationCapabilities: {
      RESPONSE_STYLE_GUIDANCE: false,
      RESPONSE_LENGTH_GUIDANCE: false,
      QUESTION_GUIDANCE: false,
      CLARIFICATION_GUIDANCE: false,
      CONVERSATION_ROUTING: false,
    },
  };
  const result = buildEngineResponseContext(baseInput({ config }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'NO_ALLOWED_INFLUENCE');
  assert.equal(result.allowedInfluences.length, 0);
});

// ---------------------------------------------------------------------------
// 13–15. Downstream, confirmação e Pending Action.
// ---------------------------------------------------------------------------

test('13. resultado downstream inválido → legado integral (DOWNSTREAM_RESULT_INVALID)', () => {
  const result = buildEngineResponseContext(baseInput({ integrationResult: null }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'DOWNSTREAM_RESULT_INVALID');
  assert.equal(result.legacyPreserved, true);
});

test('13b. engine não usada (diagnostics.engineUsed=false) → DOWNSTREAM_RESULT_INVALID', () => {
  const gateway = buildGatewayResult({ diagnostics: { engineUsed: false } });
  const result = buildEngineResponseContext(baseInput({ gatewayResult: gateway }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'DOWNSTREAM_RESULT_INVALID');
});

test('14. confirmação obrigatória vence qualquer influência', () => {
  const result = buildEngineResponseContext(baseInput({
    confirmationState: { pending: true },
  }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'CONFIRMATION_MANDATORY');
  assert.equal(result.confirmationPreserved, true);
  assert.equal(result.legacyPreserved, true);
});

test('14b. confirmação com erro também vence (nunca pulada)', () => {
  const result = buildEngineResponseContext(baseInput({
    confirmationState: { confirmationError: 'conta invalida' },
  }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'CONFIRMATION_MANDATORY');
  assert.equal(result.confirmationPreserved, true);
});

test('15. Pending Action preservada pela ponte', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.equal(result.pendingActionPreserved, true);
  const without = buildEngineResponseContext(baseInput({ pendingAction: null }));
  assert.equal(without.pendingActionPreserved, false);
});

// ---------------------------------------------------------------------------
// 16–18. Uma resposta por turno, nenhuma reexecução, nenhum texto factual.
// ---------------------------------------------------------------------------

test('16. uma resposta por turno: resultado determinístico e idempotente', () => {
  const first = buildEngineResponseContext(baseInput());
  const second = buildEngineResponseContext(baseInput());
  assert.deepEqual(first, second);
  const route = buildEngineResponseContext(baseInput({ selectedRoute: 'ROUTE_QUESTION' }));
  const routeAgain = buildEngineResponseContext(baseInput({ selectedRoute: 'ROUTE_QUESTION' }));
  assert.deepEqual(route, routeAgain);
});

test('17. nenhuma camada reexecutada: a ponte usa o snapshot, nunca o config', () => {
  const rollout = Object.freeze({
    effectiveStage: 'ROLLOUT_OFF',
    userAuthorized: false,
    metadata: Object.freeze({ stage: 'ROLLOUT_OFF' }),
  });
  const result = buildEngineResponseContext(baseInput({
    rolloutSnapshot: rollout,
    config: { ...CONFIG, rolloutEnabled: true },
  }));
  assert.equal(result.fallbackReason, 'ROLLOUT_OFF');
  assert.equal(result.influenceAllowed, false);
});

test('18. nenhuma resposta factual criada: o resultado não contém texto', () => {
  const result = buildEngineResponseContext(baseInput());
  const serialized = JSON.stringify(result);
  assert.ok(!('text' in result));
  assert.ok(!('finalText' in result));
  assert.ok(!serialized.includes('resposta legada'));
});

// ---------------------------------------------------------------------------
// 19–23. Nenhum efeito colateral (safety integralmente false).
// ---------------------------------------------------------------------------

test('19–23. safety integral: nenhum financeiro, memória, aprendizado, banco/RPC, TTS', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.equal(result.safety.financialExecution, false);
  assert.equal(result.safety.memoryWrite, false);
  assert.equal(result.safety.learningApplied, false);
  assert.equal(result.safety.databaseCalled, false);
  assert.equal(result.safety.rpcCalled, false);
  assert.equal(result.safety.ttsTriggered, false);
  assert.equal(result.safety.confirmationSkipped, false);
  assert.equal(result.safety.pendingActionModified, false);
  assert.equal(result.safety.responseModified, false);
  assert.equal(result.safety.persistenceWritten, false);
  assert.equal(isBridgeSafetyIntegral(result.safety), true);
});

// ---------------------------------------------------------------------------
// 24. Nenhum state React (a ponte é uma função pura).
// ---------------------------------------------------------------------------

test('24. módulo da ponte não importa React nem cria state', () => {
  const source = readFileSync(path.join(__dirname, 'buildEngineResponseContext.js'), 'utf8');
  assert.ok(!source.includes("from 'react'"));
  assert.ok(!source.includes('useState('));
  assert.ok(!source.includes('useReducer('));
  assert.ok(!source.includes('useCallback'));
});

// ---------------------------------------------------------------------------
// 25–26. Reset no novo turno e no catch — integração com UniChatPage.
// ---------------------------------------------------------------------------

test('25. novo turno zera o ref da ponte (sendText)', async () => {
  const page = await readSourceFile('UniChatPage.jsx');
  const sendBlock = sliceBetween(
    page,
    'lastEngineTurnRef.current = {',
    'const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;',
  );
  assert.match(sendBlock, /lastContextBridgeResultRef\.current = null;/);
  const bridgeReset = sendBlock.indexOf('lastContextBridgeResultRef.current = null;');
  const routingReset = sendBlock.indexOf('lastConversationRoutingSnapshotRef.current = null;');
  assert.ok(bridgeReset > routingReset, 'ponte é zerada junto com os demais refs');
});

test('26. catch do runEngineObservational zera o ref da ponte', async () => {
  const page = await readSourceFile('UniChatPage.jsx');
  const runBlock = sliceBetween(
    page,
    'const runEngineObservational = useCallback',
    'const applyEngineGuidanceToResponse = useCallback',
  );
  const catchStart = runBlock.indexOf('} catch {');
  const catchSlice = runBlock.slice(catchStart);
  assert.match(catchSlice, /lastContextBridgeResultRef\.current = null;/);
});

// ---------------------------------------------------------------------------
// 27–30. Serialização, deepFreeze, determinismo e erro interno.
// ---------------------------------------------------------------------------

test('27. resultado serializável (JSON round-trip, sem funções)', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.equal(result.serializable, true);
  const roundTrip = JSON.parse(JSON.stringify(result));
  assert.deepEqual(roundTrip, result);
  assert.equal(typeof roundTrip.allowedInfluences[0], 'string');
});

test('28. resultado profundamente congelado (deepFreeze)', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.safety), true);
  assert.equal(Object.isFrozen(result.allowedInfluences), true);
  assert.equal(Object.isFrozen(result.diagnostics), true);
  assert.throws(() => { 'use strict'; result.influenceAllowed = true; }, TypeError);
});

test('29. determinismo: mesma entrada → exatamente o mesmo resultado', () => {
  const input = baseInput();
  const a = buildEngineResponseContext(input);
  const b = buildEngineResponseContext(input);
  assert.deepStrictEqual(a, b);
  assert.equal(a.influenceAllowed, b.influenceAllowed);
});

test('30. erro interno → legado integral (ERROR_SAFE)', () => {
  const throwing = new Proxy(buildGatewayResult(), {
    get() {
      throw new Error('boom');
    },
  });
  const result = buildEngineResponseContext(baseInput({ gatewayResult: throwing }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'ERROR_SAFE');
  assert.equal(result.legacyPreserved, true);
  assert.equal(result.serializable, false);
});

// ---------------------------------------------------------------------------
// Gates extras da política.
// ---------------------------------------------------------------------------

test('ponte nasce desligada: config sem flag → BRIDGE_DISABLED', () => {
  const result = buildEngineResponseContext(baseInput({ config: {} }));
  assert.equal(result.enabled, false);
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'BRIDGE_DISABLED');
  assert.equal(result.legacyPreserved, true);
});

test('usuário não autorizado → USER_NOT_AUTHORIZED', () => {
  const result = buildEngineResponseContext(baseInput({ userId: 'stranger' }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'USER_NOT_AUTHORIZED');
});

test('orchestrator PARTIAL → ORCHESTRATOR_INVALID', () => {
  const orchestrator = { ...buildOrchestrator(), orchestratorStatus: 'PARTIAL' };
  const result = buildEngineResponseContext(baseInput({ cognitiveSnapshot: orchestrator }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'ORCHESTRATOR_INVALID');
});

test('orchestrator ausente → ORCHESTRATOR_INVALID', () => {
  const result = buildEngineResponseContext(baseInput({ cognitiveSnapshot: null }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'ORCHESTRATOR_INVALID');
});

test('readiness ausente → READINESS_INVALID', () => {
  const result = buildEngineResponseContext(baseInput({ operationalReadiness: null }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'READINESS_INVALID');
});

test('circuit breaker aberto → CIRCUIT_BREAKER_OPEN', () => {
  const result = buildEngineResponseContext(baseInput({ circuitBreakerOpen: true }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'CIRCUIT_BREAKER_OPEN');
});

test('confiança baixa → LOW_CONFIDENCE', () => {
  const result = buildEngineResponseContext(baseInput({ context: { confidence: 0.4, risk: 'LOW' } }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'LOW_CONFIDENCE');
});

test('risco alto → HIGH_RISK', () => {
  const result = buildEngineResponseContext(baseInput({ context: { confidence: 0.9, risk: 'HIGH' } }));
  assert.equal(result.influenceAllowed, false);
  assert.equal(result.fallbackReason, 'HIGH_RISK');
});

test('estilo e banda são sanitizados (somente valores fechados)', () => {
  const result = buildEngineResponseContext(baseInput({
    context: { responseStyle: 'hacked', responseLengthBand: 'gigante' },
  }));
  assert.equal(result.responseStyle, null);
  assert.equal(result.responseLengthBand, null);
  assert.equal(result.influenceAllowed, true);
});

test('decisões sanitizadas nunca contêm campos fora da allowlist', () => {
  const result = buildEngineResponseContext(baseInput());
  assert.ok(!('junk' in result.questionDecision));
  assert.ok(!('finalText' in result.questionDecision));
});

// ---------------------------------------------------------------------------
// selectSafeEngineInfluence (unidade) + contrato.
// ---------------------------------------------------------------------------

test('selectSafeEngineInfluence: lista vazia → nada autorizado', () => {
  const selection = selectSafeEngineInfluence({ requestedInfluences: [], config: CONFIG });
  assert.deepEqual(selection.allowedInfluences, []);
  assert.deepEqual(selection.blockedInfluences, []);
});

test('selectSafeEngineInfluence: influência duplicada não é autorizada duas vezes', () => {
  const selection = selectSafeEngineInfluence({
    requestedInfluences: ['RESPONSE_STYLE_GUIDANCE', 'RESPONSE_STYLE_GUIDANCE'],
    config: CONFIG,
  });
  assert.equal(selection.allowedInfluences.length, 1);
});

test('contrato: resultado válido passa em validateBridgeContext', () => {
  const result = buildEngineResponseContext(baseInput());
  const validation = validateBridgeContext(result);
  assert.equal(validation.valid, true, validation.errors.join(','));
});

test('contrato: enums fechados — motivos de fallback e status', () => {
  assert.ok(CONTEXT_BRIDGE_FALLBACK_REASONS.length >= 17);
  assert.ok(CONTEXT_BRIDGE_POLICY.allowedEnvironments.includes('development'));
  assert.equal(CONTEXT_BRIDGE_POLICY.allowProductionActivation, false);
  assert.ok(isContextBridgeStatus('ALLOWED'));
  assert.ok(!isContextBridgeStatus('RANDOM'));
});

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function readSourceFile(name) {
  return readFileSync(
    path.join(__dirname, '..', '..', 'uni-chat', name),
    'utf8',
  );
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1) return '';
  return source.slice(start, end);
}
