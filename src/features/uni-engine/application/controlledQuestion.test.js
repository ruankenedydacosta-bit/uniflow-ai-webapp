// Uni Engine — Controlled Question (Parte 6, Bloco Único: perguntas seguras
// pelo pipeline legado).
//
// Testes da camada de pergunta controlada. A Uni Engine NUNCA escreve texto
// livre: a pergunta vem SEMPRE de template fechado permitido
// (CONTROLLED_QUESTION_TEMPLATES), uma única por turno, com prioridade
// determinística (confirmação legada > Clarification > Question). Pending
// Action e confirmação permanecem soberanos no pipeline legado. Qualquer gate
// falho → fallback seguro (applied=false, sem pergunta, legado integral).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { runControlledGuidanceApplication } from './runControlledGuidanceApplication.js';
import { runControlledQuestionApplication } from './runControlledQuestionApplication.js';
import {
  createQuestionDecision,
  createClarificationDecision,
} from './applicationContracts.js';
import {
  validateControlledQuestionResult,
  isControlledQuestionSafetyIntegral,
} from './controlledQuestionContracts.js';
import {
  CONTROLLED_QUESTION_TEMPLATES,
  CONTROLLED_QUESTION_POLICY,
  CONTROLLED_QUESTION_PRIORITY,
  getControlledQuestionPriority,
  isControlledQuestionsEnabledByConfig,
  isControlledQuestionCapabilityEnabledByConfig,
} from './controlledQuestionPolicy.js';
import {
  CONTROLLED_QUESTION_SAFETY_KEYS,
  isControlledQuestionReason,
  isControlledQuestionSafetyKey,
} from './controlledQuestionTypes.js';
import { selectControlledQuestionTemplateSafe } from './selectControlledQuestionTemplate.js';
import { redactControlledQuestionTelemetry } from './telemetry/redactControlledQuestionTelemetry.js';
import { buildEngineResult, buildActiveDecision } from '../integration/testFixtures.js';
import { QUESTION_TEMPLATES } from '../integration/integrationPolicy.js';

// Texto legado de UMA clarificação em andamento do pipeline: a pergunta de
// categoria (template fechado da Integration). Com a conta ausente, a Uni
// Engine recomenda trocar para a pergunta da conta (GUIDED_FIELD_SWAP).
const LEGACY_CLARIFICATION_TEXT = QUESTION_TEMPLATES.category_required;
const LEGACY_CLARIFICATION = {
  text: LEGACY_CLARIFICATION_TEXT,
  responseType: 'clarification',
  issueField: 'category',
  transactionType: 'expense',
  conversationStyle: 'normal',
};

const LEGACY_TEXT = 'Gastei R$ 50,00 no mercado com o cartão de crédito.';
const OLD_TURN_TEXT = 'Texto de um turno ANTERIOR que não pode vazar.';
const LONG_TEXT = 'Não consegui identificar o saldo atual dessa conta para calcular o ajuste. Tente novamente em instantes.';
const SHORT_TEXT = 'Não consegui identificar o saldo dessa conta. Tente novamente em instantes.';

const ACCOUNT_QUESTION = CONTROLLED_QUESTION_TEMPLATES.account;
const CATEGORY_QUESTION = CONTROLLED_QUESTION_TEMPLATES.category;
const AMOUNT_QUESTION = CONTROLLED_QUESTION_TEMPLATES.amount;
const TRANSACTION_TYPE_QUESTION = CONTROLLED_QUESTION_TEMPLATES.transactionType;
const DESCRIPTION_QUESTION = CONTROLLED_QUESTION_TEMPLATES.description;
const AMBIGUITY_ACCOUNT_QUESTION = CONTROLLED_QUESTION_TEMPLATES.ambiguity_account;
const AMBIGUITY_CATEGORY_QUESTION = CONTROLLED_QUESTION_TEMPLATES.ambiguity_category;
const AMBIGUITY_INTENT_QUESTION = CONTROLLED_QUESTION_TEMPLATES.ambiguity_intent;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildControlledConfig(env = {}) {
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
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED: 'true',
      ...env,
    },
  });
}

