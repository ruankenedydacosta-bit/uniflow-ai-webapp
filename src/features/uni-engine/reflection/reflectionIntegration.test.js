// Testes de integração da Fase 8 com o pipeline do Uni Engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { buildBaseInput } from '../testFixtures.js';

const REFLECTION_CONFIG = createUniEngineConfig({
  env: {
    VITE_UNI_ENGINE_ENABLED: 'true',
    VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    VITE_UNI_ENGINE_REFLECTION_ENABLED: 'true',
    VITE_UNI_ENGINE_REFLECTION_SHADOW: 'true',
    VITE_UNI_ENGINE_REFLECTION_TELEMETRY: 'false',
    VITE_UNI_ENGINE_LEARNING_CANDIDATES_ENABLED: 'true',
  },
});

const NO_CANDIDATES_CONFIG = createUniEngineConfig({
  env: {
    VITE_UNI_ENGINE_ENABLED: 'true',
    VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    VITE_UNI_ENGINE_REFLECTION_ENABLED: 'true',
    VITE_UNI_ENGINE_REFLECTION_SHADOW: 'true',
    VITE_UNI_ENGINE_REFLECTION_TELEMETRY: 'false',
  },
});

test('integração: sem flag de reflexão, resultado é null (Fases 1–7 intactas)', () => {
  const result = runUniEngineShadow(buildBaseInput(), {
    config: createUniEngineConfig({
      env: {
        VITE_UNI_ENGINE_ENABLED: 'true',
        VITE_UNI_ENGINE_SHADOW_MODE: 'true',
        VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'false',
      },
    }),
  });
  assert.equal(result.reflection, null);
  assert.ok(result.classification);
  assert.ok(result.plan);
  assert.ok(result.shadowComparison);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('integração: reflexão ativa detecta correção e nunca aplica', () => {
  const result = runUniEngineShadow(buildBaseInput({
    message: { text: 'não é alimentação, é saúde' },
  }), { config: REFLECTION_CONFIG });
  assert.ok(result.reflection, 'reflection deve estar presente');
  assert.equal(result.reflection.outcome, 'USER_CORRECTED');
  assert.ok(result.reflection.learningCandidates.length >= 1);
  for (const candidate of result.reflection.learningCandidates) {
    assert.equal(candidate.shadow.applied, false);
    assert.equal(candidate.shadow.persisted, false);
    assert.equal(candidate.shadow.changedBehavior, false);
  }
  assert.equal(result.reflection.shadow.shadowMode, true);
  assert.equal(result.reflection.shadow.appliedToDecision, false);
  assert.equal(result.reflection.shadow.executed, false);
});

test('integração: candidatos desabilitados não são gerados no pipeline', () => {
  const result = runUniEngineShadow(buildBaseInput({
    message: { text: 'não é alimentação, é saúde' },
  }), { config: NO_CANDIDATES_CONFIG });
  assert.ok(result.reflection);
  assert.deepEqual(result.reflection.learningCandidates, []);
});

test('integração: reflexão com flags off por padrão não muda comportamento', () => {
  const result = runUniEngineShadow(buildBaseInput(), {});
  assert.equal(result.reflection, null);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('integração: motor ligado mas reflexão off não roda reflexão', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_REFLECTION_ENABLED: 'false',
    },
  });
  const result = runUniEngineShadow(buildBaseInput(), { config });
  assert.equal(result.reflection, null);
});

test('integração: reflexão em shadow com mensagem de despesa comum', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: REFLECTION_CONFIG });
  assert.ok(result.reflection);
  assert.equal(result.reflection.shadow.shadowMode, true);
  assert.equal(result.reflection.shadow.memoryModified, false);
  assert.equal(result.reflection.shadow.voiceTouched, false);
  assert.equal(result.reflection.shadow.databaseCalled, false);
});
