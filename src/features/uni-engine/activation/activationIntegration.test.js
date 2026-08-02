// Testes de integração da Fase 9 (Activation Engine) com o pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { buildBaseInput } from '../testFixtures.js';

const ACTIVATION_CONFIG = createUniEngineConfig({
  env: {
    VITE_UNI_ENGINE_ENABLED: 'true',
    VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
    VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'true',
    VITE_UNI_ENGINE_ACTIVATION_TELEMETRY: 'false',
    VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
    VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
    VITE_UNI_ENGINE_CAP_METADATA_ONLY: 'true',
  },
});

const ACTIVE_CONFIG = createUniEngineConfig({
  env: {
    VITE_UNI_ENGINE_ENABLED: 'true',
    VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    VITE_UNI_ENGINE_DECISION_ENABLED: 'true',
    VITE_UNI_ENGINE_DECISION_SHADOW: 'true',
    VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
    VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
    VITE_UNI_ENGINE_ACTIVATION_TELEMETRY: 'false',
    VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
    VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'tester-1',
    VITE_UNI_ENGINE_CAP_METADATA_ONLY: 'true',
  },
});

const LOW_RISK_MESSAGE = { text: 'qual é meu saldo?' };

test('integração 118: activation off por padrão → seção null', () => {
  const result = runUniEngineShadow(buildBaseInput(), {});
  assert.equal(result.activation, null);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('integração 119: shadow mode retorna decisões serializáveis', () => {
  const result = runUniEngineShadow(buildBaseInput(), {
    config: ACTIVATION_CONFIG,
    isDev: true,
  });
  assert.ok(result.activation, 'activation deve estar presente');
  assert.equal(result.activation.enabled, true);
  assert.equal(result.activation.shadowMode, true);
  assert.ok(Array.isArray(result.activation.decisions));
  for (const decision of result.activation.decisions) {
    assert.equal(decision.activationStatus, 'SHADOW_ONLY');
    assert.equal(decision.applied, false);
    assert.equal(decision.fallbackUsed, true);
  }
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('integração 120: test user em DEV ativa sem aplicar resposta', () => {
  const result = runUniEngineShadow(buildBaseInput({
    message: LOW_RISK_MESSAGE,
    session: { userId: 'tester-1' },
  }), {
    config: ACTIVE_CONFIG,
    isDev: true,
  });
  assert.ok(result.activation);
  assert.equal(result.activation.shadowMode, false);
  const decision = result.activation.decisions[0];
  assert.equal(decision.activationStatus, 'ACTIVE_TEST');
  assert.equal(decision.applied, true);
  assert.equal(decision.shadow.appliedToDecision, true);
  assert.equal(decision.shadow.appliedToResponse, false);
  assert.equal(decision.shadow.executed, false);
  assert.equal(decision.shadow.databaseCalled, false);
  assert.equal(decision.shadow.voiceTouched, false);
});

test('integração 121: produção nunca ativa por acidente', () => {
  const result = runUniEngineShadow(buildBaseInput(), {
    config: ACTIVATION_CONFIG,
    isDev: false,
  });
  assert.ok(result.activation);
  assert.equal(result.activation.environment, 'production');
  for (const decision of result.activation.decisions) {
    assert.equal(decision.activationStatus, 'BLOCKED_BY_ENVIRONMENT');
    assert.equal(decision.applied, false);
  }
});

test('integração 122: resposta real permanece legado', () => {
  const result = runUniEngineShadow(buildBaseInput({
    message: LOW_RISK_MESSAGE,
    session: { userId: 'tester-1' },
  }), {
    config: ACTIVE_CONFIG,
    isDev: true,
  });
  assert.ok(result.classification);
  assert.ok(result.plan);
  assert.equal(result.diagnostics.fallbackUsed, false);
  for (const decision of result.activation.decisions) {
    assert.equal(decision.fallbackUsed, false);
  }
});

test('integração 123: telemetria redigida nunca contém userId', () => {
  const collected = [];
  const result = runUniEngineShadow(buildBaseInput({
    session: { userId: 'user-secreto-123' },
  }), {
    config: createUniEngineConfig({
      env: {
        VITE_UNI_ENGINE_ENABLED: 'true',
        VITE_UNI_ENGINE_SHADOW_MODE: 'true',
        VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
        VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'true',
        VITE_UNI_ENGINE_ACTIVATION_TELEMETRY: 'true',
        VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
        VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      },
    }),
    isDev: true,
    telemetryAdapter: (payload) => collected.push(payload),
  });
  assert.ok(result.activation);
  const serialized = JSON.stringify(collected);
  assert.ok(serialized.includes('user-secreto-123') === false, 'userId não pode vazar');
  assert.ok(collected.length >= 1);
  for (const payload of collected) {
    assert.equal('userId' in payload, false);
    assert.equal('message' in payload, false);
  }
});

test('integração 124: Fases 1–8 permanecem intactas com activation ligada', () => {
  const result = runUniEngineShadow(buildBaseInput(), {
    config: ACTIVATION_CONFIG,
    isDev: true,
  });
  assert.ok(result.classification);
  assert.ok(result.epistemicState);
  assert.ok(result.plan);
  assert.ok(result.shadowComparison);
  assert.ok(result.cognitiveContext);
  assert.ok(result.suggestions);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('integração: apenas capacidades com flag aparecem nas decisões', () => {
  const result = runUniEngineShadow(buildBaseInput(), {
    config: ACTIVATION_CONFIG,
    isDev: true,
  });
  const capabilities = result.activation.decisions.map((d) => d.capability).sort();
  assert.deepEqual(capabilities, ['METADATA_ONLY', 'QUESTION_GUIDANCE']);
});

test('integração: rollout percentual determinístico no pipeline', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_ROLLOUT_PERCENT: '50',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
    },
  });
  const first = runUniEngineShadow(buildBaseInput({
    session: { userId: 'user-a' },
  }), { config, isDev: true });
  const second = runUniEngineShadow(buildBaseInput({
    session: { userId: 'user-a' },
  }), { config, isDev: true });
  const decisionA = first.activation.decisions[0];
  const decisionB = second.activation.decisions[0];
  assert.equal(decisionA.rolloutBucket, decisionB.rolloutBucket);
  assert.equal(decisionA.activationStatus, decisionB.activationStatus);
  assert.equal(typeof decisionA.rolloutBucket, 'number');
});