function buildControlledContext(overrides = {}) {
  return {
    environment: 'development',
    isDev: true,
    userId: 'test-user-1',
    confidence: 0.9,
    risk: 'LOW',
    circuitBreakerOpen: false,
    executionReady: true,
    telemetryAdapter: null,
    ...overrides,
  };
}

function questionDecision(missingFields = ['account'], overrides = {}) {
  return createQuestionDecision({
    shouldAsk: true,
    questionPriority: 'HIGH',
    missingInformation: missingFields,
    confidence: 0.9,
    questionReason: 'SHOULD_ASK',
    diagnostics: ['QUESTION_NEEDED'],
    ...overrides,
  });
}

function clarificationDecision(ambiguousFields = ['account'], overrides = {}) {
  return createClarificationDecision({
    shouldClarify: true,
    clarificationPriority: 'HIGH',
    ambiguousFields,
    clarificationReason: 'SHOULD_CLARIFY',
    confidence: 0.9,
    diagnostics: ['CLARIFICATION_NEEDED'],
    ...overrides,
  });
}

function buildApplicationResult({
  question = null,
  clarification = null,
  originalText = LEGACY_TEXT,
} = {}) {
  return {
    version: '1.0',
    enabled: true,
    applied: true,
    appliedCapabilities: [],
    blockedCapabilities: [],
    originalText,
    finalText: LEGACY_TEXT,
    factualContentPreserved: true,
    styleApplied: false,
    lengthApplied: false,
    fallbackUsed: false,
    fallbackReason: null,
    status: 'APPLIED',
    diagnostics: [],
    shadowComparison: null,
    safety: {
      factualContentPreserved: true,
      financialExecution: false,
      memoryWrite: false,
      learningApplied: false,
      confirmationSkipped: false,
      pendingActionModified: false,
      databaseCalled: false,
      ttsTriggeredByApplication: false,
    },
    questionDecision: question,
    clarificationDecision: clarification,
    latencyMs: 1,
  };
}

function runAdapter(overrides = {}) {
  return runControlledQuestionApplication({
    config: buildControlledConfig(),
    legacyText: LEGACY_TEXT,
    applicationResult: buildApplicationResult({ question: questionDecision() }),
    pendingAction: null,
    alreadyAskedFields: null,
    confirmationRequired: false,
    context: buildControlledContext(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Flags e gates
// ---------------------------------------------------------------------------

test('Q-1: tudo desligado mantém legado — fallback sem pergunta, applied=false', () => {
  const result = runAdapter({
    config: createUniEngineConfig({ env: {} }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.finalQuestion, null);
  assert.equal(result.originalLegacyText, LEGACY_TEXT);
  assert.equal(result.pendingActionPreserved, true);
  assert.ok(isControlledQuestionReason(result.fallbackReason));
});

test('Q-2: produção bloqueia — ambiente production nunca pergunta', () => {
  const result = runAdapter({ context: buildControlledContext({ environment: 'production' }) });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'ENVIRONMENT_NOT_ALLOWED');
});

test('Q-3: usuário NÃO autorizado bloqueia', () => {
  const result = runAdapter({
    context: buildControlledContext({ userId: 'usuario-de-fora' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'USER_NOT_AUTHORIZED');
});

test('Q-4: capability QUESTION desligada bloqueia a pergunta', () => {
  const result = runAdapter({
    config: buildControlledConfig({ VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'false' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'CAPABILITY_DISABLED');
});

test('Q-5: capability CLARIFICATION desligada bloqueia a clarificação', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ clarification: clarificationDecision() }),
    config: buildControlledConfig({ VITE_UNI_ENGINE_CAP_CLARIFICATION_GUIDANCE: 'false' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'CAPABILITY_DISABLED');
});

test('Q-6: decisão ausente bloqueia (questionDecision e clarificationDecision null)', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'NO_DECISION');
});

test('Q-7: shouldAsk=false não pergunta', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({
      question: questionDecision(['account'], { shouldAsk: false, questionReason: 'NO_MISSING_FIELD' }),
    }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'NO_ASK');
});

test('Q-8: shouldClarify=false não pergunta', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({
      clarification: clarificationDecision(['account'], { shouldClarify: false, clarificationReason: 'NO_AMBIGUITY' }),
    }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'NO_CLARIFY');
});

test('Q-9: confiança baixa bloqueia (0.4 < mínimo)', () => {
  const result = runAdapter({
    context: buildControlledContext({ confidence: 0.4 }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'LOW_CONFIDENCE');
});

test('Q-10: risco alto bloqueia', () => {
  const result = runAdapter({
    context: buildControlledContext({ risk: 'HIGH' }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'RISK_NOT_ALLOWED');
});

test('Q-11: circuit breaker aberto bloqueia', () => {
  const result = runAdapter({
    context: buildControlledContext({ circuitBreakerOpen: true }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'CIRCUIT_BREAKER_OPEN');
});

test('Q-12: turno antigo bloqueia (originalText ≠ texto atual)', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ originalText: OLD_TURN_TEXT }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'STALE_TURN');
  assert.equal(result.sameTurn, false);
});

test('Q-13: template desconhecido bloqueia (seletor fechado)', () => {
  const selection = selectControlledQuestionTemplateSafe({ field: '' });
  assert.equal(selection.templateKey, null);
  assert.equal(selection.blockReason, 'UNKNOWN_TEMPLATE');
});

test('Q-14: campo fora da allowlist bloqueia (destinationAccount)', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({
      question: questionDecision(['destinationAccount']),
    }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'FIELD_NOT_ALLOWED');
});

// ---------------------------------------------------------------------------
// Perguntas permitidas (templates fechados)
// ---------------------------------------------------------------------------

test('Q-15: pergunta de conta permitida', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ question: questionDecision(['account']) }),
  });
  assert.equal(result.applied, true);
  assert.equal(result.capability, 'QUESTION_GUIDANCE');
  assert.equal(result.decisionType, 'question');
  assert.equal(result.requestedField, 'account');
  assert.equal(result.templateKey, 'account');
  assert.equal(result.finalQuestion, ACCOUNT_QUESTION);
});

test('Q-16: pergunta de categoria permitida', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ question: questionDecision(['category']) }),
  });
  assert.equal(result.finalQuestion, CATEGORY_QUESTION);
  assert.equal(result.templateKey, 'category');
});

