// Testes da Fase 10 — Integração do pipeline Fases 1–9 + saúde/observabilidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { UNI_ENGINE_VERSION, UNI_ENGINE_REVISION, isSerializableValue } from '../uniEngineContracts.js';
import { runEngineHealthCheck } from '../health/buildEngineHealth.js';
import { buildObservabilitySnapshot, summarizeObservability } from '../observability/buildObservabilitySnapshot.js';
import { phase10CoreConfig, phase10FullConfig, phase10Input } from './shared.js';

const memoryAdapter = {
  retrieveRelevantSync: () => ({
    data: {
      memories: [
        { id: 'mem-1', subjectKey: 'user', memoryType: 'preference', value: 'x', confidence: 0.9 },
      ],
    },
  }),
  evaluateCandidatesSync: () => ({ candidates: [] }),
};

test('pipeline completo (Fases 1–9) produz todas as seções', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  assert.equal(result.enabled, true);
  // Fase 1
  assert.ok(result.normalizedMessage);
  assert.ok(result.classification);
  assert.ok(result.epistemicState);
  assert.ok(result.plan);
  assert.ok(result.validation);
  assert.ok(result.shadowComparison);
  // Fase 2
  assert.ok(result.cognitiveContext);
  assert.ok(result.referenceResolution);
  assert.ok(result.suggestions);
  assert.ok(result.agreementMetrics);
  assert.ok(Array.isArray(result.divergenceDiagnostics));
  // Fase 3
  assert.ok(result.persistentMemory);
  assert.equal(result.persistentMemory.appliedToDecision, false);
  // Fase 4
  assert.ok(result.epistemicModel);
  assert.equal(result.epistemicModel.appliedToDecision, false);
  // Fases 5–9
  assert.ok(result.decisionLayer);
  assert.equal(result.decisionLayer.shadow.appliedToDecision, false);
  assert.ok(result.planning);
  assert.ok(result.goals);
  assert.ok(result.reflection);
  assert.ok(result.activation);
  assert.ok(Array.isArray(result.activation.decisions));
});

test('health completo com adapter de memória: apenas activation_blocked esperado', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  const health = runEngineHealthCheck({ config, result });
  const statuses = health.checks.map((check) => `${check.module}:${check.status}`);
  assert.ok(statuses.includes('memory:healthy'));
  assert.ok(statuses.includes('core:healthy'));
  assert.ok(statuses.includes('decision:healthy'));
  assert.ok(statuses.includes('planning:healthy'));
  assert.ok(statuses.includes('goals:healthy'));
  assert.ok(statuses.includes('reflection:healthy'));
  assert.ok(statuses.includes('epistemic:healthy'));
  assert.equal(health.status, 'activation_blocked');
});

test('health sem activation: agregado healthy', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  const health = runEngineHealthCheck({ config, result });
  assert.equal(health.status, 'healthy');
});

test('snapshot com activation reflete bloqueio como status agregado', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(snapshot.health, 'activation_blocked');
  assert.equal(snapshot.activation.enabled, true);
  assert.equal(snapshot.activation.decisionsCount > 0, true);
});

test('cascata de flags: seção some quando o módulo está desligado', () => {
  const config = phase10CoreConfig({
    VITE_UNI_ENGINE_DECISION_ENABLED: 'false',
    VITE_UNI_ENGINE_PLANNING_ENABLED: 'false',
    VITE_UNI_ENGINE_GOALS_ENABLED: 'false',
    VITE_UNI_ENGINE_REFLECTION_ENABLED: 'false',
    VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'false',
  });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.decisionLayer, null);
  assert.equal(result.planning, null);
  assert.equal(result.goals, null);
  assert.equal(result.reflection, null);
  assert.equal(result.epistemicModel, null);
  assert.ok(result.classification);
});

test('motor desligado → resultado vazio oficial e saudável', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.enabled, false);
  assert.equal(result.skipped, true);
  assert.equal(result.classification, null);
  const health = runEngineHealthCheck({ config, result });
  assert.equal(health.status, 'disabled');
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(snapshot.health, 'disabled');
  assert.equal(summarizeObservability(snapshot).enabled, false);
});

