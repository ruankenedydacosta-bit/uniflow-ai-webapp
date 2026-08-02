// Testes da Fase 10 — Observability da Uni Engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { UNI_ENGINE_MODULE_NAMES, UNI_ENGINE_REVISION, UNI_ENGINE_VERSION, isSerializableValue } from '../uniEngineContracts.js';
import {
  buildObservabilitySnapshot,
  summarizeObservability,
  validateObservabilitySnapshotOutput,
} from '../observability/buildObservabilitySnapshot.js';
import {
  createModuleObservability,
  createObservabilitySnapshot,
  createEmptyObservabilitySnapshot,
  validateObservabilitySnapshot,
  redactObservabilitySnapshot,
} from '../observability/observabilityContracts.js';
import {
  OBSERVABILITY_MODULE_STATUSES,
  OBSERVABILITY_SNAPSHOT_VERSION,
  OBSERVABILITY_ALLOWED_FIELDS,
  isValidObservabilityModuleStatus,
  observabilityConfidenceBand,
  observabilityRiskBand,
} from '../observability/observabilityTypes.js';
import { UNI_ENGINE_MODULE_LATENCY_KEYS } from '../observability/latencySources.js';
import { phase10CoreConfig, phase10FullConfig, phase10Input } from './shared.js';

// -----------------------------------------------
// observabilityTypes
// -----------------------------------------------
test('OBSERVABILITY_MODULE_STATUSES é fechado', () => {
  assert.deepEqual(OBSERVABILITY_MODULE_STATUSES, ['active', 'disabled', 'inconsistent', 'error', 'unknown']);
  assert.equal(isValidObservabilityModuleStatus('active'), true);
  assert.equal(isValidObservabilityModuleStatus('error'), true);
  assert.equal(isValidObservabilityModuleStatus('healthy'), false);
});

test('observabilityConfidenceBand mapeia faixas sem expor valores', () => {
  assert.equal(observabilityConfidenceBand(0.95), 'high');
  assert.equal(observabilityConfidenceBand(0.8), 'high');
  assert.equal(observabilityConfidenceBand(0.7), 'medium');
  assert.equal(observabilityConfidenceBand(0.6), 'medium');
  assert.equal(observabilityConfidenceBand(0.55), 'low');
  assert.equal(observabilityConfidenceBand(0.4), 'low');
  assert.equal(observabilityConfidenceBand(0.2), 'very_low');
  assert.equal(observabilityConfidenceBand(null), null);
  assert.equal(observabilityConfidenceBand('high'), null);
});

test('observabilityRiskBand apenas propaga strings', () => {
  assert.equal(observabilityRiskBand('HIGH'), 'HIGH');
  assert.equal(observabilityRiskBand('LOW'), 'LOW');
  assert.equal(observabilityRiskBand(null), null);
  assert.equal(observabilityRiskBand(7), null);
});

test('allowlist do snapshot cobre todos os campos do contrato', () => {
  const snapshot = createEmptyObservabilitySnapshot();
  for (const key of Object.keys(snapshot)) {
    assert.ok(OBSERVABILITY_ALLOWED_FIELDS.includes(key), `falta allowlist: ${key}`);
  }
});

test('UNI_ENGINE_MODULE_LATENCY_KEYS cobre os 9 módulos', () => {
  assert.equal(Object.keys(UNI_ENGINE_MODULE_LATENCY_KEYS).length, 9);
  for (const module of UNI_ENGINE_MODULE_NAMES) {
    assert.ok(module in UNI_ENGINE_MODULE_LATENCY_KEYS);
  }
  assert.equal(UNI_ENGINE_MODULE_LATENCY_KEYS.telemetry, null);
  assert.equal(typeof UNI_ENGINE_MODULE_LATENCY_KEYS.core, 'string');
});

// -----------------------------------------------
// observabilityContracts (formas puras)
// -----------------------------------------------
test('createModuleObservability normaliza e valida', () => {
  const entry = createModuleObservability({ module: 'core', status: 'active', enabled: true, shadowMode: false, latencyMs: 5.555 });
  assert.equal(entry.module, 'core');
  assert.equal(entry.status, 'active');
  assert.equal(entry.latencyMs, 5.555);
  const bogus = createModuleObservability({ module: 'nope', status: 'bogus' });
  assert.equal(bogus.module, 'unknown');
  assert.equal(bogus.status, 'unknown');
});

