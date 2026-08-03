// Uni Engine — Application (Parte 5, Bloco 3: primeira ativação controlada).
//
// Testes da camada de APLICAÇÃO: somente RESPONSE_STYLE_GUIDANCE e
// RESPONSE_LENGTH_GUIDANCE podem ser aplicadas, exclusivamente em DEV, com
// Integration + Activation habilitadas e usuário autorizado. QUESTION_GUIDANCE
// (Bloco 2) e CLARIFICATION_GUIDANCE (Bloco 3) produzem APENAS decisões
// observacionais (questionDecision / clarificationDecision) — a Uni nunca
// gera pergunta/esclarecimento automaticamente. Flags desligadas por padrão;
// qualquer falha → fallback ao texto legado (applied=false,
// finalText=originalText, factualContentPreserved=true). NUNCA aplica
// Question/Clarification nesta parte, NUNCA executa, NUNCA escreve memória,
// NUNCA aprende, NUNCA altera Pending Actions e NUNCA dispara TTS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { runControlledGuidanceApplication } from './runControlledGuidanceApplication.js';
import {
  validateApplicationResult,
  isSerializableApplicationResult,
  createApplicationSafety,
} from './applicationContracts.js';
import {
  ALLOWED_APPLICATION_CAPABILITIES,
  BLOCKED_APPLICATION_CAPABILITIES,
  isApplicationStatus,
  isApplicationFallbackReason,
  QUESTION_PRIORITIES,
  QUESTION_REASONS,
  isQuestionPriority,
  isQuestionReason,
  CLARIFICATION_PRIORITIES,
  CLARIFICATION_REASONS,
  isClarificationPriority,
  isClarificationReason,
} from './applicationTypes.js';
import {
  shouldUseApplicationFallback,
  isApplicationEnabledByPolicy,
  isQuestionCapabilityEnabledByConfig,
  isQuestionConfidenceAllowedByPolicy,
  isClarificationCapabilityEnabledByConfig,
  isClarificationConfidenceAllowedByPolicy,
} from './applicationPolicy.js';
import { redactApplicationTelemetry } from './telemetry/redactApplicationTelemetry.js';
import {
  validateQuestionDecision,
  createQuestionDecision,
  QUESTION_DECISION_FIELDS,
  validateClarificationDecision,
  createClarificationDecision,
  CLARIFICATION_DECISION_FIELDS,
} from './applicationContracts.js';
import {
  buildActiveDecision,
  buildEngineResult,
  legacyClarification,
  EXPENSE_ACCOUNT_QUESTION,
} from '../integration/testFixtures.js';

// Textos do par long→short seguro (integrationPolicy.js).
const LONG_TEXT = 'Não consegui identificar o saldo atual dessa conta para calcular o ajuste. Tente novamente em instantes.';
const SHORT_TEXT = 'Não consegui identificar o saldo dessa conta. Tente novamente em instantes.';

const RESPONSE_TEXT = 'Gastei R$ 50,00 no mercado com o cartão de crédito.';

// Template fechado de esclarecimento (CLARIFICATION_TEMPLATES.amount_missing).
const CLARIFICATION_TEXT = 'Qual foi o valor?';

function buildApplicationConfig(env = {}) {
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

function buildContext(overrides = {}) {
  return {
    isDev: true,
    environment: 'development',
    userId: 'test-user-1',
    ...overrides,
  };
}

function buildEngineWithDecision(capability, overrides = {}) {
  const engine = buildEngineResult({
    decisionLayer: { decisionType: 'respond', nextDecisionType: 'respond', risk: 'LOW', confidence: 0.9 },
    activation: { enabled: true, decisions: [buildActiveDecision(capability)] },
  });
  if (overrides.engine) {
    Object.assign(engine, overrides.engine);
  }
  return engine;
}

// ---------------------------------------------------------------------------
// Flags e gates
// ---------------------------------------------------------------------------

test('A-1: applicationEnabled=false → fallback ao texto legado (applied=false)', () => {
  const config = buildApplicationConfig({ VITE_UNI_ENGINE_APPLICATION_ENABLED: 'false' });
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.finalText, RESPONSE_TEXT);
  assert.equal(result.originalText, RESPONSE_TEXT);
  assert.equal(result.factualContentPreserved, true);
  assert.equal(result.appliedCapabilities.length, 0);
  assert.equal(isApplicationStatus(result.status), true);
  assert.equal(isApplicationFallbackReason(result.fallbackReason), true);
});

test('A-2: flag APPLICATION ausente → nunca ativa (comportamento all-off idêntico ao HEAD)', () => {
  const config = createUniEngineConfig({ env: {} });
  assert.equal(config.enabled, false);
  assert.equal(config.applicationEnabled, false);
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.finalText, RESPONSE_TEXT);
  assert.equal(result.status, 'FALLBACK');
});

