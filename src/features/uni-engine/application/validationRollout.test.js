// Uni Engine — Application (Parte 5, Bloco 5: validação controlada em DEV).
//
// Roll-out interno: valida, usando EXCLUSIVAMENTE a infraestrutura existente
// (Integration, Guidance, Observation, Decision Readiness, Capability
// Readiness, Execution Readiness, Application Layer e
// selectControlledVisibleResponse), que:
//
//   - STYLE e LENGTH funcionam quando TODOS os gates passam (finalText da
//     Application vira o texto visível);
//   - QUALQUER gate falho devolve imediatamente o texto legado;
//   - tudo desligado → comportamento legado idêntico ao HEAD;
//   - Question e Clarification continuam estritamente observacionais;
//   - nenhum efeito colateral ocorre (sem execução financeira, sem memória,
//     sem RPC, sem persistência, sem duplicidade de mensagem, sem Pending
//     Action alterada, sem TTS).
//
// Os helpers de teste habilitam TEMPORARIAMENTE em DEV: applicationEnabled,
// integrationEnabled, activationEnabled, usuário autorizado, STYLE e LENGTH.
// Nada de produção é alterado (flags continuam desligadas por padrão).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { runUniEngineIntegration } from '../integration/runUniEngineIntegration.js';
import { buildGuidanceSnapshot } from '../guidance/buildGuidanceSnapshot.js';
import { buildObservationSnapshot } from '../observation/buildObservationSnapshot.js';
import { buildDecisionReadinessSnapshot } from '../readiness/buildDecisionReadinessSnapshot.js';
import { buildCapabilityReadinessSnapshot } from '../capability-readiness/buildCapabilityReadinessSnapshot.js';
import { buildExecutionReadinessSnapshot } from '../execution-readiness/buildExecutionReadinessSnapshot.js';
import { runControlledGuidanceApplication } from './runControlledGuidanceApplication.js';
import { selectControlledVisibleResponse } from './selectControlledVisibleResponse.js';
import {
  buildEngineResult,
  buildActiveDecision,
} from '../integration/testFixtures.js';

const LEGACY_TEXT = 'Gastei R$ 50,00 no mercado com o cartão de crédito.';
const OLD_TURN_TEXT = 'Mensagem de um turno ANTERIOR que não pode vazar.';
const LONG_TEXT = 'Não consegui identificar o saldo atual dessa conta para calcular o ajuste. Tente novamente em instantes.';
const SHORT_TEXT = 'Não consegui identificar o saldo dessa conta. Tente novamente em instantes.';

// ---------------------------------------------------------------------------
// Helpers de teste do Bloco 5 (roll-out interno em DEV).
// ---------------------------------------------------------------------------

// Habilita temporariamente: engine, integration, activation, application,
// usuário autorizado, STYLE e LENGTH — exclusivamente para desenvolvimento.
function buildRolloutConfig(env = {}) {
  return createUniEngineConfig({
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
      ...env,
    },
  });
}

function buildRolloutContext(overrides = {}) {
  return {
    isDev: true,
    environment: 'development',
    userId: 'test-user-1',
    telemetryAdapter: null,
    activationDecisions: [],
    confidence: 0.9,
    risk: 'LOW',
    ...overrides,
  };
}

function buildRolloutEngine(capabilities = ['RESPONSE_STYLE_GUIDANCE'], overrides = {}) {
  return buildEngineResult({
    decisionLayer: {
      decisionType: 'respond',
      nextDecisionType: 'respond',
      risk: 'LOW',
      confidence: 0.9,
    },
    activation: {
      enabled: true,
      decisions: capabilities.map((capability) => buildActiveDecision(capability)),
    },
    ...overrides,
  });
}

