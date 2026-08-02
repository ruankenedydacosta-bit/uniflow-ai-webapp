// Testes de integração do Goal Engine no Shadow Mode (Fase 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { buildBaseInput } from '../testFixtures.js';
import { createUniEngineConfig, UNI_ENGINE_DEFAULT_CONFIG } from '../uniEngineConfig.js';

function config(overrides = {}) {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_GOALS_ENABLED: 'true',
      VITE_UNI_ENGINE_GOALS_SHADOW: 'true',
      VITE_UNI_ENGINE_GOALS_TELEMETRY: 'false',
      ...overrides,
    },
  });
}

function goalInput(text = 'Quero juntar R$ 10.000 em 12 meses') {
  return buildBaseInput({
    message: { text },
    detectedIntent: 'create_goal',
  });
}

test('integração adiciona goals ao resultado', () => {
  const result = runUniEngineShadow(goalInput(), { config: config() });
  assert.ok(result.goals);
  assert.equal(result.goals.goalDetected, true);
  assert.equal(result.goals.type, 'SAVINGS');
});

test('flags de goals nascem desligadas', () => {
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.goalsEnabled, false);
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.goalsShadowMode, true);
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.goalsTelemetryEnabled, false);
});

test('goals exige Uni Engine habilitado', () => {
  const disabled = config({ VITE_UNI_ENGINE_ENABLED: 'false' });
  assert.equal(disabled.goalsEnabled, false);
  assert.equal(disabled.goalsShadowMode, false);
});

test('goals exige shadow próprio', () => {
  const result = runUniEngineShadow(goalInput(), { config: config({ VITE_UNI_ENGINE_GOALS_SHADOW: 'false' }) });
  assert.equal(result.goals, null);
});

test('goals desligado não muda resultado anterior', () => {
  const result = runUniEngineShadow(goalInput(), { config: createUniEngineConfig({ env: { VITE_UNI_ENGINE_ENABLED: 'true', VITE_UNI_ENGINE_SHADOW_MODE: 'true' } }) });
  assert.equal(result.goals, null);
});

test('integração não altera plano cognitivo', () => {
  const off = runUniEngineShadow(goalInput(), { config: createUniEngineConfig({ env: { VITE_UNI_ENGINE_ENABLED: 'true', VITE_UNI_ENGINE_SHADOW_MODE: 'true' } }) });
  const on = runUniEngineShadow(goalInput(), { config: config() });
  assert.deepEqual(on.plan, off.plan);
});

test('integração preserva fases anteriores no resultado', () => {
  const result = runUniEngineShadow(goalInput(), { config: config() });
  assert.ok(result.classification);
  assert.ok(result.plan);
  assert.ok(result.validation);
  assert.ok(result.shadowComparison);
  assert.ok(result.suggestions);
  assert.ok(result.agreementMetrics);
  assert.ok(result.epistemicState);
});

test('integração mantém snapshot intacto', () => {
  const source = goalInput();
  const before = JSON.stringify(source.context.financialSnapshot);
  runUniEngineShadow(source, { config: config() });
  assert.equal(JSON.stringify(source.context.financialSnapshot), before);
});

test('integração mantém resposta serializável', () => {
  assert.doesNotThrow(() => JSON.stringify(runUniEngineShadow(goalInput(), { config: config() })));
});

test('integração nunca altera o pipeline atual', () => {
  const source = goalInput();
  const before = JSON.stringify(source.currentPipeline);
  runUniEngineShadow(source, { config: config() });
  assert.equal(JSON.stringify(source.currentPipeline), before);
});

test('barrel exporta goals e runner', async () => {
  const barrel = await import('../index.js');
  assert.equal(typeof barrel.runGoalEngine, 'function');
  assert.equal(typeof barrel.goals, 'object');
  assert.ok(Array.isArray(barrel.goals.GOAL_TYPES));
});

test('telemetria de goals é redigida no resultado', () => {
  const received = [];
  const telemetryConfig = config({ VITE_UNI_ENGINE_GOALS_TELEMETRY: 'true' });
  const result = runUniEngineShadow(goalInput(), { config: telemetryConfig, telemetryAdapter: (entry) => received.push(entry) });
  assert.ok(result.goals.telemetry);
  assert.equal(JSON.stringify(result.goals.telemetry).includes('10000'), false);
  const goalEntries = received.filter((entry) => entry.goalDetected !== undefined);
  assert.ok(goalEntries.length >= 1);
});

test('resultado desabilitado inclui goals nulo', () => {
  const result = runUniEngineShadow(goalInput(), { config: createUniEngineConfig({ env: {} }) });
  assert.equal(result.goals, null);
});