test('A-3: production → bloqueado (ENVIRONMENT_NOT_ALLOWED)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext({ isDev: false, environment: 'production' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'ENVIRONMENT_NOT_ALLOWED');
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-4: usuário não autorizado → bloqueado (USER_NOT_AUTHORIZED)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext({ userId: 'other-user' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'USER_NOT_AUTHORIZED');
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-5: capability STYLE desligada → capacidade não ativa → fallback', () => {
  const config = buildApplicationConfig({ VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'false' });
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('RESPONSE_STYLE_GUIDANCE')] },
    }),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-6: capability LENGTH desligada → capacidade não ativa → fallback', () => {
  const config = buildApplicationConfig({ VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE: 'false' });
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: LONG_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineWithDecision('RESPONSE_LENGTH_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.lengthApplied, false);
  assert.equal(result.finalText, LONG_TEXT);
});

test('A-7: confiança baixa → bloqueado (LOW_CONFIDENCE)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext({ confidence: 0.4 }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'LOW_CONFIDENCE');
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-8: risco alto → bloqueado (HIGH_RISK)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext({ risk: 'HIGH' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'HIGH_RISK');
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-9: circuit breaker aberto → bloqueado (CIRCUIT_BREAKER_OPEN)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext({ circuitBreakerOpen: true }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'CIRCUIT_BREAKER_OPEN');
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-10: activation desligada → application desligada pela cascata do config', () => {
  const config = buildApplicationConfig({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'false' });
  assert.equal(config.applicationEnabled, false);
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-11: integration desligada → application desligada pela cascata do config', () => {
  const config = buildApplicationConfig({ VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'false' });
  assert.equal(config.applicationEnabled, false);
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-12: motor desligado → application desligada pela cascata do config', () => {
  const config = buildApplicationConfig({ VITE_UNI_ENGINE_ENABLED: 'false' });
  assert.equal(config.applicationEnabled, false);
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-13: text ausente/inválido → fallback (INVALID_LEGACY_TEXT)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: null,
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'INVALID_LEGACY_TEXT');
  assert.equal(result.finalText, null);
});

// ---------------------------------------------------------------------------
// Aplicação real de STYLE
// ---------------------------------------------------------------------------

test('A-14: estilo simple aplicado (sem preferência persistida → sugestão do motor)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query', conversationStyle: null },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.equal(result.styleApplied, true);
  assert.equal(result.appliedCapabilities.includes('RESPONSE_STYLE_GUIDANCE'), true);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.factualContentPreserved, true);
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-15: preferência persistida normal respeitada (SEMPRE vence a sugestão)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.equal(result.styleApplied, true);
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-16: preferência persistida detailed respeitada (detalhado preservado)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query', conversationStyle: 'detailed' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.equal(result.styleApplied, true);
  assert.equal(result.factualContentPreserved, true);
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-17: responseType confirmation (protegido) → estilo não altera texto', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: 'Movimentação confirmada com sucesso.', responseType: 'confirmation' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.equal(result.styleApplied, true);
  assert.equal(result.factualContentPreserved, true);
  assert.equal(result.finalText, 'Movimentação confirmada com sucesso.');
});

// ---------------------------------------------------------------------------
// Aplicação real de LENGTH
// ---------------------------------------------------------------------------

test('A-18: comprimento curto aplicado via forma curta segura', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: LONG_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineWithDecision('RESPONSE_LENGTH_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.equal(result.lengthApplied, true);
  assert.equal(result.appliedCapabilities.includes('RESPONSE_LENGTH_GUIDANCE'), true);
  assert.equal(result.finalText, SHORT_TEXT);
  assert.equal(result.factualContentPreserved, true);
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.fallbackUsed, false);
});

test('A-19: preferência detailed NUNCA é encurtada', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: LONG_TEXT, responseType: 'query', conversationStyle: 'detailed' },
    engineResult: buildEngineWithDecision('RESPONSE_LENGTH_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.lengthApplied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.finalText, LONG_TEXT);
  assert.equal(result.factualContentPreserved, true);
});

test('A-20: texto sem forma curta segura → não encurta (fallback preserva texto)', () => {
  const config = buildApplicationConfig();
  const text = 'Analisando seus últimos 30 dias: gastos de R$ 2.100,00 e receitas de R$ 3.400,00.';
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineWithDecision('RESPONSE_LENGTH_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.lengthApplied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.finalText, text);
  assert.equal(result.factualContentPreserved, true);
});

// ---------------------------------------------------------------------------
// Fatos financeiros e segurança
// ---------------------------------------------------------------------------

test('A-21: fatos financeiros (valor/conta/categoria/data/status) são preservados', () => {
  const config = buildApplicationConfig();
  const financialText = 'Foi lançado R$ 1.234,56 na conta Corrente (Banco do Brasil) na categoria Alimentação em 05/01/2026. Status: confirmado.';
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: financialText, responseType: 'query', conversationStyle: 'detailed' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.factualContentPreserved, true);
  assert.equal(result.finalText, financialText);
  assert.ok(result.finalText.includes('R$ 1.234,56'));
  assert.ok(result.finalText.includes('Corrente'));
  assert.ok(result.finalText.includes('Alimentação'));
  assert.ok(result.finalText.includes('05/01/2026'));
  assert.ok(result.finalText.includes('confirmado'));
});