// Fluxo EXATAMENTE como o UniChatPage executa (runEngineObservational):
// integration → guidance → observation → decision readiness → capability
// readiness → execution readiness → application → seleção visível.
function runDevRolloutFlow({
  config = buildRolloutConfig(),
  engine = buildRolloutEngine(),
  legacyText = LEGACY_TEXT,
  context = buildRolloutContext(),
  selectorOverrides = {},
} = {}) {
  const legacy = { text: legacyText, responseType: 'query', conversationStyle: 'normal' };
  const integrationSnapshot = runUniEngineIntegration({
    config,
    legacy,
    engineResult: engine,
    context: {
      environment: 'development',
      userId: 'test-user-1',
      isDev: true,
      telemetryAdapter: null,
    },
  });
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy,
    engineResult: engine,
    context: { isDev: true, environment: 'development' },
  });
  const observationSnapshot = buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engine?.activation ?? null,
    context: { isDev: true, environment: 'development' },
  });
  const decisionReadinessSnapshot = buildDecisionReadinessSnapshot({
    observationSnapshot,
    decisionSnapshot: engine?.decisionLayer ?? null,
    context: { isDev: true, environment: 'development' },
  });
  const capabilityReadinessSnapshot = buildCapabilityReadinessSnapshot({
    observationSnapshot,
    decisionReadinessSnapshot,
    context: { isDev: true, environment: 'development' },
  });
  const executionReadinessSnapshot = buildExecutionReadinessSnapshot({
    observationSnapshot,
    decisionReadinessSnapshot,
    capabilityReadinessSnapshot,
    context: { isDev: true, environment: 'development' },
  });
  const applicationResult = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    guidance: guidanceSnapshot ?? null,
    context,
  });
  const executionReady = !(executionReadinessSnapshot?.executionBlockedReasons ?? [])
    .includes('CIRCUIT_BREAKER_OPEN');
  const visible = selectControlledVisibleResponse({
    legacyText,
    applicationResult,
    config,
    environment: 'development',
    authorized: true,
    executionReady,
    circuitBreakerOpen: false,
    confidence: 0.9,
    risk: 'LOW',
    ...selectorOverrides,
  });
  return {
    integrationSnapshot,
    guidanceSnapshot,
    observationSnapshot,
    decisionReadinessSnapshot,
    capabilityReadinessSnapshot,
    executionReadinessSnapshot,
    applicationResult,
    visible,
  };
}

// ---------------------------------------------------------------------------
// Comportamento quando TUDO está desligado
// ---------------------------------------------------------------------------

test('V-1: tudo desligado → application nem roda (applied=false) e a resposta é o texto legado idêntico', () => {
  const allOff = createUniEngineConfig({ env: {} });
  const { applicationResult, visible } = runDevRolloutFlow({ config: allOff });
  assert.equal(applicationResult.applied, false);
  assert.equal(applicationResult.finalText, LEGACY_TEXT);
  assert.equal(applicationResult.originalText, LEGACY_TEXT);
  assert.equal(applicationResult.factualContentPreserved, true);
  assert.equal(visible, LEGACY_TEXT);
});

test('V-2: integration off → nenhuma ativação possível → texto legado', () => {
  const config = buildRolloutConfig({ VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'false' });
  const { integrationSnapshot, visible } = runDevRolloutFlow({ config });
  assert.equal(integrationSnapshot.applied, false);
  assert.equal(visible, LEGACY_TEXT);
});

test('V-3: activation off → nenhuma decisão de activation → texto legado', () => {
  const config = buildRolloutConfig({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'false' });
  const { applicationResult, visible } = runDevRolloutFlow({ config });
  assert.equal(applicationResult.appliedCapabilities.length, 0);
  assert.equal(visible, LEGACY_TEXT);
});

test('V-4: application off → application não aplica nada → texto legado', () => {
  const config = buildRolloutConfig({ VITE_UNI_ENGINE_APPLICATION_ENABLED: 'false' });
  const { applicationResult, visible } = runDevRolloutFlow({ config });
  assert.equal(applicationResult.applied, false);
  assert.equal(applicationResult.fallbackUsed, true);
  assert.equal(visible, LEGACY_TEXT);
});

test('V-5: usuário NÃO autorizado → texto legado mesmo com tudo ligado', () => {
  const config = buildRolloutConfig({ VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'outro-usuario' });
  const { applicationResult, visible } = runDevRolloutFlow({ config });
  assert.equal(applicationResult.applied, false);
  assert.equal(visible, LEGACY_TEXT);
});

// ---------------------------------------------------------------------------
// Gates falhos → legado imediato
// ---------------------------------------------------------------------------

test('V-6: confidence baixa (0.4) → texto legado', () => {
  const { applicationResult, visible } = runDevRolloutFlow({
    selectorOverrides: { confidence: 0.4 },
  });
  assert.equal(applicationResult.applied, true);
  assert.equal(visible, LEGACY_TEXT);
});

