// Testes da Fase 10 — Health Check da Uni Engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { UNI_ENGINE_MODULE_NAMES, UNI_ENGINE_REVISION, UNI_ENGINE_VERSION } from '../uniEngineContracts.js';
import {
  HEALTH_STATUSES,
  isValidHealthStatus,
  isHealthFailure,
  resolveAggregateHealth,
  HEALTH_CHECK_SEVERITIES,
} from '../health/healthTypes.js';
import {
  createModuleHealth,
  createHealthCheck,
  createEmptyHealthCheck,
  validateHealthCheck,
  HEALTH_CHECK_VERSION,
} from '../health/healthContracts.js';
import {
  runEngineHealthCheck,
  validateEngineHealthCheck,
  isSerializableValue,
} from '../health/buildEngineHealth.js';
import { phase10CoreConfig, phase10FullConfig, phase10Input } from './shared.js';

// -----------------------------------------------
// healthTypes
// -----------------------------------------------
test('HEALTH_STATUSES é fechado e completo', () => {
  assert.deepEqual(HEALTH_STATUSES, [
    'healthy',
    'degraded',
    'disabled',
    'inconsistent',
    'contract_error',
    'telemetry_error',
    'activation_blocked',
    'fallback_active',
  ]);
  assert.equal(isValidHealthStatus('healthy'), true);
  assert.equal(isValidHealthStatus('fallback_active'), true);
  assert.equal(isValidHealthStatus('unknown'), false);
  assert.equal(isValidHealthStatus(42), false);
});

test('isHealthFailure classifica apenas os status de falha', () => {
  assert.equal(isHealthFailure('healthy'), false);
  assert.equal(isHealthFailure('degraded'), false);
  assert.equal(isHealthFailure('disabled'), true);
  assert.equal(isHealthFailure('inconsistent'), true);
  assert.equal(isHealthFailure('contract_error'), true);
  assert.equal(isHealthFailure('telemetry_error'), true);
  assert.equal(isHealthFailure('activation_blocked'), true);
  assert.equal(isHealthFailure('fallback_active'), true);
});

test('resolveAggregateHealth escolhe a maior severidade', () => {
  assert.equal(resolveAggregateHealth([]), 'degraded');
  assert.equal(resolveAggregateHealth([{ status: 'healthy' }, { status: 'healthy' }]), 'healthy');
  assert.equal(resolveAggregateHealth([{ status: 'healthy' }, { status: 'degraded' }]), 'degraded');
  assert.equal(resolveAggregateHealth([{ status: 'healthy' }, { status: 'fallback_active' }]), 'fallback_active');
  assert.equal(resolveAggregateHealth([{ status: 'fallback_active' }, { status: 'inconsistent' }]), 'inconsistent');
  assert.equal(resolveAggregateHealth([{ status: 'degraded' }, { status: 'contract_error' }]), 'contract_error');
  assert.equal(resolveAggregateHealth([{ status: 'healthy' }, { status: 'disabled' }]), 'disabled');
  assert.equal(resolveAggregateHealth([{ status: 'bogus' }]), 'degraded');
});

test('HEALTH_CHECK_SEVERITIES cobre todos os status', () => {
  for (const status of HEALTH_STATUSES) {
    assert.equal(typeof HEALTH_CHECK_SEVERITIES[status], 'number');
  }
});

// -----------------------------------------------
// healthContracts (formas puras)
// -----------------------------------------------
test('createModuleHealth normaliza entradas inválidas', () => {
  const check = createModuleHealth({ module: 'xenon', status: 'bogus', enabled: 'yes', latencyMs: 'fast' });
  assert.equal(check.module, 'unknown');
  assert.equal(check.status, 'degraded');
  assert.equal(check.enabled, true);
  assert.equal(check.shadowMode, false);
  assert.equal(check.latencyMs, null);
  assert.equal(check.errorCode, null);
  assert.equal(check.detail, null);
});

test('createModuleHealth preserva valores válidos e arredonda latência', () => {
  const check = createModuleHealth({
    module: 'decision',
    enabled: true,
    shadowMode: true,
    status: 'fallback_active',
    latencyMs: 12.34567,
    errorCode: 'DECISION_INTERNAL_ERROR',
    detail: 'safe path',
  });
  assert.equal(check.module, 'decision');
  assert.equal(check.status, 'fallback_active');
  assert.equal(check.latencyMs, 12.35);
  assert.equal(check.errorCode, 'DECISION_INTERNAL_ERROR');
  assert.equal(check.detail, 'safe path');
});

