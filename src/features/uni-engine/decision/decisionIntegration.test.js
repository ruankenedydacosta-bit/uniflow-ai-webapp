import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import {
  UNI_ENGINE_DEFAULT_CONFIG,
  createUniEngineConfig,
} from '../uniEngineConfig.js';
import {
  buildBaseInput,
  buildReadyActionPending,
} from '../testFixtures.js';

function decisionConfig(overrides = {}) {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_DECISION_ENABLED: 'true',
      VITE_UNI_ENGINE_DECISION_SHADOW: 'true',
      VITE_UNI_ENGINE_DECISION_TELEMETRY: 'false',
      ...overrides,
    },
  });
}

test('integração 91: Fase 1 fornece intent classificada à decisão', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: decisionConfig() });
  assert.equal(result.decisionLayer.contextEvaluation.intent.type, result.classification.primaryIntent);
});

test('integração 92: Fase 2 fornece contexto e plano sem alterar decisão original', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: decisionConfig() });
  assert.equal(result.plan.decision, 'ask');
  assert.equal(result.decisionLayer.decisionType, 'ASK');
  assert.ok(result.decisionLayer.contextEvaluation);
});

test('integração 93: Fase 3 permanece opcional quando memória está desligada', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: decisionConfig() });
  assert.equal(result.persistentMemory, null);
  assert.ok(result.decisionLayer);
  assert.equal(result.decisionLayer.shadow.memoryModified, false);
});

test('integração 94: Fase 4 permanece opcional quando modelo epistêmico está desligado', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: decisionConfig() });
  assert.equal(result.epistemicModel, null);
  assert.ok(result.decisionLayer);
});

test('integração 95: resultado do chat e comparação shadow permanecem intactos', () => {
  const input = buildBaseInput();
  const withoutDecision = runUniEngineShadow(input, {
    config: createUniEngineConfig({
      env: {
        VITE_UNI_ENGINE_ENABLED: 'true',
        VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      },
    }),
  });
  const withDecision = runUniEngineShadow(input, { config: decisionConfig() });
  assert.equal(withDecision.shadowComparison.status, withoutDecision.shadowComparison.status);
  assert.equal(withDecision.plan.decision, withoutDecision.plan.decision);
  assert.equal(withDecision.plan.nextQuestion?.field, withoutDecision.plan.nextQuestion?.field);
  assert.equal(withDecision.plan.executorExpected, withoutDecision.plan.executorExpected);
});

test('integração 96: pending pronto recomenda confirmação sem executar', () => {
  const pending = buildReadyActionPending();
  const result = runUniEngineShadow(buildBaseInput({
    message: { text: 'sim' },
    pendingAction: pending,
    detectedIntent: 'confirm',
    pendingIntent: 'register_expense',
    pendingActive: true,
    resultType: 'ready',
  }), { config: decisionConfig() });
  assert.equal(result.decisionLayer.decisionType, 'CONFIRM');
  assert.equal(result.decisionLayer.shadow.executorCalled, false);
});

test('integração 97: snapshot financeiro é apenas leitura', () => {
  const input = buildBaseInput();
  const before = JSON.stringify(input.context.financialSnapshot);
  const result = runUniEngineShadow(input, { config: decisionConfig() });
  assert.equal(JSON.stringify(input.context.financialSnapshot), before);
  assert.equal(result.decisionLayer.shadow.databaseCalled, false);
});

test('integração 99: flags de decisão nascem desligadas', () => {
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.decisionEnabled, false);
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.decisionShadowMode, false);
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.decisionTelemetryEnabled, false);
});

test('flag decision exige Uni Engine habilitado', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'false',
      VITE_UNI_ENGINE_DECISION_ENABLED: 'true',
      VITE_UNI_ENGINE_DECISION_SHADOW: 'true',
    },
  });
  assert.equal(config.decisionEnabled, false);
  assert.equal(config.decisionShadowMode, false);
});

test('flag shadow desligada impede a execução da camada de decisão', () => {
  const config = decisionConfig({ VITE_UNI_ENGINE_DECISION_SHADOW: 'false' });
  const result = runUniEngineShadow(buildBaseInput(), { config });
  assert.equal(result.decisionLayer, null);
});

test('integração 100: barrel principal exporta runDecisionLayer', async () => {
  const barrel = await import('../index.js');
  assert.equal(typeof barrel.runDecisionLayer, 'function');
  assert.ok(Array.isArray(barrel.decision.DECISION_TYPES));
});

test('plano é expandido somente com metadados da decisão', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: decisionConfig() });
  assert.ok(Object.hasOwn(result.plan, 'decisionReadiness'));
  assert.ok(Object.hasOwn(result.plan, 'decisionConfidence'));
  assert.ok(Object.hasOwn(result.plan, 'decisionRisk'));
  assert.ok(Object.hasOwn(result.plan, 'decisionDependencies'));
  assert.ok(Object.hasOwn(result.plan, 'decisionSuggestions'));
});

test('camada desligada preserva o formato anterior do plano', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    },
  });
  const result = runUniEngineShadow(buildBaseInput(), { config });
  assert.equal(result.decisionLayer, null);
  assert.equal(Object.hasOwn(result.plan, 'decisionReadiness'), false);
});

test('resultado completo continua serializável com decisionLayer', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: decisionConfig() });
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(result.decisionLayer.shadow.appliedToDecision, false);
});