test('V-7: circuit breaker aberto → texto legado', () => {
  const { visible } = runDevRolloutFlow({
    selectorOverrides: { circuitBreakerOpen: true },
  });
  assert.equal(visible, LEGACY_TEXT);
});

test('V-7b: Execution Readiness bloqueando (CIRCUIT_BREAKER_OPEN) → texto legado', () => {
  const flow = runDevRolloutFlow();
  const blockingSnapshot = buildExecutionReadinessSnapshot({
    observationSnapshot: flow.observationSnapshot,
    decisionReadinessSnapshot: {
      version: '1.0',
      mode: 'observational',
      decisionAvailable: true,
      decisionStatus: 'ASK',
      confidence: 0.9,
      risk: 'LOW',
      missingInformation: ['amount'],
      circuitBreakerStatus: { open: true, openCapabilities: ['RESPONSE_STYLE_GUIDANCE'] },
    },
    capabilityReadinessSnapshot: flow.capabilityReadinessSnapshot,
    context: { isDev: true, environment: 'development' },
  });
  assert.ok(blockingSnapshot.executionBlockedReasons.includes('CIRCUIT_BREAKER_OPEN'));
  const executionReady = !blockingSnapshot.executionBlockedReasons.includes('CIRCUIT_BREAKER_OPEN');
  assert.equal(executionReady, false);
  const visible = selectControlledVisibleResponse({
    legacyText: LEGACY_TEXT,
    applicationResult: flow.applicationResult,
    config: buildRolloutConfig(),
    environment: 'development',
    authorized: true,
    executionReady,
    circuitBreakerOpen: false,
    confidence: 0.9,
    risk: 'LOW',
  });
  assert.equal(visible, LEGACY_TEXT);
});

test('V-8: risco alto (HIGH) → texto legado', () => {
  const { visible } = runDevRolloutFlow({
    selectorOverrides: { risk: 'HIGH' },
  });
  assert.equal(visible, LEGACY_TEXT);
});

test('V-9: fallback da application (confidence baixa no contexto) → applied=false, fallbackUsed=true, texto legado', () => {
  const context = buildRolloutContext({ confidence: 0.4 });
  const { applicationResult, visible } = runDevRolloutFlow({ context });
  assert.equal(applicationResult.applied, false);
  assert.equal(applicationResult.fallbackUsed, true);
  assert.equal(applicationResult.finalText, LEGACY_TEXT);
  assert.equal(visible, LEGACY_TEXT);
});

test('V-10: capability proibida (FINANCIAL_EXECUTION) em appliedCapabilities → texto legado', () => {
  const { visible } = runDevRolloutFlow({
    selectorOverrides: {
      applicationResult: {
        ...runDevRolloutFlow().applicationResult,
        appliedCapabilities: ['RESPONSE_STYLE_GUIDANCE', 'FINANCIAL_EXECUTION'],
      },
    },
  });
  assert.equal(visible, LEGACY_TEXT);
});

test('V-10b: capability proibida na Activation NUNCA é aplicada → application bloqueada → texto legado', () => {
  const engine = buildRolloutEngine(['RESPONSE_STYLE_GUIDANCE'], {
    activation: {
      enabled: true,
      decisions: [buildActiveDecision('FINANCIAL_EXECUTION')],
    },
  });
  const { applicationResult, visible } = runDevRolloutFlow({ engine });
  assert.equal(applicationResult.applied, false);
  assert.equal(applicationResult.fallbackUsed, true);
  assert.ok(applicationResult.blockedCapabilities.includes('RESPONSE_STYLE_GUIDANCE'));
  assert.equal(visible, LEGACY_TEXT);
});

// ---------------------------------------------------------------------------
// STYLE e LENGTH funcionando
// ---------------------------------------------------------------------------

test('V-11: apenas STYLE ligado → application aplica o estilo (banda; o texto nunca é reescrito)', () => {
  const { applicationResult, visible } = runDevRolloutFlow({
    engine: buildRolloutEngine(['RESPONSE_STYLE_GUIDANCE']),
  });
  assert.equal(applicationResult.applied, true);
  assert.equal(applicationResult.styleApplied, true);
  assert.ok(applicationResult.appliedCapabilities.includes('RESPONSE_STYLE_GUIDANCE'));
  assert.equal(applicationResult.finalText, LEGACY_TEXT);
  assert.equal(applicationResult.factualContentPreserved, true);
  assert.equal(visible, applicationResult.finalText);
});