test('Q-17: pergunta de valor permitida', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ question: questionDecision(['amount']) }),
  });
  assert.equal(result.finalQuestion, AMOUNT_QUESTION);
});

test('Q-18: pergunta de tipo da movimentação permitida', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ question: questionDecision(['transactionType']) }),
  });
  assert.equal(result.finalQuestion, TRANSACTION_TYPE_QUESTION);
});

test('Q-19: pergunta de descrição permitida', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ question: questionDecision(['description']) }),
  });
  assert.equal(result.finalQuestion, DESCRIPTION_QUESTION);
});

test('Q-20: clarificação de conta permitida', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ clarification: clarificationDecision(['account']) }),
  });
  assert.equal(result.applied, true);
  assert.equal(result.capability, 'CLARIFICATION_GUIDANCE');
  assert.equal(result.decisionType, 'clarification');
  assert.equal(result.requestedField, 'account');
  assert.equal(result.templateKey, 'ambiguity_account');
  assert.equal(result.finalQuestion, AMBIGUITY_ACCOUNT_QUESTION);
});

test('Q-21: clarificação de categoria permitida', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ clarification: clarificationDecision(['category']) }),
  });
  assert.equal(result.finalQuestion, AMBIGUITY_CATEGORY_QUESTION);
});

test('Q-22: clarificação de intenção permitida', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ clarification: clarificationDecision(['intent']) }),
  });
  assert.equal(result.finalQuestion, AMBIGUITY_INTENT_QUESTION);
});

// ---------------------------------------------------------------------------
// Prioridade determinística
// ---------------------------------------------------------------------------

test('Q-23: Question e Clarification simultâneas geram UMA pergunta (Clarification vence)', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({
      question: questionDecision(['account']),
      clarification: clarificationDecision(['intent']),
    }),
  });
  assert.equal(result.applied, true);
  assert.equal(result.capability, 'CLARIFICATION_GUIDANCE');
  assert.equal(result.templateKey, 'ambiguity_intent');
  assert.equal(result.finalQuestion, AMBIGUITY_INTENT_QUESTION);
  assert.ok(!result.finalQuestion.includes('conta foi essa movimentação'));
});

