// Integration — fases do pipeline (Parte 1). A integração atravessa as fases
// sem executar nada: consume Shadow, respeita Activation, nunca escreve
// memória, nunca aprende, nunca sugere categoria/conta/objetivo/plano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import { isAuthorizedIntegrationCapability } from './integrationTypes.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
  EXPENSE_ACCOUNT_QUESTION,
} from './testFixtures.js';

test('I-84: Fase 1 — engine em shadow puro alimenta a integração sem ativá-la', () => {
  const config = buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'true' });
  const result = runUniEngineIntegration({
    config,
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'SHADOW_ONLY');
  assert.equal(result.applied, false);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-85: Fase 2 — resposta LLM pode receber banda de estilo, nunca reescrita', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      responseType: 'query',
      text: 'Analisando seus últimos 30 dias: gastos de R$ 2.100,00 e receitas de R$ 3.400,00.',
    }),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'respond', nextDecisionType: 'respond', risk: 'LOW', confidence: 0.85 },
      activation: { enabled: true, decisions: [buildActiveDecision('RESPONSE_STYLE_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.styleGuidance.styleKey, 'simple');
  assert.equal(result.finalText, 'Analisando seus últimos 30 dias: gastos de R$ 2.100,00 e receitas de R$ 3.400,00.');
});

test('I-86: Fase 3 — integração nunca escreve memória (sem campo de memória)', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
  assert.equal(Object.hasOwn(result, 'memory'), false);
  assert.equal(Object.hasOwn(result, 'memoryWritten'), false);
  assert.equal(JSON.stringify(result).includes('memoryModified'), false);
});

test('I-87: Fase 4 — modelo epistêmico nunca é tocado pela integração', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      epistemic: { caution: 'high' },
      activation: { enabled: true, decisions: [buildActiveDecision('EPISTEMIC_CAUTION')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-88: Fase 5 — camada de decisão é fonte de dados, nunca comando', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.questionGuidance.questionKey, 'amount_required');
  assert.equal(result.applied, true);
});

test('I-89: Fase 6 — sugestão de plano nunca é executada (capacidade não autorizada)', () => {
  assert.equal(isAuthorizedIntegrationCapability('PLANNING_SUGGESTION'), false);
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('PLANNING_SUGGESTION')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-90: Fase 7 — sugestão de objetivo não é autorizada na Parte 1', () => {
  assert.equal(isAuthorizedIntegrationCapability('GOAL_SUGGESTION'), false);
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('GOAL_SUGGESTION')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
});

test('I-91: Fase 8 — aprendizado nunca é aplicado (sem capacidade de aprendizado)', () => {
  assert.equal(isAuthorizedIntegrationCapability('LEARNING_APPLICATION'), false);
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('LEARNING_APPLICATION')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-92: Fase 9 — Activation governa: decisão ativa aplica, shadow bloqueia', () => {
  const active = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
  const shadow = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE', { activationStatus: 'SHADOW_ONLY', shadowMode: true })] },
    }),
    context: { isDev: true },
  });
  assert.equal(active.applied, true);
  assert.equal(active.finalText, 'Qual foi o valor dessa movimentação?');
  assert.equal(shadow.applied, false);
  assert.equal(shadow.finalText, EXPENSE_ACCOUNT_QUESTION);
});
