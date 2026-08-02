// Integration — fallback (Parte 1). Qualquer erro ou condição insegura cai
// imediatamente ao pipeline legado, preservando o texto e a execução.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
  EXPENSE_ACCOUNT_QUESTION,
} from './testFixtures.js';

test('I-55: entrada sem texto → fallback LEGACY_INVALID preserva legado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: null,
    engineResult: null,
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.fallbackReason, 'LEGACY_INVALID');
  assert.equal(result.finalText, null);
});

test('I-56: texto vazio → fallback LEGACY_INVALID', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: { text: '   ' },
    engineResult: null,
    context: { isDev: true },
  });
  assert.equal(result.fallbackReason, 'LEGACY_INVALID');
});

test('I-57: decisão com status shadow → bloqueada, texto legado preservado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE', { activationStatus: 'SHADOW_ONLY', shadowMode: true })] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.applied, false);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
  assert.ok(result.diagnostics.some((d) => d.code === 'CAPABILITY_NOT_ACTIVE'));
});

test('I-58: decisão com fallbackUsed → bloqueada', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE', { fallbackUsed: true })] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.applied, false);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-59: decisão com gates obrigatórios ausentes → bloqueada', () => {
  const decision = buildActiveDecision('QUESTION_GUIDANCE');
  decision.gates = decision.gates.slice(0, 3);
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [decision] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.applied, false);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-60: gate obrigatório reprovado (ENVIRONMENT_ALLOWED) → bloqueada', () => {
  const decision = buildActiveDecision('QUESTION_GUIDANCE');
  decision.gates = decision.gates.map((gate) => (
    gate.name === 'ENVIRONMENT_ALLOWED' ? { ...gate, passed: false } : gate
  ));
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [decision] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.applied, false);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-61: confiança abaixo do limiar da capacidade → CONFIDENCE_INSUFFICIENT', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true, confidence: 0.3 },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.fallbackReason, 'CONFIDENCE_INSUFFICIENT');
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-62: risco excessivo → RISK_EXCESSIVE', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true, risk: 'HIGH' },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.fallbackReason, 'RISK_EXCESSIVE');
});

test('I-63: dados insuficientes → CONTEXT_INSUFFICIENT', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    }),
    context: { isDev: true, dataSufficient: false },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.fallbackReason, 'CONTEXT_INSUFFICIENT');
});

test('I-64: engineResult não serializável é tratado como objeto vazio (fallback seguro)', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: { activation: { decisions: undefined } },
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-65: exceção interna vira fallback imediato com texto legado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: {
        enabled: true,
        decisions: [buildActiveDecision('QUESTION_GUIDANCE')],
      },
      comparison: {
        missingFields: ['amount'],
        agreementMetrics: { divergenceCount: 0 },
      },
      decisionLayer: { nextDecisionType: 'ask', decisionType: 'ask', risk: 'LOW' },
    }),
    context: {
      isDev: true,
      get confidence() { throw new Error('boom'); },
    },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});

test('I-66: fallback nunca altera texto nem sinaliza applied', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({ activation: { enabled: true, decisions: [] } }),
    context: { isDev: true },
  });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.applied, false);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
  assert.equal(result.legacyPreserved, true);
});

test('I-67: result de fallback passa na validação de contrato', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({ activation: { enabled: true, decisions: [] } }),
    context: { isDev: true },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('I-68: ativação com decisão sem aplicação efetiva (effect diferente) → bloqueada', () => {
  const decision = buildActiveDecision('QUESTION_GUIDANCE', {
    appliedEffect: { effect: 'execute', applied: true, fields: [] },
  });
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: buildEngineResult({
      activation: { enabled: true, decisions: [decision] },
    }),
    context: { isDev: true },
  });
  assert.equal(result.status, 'FALLBACK');
  assert.equal(result.applied, false);
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
});