test('createEmptyObservabilitySnapshot é válido', () => {
  const snapshot = createEmptyObservabilitySnapshot({ revision: UNI_ENGINE_REVISION });
  const validation = validateObservabilitySnapshot(snapshot);
  assert.equal(validation.valid, true);
  assert.equal(snapshot.version, OBSERVABILITY_SNAPSHOT_VERSION);
  assert.equal(snapshot.health, 'disabled');
  assert.equal(snapshot.totalLatencyMs, 0);
  assert.deepEqual(snapshot.activation, { enabled: false, shadowMode: false, decisionsCount: 0, activeCount: 0, shadowCount: 0, blockedCount: 0, errorCount: 0 });
});

test('createObservabilitySnapshot normaliza agregações', () => {
  const snapshot = createObservabilitySnapshot({
    health: 'healthy',
    totalLatencyMs: 12.5,
    modules: [createModuleObservability({ module: 'core', status: 'active', enabled: true })],
    activeModules: ['core', 'xenon'],
    fallback: { active: true, reasons: ['CORE_FALLBACK', 42] },
    activation: { enabled: true, decisionsCount: 3, activeCount: 1 },
    telemetry: { enabled: true, errorCount: 0 },
  });
  assert.deepEqual(snapshot.activeModules, ['core']);
  assert.equal(snapshot.fallback.active, true);
  assert.deepEqual(snapshot.fallback.reasons, ['CORE_FALLBACK']);
  assert.equal(snapshot.activation.decisionsCount, 3);
});

test('validateObservabilitySnapshot rejeita formas inválidas', () => {
  assert.deepEqual(validateObservabilitySnapshot(null).errors, ['SNAPSHOT_NOT_OBJECT']);
  const bad = createEmptyObservabilitySnapshot();
  bad.health = 'bogus';
  assert.ok(validateObservabilitySnapshot(bad).errors.includes('HEALTH_INVALID'));
  const bad2 = createEmptyObservabilitySnapshot();
  bad2.totalLatencyMs = -3;
  assert.ok(validateObservabilitySnapshot(bad2).errors.includes('TOTAL_LATENCY_INVALID'));
  const bad3 = createEmptyObservabilitySnapshot();
  bad3.fn = () => {};
  assert.ok(validateObservabilitySnapshot(bad3).errors.includes('NOT_SERIALIZABLE'));
});

test('redactObservabilitySnapshot remove campos fora da allowlist', () => {
  const snapshot = createEmptyObservabilitySnapshot();
  snapshot.secretField = 'segredo';
  snapshot.rawText = 'texto sensível';
  const redacted = redactObservabilitySnapshot(snapshot);
  assert.equal(redacted.secretField, undefined);
  assert.equal(redacted.rawText, undefined);
  assert.equal(redacted.version, OBSERVABILITY_SNAPSHOT_VERSION);
});

test('redactObservabilitySnapshot sobre não-objeto → {}', () => {
  assert.deepEqual(redactObservabilitySnapshot(null), {});
  assert.deepEqual(redactObservabilitySnapshot(42), {});
});

// -----------------------------------------------
// buildObservabilitySnapshot — motor desligado
// -----------------------------------------------
test('motor desligado → snapshot disabled com todos os módulos desativados', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_ENABLED: 'false' });
  const snapshot = buildObservabilitySnapshot({ config, result: null });
  assert.equal(snapshot.health, 'disabled');
  assert.deepEqual(snapshot.disabledModules, [...UNI_ENGINE_MODULE_NAMES]);
  assert.deepEqual(snapshot.activeModules, []);
  assert.deepEqual(snapshot.errorModules, []);
  assert.equal(snapshot.totalLatencyMs, 0);
  assert.equal(validateObservabilitySnapshotOutput(snapshot).valid, true);
});

test('config nulo → snapshot disabled', () => {
  for (const config of [null, undefined, {}]) {
    const snapshot = buildObservabilitySnapshot({ config });
    assert.equal(snapshot.health, 'disabled');
  }
});

// -----------------------------------------------
// buildObservabilitySnapshot — motor ligado
// -----------------------------------------------
test('snapshot reflete módulos ativos e flags', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(snapshot.flags.enabled, true);
  assert.equal(snapshot.flags.decisionEnabled, true);
  assert.equal(snapshot.flags.memoryEnabled, false);
  assert.equal(snapshot.flags.telemetryEnabled, false);
  assert.ok(snapshot.activeModules.includes('core'));
  assert.ok(snapshot.activeModules.includes('decision'));
  assert.ok(snapshot.activeModules.includes('epistemic'));
  assert.ok(snapshot.activeModules.includes('planning'));
  assert.ok(snapshot.activeModules.includes('goals'));
  assert.ok(snapshot.activeModules.includes('reflection'));
  assert.ok(snapshot.disabledModules.includes('memory'));
  assert.ok(snapshot.disabledModules.includes('telemetry'));
  assert.ok(!snapshot.activeModules.includes('telemetry'));
});