test('V-12: apenas LENGTH ligado → finalText (forma curta segura) aparece na resposta', () => {
  const { applicationResult, visible } = runDevRolloutFlow({
    engine: buildRolloutEngine(['RESPONSE_LENGTH_GUIDANCE']),
    legacyText: LONG_TEXT,
  });
  assert.ok(applicationResult.appliedCapabilities.includes('RESPONSE_LENGTH_GUIDANCE'));
  assert.equal(applicationResult.applied, true);
  assert.equal(applicationResult.finalText, SHORT_TEXT);
  assert.equal(visible, SHORT_TEXT);
});

test('V-13: STYLE + LENGTH ligados → finalText (forma curta segura) aparece na resposta', () => {
  const { applicationResult, visible } = runDevRolloutFlow({
    engine: buildRolloutEngine(['RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE']),
    legacyText: LONG_TEXT,
  });
  assert.deepEqual([...applicationResult.appliedCapabilities].sort(), [
    'RESPONSE_LENGTH_GUIDANCE',
    'RESPONSE_STYLE_GUIDANCE',
  ]);
  assert.equal(applicationResult.finalText, SHORT_TEXT);
  assert.equal(visible, SHORT_TEXT);
});

// ---------------------------------------------------------------------------
// Question e Clarification continuam observacionais
// ---------------------------------------------------------------------------