test('Q-24: prioridade determinística fechada (Clarification=1 < Question=2)', () => {
  assert.equal(CONTROLLED_QUESTION_PRIORITY.CLARIFICATION_GUIDANCE, 1);
  assert.equal(CONTROLLED_QUESTION_PRIORITY.QUESTION_GUIDANCE, 2);
  assert.equal(getControlledQuestionPriority('CLARIFICATION_GUIDANCE'), 1);
  assert.equal(getControlledQuestionPriority('QUESTION_GUIDANCE'), 2);
  assert.equal(getControlledQuestionPriority('FINANCIAL_EXECUTION'), Infinity);
  const first = runAdapter({
    applicationResult: buildApplicationResult({
      question: questionDecision(['amount']),
      clarification: clarificationDecision(['intent']),
    }),
  });
  const second = runAdapter({
    applicationResult: buildApplicationResult({
      question: questionDecision(['amount']),
      clarification: clarificationDecision(['intent']),
    }),
  });
  assert.equal(first.capability, second.capability);
  assert.equal(first.finalQuestion, second.finalQuestion);
});

test('Q-25: confirmação legada tem precedência absoluta', () => {
  const byFlag = runAdapter({ confirmationRequired: true });
  assert.equal(byFlag.applied, false);
  assert.equal(byFlag.fallbackReason, 'CONFIRMATION_PRECEDES');
  assert.equal(byFlag.confirmationPreserved, true);
  const byPendingAction = runAdapter({
    pendingAction: { intent: 'register_expense', missingFields: ['account'], awaitingConfirmation: true },
  });
  assert.equal(byPendingAction.applied, false);
  assert.equal(byPendingAction.fallbackReason, 'CONFIRMATION_PRECEDES');
});

// ---------------------------------------------------------------------------
// Pending Action (apenas leitura) e deduplicação
// ---------------------------------------------------------------------------

test('Q-26: Pending Action sempre preservada (nunca modificada)', () => {
  const applied = runAdapter();
  const rejected = runAdapter({ confirmationRequired: true });
  assert.equal(applied.pendingActionPreserved, true);
  assert.equal(rejected.pendingActionPreserved, true);
  assert.equal(applied.safety.pendingActionModifiedUnsafely, false);
  assert.equal(rejected.safety.pendingActionModifiedUnsafely, false);
});