test('snapshot tem latências por módulo apenas para módulos ativos', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(typeof snapshot.latencyByModule.core, 'number');
  assert.equal(typeof snapshot.latencyByModule.decision, 'number');
  assert.equal(typeof snapshot.latencyByModule.planning, 'number');
  assert.equal(snapshot.latencyByModule.memory, undefined);
  assert.equal(snapshot.totalLatencyMs, Number(result.diagnostics.latencyMs.toFixed(3)));
});

test('snapshot NUNCA contém dados sensíveis ou texto do usuário', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input({ message: { text: 'Gastei 50 reais no mercado' } }), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  const json = JSON.stringify(snapshot);
  assert.ok(!json.includes('Mercado'));
  assert.ok(!json.includes('gastei'));
  assert.ok(!json.includes('user-1'));
  assert.ok(!json.includes('conv-1'));
  assert.ok(!json.includes('740.5'));
  assert.ok(!json.includes('Nubank'));
});

test('snapshot é serializável e valida', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(isSerializableValue(snapshot), true);
  assert.equal(JSON.parse(JSON.stringify(snapshot)).health, snapshot.health);
  assert.equal(validateObservabilitySnapshotOutput(snapshot).valid, true);
});

test('snapshot carrega versão, revisão e health coerentes', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(snapshot.version, OBSERVABILITY_SNAPSHOT_VERSION);
  assert.equal(snapshot.engineVersion, UNI_ENGINE_VERSION);
  assert.equal(snapshot.revision, UNI_ENGINE_REVISION);
  assert.equal(typeof snapshot.timestamp, 'string');
  assert.ok(['healthy', 'degraded', 'fallback_active', 'activation_blocked'].includes(snapshot.health));
});

test('confidence do snapshot vem da decision layer em banda', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(snapshot.confidence.source, 'decision');
  assert.ok(['high', 'medium', 'low', 'very_low'].includes(snapshot.confidence.band));
  assert.equal(snapshot.risk.band, result.decisionLayer.risk);
  assert.equal(snapshot.risk.source, 'decision');
});

test('shadow ativo reflete o modo shadow', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(snapshot.shadow.active, true);
  assert.equal(snapshot.fallback.active, false);
  assert.deepEqual(snapshot.fallback.reasons, []);
  assert.equal(snapshot.circuitBreaker.open, false);
  assert.equal(snapshot.telemetry.enabled, false);
});

test('fallback no core é refletido no snapshot', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(null, { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(snapshot.health, 'fallback_active');
  assert.equal(snapshot.fallback.active, true);
  assert.ok(snapshot.fallback.reasons.includes('CORE_FALLBACK'));
  assert.ok(snapshot.errorModules.includes('core'));
});

test('activation resumida soma decisões sem expor detalhes', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  const counts = snapshot.activation.activeCount + snapshot.activation.shadowCount
    + snapshot.activation.blockedCount + snapshot.activation.errorCount;
  assert.equal(snapshot.activation.decisionsCount, result.activation.decisions.length);
  assert.equal(counts, result.activation.decisions.length);
});

test('planning/goals/reflection resumidos por agregados', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(snapshot.planning.enabled, true);
  assert.equal(snapshot.planning.stepCount, result.planning.suggestedSteps.length);
  assert.equal(snapshot.planning.fallback, result.planning.fallbackUsed);
  assert.equal(snapshot.goals.enabled, true);
  assert.equal(snapshot.reflection.enabled, true);
});

test('health fornecido é usado em vez de recomputar', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(phase10Input(), { config });
  const fakeHealth = { status: 'degraded', checks: [] };
  const snapshot = buildObservabilitySnapshot({ config, result, health: fakeHealth });
  assert.equal(snapshot.health, 'degraded');
});

test('summary do snapshot reflete saúde e módulos', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  const summary = summarizeObservability(snapshot);
  assert.equal(summary.enabled, true);
  assert.equal(summary.healthy, snapshot.health === 'healthy');
  assert.ok(summary.activeModules.includes('core'));
  assert.equal(summary.totalLatencyMs, snapshot.totalLatencyMs);
});

test('summary para entradas inválidas é seguro', () => {
  const summary = summarizeObservability(null);
  assert.equal(summary.healthy, false);
  assert.equal(summary.enabled, false);
  assert.deepEqual(summary.activeModules, []);
  assert.equal(summary.totalLatencyMs, null);
});

test('correlationId é propagado no snapshot', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result, correlationId: 'ue_obs_1' });
  assert.equal(snapshot.correlationId, 'ue_obs_1');
});