test('A-22: confirmação financeira nunca é pulada', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: 'Confirma o pagamento de R$ 250,00 para Luz & Energia?', responseType: 'confirmation' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.equal(result.safety.confirmationSkipped, false);
  assert.equal(result.factualContentPreserved, true);
  assert.ok(result.finalText.includes('Confirma'));
});

test('A-23: nenhuma ação financeira é executada pela aplicação', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.safety.financialExecution, false);
});

test('A-24: nenhuma memória é escrita pela aplicação', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.safety.memoryWrite, false);
});

test('A-25: nenhum aprendizado é aplicado pela aplicação', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.safety.learningApplied, false);
});

test('A-26: nenhuma Pending Action é modificada pela aplicação', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.safety.pendingActionModified, false);
});

test('A-27: nenhuma chamada a banco/database é feita pela aplicação', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.safety.databaseCalled, false);
});

test('A-28: nenhum TTS é disparado pela aplicação', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(result.safety.ttsTriggeredByApplication, false);
});

test('A-29: factualContentPreserved é SEMPRE true (aplicado e fallback)', () => {
  const config = buildApplicationConfig();
  const applied = runControlledGuidanceApplication({
    config,
    legacy: { text: LONG_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineWithDecision('RESPONSE_LENGTH_GUIDANCE'),
    context: buildContext(),
  });
  const blocked = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context: buildContext({ environment: 'production' }),
  });
  assert.equal(applied.factualContentPreserved, true);
  assert.equal(blocked.factualContentPreserved, true);
});

test('A-30: createApplicationSafety é fechado e seguro por padrão', () => {
  const safety = createApplicationSafety({});
  assert.deepEqual(safety, {
    factualContentPreserved: true,
    financialExecution: false,
    memoryWrite: false,
    learningApplied: false,
    confirmationSkipped: false,
    pendingActionModified: false,
    databaseCalled: false,
    ttsTriggeredByApplication: false,
  });
});

// ---------------------------------------------------------------------------
// Capacidades proibidas e não autorizadas
// ---------------------------------------------------------------------------

test('A-31: capabilities proibidas NUNCA são aplicadas (bloqueio absoluto)', () => {
  assert.deepEqual(
    BLOCKED_APPLICATION_CAPABILITIES,
    ['RESPONSE_CONTENT_INFLUENCE', 'MEMORY_WRITE', 'FINANCIAL_EXECUTION', 'LEARNING_APPLICATION'],
  );
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('FINANCIAL_EXECUTION')] },
    }),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.appliedCapabilities.includes('FINANCIAL_EXECUTION'), false);
  assert.equal(result.finalText, RESPONSE_TEXT);
  assert.equal(result.safety.financialExecution, false);
});

test('A-32: só as capacidades da Parte 5 podem ser aplicadas/decididas', () => {
  assert.deepEqual(
    ALLOWED_APPLICATION_CAPABILITIES,
    ['RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE', 'QUESTION_GUIDANCE', 'CLARIFICATION_GUIDANCE'],
  );
});

test('A-33: CLARIFICATION e QUESTION só decidem com flag explícita (nunca texto)', () => {
  const config = buildApplicationConfig();
  // CLARIFICATION_GUIDANCE: sem flag de capacidade → nunca ativa (nada decide).
  const clarificationOff = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext(),
  });
  assert.equal(clarificationOff.applied, false);
  assert.equal(clarificationOff.clarificationDecision, null);
  assert.equal(clarificationOff.finalText, CLARIFICATION_TEXT);
  // QUESTION_GUIDANCE: sem flag de capacidade → também não ativa (nada decide).
  const questionOff = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: buildContext(),
  });
  assert.equal(questionOff.applied, false);
  assert.equal(questionOff.questionDecision, null);
  assert.equal(questionOff.finalText, RESPONSE_TEXT);
});

test('A-34: decisão SHADOW_ONLY da Activation → aplicação não contorna (não aplica)', () => {
  const config = buildApplicationConfig();
  const shadowDecision = buildActiveDecision('RESPONSE_STYLE_GUIDANCE', {
    shadowMode: true,
    activationStatus: 'SHADOW_ONLY',
    applied: false,
  });
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [shadowDecision] },
    }),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.finalText, RESPONSE_TEXT);
});

test('A-35: decisão sem appliedEffect guidance/metadata → não aplica', () => {
  const config = buildApplicationConfig();
  const brokenDecision = buildActiveDecision('RESPONSE_STYLE_GUIDANCE', {
    appliedEffect: { applied: false, effect: 'none', fields: [], blockedBy: null },
  });
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query' },
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [brokenDecision] },
    }),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.finalText, RESPONSE_TEXT);
});

// ---------------------------------------------------------------------------
// Contratos, telemetria e política
// ---------------------------------------------------------------------------

