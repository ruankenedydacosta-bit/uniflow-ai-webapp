// Testes de feature flags do Modelo Epistêmico (Fase 4 — seção 17).
// Regras: padrão desligado; Shadow Mode ligado quando habilitado; telemetria
// apenas em desenvolvimento; variável ausente nunca ativa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniEngineConfig, UNI_ENGINE_DEFAULT_CONFIG } from '../uniEngineConfig.js';

test('config 4.1: padrão de produção é seguro — epistêmico nasce desligado', () => {
  const config = createUniEngineConfig({ env: {} });
  assert.equal(config.epistemicEnabled, false);
  assert.equal(config.epistemicShadowMode, false, 'sem epistemicEnabled, shadow nunca ativa');
  assert.equal(config.epistemicTelemetryEnabled, false);
});

test('config 4.2: default constante é seguro e imutável', () => {
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.epistemicEnabled, false);
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.epistemicShadowMode, true);
  assert.ok(Object.isFrozen(UNI_ENGINE_DEFAULT_CONFIG));
});

test('config 4.3: ativação explícita liga o modelo com shadow por padrão', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true',
    },
  });
  assert.equal(config.epistemicEnabled, true);
  assert.equal(config.epistemicShadowMode, true, 'shadow padrão ligado quando habilitado');
});

test('config 4.4: variável ausente ou inválida nunca ativa o modelo', () => {
  const variants = [
    {},
    { VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'yes' },
    { VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'TRUE-ish' },
    { VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 1 },
    { VITE_UNI_ENGINE_EPISTEMIC_ENABLED: '' },
  ];
  for (const env of variants) {
    const config = createUniEngineConfig({ env });
    assert.equal(config.epistemicEnabled, false, `env ${JSON.stringify(env)} não pode ativar`);
  }
});

test('config 4.5: telemetria epistêmica só liga com variável explícita ou dev', () => {
  const prod = createUniEngineConfig({
    env: {
      MODE: 'production',
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true',
    },
  });
  assert.equal(prod.epistemicTelemetryEnabled, false, 'produção sem variável nunca registra');

  const dev = createUniEngineConfig({
    env: {
      DEV: true,
      MODE: 'development',
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true',
    },
  });
  assert.equal(dev.epistemicTelemetryEnabled, true, 'dev registra telemetria redigida');

  const explicitOff = createUniEngineConfig({
    env: {
      DEV: true,
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_TELEMETRY_ENABLED: 'false',
    },
  });
  assert.equal(explicitOff.epistemicTelemetryEnabled, false, 'variável explícita sobrepõe DEV');
});

test('config 4.6: cascata — motor desligado desliga o modelo epistêmico', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'false',
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE: 'true',
    },
  });
  assert.equal(config.enabled, false);
  assert.equal(config.epistemicEnabled, false, 'epistêmico nunca roda com motor desligado');
  assert.equal(config.epistemicShadowMode, false);
});

test('config 4.7: cascata — modelo desligado desliga shadow e telemetria', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'false',
      VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_TELEMETRY_ENABLED: 'true',
    },
  });
  assert.equal(config.epistemicEnabled, false);
  assert.equal(config.epistemicShadowMode, false);
  assert.equal(config.epistemicTelemetryEnabled, false);
});

test('config 4.8: shadow explicitamente desligado desliga apenas a execução do modelo', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE: 'false',
    },
  });
  assert.equal(config.epistemicEnabled, true);
  assert.equal(config.epistemicShadowMode, false);
});

test('config 4.9: sem env algum, nada do modelo é ativado', () => {
  const config = createUniEngineConfig();
  assert.equal(config.epistemicEnabled, false);
  assert.equal(config.epistemicTelemetryEnabled, false);
});
