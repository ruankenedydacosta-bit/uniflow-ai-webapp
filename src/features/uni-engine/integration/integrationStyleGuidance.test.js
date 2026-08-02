// Integration — orientação de estilo (RESPONSE_STYLE_GUIDANCE, Parte 1). A
// preferência persistida SEMPRE vence a sugestão do motor; nunca reescreve
// conteúdo factual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import { applyResponseStyleGuidance } from './applyResponseStyleGuidance.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
} from './testFixtures.js';

function engineResponding(extra = {}) {
  return buildEngineResult({
    decisionLayer: { decisionType: 'respond', nextDecisionType: 'respond', risk: 'LOW', confidence: 0.9 },
    classification: { ambiguities: [], primaryIntent: 'query_balance' },
    comparison: { missingFields: [], agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, shadowMode: false, environment: 'development', decisions: [buildActiveDecision('RESPONSE_STYLE_GUIDANCE')] },
    ...extra,
  });
}

test('I-41: sem preferência persistida, sugestão concisa do motor vira simple', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', text: 'Seu saldo atual é R$ 1.000,00. Você tem também R$ 350,00 em investimentos.' }),
    engineResult: engineResponding(),
    context: { isDev: true },
  });
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.styleGuidance.styleKey, 'simple');
  assert.equal(result.styleGuidance.applied, true);
  assert.equal(result.finalText, 'Seu saldo atual é R$ 1.000,00. Você tem também R$ 350,00 em investimentos.');
});

test('I-42: preferência detailed do usuário vence sugestão concisa do motor', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', conversationStyle: 'detailed', text: 'Seu saldo atual é R$ 1.000,00.' }),
    engineResult: engineResponding(),
    context: { isDev: true },
  });
  assert.equal(result.styleGuidance.styleKey, 'detailed');
  assert.equal(result.styleGuidance.respectedPreference, true);
  assert.equal(result.finalText, 'Seu saldo atual é R$ 1.000,00.');
});

test('I-43: preferência simple nunca é rebaixada', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', conversationStyle: 'simple', text: 'Saldo: R$ 1.000,00.' }),
    engineResult: engineResponding({ decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 } }),
    context: { isDev: true },
  });
  assert.equal(result.styleGuidance.styleKey, 'simple');
});

test('I-44: sem ativação, estilo não é aplicado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', text: 'Seu saldo atual é R$ 1.000,00.' }),
    engineResult: buildEngineResult({ activation: { enabled: true, decisions: [] } }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.styleGuidance, null);
});

test('I-45: confirmação preserva texto — estilo é orientação, nunca reescrita', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'confirmation', text: 'Pronto! Sua receita de R$ 500,00 foi registrada.' }),
    engineResult: engineResponding(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Pronto! Sua receita de R$ 500,00 foi registrada.');
  assert.equal(result.applied, false);
});

test('I-46: applyResponseStyleGuidance com preferência nula segue o motor', () => {
  const outcome = applyResponseStyleGuidance({
    legacy: legacyClarification({ responseType: 'query', conversationStyle: null }),
    suggested: { styleKey: 'concise', toneBand: 'neutral' },
    active: true,
  });
  assert.equal(outcome.guidance.styleKey, 'simple');
  assert.equal(outcome.guidance.applied, true);
  assert.equal(outcome.guidance.reason, 'STYLE_SUGGESTED');
});

test('I-47: preferência normal respeitada mesmo com sugestão concisa', () => {
  const outcome = applyResponseStyleGuidance({
    legacy: legacyClarification({ responseType: 'query', conversationStyle: 'normal' }),
    suggested: { styleKey: 'concise', toneBand: 'neutral' },
    active: true,
  });
  assert.equal(outcome.guidance.styleKey, 'normal');
  assert.equal(outcome.guidance.reason, 'PREFERENCE_RESPECTED');
});
