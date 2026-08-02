// Testes da Fase 10 — Benchmark de latência e orçamentos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { runEngineHealthCheck } from '../health/buildEngineHealth.js';
import { buildObservabilitySnapshot } from '../observability/buildObservabilitySnapshot.js';
import { phase10FullConfig, phase10Input } from './shared.js';

const memoryAdapter = {
  retrieveRelevantSync: () => ({ data: { memories: [] } }),
  evaluateCandidatesSync: () => ({ candidates: [] }),
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function runBenchmark(times, fn) {
  for (let i = 0; i < times; i += 1) fn();
  return times;
}

test('motor completo cabe no orçamento de 50ms (mediana)', () => {
  const config = phase10FullConfig();
  const latencies = [];
  runBenchmark(15, () => {
    const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
    latencies.push(result.diagnostics.latencyMs);
  });
  const medianLatency = median(latencies);
  assert.ok(medianLatency < 50, `mediana ${medianLatency}ms acima do orçamento`);
  assert.ok(medianLatency > 0);
});

test('cada módulo cabe no orçamento de 20ms (mediana)', () => {
  const config = phase10FullConfig();
  for (let i = 0; i < 15; i += 1) {
    const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
    const samples = {
      memory: result.persistentMemory.diagnostics.latencyMs,
      epistemic: result.epistemicModel.latencyMs,
      decision: result.decisionLayer.latencyMs,
      planning: result.planning.latencyMs,
      goals: result.goals.latencyMs,
      reflection: result.reflection.latencyMs,
    };
    for (const [name, value] of Object.entries(samples)) {
      assert.ok(value < 20, `${name} ${value}ms acima do orçamento`);
    }
  }
});

test('health check cabe no orçamento de 10ms', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  const durations = [];
  for (let i = 0; i < 20; i += 1) {
    const start = performance.now();
    runEngineHealthCheck({ config, result });
    durations.push(performance.now() - start);
  }
  assert.ok(median(durations) < 10, `mediana ${median(durations)}ms acima do orçamento`);
});

test('snapshot de observability cabe no orçamento de 10ms', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  const durations = [];
  for (let i = 0; i < 20; i += 1) {
    const start = performance.now();
    buildObservabilitySnapshot({ config, result });
    durations.push(performance.now() - start);
  }
  assert.ok(median(durations) < 10, `mediana ${median(durations)}ms acima do orçamento`);
});

test('health check é leitura pura: não muda o resultado', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  const before = JSON.stringify(result);
  runEngineHealthCheck({ config, result });
  assert.equal(JSON.stringify(result), before);
});

test('snapshot é leitura pura: não muda o resultado', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  const before = JSON.stringify(result);
  buildObservabilitySnapshot({ config, result });
  assert.equal(JSON.stringify(result), before);
});

test('latência do motor em erro é baixa (caminho seguro)', () => {
  const config = phase10FullConfig();
  const latencies = [];
  for (let i = 0; i < 10; i += 1) {
    const result = runUniEngineShadow(null, { config });
    latencies.push(result.diagnostics.latencyMs);
  }
  assert.ok(median(latencies) < 20, `mediana ${median(latencies)}ms acima do orçamento`);
});

test('caminho desligado é instantâneo', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_ENABLED: 'false' });
  const start = performance.now();
  for (let i = 0; i < 50; i += 1) {
    runUniEngineShadow(phase10Input(), { config });
  }
  const average = (performance.now() - start) / 50;
  assert.ok(average < 5, `média ${average}ms acima do orçamento`);
});
