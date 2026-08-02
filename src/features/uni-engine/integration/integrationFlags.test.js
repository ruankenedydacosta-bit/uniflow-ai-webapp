// Integration — flags e cascatas de segurança (Parte 1). Nenhuma variável
// ausente ativa a integração; produção nunca ativa por acidente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import { legacyClarification } from './testFixtures.js';

const BASE_ENV = {
  VITE_UNI_ENGINE_ENABLED: 'true',
  VITE_UNI_ENGINE_SHADOW_MODE: 'true',
  VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
  VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
};

test('I-8: sem nenhuma variável, tudo nasce desligado (padrão seguro)', () => {
  const config = createUniEngineConfig({ env: {} });
  assert.equal(config.enabled, false);
  assert.equal(config.activationEnabled, false);
  assert.equal(config.integrationEnabled, false);
  assert.equal(config.integrationShadowMode, false);
  assert.equal(config.integrationTelemetryEnabled, false);
});

test('I-9: integração exige engine ligado (cascata para false)', () => {
  const config = createUniEngineConfig({
    env: {
      ...BASE_ENV,
      VITE_UNI_ENGINE_ENABLED: 'false',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
    },
  });
  assert.equal(config.enabled, false);
  assert.equal(config.integrationEnabled, false);
  assert.equal(config.integrationShadowMode, false);
  assert.equal(config.integrationTelemetryEnabled, false);
});

test('I-10: integração exige Activation ligada (cascata para false)', () => {
  const config = createUniEngineConfig({
    env: {
      ...BASE_ENV,
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'false',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
    },
  });
  assert.equal(config.enabled, true);
  assert.equal(config.activationEnabled, false);
  assert.equal(config.integrationEnabled, false);
  assert.equal(config.integrationShadowMode, false);
});

test('I-11: integração desligada força shadow e telemetria para false', () => {
  const config = createUniEngineConfig({
    env: {
      ...BASE_ENV,
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_INTEGRATION_TELEMETRY: 'true',
    },
  });
  assert.equal(config.integrationEnabled, false);
  assert.equal(config.integrationShadowMode, false);
  assert.equal(config.integrationTelemetryEnabled, false);
});

test('I-12: flags booleanas aceitam apenas valores explícitos', () => {
  const config = createUniEngineConfig({
    env: {
      ...BASE_ENV,
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'sim',
      VITE_UNI_ENGINE_INTEGRATION_TELEMETRY: 'yes',
    },
  });
  assert.equal(config.integrationEnabled, false);
  assert.equal(config.integrationTelemetryEnabled, false);
});

test('I-13: engine ligado + activation ligada + integração ligada ativa tudo', () => {
  const config = createUniEngineConfig({
    env: {
      ...BASE_ENV,
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
    },
  });
  assert.equal(config.enabled, true);
  assert.equal(config.activationEnabled, true);
  assert.equal(config.integrationEnabled, true);
  assert.equal(config.integrationShadowMode, false);
});

test('I-14: runUniEngineIntegration com config desligada → disabled e texto legado', () => {
  const config = createUniEngineConfig({ env: {} });
  const result = runUniEngineIntegration({
    config,
    legacy: legacyClarification(),
    engineResult: null,
    context: { isDev: true },
  });
  assert.equal(result.enabled, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'INTEGRATION_DISABLED');
  assert.equal(result.finalText, legacyClarification().text);
});

test('I-15: engine desligada com integração ligada → disabled ENGINE_DISABLED', () => {
  const result = runUniEngineIntegration({
    config: { enabled: false, integrationEnabled: true, integrationShadowMode: false, integrationTelemetryEnabled: false },
    legacy: legacyClarification(),
    engineResult: null,
    context: { isDev: true },
  });
  assert.equal(result.status, 'DISABLED');
  assert.equal(result.fallbackReason, 'ENGINE_DISABLED');
});

test('I-16: integração desligada mas engine ligada → disabled INTEGRATION_DISABLED', () => {
  const config = createUniEngineConfig({ env: BASE_ENV });
  const result = runUniEngineIntegration({
    config,
    legacy: legacyClarification(),
    engineResult: null,
    context: { isDev: true },
  });
  assert.equal(result.status, 'DISABLED');
  assert.equal(result.fallbackReason, 'INTEGRATION_DISABLED');
});

test('I-17: integração ligada sem decisões da Activation → fallback ACTIVATION_DECISIONS_MISSING', () => {
  const config = createUniEngineConfig({
    env: { ...BASE_ENV, VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true', VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false' },
  });
  const result = runUniEngineIntegration({
    config,
    legacy: legacyClarification(),
    engineResult: { enabled: true, activation: { decisions: [] } },
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.fallbackReason, 'ACTIVATION_DECISIONS_MISSING');
  assert.equal(result.finalText, legacyClarification().text);
});

test('I-18: decisão de capacidade fora da allowlist → fallback CAPABILITY_NOT_AUTHORIZED', () => {
  const config = createUniEngineConfig({
    env: { ...BASE_ENV, VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true', VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false' },
  });
  const result = runUniEngineIntegration({
    config,
    legacy: legacyClarification(),
    engineResult: {
      enabled: true,
      activation: {
        decisions: [{ capability: 'FINANCIAL_EXECUTION', activationStatus: 'ACTIVE_TEST' }],
      },
    },
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.fallbackReason, 'CAPABILITY_NOT_AUTHORIZED');
});

test('I-19: engine em shadow mode puro ainda roda a integração em shadow', () => {
  const config = createUniEngineConfig({
    env: {
      ...BASE_ENV,
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'true',
    },
  });
  const result = runUniEngineIntegration({
    config,
    legacy: legacyClarification(),
    engineResult: {
      enabled: true,
      decisionLayer: { nextDecisionType: 'ask', decisionType: 'ask', risk: 'LOW' },
      classification: { ambiguities: [], primaryIntent: 'register_expense' },
      comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
      activation: {
        decisions: [
          {
            capability: 'QUESTION_GUIDANCE',
            activationStatus: 'ACTIVE_TEST',
            gates: [
              'ENGINE_ENABLED', 'ACTIVATION_ENABLED', 'CAPABILITY_ENABLED', 'ENVIRONMENT_ALLOWED',
              'CONFIDENCE_THRESHOLD', 'RISK_THRESHOLD', 'WORKSPACE_COMPATIBLE', 'DATA_SUFFICIENCY',
              'CAPABILITY_POLICY', 'CIRCUIT_BREAKER',
            ].map((name) => ({ name, passed: true })),
            appliedEffect: { effect: 'guidance', applied: true, fields: ['questionKey'] },
            shadow: {},
          },
        ],
      },
    },
    context: { isDev: true },
  });
  assert.equal(result.status, 'SHADOW_ONLY');
  assert.equal(result.applied, false);
  assert.equal(result.finalText, legacyClarification().text);
});

test('I-20: default seguro — flags ausentes nunca ligam em produção', () => {
  const config = createUniEngineConfig({ env: { DEV: false, MODE: 'production' } });
  assert.equal(config.integrationEnabled, false);
  assert.equal(config.integrationTelemetryEnabled, false);
  const result = runUniEngineIntegration({
    config,
    legacy: legacyClarification(),
    engineResult: null,
    context: { isDev: false, environment: 'production' },
  });
  assert.equal(result.enabled, false);
  assert.equal(result.fallbackUsed, true);
});
