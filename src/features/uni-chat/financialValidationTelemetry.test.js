// Sprint 4 Ciclo 4 (Bloco 4.9) — testes do agregador DEV de telemetria de
// validação real. Garante: nunca loga/acumula fora de DEV, nunca lança,
// nunca inventa custo sem tabela de preço real, calcula corretamente taxa
// de sucesso/fallback/bloqueio de guardrail/latência/distribuição de modos.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recordFinancialValidationEvent,
  getFinancialValidationTelemetrySnapshot,
  resetFinancialValidationTelemetry,
} from './financialValidationTelemetry.js';

test.beforeEach(() => {
  resetFinancialValidationTelemetry();
});

test('fora de DEV (isDev=false), nunca acumula nada', () => {
  recordFinancialValidationEvent({ mode: 'financial_intent', llmCallCount: 1 }, { isDev: false });
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(snapshot.totalEvents, 0);
});

test('em DEV, acumula eventos e conta chamadas LLM', () => {
  recordFinancialValidationEvent({ mode: 'financial_intent', llmCallCount: 1 }, { isDev: true });
  recordFinancialValidationEvent({ mode: 'financial_response_compose', llmCallCount: 2 }, { isDev: true });
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(snapshot.totalEvents, 2);
  assert.equal(snapshot.totalLlmCalls, 3);
  assert.equal(snapshot.avgLlmCallsPerEvent, 1.5);
});

test('distribuição de modos usados é contada corretamente', () => {
  recordFinancialValidationEvent({ mode: 'financial_intent' }, { isDev: true });
  recordFinancialValidationEvent({ mode: 'financial_intent' }, { isDev: true });
  recordFinancialValidationEvent({ mode: 'financial_response_compose' }, { isDev: true });
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.deepEqual(snapshot.modesUsed, { financial_intent: 2, financial_response_compose: 1 });
});

test('taxa de sucesso do composer -- só conta eventos com composerUsed !== null', () => {
  recordFinancialValidationEvent({ mode: 'financial_intent', composerUsed: null }, { isDev: true }); // não conta
  recordFinancialValidationEvent({ mode: 'financial_response_compose', composerUsed: true }, { isDev: true });
  recordFinancialValidationEvent({ mode: 'financial_response_compose', composerUsed: true }, { isDev: true });
  recordFinancialValidationEvent({ mode: 'financial_response_compose', composerUsed: false, fallbackReason: 'TIMEOUT' }, { isDev: true });
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(snapshot.composerAttempts, 3);
  assert.equal(snapshot.composerSuccessRate, 2 / 3);
  assert.equal(snapshot.fallbackRate, 1 / 3);
});

test('taxa de bloqueio de guardrail -- só conta fallbackReason que começa com GUARDRAIL_FAILED', () => {
  recordFinancialValidationEvent({ composerUsed: false, fallbackReason: 'GUARDRAIL_FAILED_NUMBER' }, { isDev: true });
  recordFinancialValidationEvent({ composerUsed: false, fallbackReason: 'GUARDRAIL_FAILED_ENTITY_INVENTED' }, { isDev: true });
  recordFinancialValidationEvent({ composerUsed: false, fallbackReason: 'TIMEOUT' }, { isDev: true });
  recordFinancialValidationEvent({ composerUsed: true }, { isDev: true });
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(snapshot.composerAttempts, 4);
  assert.equal(snapshot.guardrailBlockRate, 2 / 4);
  assert.deepEqual(snapshot.guardrailBlocksByReason, {
    GUARDRAIL_FAILED_NUMBER: 1,
    GUARDRAIL_FAILED_ENTITY_INVENTED: 1,
  });
});

test('latência: média e p95 calculados a partir de durationMs reais', () => {
  for (const ms of [100, 200, 300, 400, 500]) {
    recordFinancialValidationEvent({ durationMs: ms }, { isDev: true });
  }
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(snapshot.avgLatencyMs, 300);
  assert.equal(snapshot.p95LatencyMs, 500);
});

test('tokens: soma promptTokens/completionTokens reais de cada evento', () => {
  recordFinancialValidationEvent({ usage: { promptTokens: 100, completionTokens: 20 } }, { isDev: true });
  recordFinancialValidationEvent({ usage: { promptTokens: 150, completionTokens: 25 } }, { isDev: true });
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(snapshot.totalPromptTokens, 250);
  assert.equal(snapshot.totalCompletionTokens, 45);
});

test('sem tabela de preço fornecida, custo estimado é null -- nunca inventa preço', () => {
  recordFinancialValidationEvent({ usage: { promptTokens: 1_000_000, completionTokens: 1_000_000 } }, { isDev: true });
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(snapshot.estimatedCostUsd, null);
});

test('com tabela de preço real fornecida pelo chamador, calcula custo estimado corretamente', () => {
  recordFinancialValidationEvent({ usage: { promptTokens: 1_000_000, completionTokens: 500_000 } }, { isDev: true });
  const snapshot = getFinancialValidationTelemetrySnapshot({
    pricing: { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  });
  assert.equal(snapshot.estimatedCostUsd, 0.45);
});

test('resetFinancialValidationTelemetry zera todo o estado acumulado', () => {
  recordFinancialValidationEvent({ mode: 'financial_intent', llmCallCount: 5 }, { isDev: true });
  resetFinancialValidationTelemetry();
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(snapshot.totalEvents, 0);
  assert.equal(snapshot.totalLlmCalls, 0);
});

test('sem nenhum evento registrado, snapshot nunca lança e devolve taxas/latências null (nada a dividir)', () => {
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(snapshot.composerSuccessRate, null);
  assert.equal(snapshot.fallbackRate, null);
  assert.equal(snapshot.guardrailBlockRate, null);
  assert.equal(snapshot.avgLatencyMs, null);
  assert.equal(snapshot.p95LatencyMs, null);
  assert.equal(snapshot.avgLlmCallsPerEvent, null);
});

test('recordFinancialValidationEvent nunca lança mesmo com entradas malformadas', () => {
  assert.doesNotThrow(() => recordFinancialValidationEvent(null, { isDev: true }));
  assert.doesNotThrow(() => recordFinancialValidationEvent({ usage: 'não é um objeto' }, { isDev: true }));
  assert.doesNotThrow(() => recordFinancialValidationEvent({ llmCallCount: 'x', durationMs: 'y' }, { isDev: true }));
});

test('snapshot é imutável (Object.freeze)', () => {
  recordFinancialValidationEvent({ mode: 'financial_intent' }, { isDev: true });
  const snapshot = getFinancialValidationTelemetrySnapshot();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.modesUsed), true);
  assert.equal(Object.isFrozen(snapshot.guardrailBlocksByReason), true);
});
