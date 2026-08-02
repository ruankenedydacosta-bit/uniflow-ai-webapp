// Integration — regressão global (Parte 1). O pipeline legado permanece a
// fonte da verdade; a integração é uma camada transparente que nunca
// degrada a experiência existente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import { createEmptyIntegrationResult } from './integrationContracts.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  buildShadowDecision,
  legacyClarification,
  EXPENSE_ACCOUNT_QUESTION,
  AMOUNT_QUESTION,
} from './testFixtures.js';

test('I-109: texto legado é sempre a base — finalText nunca fica vazio quando há texto', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({ activation: { enabled: true, decisions: [] } }),
    context: { isDev: true },
  });
  assert.ok(result.finalText.length > 0);
});

test('I-110: resultado com shadow mode informa shadowComparison correto', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'true' }),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 2 } },
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.shadowComparison.mode, 'shadow');
  assert.equal(result.shadowComparison.divergenceCount, 2);
  assert.equal(result.shadowComparison.decisionCount, 1);
});

test('I-111: shadow decision de capacidade autorizada nunca aplica na integração', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'true' }),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: { enabled: true, decisions: [buildShadowDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'SHADOW_ONLY');
  assert.equal(result.applied, false);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-112: diagnóstico é redigido — sem texto completo, IDs ou valores', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: 'Em qual conta você fez esse pagamento?' }),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
  const json = JSON.stringify(result.diagnostics);
  assert.equal(json.includes('Em qual conta'), false);
  assert.ok(result.diagnostics.some(
    (d) => d.reason === 'capabilities_requested' && d.metadata?.requested?.includes('QUESTION_GUIDANCE'),
  ));
});

test('I-113: capacidades aplicadas refletem apenas o que mudou texto', () => {
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
  assert.equal(result.applied, true);
  assert.equal(result.legacyPreserved, true);
  assert.deepEqual(result.capabilitiesApplied, ['QUESTION_GUIDANCE']);
});

test('I-114: quando nada muda, legacyPreserved permanece true', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('METADATA_ONLY')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.applied, false);
  assert.equal(result.legacyPreserved, true);
});

test('I-115: decisão duplicada da mesma capacidade é deduplicada', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: {
        enabled: true,
        decisions: [
          buildActiveDecision('QUESTION_GUIDANCE'),
          buildActiveDecision('QUESTION_GUIDANCE'),
        ],
      },
    }),
    context: { isDev: true },
  });
  assert.deepEqual(result.capabilitiesRequested.filter((c) => c === 'QUESTION_GUIDANCE').length, 1);
});

test('I-116: limpeza de contexto ausente nunca lança', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: null,
  });
  assert.equal(result.applied, true);
  assert.equal(result.finalText, AMOUNT_QUESTION);
});

test('I-117: texto com espaços é normalizado pelo adapter, sem corromper template', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: '  Em qual conta você fez esse pagamento?  ' }),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.finalText, AMOUNT_QUESTION);
});

test('I-118: fallback com razão desconhecida mantém contrato válido', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: null,
    engineResult: null,
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.fallbackReason, 'LEGACY_INVALID');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('I-119: engineResult nulo com integração ligada → fallback seguro', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: null,
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.fallbackReason, 'ACTIVATION_DECISIONS_MISSING');
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-120: resultado nunca expõe o texto do usuário nem IDs em nenhum campo', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: {
        enabled: true,
        decisions: [buildActiveDecision('QUESTION_GUIDANCE', { correlationId: 'user-99' })],
      },
    }),
    context: { isDev: true },
  });
  const json = JSON.stringify(result);
  assert.equal(json.includes('user-99'), false);
});

test('I-121: createEmptyIntegrationResult é idempotente e seguro', () => {
  const first = createEmptyIntegrationResult({ enabled: false });
  const second = createEmptyIntegrationResult({ enabled: false });
  assert.deepEqual(first, second);
  assert.equal(first.applied, false);
  assert.equal(first.legacyPreserved, true);
  assert.equal(first.fallbackUsed, true);
});
