// Testes da Fase 10 — Casos de borda de health e observability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { UNI_ENGINE_MODULE_NAMES } from '../uniEngineContracts.js';
import { runEngineHealthCheck } from '../health/buildEngineHealth.js';
import {
  createModuleHealth,
  createHealthCheck,
  validateHealthCheck,
} from '../health/healthContracts.js';
import { buildObservabilitySnapshot } from '../observability/buildObservabilitySnapshot.js';
import { createObservabilitySnapshot } from '../observability/observabilityContracts.js';
import { phase10CoreConfig, phase10FullConfig, phase10Input } from './shared.js';

test('health desligado mantém correlationId e checks canônicos', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_ENABLED: 'false' });
  const health = runEngineHealthCheck({ config, correlationId: 'ue_off_1' });
  assert.equal(health.correlationId, 'ue_off_1');
  assert.deepEqual(health.checks.map((check) => check.module), [...UNI_ENGINE_MODULE_NAMES]);
  assert.equal(validateHealthCheck(health).valid, true);
});

test('health agrega errorCodes únicos dos checks', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(null, { config });
  const health = runEngineHealthCheck({ config, result });
  assert.ok(health.errorCodes.includes('INPUT_NOT_OBJECT'));
  assert.equal(new Set(health.errorCodes).size, health.errorCodes.length);
});

test('health shadowMode reflete o config', () => {
  const config = phase10CoreConfig();
  const health = runEngineHealthCheck({ config });
  assert.equal(health.shadowMode, true);
  const config2 = phase10CoreConfig({ VITE_UNI_ENGINE_SHADOW_MODE: 'false' });
  const health2 = runEngineHealthCheck({ config2 });
  assert.equal(health2.shadowMode, false);
});

test('engine sem shadow mode → resultado desligado oficial', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_SHADOW_MODE: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.enabled, false);
  assert.equal(result.skipped, true);
  assert.equal(result.diagnostics.errorCode, 'ENGINE_DISABLED');
});

test('health de motor desligado por shadow: disabled', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_SHADOW_MODE: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result });
  assert.equal(health.status, 'disabled');
});

test('snapshot tem exatamente 9 entradas de módulo', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(snapshot.modules.length, 9);
  assert.deepEqual(snapshot.modules.map((entry) => entry.module), [...UNI_ENGINE_MODULE_NAMES]);
});

test('snapshot sem resultado: totalLatencyMs nulo e health coerente', () => {
  const config = phase10CoreConfig();
  const snapshot = buildObservabilitySnapshot({ config, result: null });
  assert.equal(snapshot.totalLatencyMs, null);
  assert.ok(['healthy', 'degraded'].includes(snapshot.health));
  assert.equal(snapshot.modules.length, 9);
});

test('snapshot com telemetryErrors contabiliza no bloco telemetry', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'true' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result, telemetryErrors: ['e1', 'e2'] });
  assert.equal(snapshot.telemetry.enabled, true);
  assert.equal(snapshot.telemetry.errorCount, 2);
  assert.equal(snapshot.health, 'telemetry_error');
});

test('snapshot shadow/fallback têm formas fixas', () => {
  const snapshot = createObservabilitySnapshot({});
  assert.deepEqual(snapshot.shadow, {});
  assert.deepEqual(snapshot.fallback, { active: false, reasons: [] });
  assert.deepEqual(snapshot.circuitBreaker, { open: false, openedCapabilities: [] });
});

test('health latência própria é medida e finita', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result });
  assert.equal(typeof health.latencyMs, 'number');
  assert.ok(Number.isFinite(health.latencyMs));
  assert.ok(health.latencyMs >= 0);
});

test('health em modo degraded expõe detail de diagnóstico', () => {
  const config = phase10CoreConfig();
  const health = runEngineHealthCheck({ config, result: 'nope' });
  const core = health.checks.find((check) => check.module === 'core');
  assert.equal(core.status, 'degraded');
  assert.equal(core.detail, 'RESULT_MISSING');
});

test('createHealthCheck corta checks acima de 16 e errorCodes acima de 16', () => {
  const checks = Array.from({ length: 20 }, () => createModuleHealth({ module: 'core', status: 'healthy' }));
  const health = createHealthCheck({ status: 'healthy', checks, errorCodes: Array.from({ length: 20 }, (_, i) => `E${i}`) });
  assert.equal(health.checks.length, 16);
  assert.equal(health.errorCodes.length, 16);
});

test('createModuleHealth rejeita módulos fora do catálogo', () => {
  const check = createModuleHealth({ module: 'evil', status: 'healthy' });
  assert.equal(check.module, 'unknown');
});

test('módulos opcionais desligados não geram erro no health', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result });
  for (const module of ['decision', 'planning', 'goals', 'reflection', 'memory', 'epistemic', 'activation']) {
    const check = health.checks.find((entry) => entry.module === module);
    assert.equal(check.status, 'disabled');
    assert.equal(check.enabled, false);
  }
});

test('health com activation ligada e seção sem decisões → activation_blocked', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const withEmptyActivation = { ...result, activation: { enabled: true, decisions: [] } };
  const health = runEngineHealthCheck({ config, result: withEmptyActivation });
  assert.equal(health.checks.find((check) => check.module === 'activation').status, 'activation_blocked');
});

test('estado inconsistente: flag ligada mas seção ausente em cada módulo', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  for (const module of ['decision', 'planning', 'goals', 'reflection']) {
    const withoutSection = { ...result, [module === 'decision' ? 'decisionLayer' : module]: null };
    const health = runEngineHealthCheck({ config, result: withoutSection });
    assert.equal(health.checks.find((check) => check.module === module).status, 'inconsistent', module);
  }
});

test('validação final: health e snapshot sempre válidos em 3 cenários', () => {
  const configs = [
    phase10CoreConfig(),
    phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' }),
    phase10CoreConfig({ VITE_UNI_ENGINE_ENABLED: 'false' }),
  ];
  for (const config of configs) {
    const result = runUniEngineShadow(phase10Input(), { config });
    const health = runEngineHealthCheck({ config, result });
    const snapshot = buildObservabilitySnapshot({ config, result });
    assert.equal(validateHealthCheck(health).valid, true);
    assert.equal(typeof snapshot.version, 'string');
  }
});