test('A-36: resultado é serializável e válido pelo contrato', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: LONG_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineWithDecision('RESPONSE_LENGTH_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(isSerializableApplicationResult(result), true);
  const validation = validateApplicationResult(result);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('A-37: telemetria redigida nunca expõe texto, IDs, valores ou memória', () => {
  const config = buildApplicationConfig({ VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'true' });
  let emitted = null;
  const context = buildContext({
    telemetryAdapter: { emit: (key, payload) => { emitted = payload; } },
  });
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query', conversationStyle: 'simple' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context,
  });
  assert.equal(result.applied, true);
  assert.ok(emitted, 'telemetria deve ser emitida quando habilidada');
  const serialized = JSON.stringify(emitted);
  assert.ok(!serialized.includes(RESPONSE_TEXT));
  assert.ok(!serialized.includes('test-user-1'));
  assert.ok(!serialized.includes('R$'));
  assert.ok(!serialized.includes('originalText'));
  assert.ok(!serialized.includes('finalText'));
});

test('A-38: telemetria desligada → nada é emitido', () => {
  const config = buildApplicationConfig({ VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false' });
  let emitted = null;
  const context = buildContext({
    telemetryAdapter: { emit: (key, payload) => { emitted = payload; } },
  });
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: RESPONSE_TEXT, responseType: 'query', conversationStyle: 'simple' },
    engineResult: buildEngineWithDecision('RESPONSE_STYLE_GUIDANCE'),
    context,
  });
  assert.equal(result.applied, true);
  assert.equal(emitted, null);
});

test('A-39: redactApplicationTelemetry aplica allowlist estrutural', () => {
  const redacted = redactApplicationTelemetry({
    version: '1.0',
    enabled: true,
    applied: true,
    appliedCapabilities: ['RESPONSE_STYLE_GUIDANCE'],
    blockedCapabilities: [],
    factualContentPreserved: true,
    styleApplied: true,
    lengthApplied: false,
    fallbackUsed: false,
    fallbackReason: null,
    status: 'APPLIED',
    latencyMs: 1.2,
    errorCode: null,
    originalText: 'CONTEÚDO SECRETO',
    finalText: 'CONTEÚDO SECRETO',
    userId: 'test-user-1',
    accountId: 'acc-1',
    amount: 1234.56,
  });
  assert.ok(!JSON.stringify(redacted).includes('CONTEÚDO SECRETO'));
  assert.ok(!JSON.stringify(redacted).includes('test-user-1'));
  assert.ok(!JSON.stringify(redacted).includes('acc-1'));
  assert.ok(!JSON.stringify(redacted).includes('1234.56'));
  assert.equal(redacted.version, '1.0');
  assert.equal(redacted.applied, true);
});

test('A-40: shouldUseApplicationFallback com flags inválidas → fallback seguro', () => {
  assert.deepEqual(shouldUseApplicationFallback(null), { shouldFallback: true, reasonCode: 'APPLICATION_DISABLED' });
  assert.deepEqual(shouldUseApplicationFallback({}), { shouldFallback: true, reasonCode: 'APPLICATION_DISABLED' });
  assert.equal(isApplicationEnabledByPolicy({}), false);
  assert.equal(isApplicationEnabledByPolicy({ applicationEnabled: 'true' }), false);
  assert.equal(isApplicationEnabledByPolicy({ applicationEnabled: true }), true);
});

test('A-41: shadowComparison expõe apenas agregados (nunca texto/IDs/valores)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: LONG_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineWithDecision('RESPONSE_LENGTH_GUIDANCE'),
    context: buildContext(),
  });
  assert.equal(typeof result.shadowComparison.originalTextLength, 'number');
  assert.equal(typeof result.shadowComparison.finalTextLength, 'number');
  assert.equal(result.shadowComparison.lengthDelta, SHORT_TEXT.length - LONG_TEXT.length);
  assert.ok(!JSON.stringify(result.shadowComparison).includes(LONG_TEXT));
  assert.ok(!JSON.stringify(result.shadowComparison).includes(SHORT_TEXT));
});

test('A-42: resultado combinado style+length aplica ambas capacidades', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: LONG_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'respond', nextDecisionType: 'respond', risk: 'LOW', confidence: 0.9 },
      activation: {
        enabled: true,
        decisions: [
          buildActiveDecision('RESPONSE_STYLE_GUIDANCE'),
          buildActiveDecision('RESPONSE_LENGTH_GUIDANCE'),
        ],
      },
    }),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.equal(result.styleApplied, true);
  assert.equal(result.lengthApplied, true);
  assert.equal(result.appliedCapabilities.length, 2);
  assert.equal(result.finalText, SHORT_TEXT);
  assert.equal(result.factualContentPreserved, true);
});

// ============================================================================
// PARTE 5 — BLOCO 2: QUESTION_GUIDANCE (decisão observacional controlada).
// A Application produz APENAS a decisão questionDecision (shouldAsk,
// questionPriority, missingInformation, confidence, questionReason,
// diagnostics) — nunca texto de pergunta, nunca altera a resposta, nunca
// executa. A decisão fica disponível para o pipeline legado decidir se exibe
// ou não a pergunta.
// ============================================================================

function buildQuestionConfig(env = {}) {
  return buildApplicationConfig({
    VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
    ...env,
  });
}

