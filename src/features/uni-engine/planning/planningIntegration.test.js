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
      VITE_UNI_ENGINE_PLANNING_ENABLED: 'true',
      VITE_UNI_ENGINE_PLANNING_SHADOW: 'true',
      VITE_UNI_ENGINE_PLANNING_TELEMETRY: 'false',
      ...overrides,
    },
  });
}

function goalInput(text = 'Quero juntar R$ 10.000 em 12 meses') {
  return buildBaseInput({
    message: { text },
    detectedIntent: 'create_goal',
    financialSnapshot: { ...buildBaseInput().context.financialSnapshot, hasData: true },
  });
}

test('integração adiciona planning ao resultado', () => {
  assert.ok(runUniEngineShadow(goalInput(), { config: config() }).planning);
});

test('flags de planning nascem desligadas', () => {
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.planningEnabled, false);
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.planningShadowMode, false);
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.planningTelemetryEnabled, false);
});

test('planning exige Uni Engine habilitado', () => {
  const disabled = config({ VITE_UNI_ENGINE_ENABLED: 'false' });
  assert.equal(disabled.planningEnabled, false);
});

test('planning exige shadow próprio', () => {
  const result = runUniEngineShadow(goalInput(), { config: config({ VITE_UNI_ENGINE_PLANNING_SHADOW: 'false' }) });
  assert.equal(result.planning, null);
});

test('planning desligado não muda resultado anterior', () => {
  const result = runUniEngineShadow(goalInput(), { config: createUniEngineConfig({ env: { VITE_UNI_ENGINE_ENABLED: 'true', VITE_UNI_ENGINE_SHADOW_MODE: 'true' } }) });
  assert.equal(result.planning, null);
});

test('integração preserva Decision Layer', () => {
  const decisionConfig = config({ VITE_UNI_ENGINE_DECISION_ENABLED: 'true', VITE_UNI_ENGINE_DECISION_SHADOW: 'true' });
  const result = runUniEngineShadow(goalInput(), { config: decisionConfig });
  assert.ok(result.decisionLayer);
  assert.equal(result.decisionLayer.shadow.appliedToDecision, false);
});

test('integração preserva memória operacional', () => {
  const memory = {};
  const result = runUniEngineShadow(goalInput(), { config: config(), operationalMemory: memory });
  assert.ok(result.operationalMemory);
  assert.equal(result.planning.shadow.memoryModified, false);
});

test('integração preserva modelo epistêmico', () => {
  const epistemicConfig = config({ VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true', VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE: 'true' });
  const result = runUniEngineShadow(goalInput(), { config: epistemicConfig });
  assert.ok(result.epistemicModel);
  assert.equal(result.planning.shadow.appliedToDecision, false);
});

test('integração não altera plano cognitivo', () => {
  const off = runUniEngineShadow(goalInput(), { config: createUniEngineConfig({ env: { VITE_UNI_ENGINE_ENABLED: 'true', VITE_UNI_ENGINE_SHADOW_MODE: 'true' } }) });
  const on = runUniEngineShadow(goalInput(), { config: config() });
  assert.deepEqual(on.plan, off.plan);
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

test('barrel exporta planning e runner', async () => {
  const barrel = await import('../index.js');
  assert.equal(typeof barrel.runPlanningEngine, 'function');
  assert.ok(Array.isArray(barrel.planning.PLANNING_GOAL_TYPES));
});

test('telemetria de planning é redigida', () => {
  const received = [];
  const telemetryConfig = config({ VITE_UNI_ENGINE_PLANNING_TELEMETRY: 'true' });
  const result = runUniEngineShadow(goalInput(), { config: telemetryConfig, telemetryAdapter: (entry) => received.push(entry) });
  assert.ok(result.planning.telemetry);
  assert.equal(JSON.stringify(result.planning.telemetry).includes('10000'), false);
});

test('resultado desabilitado inclui planning nulo', () => {
  const result = runUniEngineShadow(goalInput(), { config: createUniEngineConfig({ env: {} }) });
  assert.equal(result.planning, null);
});
