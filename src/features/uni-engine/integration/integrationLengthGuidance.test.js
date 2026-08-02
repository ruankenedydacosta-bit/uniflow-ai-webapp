// Integration — orientação de comprimento (RESPONSE_LENGTH_GUIDANCE,
// Parte 1). Só reduz quando existe forma curta segura conhecida; preferência
// detailed nunca é encurtada; confirmação/erro/sucesso nunca são tocados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import { applyResponseLengthGuidance } from './applyResponseLengthGuidance.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
} from './testFixtures.js';

const LONG_UNKNOWN = 'Entendi que pode ser um lançamento financeiro, mas não consegui identificar todos os detalhes. Pode reformular dizendo o valor e do que se trata? Por exemplo: "Gastei R$ 50 no mercado."';
const SHORT_KNOWN = 'Não consegui identificar os detalhes desse lançamento. Pode informar o valor e do que se trata?';

function engineShort(extra = {}) {
  return buildEngineResult({
    decisionLayer: { decisionType: 'respond', nextDecisionType: 'respond', risk: 'LOW', confidence: 0.9 },
    classification: { ambiguities: [], primaryIntent: 'unknown' },
    comparison: { missingFields: [], agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, shadowMode: false, environment: 'development', decisions: [buildActiveDecision('RESPONSE_LENGTH_GUIDANCE')] },
    ...extra,
  });
}

test('I-48: forma curta segura aplicada quando o motor pede short', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', text: LONG_UNKNOWN }),
    engineResult: engineShort(),
    context: { isDev: true },
  });
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.finalText, SHORT_KNOWN);
  assert.equal(result.lengthGuidance.lengthBand, 'short');
  assert.equal(result.lengthGuidance.applied, true);
});

test('I-49: preferência detailed nunca é encurtada', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', conversationStyle: 'detailed', text: LONG_UNKNOWN }),
    engineResult: engineShort(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, LONG_UNKNOWN);
  assert.equal(result.applied, false);
  assert.equal(result.lengthGuidance.reason, 'DETAILED_PREFERENCE_PRESERVED');
});

test('I-50: banda detailed nunca encurta (detalhada somente sob demanda)', () => {
  const outcome = applyResponseLengthGuidance({
    legacy: legacyClarification({ responseType: 'query', text: LONG_UNKNOWN }),
    suggested: { lengthBand: 'detailed' },
    active: true,
  });
  assert.equal(outcome.guidance.applied, false);
  assert.equal(outcome.finalText, LONG_UNKNOWN);
  assert.equal(outcome.guidance.reason, 'DETAILED_ON_DEMAND_ONLY');
});

test('I-51: sem forma curta segura, texto longo intacto', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', text: 'Este texto é longo, mas não possui uma forma curta cadastrada nesta versão da política.' }),
    engineResult: engineShort(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Este texto é longo, mas não possui uma forma curta cadastrada nesta versão da política.');
  assert.equal(result.applied, false);
});

test('I-52: texto curto dentro do limite não é tocado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', text: 'Seu saldo atual é R$ 1.000,00.' }),
    engineResult: engineShort(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Seu saldo atual é R$ 1.000,00.');
  assert.equal(result.applied, false);
});

test('I-53: confirmação nunca é encurtada', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'confirmation', text: LONG_UNKNOWN }),
    engineResult: engineShort(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, LONG_UNKNOWN);
  assert.equal(result.applied, false);
});

test('I-54: applyResponseLengthGuidance em shadow preserva texto longo', () => {
  const outcome = applyResponseLengthGuidance({
    legacy: legacyClarification({ responseType: 'query', text: LONG_UNKNOWN }),
    suggested: { lengthBand: 'short' },
    active: false,
  });
  assert.equal(outcome.guidance.applied, false);
  assert.equal(outcome.finalText, LONG_UNKNOWN);
});
