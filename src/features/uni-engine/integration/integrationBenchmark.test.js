// Integration — benchmark de performance (Parte 1). A integração é leve o
// suficiente para rodar no caminho crítico sem comprometer o chat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
} from './testFixtures.js';
import { INTEGRATION_POLICY } from './integrationPolicy.js';

function realisticRun(config = buildIntegrationConfig()) {
  return runUniEngineIntegration({
    config,
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true },
  });
}

test('I-103: latência reportada é numérica e finita', () => {
  const result = realisticRun();
  assert.equal(typeof result.latencyMs, 'number');
  assert.equal(Number.isFinite(result.latencyMs), true);
});

test('I-104: latência dentro do alvo mediano (5ms) no caminho feliz', () => {
  const samples = Array.from({ length: 20 }, () => realisticRun().latencyMs);
  const median = samples.sort((a, b) => a - b)[10];
  assert.ok(median <= INTEGRATION_POLICY.latencyTargets.medianMs,
    `mediana ${median}ms excede alvo ${INTEGRATION_POLICY.latencyTargets.medianMs}ms`);
});

test('I-105: p95 dentro do alvo (12ms) com configuração completa', () => {
  const config = buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_TELEMETRY: 'true' });
  const samples = Array.from({ length: 40 }, () => realisticRun(config).latencyMs)
    .sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)];
  assert.ok(p95 <= INTEGRATION_POLICY.latencyTargets.p95Ms,
    `p95 ${p95}ms excede alvo ${INTEGRATION_POLICY.latencyTargets.p95Ms}ms`);
});

test('I-106: fallback é tão rápido quanto o caminho ativo', () => {
  const fallbackSamples = Array.from({ length: 10 }, () => runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({ activation: { enabled: true, decisions: [] } }),
    context: { isDev: true },
  }).latencyMs);
  const activeSample = realisticRun().latencyMs;
  const fallbackMedian = fallbackSamples.sort((a, b) => a - b)[5];
  assert.ok(fallbackMedian < 15, `fallback lento demais: ${fallbackMedian}ms`);
  assert.ok(activeSample < 15, `ativo lento demais: ${activeSample}ms`);
});

test('I-107: integração roda no caminho crítico sem bloquear a UI', () => {
  const start = performance.now();
  realisticRun();
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 30, `execução tomou ${elapsed}ms`);
});

test('I-108: limite de capacidades por execução respeitado (máx. 6)', () => {
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
          buildActiveDecision('CLARIFICATION_GUIDANCE'),
          buildActiveDecision('RESPONSE_STYLE_GUIDANCE'),
          buildActiveDecision('RESPONSE_LENGTH_GUIDANCE'),
          buildActiveDecision('METADATA_ONLY'),
          buildActiveDecision('DIAGNOSTICS_ONLY'),
          buildActiveDecision('QUESTION_GUIDANCE'),
        ],
      },
    }),
    context: { isDev: true },
  });
  assert.ok(result.capabilitiesRequested.length <= INTEGRATION_POLICY.maxCapabilitiesPerRun);
});