function buildQuestionEngine(missingFields = [], overrides = {}) {
  return buildEngineResult({
    decisionLayer: {
      decisionType: 'ask',
      nextDecisionType: 'ask',
      risk: 'LOW',
      confidence: 0.9,
    },
    comparison: {
      missingFields,
      agreementMetrics: { divergenceCount: 0 },
    },
    activation: {
      enabled: true,
      decisions: [buildActiveDecision('QUESTION_GUIDANCE')],
    },
    ...overrides,
  });
}

test('B-1: capability QUESTION_GUIDANCE desligada → nenhuma decisão (questionDecision null)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.questionDecision, null);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('B-2: production → QUESTION bloqueada (ENVIRONMENT_NOT_ALLOWED), sem decisão', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext({ isDev: false, environment: 'production' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.questionDecision, null);
  assert.equal(result.fallbackReason, 'ENVIRONMENT_NOT_ALLOWED');
});

test('B-3: usuário não autorizado → QUESTION bloqueada (USER_NOT_AUTHORIZED)', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext({ userId: 'other-user' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.questionDecision, null);
  assert.equal(result.fallbackReason, 'USER_NOT_AUTHORIZED');
});

test('B-4: confiança baixa → QUESTION bloqueada (LOW_CONFIDENCE)', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext({ confidence: 0.4 }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.questionDecision, null);
  assert.equal(result.fallbackReason, 'LOW_CONFIDENCE');
});

test('B-5: risco alto → QUESTION bloqueada (HIGH_RISK)', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext({ risk: 'HIGH' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.questionDecision, null);
  assert.equal(result.fallbackReason, 'HIGH_RISK');
});

test('B-6: circuit breaker aberto → QUESTION bloqueada (CIRCUIT_BREAKER_OPEN)', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext({ circuitBreakerOpen: true }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.questionDecision, null);
  assert.equal(result.fallbackReason, 'CIRCUIT_BREAKER_OPEN');
});

test('B-7: pergunta necessária detectada → shouldAsk=true com campos seguros', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.ok(result.questionDecision, 'deve existir decisão de pergunta');
  assert.equal(result.questionDecision.shouldAsk, true);
  assert.ok(isQuestionPriority(result.questionDecision.questionPriority));
  assert.ok(isQuestionReason(result.questionDecision.questionReason));
  assert.deepEqual(result.questionDecision.missingInformation, ['category']);
  assert.equal(result.questionDecision.confidence, 0.9);
  assert.ok(Array.isArray(result.questionDecision.diagnostics));
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
  assert.equal(result.factualContentPreserved, true);
});

test('B-8: pergunta não necessária → shouldAsk=false com motivo fechado', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine([]),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.ok(result.questionDecision);
  assert.equal(result.questionDecision.shouldAsk, false);
  assert.equal(result.questionDecision.missingInformation.length, 0);
  assert.ok(isQuestionReason(result.questionDecision.questionReason));
});

test('B-9: nenhuma pergunta é gerada automaticamente — só decisão, nunca texto', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext(),
  });
  assert.deepEqual(
    Object.keys(result.questionDecision).sort(),
    [...QUESTION_DECISION_FIELDS].sort(),
  );
  const serialized = JSON.stringify(result.questionDecision);
  assert.ok(!serialized.includes('Qual'));
  assert.ok(!serialized.includes('?'));
  assert.ok(!serialized.includes('Em qual conta'));
  assert.ok(!serialized.includes('category_required'));
  assert.ok(!result.questionDecision.suggestedText);
});

test('B-10: pipeline legado preservado — questionDecision nunca altera o texto', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext(),
  });
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
  assert.equal(result.originalText, EXPENSE_ACCOUNT_QUESTION);
  assert.equal(result.appliedCapabilities.includes('QUESTION_GUIDANCE'), false);
  assert.equal(result.factualContentPreserved, true);
  assert.equal(result.safety.confirmationSkipped, false);
});

test('B-11: fallback por guidance inválida → questionDecision null e texto preservado', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: null,
    engineResult: buildQuestionEngine(['category']),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.questionDecision, null);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'INVALID_LEGACY_TEXT');
});

test('B-12: questionDecision é serializável, JSON-safe e sem objetos circulares', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category', 'amount']),
    context: buildContext(),
  });
  const validation = validateQuestionDecision(result.questionDecision);
  assert.equal(validation.valid, true, validation.errors?.join(','));
  const roundTrip = JSON.parse(JSON.stringify(result.questionDecision));
  assert.deepEqual(roundTrip, result.questionDecision);
  assert.equal(Object.isFrozen(result.questionDecision), true);
});

test('B-13: determinismo — duas execuções idênticas produzem a mesma decisão', () => {
  const config = buildQuestionConfig();
  const legacy = legacyClarification();
  const engine = buildQuestionEngine(['category']);
  const first = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: buildContext(),
  });
  const second = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: buildContext(),
  });
  assert.equal(JSON.stringify(first.questionDecision), JSON.stringify(second.questionDecision));
  const { latencyMs: firstLatency, ...firstRest } = first;
  const { latencyMs: secondLatency, ...secondRest } = second;
  assert.ok(Number.isFinite(firstLatency) && Number.isFinite(secondLatency));
  assert.equal(JSON.stringify(firstRest), JSON.stringify(secondRest));
});