test('Q-27: transição inválida usa legado (campo não está entre os ausentes do Pending Action)', () => {
  const result = runAdapter({
    pendingAction: { intent: 'register_expense', missingFields: ['account'] },
    applicationResult: buildApplicationResult({ question: questionDecision(['category']) }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'PENDING_ACTION_INCOMPATIBLE');
});

test('Q-28: pergunta já respondida não se repete (nenhum campo ausente no Pending Action)', () => {
  const result = runAdapter({
    pendingAction: { intent: 'register_expense', missingFields: [] },
    applicationResult: buildApplicationResult({ question: questionDecision(['account']) }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'PENDING_ACTION_INCOMPATIBLE');
});

test('Q-29: pergunta duplicada no mesmo turno é bloqueada', () => {
  const result = runAdapter({
    alreadyAskedFields: ['account'],
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'DUPLICATE_QUESTION');
});

test('Q-30: intenção de consulta nunca pergunta (Pending Action incompatível)', () => {
  const result = runAdapter({
    pendingAction: { intent: 'query', missingFields: ['account'] },
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'PENDING_ACTION_INCOMPATIBLE');
});

// ---------------------------------------------------------------------------
// Nenhum conteúdo inventado; texto sempre do template fechado
// ---------------------------------------------------------------------------

test('Q-31: nenhum valor inventado — finalQuestion pertence à allowlist fechada', () => {
  const allowed = Object.values(CONTROLLED_QUESTION_TEMPLATES);
  const cases = [
    runAdapter({ applicationResult: buildApplicationResult({ question: questionDecision(['account']) }) }),
    runAdapter({ applicationResult: buildApplicationResult({ question: questionDecision(['amount']) }) }),
    runAdapter({ applicationResult: buildApplicationResult({ clarification: clarificationDecision(['account']) }) }),
    runAdapter({ applicationResult: buildApplicationResult({ clarification: clarificationDecision(['intent']) }) }),
  ];
  for (const result of cases) {
    assert.ok(allowed.includes(result.finalQuestion), `finalQuestion fora da allowlist: ${result.finalQuestion}`);
    assert.ok(!/\d/.test(result.finalQuestion), `valor inventado na pergunta: ${result.finalQuestion}`);
  }
});

test('Q-32: nenhum nome de conta inventado', () => {
  const result = runAdapter();
  assert.equal(result.finalQuestion, ACCOUNT_QUESTION);
  assert.ok(!result.finalQuestion.includes('Nubank'));
  assert.ok(!result.finalQuestion.includes('NuConta'));
  assert.ok(!result.finalQuestion.includes('Banco'));
});

test('Q-33: nenhuma categoria inventada', () => {
  const result = runAdapter({
    applicationResult: buildApplicationResult({ question: questionDecision(['category']) }),
  });
  assert.equal(result.finalQuestion, CATEGORY_QUESTION);
  assert.ok(!result.finalQuestion.includes('mercado'));
  assert.ok(!result.finalQuestion.includes('Alimentação'));
});

// ---------------------------------------------------------------------------
// Safety — zero efeitos colaterais
// ---------------------------------------------------------------------------

test('Q-34: nenhuma execução financeira', () => {
  for (const result of [runAdapter(), runAdapter({ confirmationRequired: true })]) {
    assert.equal(result.safety.financialExecution, false);
  }
});

test('Q-35: nenhuma memória escrita', () => {
  for (const result of [runAdapter(), runAdapter({ confirmationRequired: true })]) {
    assert.equal(result.safety.memoryWrite, false);
  }
});

test('Q-36: nenhum aprendizado', () => {
  for (const result of [runAdapter(), runAdapter({ confirmationRequired: true })]) {
    assert.equal(result.safety.learningApplied, false);
  }
});

test('Q-37: nenhum banco, Supabase ou RPC', () => {
  for (const result of [runAdapter(), runAdapter({ confirmationRequired: true })]) {
    assert.equal(result.safety.databaseCalled, false);
    assert.equal(result.safety.rpcCalled, false);
  }
  const serialized = JSON.stringify(runAdapter());
  assert.ok(!serialized.includes('supabase'));
  assert.ok(!serialized.includes('fetch('));
  assert.ok(!serialized.includes('insert('));
});

test('Q-38: nenhuma persistência de snapshots', () => {
  const result = runAdapter();
  assert.ok(!JSON.stringify(result).includes('localStorage'));
  assert.ok(!JSON.stringify(result).includes('supabase'));
});

test('Q-39: nenhum TTS adicional disparado pela camada', () => {
  const result = runAdapter();
  assert.ok(!Object.hasOwn(result.safety, 'ttsTriggered'));
  assert.ok(!('speak' in result));
});

// ---------------------------------------------------------------------------
// Style/Length continuam funcionando; não deformam a pergunta fechada
// ---------------------------------------------------------------------------

test('Q-40: Style/Length ainda funcionam sobre a resposta permitida', () => {
  const config = buildControlledConfig({
    VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'true',
    VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE: 'true',
  });
  const result = runControlledGuidanceApplication({
    config,
    legacy: { text: LONG_TEXT, responseType: 'query', conversationStyle: 'normal' },
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'respond', nextDecisionType: 'respond', risk: 'LOW', confidence: 0.9 },
      activation: { enabled: true, decisions: [buildActiveDecision('RESPONSE_STYLE_GUIDANCE'), buildActiveDecision('RESPONSE_LENGTH_GUIDANCE')] },
    }),
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });
  assert.equal(result.applied, true);
  assert.equal(result.finalText, SHORT_TEXT);
});

test('Q-41: Style/Length NÃO deformam a pergunta fechada', () => {
  const result = runAdapter({
    config: buildControlledConfig({
      VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE: 'true',
    }),
  });
  assert.equal(result.applied, true);
  assert.equal(result.finalQuestion, ACCOUNT_QUESTION);
  assert.equal(result.finalQuestion, CONTROLLED_QUESTION_TEMPLATES.account);
});

// ---------------------------------------------------------------------------
// Fallback e fail-safe
// ---------------------------------------------------------------------------

test('Q-42: fallback usa legado — sem pergunta, texto legado preservado', () => {
  const result = runAdapter({ confirmationRequired: true });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.finalQuestion, null);
  assert.equal(result.originalLegacyText, LEGACY_TEXT);
});

test('Q-43: erro interno usa legado (exceção capturada → INTERNAL_ERROR)', () => {
  const exploding = buildApplicationResult();
  Object.defineProperty(exploding, 'originalText', {
    get() {
      throw new Error('boom');
    },
  });
  const result = runAdapter({ applicationResult: exploding });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'INTERNAL_ERROR');
  assert.equal(result.finalQuestion, null);
});

// ---------------------------------------------------------------------------
// Contrato de saída
// ---------------------------------------------------------------------------

test('Q-44: resultado serializável', () => {
  const result = runAdapter();
  assert.doesNotThrow(() => JSON.stringify(result));
  const validation = validateControlledQuestionResult(result);
  assert.equal(validation.valid, true);
});

test('Q-45: resultado imutável (congelado em profundidade)', () => {
  const result = runAdapter();
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.safety), true);
  assert.equal(Object.isFrozen(result.diagnostics), true);
  const fallback = runAdapter({ confirmationRequired: true });
  assert.equal(Object.isFrozen(fallback), true);
});

