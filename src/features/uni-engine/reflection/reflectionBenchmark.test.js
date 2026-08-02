// Benchmark de performance do Reflection & Learning Engine (Fase 8).
//
// Metas: mediana < 10ms, p95 < 20ms por execução, com aquecimento e
// cenário realista (correção explícita gerando candidato).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReflectionEngine } from './runReflectionEngine.js';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { buildBaseInput } from '../testFixtures.js';
import { REFLECTION_TEST_CONFIG } from './reflectionTestFixtures.js';

const INPUT = {
  messageText: 'não é alimentação, é saúde',
  featureFlags: {
    reflectionShadowMode: true,
    reflectionTelemetryEnabled: false,
    learningCandidatesEnabled: true,
  },
  now: Date.parse('2026-08-01T00:00:00.000Z'),
};

function measure(fn, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { median, p95, max: sorted[sorted.length - 1] };
}

test('benchmark: runReflectionEngine cumpre metas de latência', () => {
  const warmup = measure(() => runReflectionEngine(INPUT), 200);
  const result = measure(() => runReflectionEngine(INPUT), 1000);
  assert.ok(result.median < 10, `mediana ${result.median.toFixed(2)}ms deve ser < 10ms`);
  assert.ok(result.p95 < 20, `p95 ${result.p95.toFixed(2)}ms deve ser < 20ms`);
  assert.ok(warmup.median >= 0);
});

test('benchmark: pipeline completo com reflexão cumpre meta de p95', () => {
  const warmup = measure(
    () => runUniEngineShadow(buildBaseInput(), { config: REFLECTION_TEST_CONFIG }),
    100,
  );
  const result = measure(
    () => runUniEngineShadow(buildBaseInput(), { config: REFLECTION_TEST_CONFIG }),
    200,
  );
  assert.ok(result.p95 < 20, `p95 ${result.p95.toFixed(2)}ms deve ser < 20ms`);
  assert.ok(warmup.median >= 0);
});
