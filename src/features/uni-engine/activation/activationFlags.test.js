// Testes de feature flags do Activation Engine (Fase 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniEngineConfig, UNI_ENGINE_DEFAULT_CONFIG } from '../uniEngineConfig.js';

function configFor(env) {
  return createUniEngineConfig({ env: { VITE_UNI_ENGINE_ENABLED: 'true', VITE_UNI_ENGINE_SHADOW_MODE: 'true', ...env } });
}

test('flag 9: activation off por padrão', () => {
  const config = configFor({});
  assert.equal(config.activationEnabled, false);
  assert.equal(config.activationShadowMode, false);
  assert.equal(config.activationTelemetryEnabled, false);
});

test('flag 10: shadow default é true', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true' });
  assert.equal(config.activationShadowMode, true);
});

test('flag 11: telemetria off por padrão', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true' });
  assert.equal(config.activationTelemetryEnabled, false);
});

test('flag 12: capacidade ausente nunca ativa', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true' });
  assert.equal(config.activationCapabilities.METADATA_ONLY, false);
});

test('flag 13: capacidade false por padrão', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true', VITE_UNI_ENGINE_CAP_METADATA_ONLY: 'false' });
  assert.equal(config.activationCapabilities.METADATA_ONLY, false);
});

test('flag 14: capacidade true em DEV é aceita', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true', VITE_UNI_ENGINE_CAP_METADATA_ONLY: 'true' });
  assert.equal(config.activationCapabilities.METADATA_ONLY, true);
});

test('flag 15: valor inválido nunca ativa', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true', VITE_UNI_ENGINE_CAP_METADATA_ONLY: 'talvez' });
  assert.equal(config.activationCapabilities.METADATA_ONLY, false);
});

test('flag 16: variável ausente não libera nenhum ambiente', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true' });
  assert.deepEqual(config.activationEnvironments, []);
});

test('flag 16b: produção só entra com lista explícita', () => {
  const config = configFor({
    VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
    VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development, staging, production',
  });
  assert.deepEqual(config.activationEnvironments, ['development', 'staging', 'production']);
});

test('flag 16c: ambiente inválido é descartado', () => {
  const config = configFor({
    VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
    VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development, mars',
  });
  assert.deepEqual(config.activationEnvironments, ['development']);
});

test('flag 17: test users vazios por padrão', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true' });
  assert.deepEqual(config.activationTestUserIds, []);
});

test('flag 17b: test users parseados por vírgula', () => {
  const config = configFor({
    VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
    VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'tester-1, tester-2',
  });
  assert.deepEqual(config.activationTestUserIds, ['tester-1', 'tester-2']);
});

test('flag 18: rollout zero por padrão', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true' });
  assert.equal(config.activationRolloutPercent, 0);
});

test('flag 19: rollout clamp mínimo (negativo vira 0)', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true', VITE_UNI_ENGINE_ACTIVATION_ROLLOUT_PERCENT: '-20' });
  assert.equal(config.activationRolloutPercent, 0);
});

test('flag 19b: rollout clamp máximo (acima de 100 vira 100)', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true', VITE_UNI_ENGINE_ACTIVATION_ROLLOUT_PERCENT: '150' });
  assert.equal(config.activationRolloutPercent, 100);
});

test('flag 19c: rollout inválido vira 0', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true', VITE_UNI_ENGINE_ACTIVATION_ROLLOUT_PERCENT: 'abc' });
  assert.equal(config.activationRolloutPercent, 0);
});

test('flag 20: cascata do engine principal (engine off → activation off)', () => {
  const config = createUniEngineConfig({ env: {
    VITE_UNI_ENGINE_ENABLED: 'false',
    VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
    VITE_UNI_ENGINE_CAP_METADATA_ONLY: 'true',
  }});
  assert.equal(config.enabled, false);
  assert.equal(config.activationEnabled, false);
  assert.equal(config.activationCapabilities.METADATA_ONLY, false);
});

test('flag 20b: activation off força capacidades false', () => {
  const config = configFor({ VITE_UNI_ENGINE_CAP_METADATA_ONLY: 'true' });
  assert.equal(config.activationEnabled, false);
  assert.equal(config.activationCapabilities.METADATA_ONLY, false);
  assert.equal(config.activationRolloutPercent, 0);
  assert.deepEqual(config.activationTestUserIds, []);
});

test('flag 20c: default congelado e imutável', () => {
  assert.equal(Object.isFrozen(UNI_ENGINE_DEFAULT_CONFIG), true);
  assert.equal(Object.isFrozen(UNI_ENGINE_DEFAULT_CONFIG.activationCapabilities), true);
});

test('flag 20d: flags proibidas não existem no config', () => {
  const config = configFor({ VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true' });
  assert.equal('FINANCIAL_EXECUTION' in config.activationCapabilities, false);
  assert.equal('MEMORY_WRITE' in config.activationCapabilities, false);
  assert.equal('LEARNING_APPLICATION' in config.activationCapabilities, false);
});