test('Q-46: determinismo (mesmas entradas, mesmo resultado exceto latency)', () => {
  const stable = (result) => {
    const copy = JSON.parse(JSON.stringify(result));
    copy.latencyMs = 0;
    return JSON.stringify(copy);
  };
  const first = runAdapter();
  const second = runAdapter();
  assert.equal(stable(second), stable(first));
  const rejected = (r) => {
    const copy = JSON.parse(JSON.stringify(r));
    copy.latencyMs = 0;
    return JSON.stringify(copy);
  };
  assert.equal(rejected(runAdapter({ confirmationRequired: true })), rejected(runAdapter({ confirmationRequired: true })));
});

test('Q-47: telemetria redigida — nunca texto, nunca legado', () => {
  const emitted = [];
  const context = buildControlledContext({
    telemetryAdapter: { emit: (name, payload) => emitted.push({ name, payload }) },
  });
  const config = buildControlledConfig({ VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'true' });
  const result = runAdapter({ config, context });
  assert.equal(result.applied, true);
  assert.equal(emitted.length, 1);
  const telemetry = emitted[0].payload;
  assert.ok(!Object.hasOwn(telemetry, 'finalQuestion'));
  assert.ok(!Object.hasOwn(telemetry, 'originalLegacyText'));
  assert.ok(!JSON.stringify(telemetry).includes(ACCOUNT_QUESTION));
  assert.ok(!JSON.stringify(telemetry).includes(LEGACY_TEXT));
  assert.equal(telemetry.templateKey, 'account');
  assert.equal(telemetry.applied, true);
  const redacted = redactControlledQuestionTelemetry(result);
  assert.equal(redacted.templateKey, 'account');
  assert.ok(!Object.hasOwn(redacted, 'finalQuestion'));
});

// ---------------------------------------------------------------------------
// Fluxos reais (decisões produzidas pela Application Layer)
// ---------------------------------------------------------------------------

test('Q-48: "Gastei R$ 50 no mercado" pergunta APENAS a conta ausente', () => {
  const config = buildControlledConfig();
  const engine = buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields: ['account'], agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
  });
  const applicationResult = runControlledGuidanceApplication({
    config,
    legacy: LEGACY_CLARIFICATION,
    engineResult: engine,
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });
  assert.equal(applicationResult.questionDecision.shouldAsk, true);
  assert.deepEqual(applicationResult.questionDecision.missingInformation, ['account']);
  const result = runControlledQuestionApplication({
    config,
    legacyText: LEGACY_CLARIFICATION_TEXT,
    applicationResult,
    pendingAction: { intent: 'register_expense', missingFields: ['account'] },
    context: buildControlledContext(),
  });
  assert.equal(result.applied, true);
  assert.equal(result.templateKey, 'account');
  assert.equal(result.finalQuestion, ACCOUNT_QUESTION);
  assert.ok(!result.finalQuestion.includes('valor'));
  assert.ok(!result.finalQuestion.includes('categoria'));
});

