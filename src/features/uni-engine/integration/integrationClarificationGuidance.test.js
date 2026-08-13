// Integration — orientação de esclarecimento (CLARIFICATION_GUIDANCE,
// Parte 1). Só troca pergunta curta por pergunta curta, em esclarecimento
// legado em curso; nunca decide silenciosamente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import { applyClarificationGuidance } from './applyClarificationGuidance.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
} from './testFixtures.js';

function engineWithAmbiguity(type, extra = {}) {
  return buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    classification: { ambiguities: [{ type }], primaryIntent: null },
    comparison: { missingFields: [], agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, shadowMode: false, environment: 'development', decisions: [buildActiveDecision('CLARIFICATION_GUIDANCE')] },
    ...extra,
  });
}

test('I-31: esclarecimento de valor troca para pergunta curta objetiva', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: 'Qual foi o valor?', issueField: 'amount' }),
    engineResult: engineWithAmbiguity('amount'),
    context: { isDev: true },
  });
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.finalText, 'Qual foi o valor?');
  assert.equal(result.clarificationGuidance.applied, true);
  assert.equal(result.clarificationGuidance.clarificationKey, 'amount_missing');
});

test('I-32: ambiguidade de conta seleciona pergunta de conta ambígua', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: 'Qual foi o valor?', issueField: 'amount' }),
    engineResult: engineWithAmbiguity('account'),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Encontrei mais de uma conta parecida. Qual delas você quer usar?');
  assert.equal(result.clarificationGuidance.clarificationKey, 'ambiguous_account');
});

test('I-33: ambiguidade de categoria seleciona pergunta de categoria', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: 'Qual foi o valor?', issueField: 'amount' }),
    engineResult: engineWithAmbiguity('category'),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Qual categoria você quer usar?');
  assert.equal(result.clarificationGuidance.clarificationKey, 'ambiguous_category');
});

test('I-34: intenção ambígua nunca decide silenciosamente — pergunta objetiva', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: 'Qual foi o valor?', issueField: 'amount' }),
    engineResult: engineWithAmbiguity('intent'),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Você quer registrar esse valor como entrada ou ajustar o saldo?');
  assert.equal(result.clarificationGuidance.clarificationKey, 'balance_vs_income');
});

test('I-35: sem ambiguidade declarada, texto legado preservado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: 'Qual foi o valor?', issueField: 'amount' }),
    engineResult: engineWithAmbiguity(null, {
      classification: { ambiguities: [], primaryIntent: 'register_expense' },
    }),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Qual foi o valor?');
  assert.equal(result.applied, false);
});

test('I-36: esclarecimento fora da allowlist nunca é alterado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: 'Pode confirmar seus dados pessoais?' }),
    engineResult: engineWithAmbiguity('account'),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Pode confirmar seus dados pessoais?');
  assert.equal(result.clarificationGuidance.applied, false);
});

test('I-37: ambiguidade desconhecida mantém texto legado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: 'Qual foi o valor?', issueField: 'amount' }),
    engineResult: engineWithAmbiguity('misteriosa'),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Qual foi o valor?');
});

test('I-38: resposta de consulta não vira esclarecimento (nunca age fora do curso)', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', text: 'Sua fatura fechou em R$ 800,00.' }),
    engineResult: engineWithAmbiguity('account'),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Sua fatura fechou em R$ 800,00.');
  assert.equal(result.applied, false);
});

test('I-39: applyClarificationGuidance sem ativação preserva texto', () => {
  const outcome = applyClarificationGuidance({
    legacy: legacyClarification({ text: 'Qual foi o valor?' }),
    suggested: { ambiguityType: 'account', optionsCount: 2 },
    active: false,
  });
  assert.equal(outcome.guidance.applied, false);
  assert.equal(outcome.finalText, 'Qual foi o valor?');
});

test('I-40: esclarecimento em shadow mode avalia mas não aplica', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'true' }),
    legacy: legacyClarification({ text: 'Qual foi o valor?', issueField: 'amount' }),
    engineResult: engineWithAmbiguity('account'),
    context: { isDev: true },
  });
  assert.equal(result.status, 'SHADOW_ONLY');
  assert.equal(result.applied, false);
  assert.equal(result.finalText, 'Qual foi o valor?');
});