test('B-14: diagnostics refletem a decisão de pergunta com códigos fechados', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context: buildContext(),
  });
  assert.ok(result.diagnostics.some((d) => d.code === 'QUESTION_ASKED'));
  assert.ok(result.questionDecision.diagnostics.length > 0);
  assert.ok(isQuestionReason(result.questionDecision.questionReason));
});

test('B-15: telemetria redigida — questionDecision nunca expõe texto, IDs ou valores', () => {
  const config = buildQuestionConfig({ VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'true' });
  let emitted = null;
  const context = buildContext({
    telemetryAdapter: { emit: (key, payload) => { emitted = payload; } },
  });
  runControlledGuidanceApplication({
    config,
    legacy: legacyClarification(),
    engineResult: buildQuestionEngine(['category']),
    context,
  });
  assert.ok(emitted, 'telemetria deve ser emitida quando habilitada');
  const serialized = JSON.stringify(emitted);
  assert.ok(serialized.includes('questionDecision'));
  assert.ok(!serialized.includes(EXPENSE_ACCOUNT_QUESTION));
  assert.ok(!serialized.includes('Qual'));
  assert.ok(!serialized.includes('category'));
  assert.equal(emitted.questionDecision.shouldAsk, true);
  assert.equal(typeof emitted.questionDecision.missingInformationCount, 'number');
});

test('B-16: isQuestionCapabilityEnabledByConfig e isQuestionConfidenceAllowedByPolicy determinísticos', () => {
  assert.equal(isQuestionCapabilityEnabledByConfig({}), false);
  assert.equal(isQuestionCapabilityEnabledByConfig({ activationCapabilities: {} }), false);
  assert.equal(
    isQuestionCapabilityEnabledByConfig({ activationCapabilities: { QUESTION_GUIDANCE: true } }),
    true,
  );
  assert.equal(isQuestionConfidenceAllowedByPolicy(0.69), false);
  assert.equal(isQuestionConfidenceAllowedByPolicy(0.7), true);
  assert.equal(isQuestionConfidenceAllowedByPolicy(0.9), true);
  assert.equal(isQuestionConfidenceAllowedByPolicy('0.9'), true);
  assert.ok(QUESTION_PRIORITIES.every(isQuestionPriority));
  assert.ok(QUESTION_REASONS.every(isQuestionReason));
});

test('B-17: createQuestionDecision sanitiza e congela apenas os campos permitidos', () => {
  const decision = createQuestionDecision({
    shouldAsk: true,
    questionPriority: 'HIGH',
    missingInformation: ['account', 'amount'],
    confidence: 0.95,
    questionReason: 'MISSING_FIELD_DETECTED',
    diagnostics: ['QUESTION_GUIDANCE'],
    suggestedText: 'TEXTO PROIBIDO',
    userId: 'u-1',
  });
  assert.deepEqual(
    Object.keys(decision).sort(),
    [...QUESTION_DECISION_FIELDS].sort(),
  );
  assert.ok(!JSON.stringify(decision).includes('TEXTO PROIBIDO'));
  assert.ok(!JSON.stringify(decision).includes('u-1'));
  assert.equal(Object.isFrozen(decision), true);
  const validation = validateQuestionDecision(decision);
  assert.equal(validation.valid, true);
});

test('B-18: QUESTION + STYLE ativas simultaneamente — texto e decisão convivem', () => {
  const config = buildQuestionConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ conversationStyle: null }),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['category'], agreementMetrics: { divergenceCount: 0 } },
      activation: {
        enabled: true,
        decisions: [
          buildActiveDecision('QUESTION_GUIDANCE'),
          buildActiveDecision('RESPONSE_STYLE_GUIDANCE'),
        ],
      },
    }),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.ok(result.questionDecision);
  assert.equal(result.styleApplied, true);
  assert.equal(result.factualContentPreserved, true);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

// ============================================================================
// PARTE 5 — BLOCO 3: CLARIFICATION_GUIDANCE (decisão observacional controlada).
// A Application produz APENAS a decisão clarificationDecision (shouldClarify,
// clarificationPriority, ambiguousFields, clarificationReason, confidence,
// diagnostics) — nunca texto de pergunta/esclarecimento, nunca altera a
// resposta, nunca executa. A Uni NUNCA gera automaticamente: apenas sinaliza
// que o pipeline legado pode precisar esclarecer.
// ============================================================================

function buildClarificationConfig(env = {}) {
  return buildApplicationConfig({
    VITE_UNI_ENGINE_CAP_CLARIFICATION_GUIDANCE: 'true',
    ...env,
  });
}