test('Q-49: resposta "Nubank" retoma o Pending Action legado (nenhuma pergunta nova)', () => {
  const config = buildControlledConfig();
  const engine = buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields: ['account'], agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
  });
  const applicationResult = runControlledGuidanceApplication({
    config,
    legacy: LEGACY_CLARIFICATION,
    engineResult: engine,
    context: { isDev: true, environment: 'development', userId: 'test-user-1' },
  });
  const result = runControlledQuestionApplication({
    config,
    legacyText: LEGACY_CLARIFICATION_TEXT,
    applicationResult,
    // Pending Action legado: a conta foi respondida ("Nubank") e não há mais
    // campo ausente — a transição não aceita nova pergunta; o fluxo legado
    // retoma a condução.
    pendingAction: { intent: 'register_expense', missingFields: [] },
    context: buildControlledContext(),
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'PENDING_ACTION_INCOMPATIBLE');
  assert.equal(result.finalQuestion, null);
  assert.equal(result.pendingActionPreserved, true);
});

test('Q-50: confirmação continua obrigatória antes do RPC (nunca pulada)', () => {
  const result = runAdapter({
    pendingAction: { intent: 'register_expense', missingFields: ['amount'], awaitingConfirmation: true },
    confirmationRequired: true,
  });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackReason, 'CONFIRMATION_PRECEDES');
  assert.equal(result.confirmationPreserved, true);
  assert.equal(result.safety.confirmationSkipped, false);
  assert.equal(result.safety.rpcCalled, false);
  assert.equal(result.safety.financialExecution, false);
  assert.equal(result.finalQuestion, null);
});

// ---------------------------------------------------------------------------
// Contratos públicos e fechamento
// ---------------------------------------------------------------------------

test('Q-51: safety integral em todos os resultados e enums fechados', () => {
  for (const result of [runAdapter(), runAdapter({ confirmationRequired: true })]) {
    assert.equal(isControlledQuestionSafetyIntegral(result.safety), true);
    for (const key of CONTROLLED_QUESTION_SAFETY_KEYS) {
      assert.equal(result.safety[key], false);
      assert.equal(isControlledQuestionSafetyKey(key), true);
    }
  }
  assert.equal(isControlledQuestionSafetyIntegral({ financialExecution: true }), false);
  assert.equal(isControlledQuestionSafetyIntegral(null), false);
});

test('Q-52: helpers de política e interruptor mestre', () => {
  assert.equal(isControlledQuestionsEnabledByConfig(buildControlledConfig()), true);
  assert.equal(isControlledQuestionsEnabledByConfig(createUniEngineConfig({ env: {} })), false);
  assert.equal(isControlledQuestionsEnabledByConfig(null), false);
  assert.equal(isControlledQuestionCapabilityEnabledByConfig(buildControlledConfig(), 'QUESTION_GUIDANCE'), true);
  assert.equal(isControlledQuestionCapabilityEnabledByConfig(buildControlledConfig(), 'CLARIFICATION_GUIDANCE'), true);
  assert.equal(isControlledQuestionCapabilityEnabledByConfig(
    buildControlledConfig({ VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'false' }),
    'QUESTION_GUIDANCE',
  ), false);
  assert.equal(isControlledQuestionCapabilityEnabledByConfig(null, 'QUESTION_GUIDANCE'), false);
  assert.equal(CONTROLLED_QUESTION_POLICY.minimumConfidence, 0.7);
  assert.equal(CONTROLLED_QUESTION_POLICY.confirmationPrecedence, true);
});

test('Q-53: sem applicationResult (null) → fallback sem pergunta', () => {
  const result = runAdapter({ applicationResult: null });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'NO_DECISION');
});

test('Q-54: configuração ausente → fallback (nada ativa por ausência)', () => {
  const result = runAdapter({ config: null });
  assert.equal(result.applied, false);
  assert.equal(result.fallbackUsed, true);
  assert.ok(isControlledQuestionReason(result.fallbackReason));
});
