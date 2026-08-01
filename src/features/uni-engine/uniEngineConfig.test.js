// Testes de configuração e feature flags do Uni Engine (Fase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNI_ENGINE_DEFAULT_CONFIG,
  createUniEngineConfig,
  isUniEngineShadowEnabled,
} from './uniEngineConfig.js';

test('config: padrão de produção é seguro — enabled nasce falso sem variável', () => {
  const config = createUniEngineConfig({ env: {} });
  assert.equal(config.enabled, false);
  assert.equal(config.shadowMode, false, 'sem enabled, shadowMode nunca é ativo');
  assert.equal(config.learningEnabled, false, 'learningEnabled permanece falso na Fase 1');
});

test('config: default constante é seguro e imutável', () => {
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.enabled, false);
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.shadowMode, true);
  assert.equal(UNI_ENGINE_DEFAULT_CONFIG.learningEnabled, false);
  assert.ok(Object.isFrozen(UNI_ENGINE_DEFAULT_CONFIG));
});

test('config: ativação explícita liga o motor apenas com variável booleana real', () => {
  const config = createUniEngineConfig({
    env: { VITE_UNI_ENGINE_ENABLED: 'true', VITE_UNI_ENGINE_SHADOW_MODE: 'true' },
  });
  assert.equal(config.enabled, true);
  assert.equal(config.shadowMode, true);
  assert.ok(isUniEngineShadowEnabled(config));
});

test('config: valores ausentes ou inválidos nunca ativam o motor acidentalmente', () => {
  const variants = [
    { VITE_UNI_ENGINE_ENABLED: 'yes' },
    { VITE_UNI_ENGINE_ENABLED: 'TRUE-ish' },
    { VITE_UNI_ENGINE_ENABLED: 1 },
    { VITE_UNI_ENGINE_ENABLED: '' },
    {},
  ];
  for (const env of variants) {
    const config = createUniEngineConfig({ env });
    assert.equal(config.enabled, false, `env ${JSON.stringify(env)} não pode ativar o motor`);
  }
});

test('config: telemetria só liga com variável explícita ou ambiente de desenvolvimento', () => {
  const prod = createUniEngineConfig({ env: { MODE: 'production' } });
  assert.equal(prod.telemetryEnabled, false, 'produção sem variável nunca registra telemetria');
  const dev = createUniEngineConfig({ env: { DEV: true, MODE: 'development' } });
  assert.equal(dev.telemetryEnabled, true, 'dev registra telemetria redigida');
  const explicitOff = createUniEngineConfig({
    env: { DEV: true, VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'false' },
  });
  assert.equal(explicitOff.telemetryEnabled, false, 'variável explícita sobrepõe DEV');
});

test('config: shadowMode é forçado a false quando o motor está desligado', () => {
  const config = createUniEngineConfig({
    env: { VITE_UNI_ENGINE_ENABLED: 'false', VITE_UNI_ENGINE_SHADOW_MODE: 'true' },
  });
  assert.equal(config.enabled, false);
  assert.equal(config.shadowMode, false);
  assert.equal(isUniEngineShadowEnabled(config), false);
});

test('config: learningEnabled não pode ser ativado por nenhuma variável nesta fase', () => {
  const config = createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_LEARNING_ENABLED: 'true',
    },
  });
  assert.equal(config.learningEnabled, false);
});

test('config: nenhuma variável ausente ativa o motor (sem env algum)', () => {
  const config = createUniEngineConfig();
  assert.equal(config.enabled, false);
});