function buildClarificationEngine(ambiguityTypes = [], overrides = {}) {
  return buildEngineResult({
    decisionLayer: {
      decisionType: 'ask',
      nextDecisionType: 'ask',
      risk: 'LOW',
      confidence: 0.9,
    },
    classification: {
      ambiguities: ambiguityTypes.map((type) => ({ type })),
      primaryIntent: null,
      confidence: 0.9,
    },
    comparison: {
      missingFields: [],
      agreementMetrics: { divergenceCount: 0 },
    },
    activation: {
      enabled: true,
      decisions: [buildActiveDecision('CLARIFICATION_GUIDANCE')],
    },
    ...overrides,
  });
}

test('C-1: capability CLARIFICATION_GUIDANCE desligada → nenhuma decisão (clarificationDecision null)', () => {
  const config = buildApplicationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.clarificationDecision, null);
  assert.equal(result.finalText, CLARIFICATION_TEXT);
});

test('C-2: production → CLARIFICATION bloqueada (ENVIRONMENT_NOT_ALLOWED), sem decisão', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext({ isDev: false, environment: 'production' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.clarificationDecision, null);
  assert.equal(result.fallbackReason, 'ENVIRONMENT_NOT_ALLOWED');
});

test('C-3: usuário não autorizado → CLARIFICATION bloqueada (USER_NOT_AUTHORIZED)', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext({ userId: 'other-user' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.clarificationDecision, null);
  assert.equal(result.fallbackReason, 'USER_NOT_AUTHORIZED');
});

test('C-4: confiança baixa → CLARIFICATION bloqueada (LOW_CONFIDENCE)', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext({ confidence: 0.4 }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.clarificationDecision, null);
  assert.equal(result.fallbackReason, 'LOW_CONFIDENCE');
});

test('C-5: risco alto → CLARIFICATION bloqueada (HIGH_RISK)', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext({ risk: 'HIGH' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.clarificationDecision, null);
  assert.equal(result.fallbackReason, 'HIGH_RISK');
});

test('C-6: circuit breaker aberto → CLARIFICATION bloqueada (CIRCUIT_BREAKER_OPEN)', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext({ circuitBreakerOpen: true }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.clarificationDecision, null);
  assert.equal(result.fallbackReason, 'CIRCUIT_BREAKER_OPEN');
});

test('C-7: clarificação necessária detectada → shouldClarify=true com campos seguros', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.ok(result.clarificationDecision, 'deve existir decisão de esclarecimento');
  assert.equal(result.clarificationDecision.shouldClarify, true);
  assert.ok(isClarificationPriority(result.clarificationDecision.clarificationPriority));
  assert.ok(isClarificationReason(result.clarificationDecision.clarificationReason));
  assert.deepEqual(result.clarificationDecision.ambiguousFields, ['account']);
  assert.equal(result.clarificationDecision.confidence, 0.9);
  assert.ok(Array.isArray(result.clarificationDecision.diagnostics));
  assert.equal(result.finalText, CLARIFICATION_TEXT);
  assert.equal(result.factualContentPreserved, true);
});

test('C-8: clarificação desnecessária → shouldClarify=false com motivo fechado', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine([]),
    context: buildContext(),
  });
  assert.equal(result.applied, true);
  assert.ok(result.clarificationDecision);
  assert.equal(result.clarificationDecision.shouldClarify, false);
  assert.equal(result.clarificationDecision.ambiguousFields.length, 0);
  assert.ok(isClarificationReason(result.clarificationDecision.clarificationReason));
});

test('C-9: nenhuma pergunta de esclarecimento é gerada automaticamente — só decisão, nunca texto', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext(),
  });
  assert.deepEqual(
    Object.keys(result.clarificationDecision).sort(),
    [...CLARIFICATION_DECISION_FIELDS].sort(),
  );
  const serialized = JSON.stringify(result.clarificationDecision);
  assert.ok(!serialized.includes('Qual'));
  assert.ok(!serialized.includes('?'));
  assert.ok(!serialized.includes('conta'));
  assert.ok(!serialized.includes('Pode'));
  assert.ok(!result.clarificationDecision.suggestedText);
});

test('C-10: pipeline legado preservado — clarificationDecision nunca altera o texto', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context: buildContext(),
  });
  assert.equal(result.finalText, CLARIFICATION_TEXT);
  assert.equal(result.originalText, CLARIFICATION_TEXT);
  assert.equal(result.appliedCapabilities.includes('CLARIFICATION_GUIDANCE'), false);
  assert.equal(result.factualContentPreserved, true);
  assert.equal(result.safety.confirmationSkipped, false);
});

test('C-11: fallback por guidance inválida → clarificationDecision null e texto preservado', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: null,
    engineResult: buildClarificationEngine(['account']),
    context: buildContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.clarificationDecision, null);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'INVALID_LEGACY_TEXT');
});

test('C-12: clarificationDecision é serializável, JSON-safe e sem objetos circulares', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account', 'category']),
    context: buildContext(),
  });
  const validation = validateClarificationDecision(result.clarificationDecision);
  assert.equal(validation.valid, true, validation.errors?.join(','));
  const roundTrip = JSON.parse(JSON.stringify(result.clarificationDecision));
  assert.deepEqual(roundTrip, result.clarificationDecision);
  assert.equal(Object.isFrozen(result.clarificationDecision), true);
});

