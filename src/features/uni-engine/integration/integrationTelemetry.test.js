// Integration — telemetria (Parte 1). Métricas estruturais apenas; falha de
// telemetria nunca quebra o pipeline; nenhum campo sensível.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import { buildIntegrationTelemetry, emitIntegrationTelemetry } from './telemetry/integrationTelemetry.js';
import { redactIntegrationTelemetry } from './telemetry/redactIntegrationTelemetry.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
  EXPENSE_ACCOUNT_QUESTION,
} from './testFixtures.js';

test('I-93: telemetria desligada por padrão nunca é emitida', () => {
  const calls = [];
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true, telemetryAdapter: (t) => calls.push(t) },
  });
  assert.equal(result.telemetry, null);
  assert.equal(calls.length, 0);
});

test('I-94: telemetria ligada emite métricas estruturais', () => {
  const calls = [];
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_TELEMETRY: 'true' }),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true, telemetryAdapter: (t) => calls.push(t) },
  });
  assert.equal(result.telemetry !== null, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].version, result.version);
});

test('I-95: telemetria nunca contém texto, userId, workspace ou valores', () => {
  const telemetry = buildIntegrationTelemetry({
    enabled: true,
    shadowMode: false,
    status: 'active',
    applied: true,
    capabilitiesRequested: ['QUESTION_GUIDANCE'],
    capabilitiesApplied: ['QUESTION_GUIDANCE'],
    responseType: 'clarification',
    legacyPreserved: false,
    fallbackUsed: false,
    questionApplied: true,
    clarificationApplied: false,
    styleApplied: false,
    lengthApplied: false,
    styleKey: null,
    lengthBand: null,
    latencyMs: 1.5,
    userId: 'user-123',
    workspaceId: 'ws-9',
    text: EXPENSE_ACCOUNT_QUESTION,
    accountId: 'acc-1',
    amount: 500,
  });
  const json = JSON.stringify(telemetry);
  assert.equal(json.includes('user-123'), false);
  assert.equal(json.includes('ws-9'), false);
  assert.equal(json.includes(EXPENSE_ACCOUNT_QUESTION), false);
  assert.equal(json.includes('acc-1'), false);
  assert.equal(json.includes('500'), false);
});

test('I-96: redação permite somente campos da allowlist', () => {
  const redacted = redactIntegrationTelemetry({
    version: '1.0',
    status: 'active',
    userId: 'user-123',
    text: 'segredo',
    função: () => 1,
  });
  assert.deepEqual(Object.keys(redacted).sort(), ['status', 'version']);
});

test('I-97: falha do adapter de telemetria nunca quebra a integração', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_TELEMETRY: 'true' }),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: {
      isDev: true,
      telemetryAdapter: () => { throw new Error('adapter quebrado'); },
    },
  });
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-98: fallback não emite telemetria falsa de sucesso', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_TELEMETRY: 'true' }),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({ activation: { enabled: true, decisions: [] } }),
    context: { isDev: true },
  });
  assert.equal(result.telemetry, null);
});

test('I-99: telemetria em shadow informa shadowMode true', () => {
  const calls = [];
  runUniEngineIntegration({
    config: buildIntegrationConfig({
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'true',
      VITE_UNI_ENGINE_INTEGRATION_TELEMETRY: 'true',
    }),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true, telemetryAdapter: (t) => calls.push(t) },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].shadowMode, true);
  assert.equal(calls[0].applied, false);
});

test('I-100: telemetria sem adapter é emitida de forma segura (sem lançar)', () => {
  const telemetry = buildIntegrationTelemetry({ enabled: true, status: 'active', latencyMs: 2 });
  const redacted = emitIntegrationTelemetry(telemetry, null);
  assert.equal(redacted.status, 'active');
});

test('I-101: latencyMs sempre numérico e arredondado a 2 casas', () => {
  const telemetry = buildIntegrationTelemetry({ enabled: true, status: 'active', latencyMs: 1.23456 });
  assert.equal(telemetry.latencyMs, 1.23);
});

test('I-102: campos fora da allowlist são descartados (nunca vazam)', () => {
  const redacted = redactIntegrationTelemetry({ secret: { nested: 'x' } });
  assert.equal(Object.hasOwn(redacted, 'secret'), false);
});