test('pipeline de Fases 1–2 sozinho permanece íntegro', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.enabled, true);
  assert.ok(result.plan);
  assert.ok(result.validation);
  assert.ok(result.shadowComparison);
  assert.ok(result.cognitiveContext);
  assert.equal(isSerializableValue(result), true);
});

test('latências por seção são positivas e razoáveis', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  const parts = [
    result.persistentMemory.diagnostics.latencyMs,
    result.decisionLayer.latencyMs,
    result.planning.latencyMs,
    result.reflection.latencyMs,
    result.epistemicModel.latencyMs,
  ];
  for (const part of parts) {
    assert.equal(typeof part, 'number');
    assert.ok(part > 0);
    assert.ok(part < 20, `latência ${part} fora do orçamento`);
  }
  assert.ok(result.diagnostics.latencyMs > 0);
});

test('todas as decisões de activation validam o contrato', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  for (const decision of result.activation.decisions) {
    assert.equal(typeof decision.capability, 'string');
    assert.ok(decision.capability.length > 0);
    assert.ok(['ACTIVE_TEST', 'ACTIVE_ROLLOUT', 'SHADOW_ONLY', 'ELIGIBLE', 'BLOCKED_BY_ENVIRONMENT', 'BLOCKED_BY_FLAG', 'BLOCKED_BY_POLICY', 'ERROR_SAFE', 'DISABLED'].includes(decision.activationStatus));
    assert.equal(typeof decision.latencyMs, 'number');
  }
});

test('engine permanece determinístico para o mesmo input (sem timings)', () => {
  const stripTimings = (value) => JSON.parse(JSON.stringify(value, (key, entry) => {
    if (key === 'latencyMs' || key === 'latency' || key === 'totalMs'
      || key === 'checkedAt' || key === 'timestamp' || key === 'correlationId') {
      return null;
    }
    if (typeof entry === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(entry)) {
      return null;
    }
    return entry;
  }));
  const config = phase10FullConfig();
  const first = runUniEngineShadow(phase10Input(), { config, memoryAdapter, correlationId: 'ue_det_1' });
  const second = runUniEngineShadow(phase10Input(), { config, memoryAdapter, correlationId: 'ue_det_1' });
  assert.deepEqual(stripTimings(first), stripTimings(second));
});

test('health reflete memória inconsistente quando flag ligada sem seção', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'true' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.persistentMemory, null);
  const health = runEngineHealthCheck({ config, result });
  assert.equal(health.checks.find((check) => check.module === 'memory').status, 'inconsistent');
});

test('redação da telemetria nunca expõe texto ou valores', async () => {
  const { buildUniEngineTelemetry, emitUniEngineTelemetry } = await import('../telemetry/uniEngineTelemetry.js');
  const telemetry = buildUniEngineTelemetry({
    correlationId: 'ue_t_1',
    classification: { messageType: 'action', primaryIntent: 'register_expense', confidence: 0.9, text: 'Gastei 50 reais' },
    plan: { executorExpected: 'execute_confirmed_financial_action' },
    validation: { valid: true },
    comparison: { status: 'agreement', pipelineIntent: 'register_expense' },
    diagnostics: { fallbackUsed: false },
    latencyMs: 5,
    metrics: { agreement: true, falsePositive: false },
    persistentMemory: null,
  });
  const captured = [];
  const redacted = emitUniEngineTelemetry(telemetry, (entry) => captured.push(entry));
  const json = JSON.stringify(redacted);
  assert.ok(!json.includes('Gastei'));
  assert.ok(!json.includes('50 reais'));
  assert.ok(json.includes('[redacted]'));
  assert.equal(isSerializableValue(redacted), true);
  assert.equal(captured.length, 1);
});

test('revisão 10.0 presente em resultado, health e snapshot', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config, memoryAdapter });
  const health = runEngineHealthCheck({ config, result });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(result.revision, UNI_ENGINE_REVISION);
  assert.equal(health.revision, UNI_ENGINE_REVISION);
  assert.equal(snapshot.revision, UNI_ENGINE_REVISION);
  assert.equal(result.engineVersion, UNI_ENGINE_VERSION);
});