test('createHealthCheck calcula diagnostics a partir dos checks', () => {
  const health = createHealthCheck({
    engineVersion: UNI_ENGINE_VERSION,
    revision: UNI_ENGINE_REVISION,
    status: 'degraded',
    enabled: true,
    shadowMode: true,
    checks: [
      createModuleHealth({ module: 'core', enabled: true, status: 'healthy' }),
      createModuleHealth({ module: 'decision', enabled: true, status: 'fallback_active' }),
      createModuleHealth({ module: 'goals', enabled: true, status: 'inconsistent' }),
      createModuleHealth({ module: 'planning', enabled: true, status: 'contract_error' }),
      createModuleHealth({ module: 'memory', enabled: false, status: 'disabled' }),
    ],
    errorCodes: ['DECISION_INTERNAL_ERROR'],
    latencyMs: 3.5,
    checkedAt: '2026-08-01T00:00:00.000Z',
  });
  assert.equal(health.version, HEALTH_CHECK_VERSION);
  assert.equal(health.status, 'degraded');
  assert.equal(health.diagnostics.checksFailed, 3);
  assert.equal(health.diagnostics.fallbackActive, true);
  assert.equal(health.diagnostics.activationBlocked, false);
  assert.equal(health.diagnostics.inconsistentCount, 1);
  assert.equal(health.diagnostics.errorCount, 1);
  assert.equal(health.diagnostics.telemetryErrors, 0);
});

test('validateHealthCheck aceita um health válido', () => {
  const health = createHealthCheck({
    status: 'healthy',
    enabled: true,
    shadowMode: true,
    checks: [],
    latencyMs: 1,
  });
  const validation = validateHealthCheck(health);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test('validateHealthCheck rejeita status, tipos e serialização inválidos', () => {
  assert.deepEqual(validateHealthCheck(null).errors, ['HEALTH_NOT_OBJECT']);
  assert.deepEqual(validateHealthCheck({ status: 'bogus', enabled: true, shadowMode: true, checks: [] }).errors, ['HEALTH_STATUS_INVALID']);
  assert.ok(validateHealthCheck({ status: 'healthy', enabled: 'x', shadowMode: true, checks: [] }).errors.includes('ENABLED_INVALID'));
  assert.ok(validateHealthCheck({ status: 'healthy', enabled: true, shadowMode: true, checks: 'x' }).errors.includes('CHECKS_INVALID'));
  assert.ok(validateHealthCheck({ status: 'healthy', enabled: true, shadowMode: true, checks: [], latencyMs: -1 }).errors.includes('LATENCY_MS_INVALID'));
  assert.ok(validateHealthCheck({ status: 'healthy', enabled: true, shadowMode: true, checks: [], fn: () => {} }).errors.includes('NOT_SERIALIZABLE'));
});

test('createEmptyHealthCheck é válido e desligado', () => {
  const empty = createEmptyHealthCheck({ correlationId: 'ue_test_1' });
  const validation = validateHealthCheck(empty);
  assert.equal(validation.valid, true);
  assert.equal(empty.status, 'disabled');
  assert.equal(empty.enabled, false);
  assert.equal(empty.correlationId, 'ue_test_1');
  assert.deepEqual(empty.checks, []);
});

// -----------------------------------------------
// runEngineHealthCheck — motor desligado
// -----------------------------------------------
test('motor desligado → health disabled com 9 checks', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_ENABLED: 'false' });
  const health = runEngineHealthCheck({ config, result: null });
  assert.equal(health.status, 'disabled');
  assert.equal(health.enabled, false);
  assert.equal(health.checks.length, 9);
  assert.equal(health.checks.every((check) => check.status === 'disabled'), true);
  assert.equal(health.checks.every((check) => check.enabled === false), true);
  assert.equal(health.checks.map((check) => check.module).join(','), UNI_ENGINE_MODULE_NAMES.join(','));
  assert.equal(validateEngineHealthCheck(health).valid, true);
});

test('config nulo ou não-objeto → health disabled', () => {
  for (const config of [null, undefined, 'x', 42]) {
    const health = runEngineHealthCheck({ config });
    assert.equal(health.status, 'disabled');
  }
});

test('opções não-objeto → health disabled', () => {
  const health = runEngineHealthCheck(null);
  assert.equal(health.status, 'disabled');
  assert.equal(health.correlationId, null);
});

// -----------------------------------------------
// runEngineHealthCheck — motor ligado, módulos desligados
// -----------------------------------------------
test('motor ligado sem módulos → healthy', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result });
  assert.equal(health.status, 'healthy');
  assert.equal(health.enabled, true);
  assert.equal(health.checks.find((check) => check.module === 'core').status, 'healthy');
  assert.equal(health.checks.find((check) => check.module === 'decision').status, 'disabled');
  assert.equal(health.checks.find((check) => check.module === 'telemetry').status, 'healthy');
});

test('health propagado tem revisão 10.0, versão 2.0 e latência finita', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result });
  assert.equal(health.revision, UNI_ENGINE_REVISION);
  assert.equal(health.engineVersion, UNI_ENGINE_VERSION);
  assert.equal(typeof health.latencyMs, 'number');
  assert.ok(health.latencyMs >= 0);
  assert.equal(typeof health.checkedAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(health.checkedAt)));
});

test('correlationId é propagado quando fornecido', () => {
  const config = phase10CoreConfig();
  const health = runEngineHealthCheck({ config, correlationId: 'ue_custom_1' });
  assert.equal(health.correlationId, 'ue_custom_1');
});