test('C-13: determinismo — duas execuções idênticas produzem a mesma decisão', () => {
  const config = buildClarificationConfig();
  const legacy = legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' });
  const engine = buildClarificationEngine(['account']);
  const first = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: buildContext(),
  });
  const second = runControlledGuidanceApplication({
    config,
    legacy,
    engineResult: engine,
    context: buildContext(),
  });
  assert.equal(JSON.stringify(first.clarificationDecision), JSON.stringify(second.clarificationDecision));
  const { latencyMs: firstLatency, ...firstRest } = first;
  const { latencyMs: secondLatency, ...secondRest } = second;
  assert.ok(Number.isFinite(firstLatency) && Number.isFinite(secondLatency));
  assert.equal(JSON.stringify(firstRest), JSON.stringify(secondRest));
});

test('C-14: telemetria redigida — clarificationDecision nunca expõe texto, IDs ou valores', () => {
  const config = buildClarificationConfig({ VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'true' });
  let emitted = null;
  const context = buildContext({
    telemetryAdapter: { emit: (key, payload) => { emitted = payload; } },
  });
  runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account']),
    context,
  });
  assert.ok(emitted, 'telemetria deve ser emitida quando habilitada');
  const serialized = JSON.stringify(emitted);
  assert.ok(serialized.includes('clarificationDecision'));
  assert.ok(!serialized.includes(CLARIFICATION_TEXT));
  assert.ok(!serialized.includes('Qual'));
  assert.ok(!serialized.includes('account'));
  assert.equal(emitted.clarificationDecision.shouldClarify, true);
  assert.equal(typeof emitted.clarificationDecision.ambiguousFieldsCount, 'number');
});

test('C-15: múltiplos campos ambíguos → shouldClarify=true com prioridade HIGH', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['account', 'category']),
    context: buildContext(),
  });
  assert.equal(result.clarificationDecision.shouldClarify, true);
  assert.equal(result.clarificationDecision.clarificationPriority, 'HIGH');
  assert.deepEqual(result.clarificationDecision.ambiguousFields, ['account', 'category']);
});

test('C-16: campo único ambíguo → shouldClarify=true com prioridade MEDIUM', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine(['category']),
    context: buildContext(),
  });
  assert.equal(result.clarificationDecision.shouldClarify, true);
  assert.equal(result.clarificationDecision.clarificationPriority, 'MEDIUM');
  assert.deepEqual(result.clarificationDecision.ambiguousFields, ['category']);
});

test('C-17: nenhum campo ambíguo → shouldClarify=false com motivo fechado', () => {
  const config = buildClarificationConfig();
  const result = runControlledGuidanceApplication({
    config,
    legacy: legacyClarification({ text: CLARIFICATION_TEXT, issueField: 'amount' }),
    engineResult: buildClarificationEngine([]),
    context: buildContext(),
  });
  assert.equal(result.clarificationDecision.shouldClarify, false);
  assert.equal(result.clarificationDecision.clarificationPriority, 'LOW');
  assert.equal(result.clarificationDecision.clarificationReason, 'NO_AMBIGUITY');
});

test('C-18: isClarificationCapabilityEnabledByConfig e isClarificationConfidenceAllowedByPolicy determinísticos', () => {
  assert.equal(isClarificationCapabilityEnabledByConfig({}), false);
  assert.equal(isClarificationCapabilityEnabledByConfig({ activationCapabilities: {} }), false);
  assert.equal(
    isClarificationCapabilityEnabledByConfig({ activationCapabilities: { CLARIFICATION_GUIDANCE: true } }),
    true,
  );
  assert.equal(isClarificationConfidenceAllowedByPolicy(0.69), false);
  assert.equal(isClarificationConfidenceAllowedByPolicy(0.7), true);
  assert.equal(isClarificationConfidenceAllowedByPolicy(0.9), true);
  assert.equal(isClarificationConfidenceAllowedByPolicy('0.9'), true);
  assert.ok(CLARIFICATION_PRIORITIES.every(isClarificationPriority));
  assert.ok(CLARIFICATION_REASONS.every(isClarificationReason));
});

test('C-19: createClarificationDecision sanitiza e congela apenas os campos permitidos', () => {
  const decision = createClarificationDecision({
    shouldClarify: true,
    clarificationPriority: 'HIGH',
    ambiguousFields: ['account', 'amount'],
    confidence: 0.95,
    clarificationReason: 'AMBIGUITY_DETECTED',
    diagnostics: ['CLARIFICATION_GUIDANCE'],
    suggestedText: 'Qual foi o valor?',
    userId: 'u-1',
  });
  assert.deepEqual(
    Object.keys(decision).sort(),
    [...CLARIFICATION_DECISION_FIELDS].sort(),
  );
  assert.ok(!JSON.stringify(decision).includes('Qual'));
  assert.ok(!JSON.stringify(decision).includes('u-1'));
  assert.equal(Object.isFrozen(decision), true);
  const validation = validateClarificationDecision(decision);
  assert.equal(validation.valid, true);
});