test('V-14: Question continua observacional — questionDecision existe, NENHUM texto de pergunta é gerado', () => {
  const engine = buildRolloutEngine(['QUESTION_GUIDANCE'], {
    comparison: {
      missingFields: ['account'],
      agreementMetrics: { divergenceCount: 0 },
    },
  });
  const config = buildRolloutConfig({ VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true' });
  const { applicationResult, visible } = runDevRolloutFlow({ config, engine });
  assert.notEqual(applicationResult.questionDecision, null);
  assert.equal(visible, LEGACY_TEXT);
  assert.ok(!visible.includes('?'));
  assert.ok(!visible.includes('conta'));
});

test('V-15: Clarification continua observacional — clarificationDecision existe, NENHUM texto de esclarecimento é gerado', () => {
  const engine = buildRolloutEngine(['CLARIFICATION_GUIDANCE'], {
    classification: { primaryIntent: 'register_expense', ambiguities: [{ type: 'account' }], confidence: 0.9 },
  });
  const config = buildRolloutConfig({ VITE_UNI_ENGINE_CAP_CLARIFICATION_GUIDANCE: 'true' });
  const { applicationResult, visible } = runDevRolloutFlow({ config, engine });
  assert.notEqual(applicationResult.clarificationDecision, null);
  assert.equal(visible, LEGACY_TEXT);
  assert.ok(!visible.includes('Qual foi o valor'));
});

// ---------------------------------------------------------------------------
// Zero efeitos colaterais
// ---------------------------------------------------------------------------

test('V-16: nenhuma Pending Action muda (safety.pendingActionModified=false em todos os cenários)', () => {
  const applied = runDevRolloutFlow();
  const rejected = runDevRolloutFlow({ selectorOverrides: { authorized: false } });
  const allOff = runDevRolloutFlow({ config: createUniEngineConfig({ env: {} }) });
  for (const flow of [applied, rejected, allOff]) {
    assert.equal(flow.applicationResult.safety.pendingActionModified, false);
  }
});

test('V-17: nenhuma memória muda (safety.memoryWrite=false em todos os cenários)', () => {
  const applied = runDevRolloutFlow();
  const rejected = runDevRolloutFlow({ selectorOverrides: { authorized: false } });
  const allOff = runDevRolloutFlow({ config: createUniEngineConfig({ env: {} }) });
  for (const flow of [applied, rejected, allOff]) {
    assert.equal(flow.applicationResult.safety.memoryWrite, false);
    assert.equal(flow.applicationResult.safety.learningApplied, false);
  }
});

test('V-18: nenhuma execução financeira (safety.financialExecution=false; resultado sem campo de execução)', () => {
  const applied = runDevRolloutFlow();
  const rejected = runDevRolloutFlow({ selectorOverrides: { authorized: false } });
  for (const flow of [applied, rejected]) {
    assert.equal(flow.applicationResult.safety.financialExecution, false);
    assert.equal(flow.applicationResult.safety.confirmationSkipped, false);
    assert.ok(!('execution' in flow.applicationResult));
  }
});

test('V-19: nenhuma chamada RPC (resultado é dado puro, sem efeitos de rede)', () => {
  const flow = runDevRolloutFlow();
  const json = JSON.stringify(flow.applicationResult);
  assert.doesNotThrow(() => json);
  assert.ok(!json.includes('rpc'));
  assert.equal(flow.visible, flow.applicationResult.finalText);
});

test('V-20: nenhuma persistência (resultado e texto visível são apenas dados em memória)', () => {
  const flow = runDevRolloutFlow();
  assert.equal(typeof flow.visible, 'string');
  assert.doesNotThrow(() => JSON.stringify(flow.applicationResult));
  assert.ok(!JSON.stringify(flow.applicationResult).includes('localStorage'));
});

test('V-21: nenhuma duplicação de mensagem (a seleção devolve EXATAMENTE UMA string)', () => {
  const applied = runDevRolloutFlow();
  const rejected = runDevRolloutFlow({ selectorOverrides: { authorized: false } });
  assert.equal(typeof applied.visible, 'string');
  assert.equal(typeof rejected.visible, 'string');
  assert.equal(applied.visible, applied.applicationResult.finalText);
  assert.equal(rejected.visible, LEGACY_TEXT);
});

// ---------------------------------------------------------------------------
// Turno: mesmo turno aceito, turno antigo rejeitado
// ---------------------------------------------------------------------------

test('V-22: mesmo turno — o resultado da MESMA execução é usado imediatamente na seleção', () => {
  const flow = runDevRolloutFlow();
  const applicationResult = runControlledGuidanceApplication({
    config: buildRolloutConfig(),
    legacy: { text: LEGACY_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildRolloutEngine(['RESPONSE_STYLE_GUIDANCE']),
    guidance: flow.guidanceSnapshot ?? null,
    context: buildRolloutContext(),
  });
  const visible = selectControlledVisibleResponse({
    legacyText: LEGACY_TEXT,
    applicationResult,
    config: buildRolloutConfig(),
    environment: 'development',
    authorized: true,
    executionReady: true,
    circuitBreakerOpen: false,
    confidence: 0.9,
    risk: 'LOW',
  });
  assert.equal(applicationResult.originalText, LEGACY_TEXT);
  assert.equal(visible, applicationResult.finalText);
});

test('V-23: turno antigo rejeitado — resultado de outro turno (originalText diferente) nunca vaza', () => {
  const staleFlow = runDevRolloutFlow({ legacyText: OLD_TURN_TEXT });
  const staleResult = staleFlow.applicationResult;
  assert.equal(staleResult.originalText, OLD_TURN_TEXT);
  const visible = selectControlledVisibleResponse({
    legacyText: LEGACY_TEXT,
    applicationResult: staleResult,
    config: buildRolloutConfig(),
    environment: 'development',
    authorized: true,
    executionReady: true,
    circuitBreakerOpen: false,
    confidence: 0.9,
    risk: 'LOW',
  });
  assert.equal(visible, LEGACY_TEXT);
});

test('V-24: fallback retorna legado — finalText == originalText e o texto visível é o legado', () => {
  const context = buildRolloutContext({ confidence: 0.4 });
  const { applicationResult, visible } = runDevRolloutFlow({ context });
  assert.equal(applicationResult.fallbackUsed, true);
  assert.equal(applicationResult.finalText, LEGACY_TEXT);
  assert.equal(applicationResult.originalText, LEGACY_TEXT);
  assert.equal(visible, LEGACY_TEXT);
  assert.equal(applicationResult.factualContentPreserved, true);
});

test('V-25: tudo ligado (controle positivo) — finalText aparece e o pipeline completo é determinístico', () => {
  const engine = buildRolloutEngine(['RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE']);
  const first = runDevRolloutFlow({ engine, legacyText: LONG_TEXT });
  const second = runDevRolloutFlow({ engine, legacyText: LONG_TEXT });
  assert.equal(first.applicationResult.applied, true);
  assert.equal(first.visible, SHORT_TEXT);
  assert.equal(second.visible, SHORT_TEXT);
  // Determinismo: igualdade total exceto latencyMs (medida de tempo real).
  const stable = (result) => {
    const copy = JSON.parse(JSON.stringify(result));
    copy.latencyMs = 0;
    return JSON.stringify(copy);
  };
  assert.equal(stable(second.applicationResult), stable(first.applicationResult));
});