// -----------------------------------------------
// runEngineHealthCheck — estados específicos
// -----------------------------------------------
test('input inválido → core fallback_active e agregado fallback_active', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(null, { config });
  const health = runEngineHealthCheck({ config, result });
  assert.equal(result.fallbackUsed, true);
  assert.equal(health.checks.find((check) => check.module === 'core').status, 'fallback_active');
  assert.equal(health.checks.find((check) => check.module === 'core').errorCode, 'INPUT_NOT_OBJECT');
  assert.equal(health.status, 'fallback_active');
});

test('fallback ativo tem prioridade sobre inconsistent no agregado', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'true' });
  const result = runUniEngineShadow(null, { config });
  const health = runEngineHealthCheck({ config, result });
  const statuses = health.checks.map((check) => check.status);
  assert.ok(statuses.includes('fallback_active'));
  assert.ok(statuses.includes('inconsistent'));
  assert.equal(health.status, 'fallback_active');
});

test('memória ligada sem adapter → memory inconsistent (seção ausente)', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'true' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result });
  assert.equal(health.checks.find((check) => check.module === 'memory').status, 'inconsistent');
  assert.equal(health.status, 'inconsistent');
});

test('activation ligada sem decisões saudáveis → activation_blocked', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result });
  assert.equal(health.checks.find((check) => check.module === 'activation').status, 'activation_blocked');
  assert.equal(health.status, 'activation_blocked');
});

test('activation ligada com seção ausente → activation inconsistent', () => {
  const config = phase10FullConfig();
  const result = runUniEngineShadow(phase10Input(), { config });
  const withSectionRemoved = { ...result, activation: null };
  const health = runEngineHealthCheck({ config, result: withSectionRemoved });
  assert.equal(health.checks.find((check) => check.module === 'activation').status, 'inconsistent');
});

test('telemetria com falhas → telemetry_error com prioridade máxima', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'true' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result, telemetryErrors: ['boom', 'boom2'] });
  assert.equal(health.status, 'telemetry_error');
  assert.equal(health.checks.find((check) => check.module === 'telemetry').status, 'telemetry_error');
  assert.equal(health.checks.find((check) => check.module === 'telemetry').errorCode, 'TELEMETRY_EMISSION_FAILED');
  assert.equal(health.telemetryErrors, 2);
  assert.equal(health.diagnostics.telemetryErrors, 2);
});

test('telemetria ligada sem falhas → telemetry healthy', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'true' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result, telemetryErrors: [] });
  assert.equal(health.status, 'healthy');
  assert.equal(health.checks.find((check) => check.module === 'telemetry').status, 'healthy');
});

test('telemetria desligada → telemetry disabled, sem errorCode', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'false' });
  const health = runEngineHealthCheck({ config });
  const telemetry = health.checks.find((check) => check.module === 'telemetry');
  assert.equal(telemetry.enabled, false);
  assert.equal(telemetry.status, 'healthy');
  assert.equal(telemetry.errorCode, null);
});

test('result não-objeto → core degraded com RESULT_MISSING', () => {
  const config = phase10CoreConfig();
  const health = runEngineHealthCheck({ config, result: 'nope' });
  const core = health.checks.find((check) => check.module === 'core');
  assert.equal(core.status, 'degraded');
  assert.equal(core.detail, 'RESULT_MISSING');
  assert.equal(health.status, 'degraded');
});

test('contrato de seção corrompido → contract_error na seção e no agregado', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  result.planning.confidence = 'high';
  result.planning.enabled = 'yes';
  const health = runEngineHealthCheck({ config, result });
  assert.equal(health.checks.find((check) => check.module === 'planning').status, 'contract_error');
  assert.equal(health.status, 'contract_error');
});

test('latências por módulo são lidas sem executar os módulos', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result });
  const core = health.checks.find((check) => check.module === 'core');
  const decision = health.checks.find((check) => check.module === 'decision');
  const planning = health.checks.find((check) => check.module === 'planning');
  assert.equal(typeof core.latencyMs, 'number');
  assert.ok(core.latencyMs > 0);
  assert.equal(typeof decision.latencyMs, 'number');
  assert.ok(decision.latencyMs > 0);
  assert.equal(typeof planning.latencyMs, 'number');
  assert.ok(planning.latencyMs > 0);
});

test('todo health de saída é serializável e sem funções', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  for (const scenario of [
    runEngineHealthCheck({ config, result }),
    runEngineHealthCheck({ config: phase10CoreConfig(), result: runUniEngineShadow(phase10Input(), { config: phase10CoreConfig() }) }),
    runEngineHealthCheck({ config, telemetryErrors: ['e'] }),
    runEngineHealthCheck({ config: phase10CoreConfig({ VITE_UNI_ENGINE_ENABLED: 'false' }) }),
  ]) {
    assert.equal(isSerializableValue(scenario), true);
    assert.equal(JSON.parse(JSON.stringify(scenario)).status, scenario.status);
  }
});
