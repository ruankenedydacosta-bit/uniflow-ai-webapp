// Testes de prioridade entre fontes (Fase 4 — seção 7).
// Itens 13-17: banco vence memória; correção atual vence memória;
// confirmação vence inferência; memória confirmada vence hipótese;
// contexto não cria fato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEpistemicPriority,
  getSourcePriority,
  EPISTEMIC_POLICY,
} from './epistemicPolicy.js';
import { createEpistemicItem } from './epistemicContracts.js';
import { runEpistemicVerifier } from './runEpistemicVerifier.js';

function item(source, overrides = {}) {
  return createEpistemicItem({
    subject: 'balance:total',
    value: 950,
    claimType: 'fact',
    epistemicStatus: 'confirmed',
    confidence: 0.9,
    source,
    sourcePriority: getSourcePriority(source),
    evidence: [],
    lastVerifiedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  });
}

test('epistêmico 13: banco/FinancialSnapshot vence memória', () => {
  const snapshot = item('financial_snapshot', { value: 950, lastVerifiedAt: '2026-07-30T00:00:00.000Z' });
  const memory = item('persistent_memory', { value: 1000, lastVerifiedAt: '2026-07-10T00:00:00.000Z' });
  assert.equal(resolveEpistemicPriority(snapshot, memory), snapshot);
  assert.equal(resolveEpistemicPriority(memory, snapshot), snapshot, 'ordem de entrada não importa');
});

test('epistêmico 14: correção explícita atual vence memória', () => {
  const correction = item('user_correction', { value: 1000, lastVerifiedAt: '2026-07-30T00:00:00.000Z' });
  const memory = item('persistent_memory', { value: 950, lastVerifiedAt: '2026-06-01T00:00:00.000Z' });
  assert.equal(resolveEpistemicPriority(correction, memory), correction);
});

test('epistêmico 15: confirmação explícita vence inferência determinística', () => {
  const confirmation = item('user_confirmation', { value: 50 });
  const inference = item('deterministic_inference', { value: 60 });
  assert.equal(resolveEpistemicPriority(confirmation, inference), confirmation);
});

test('epistêmico 16: memória confirmada vence hipótese', () => {
  const memory = item('persistent_memory', { value: 'Nubank', epistemicStatus: 'supported' });
  const hypothesis = item('deterministic_inference', { value: 'Itaú', epistemicStatus: 'hypothesis' });
  assert.equal(resolveEpistemicPriority(memory, hypothesis), memory);
});

test('epistêmico 16b: mesma fonte — o mais recentemente verificado vence (temporalidade)', () => {
  const oldSnapshot = item('financial_snapshot', { lastVerifiedAt: '2026-06-01T00:00:00.000Z' });
  const newSnapshot = item('financial_snapshot', { lastVerifiedAt: '2026-07-30T00:00:00.000Z' });
  assert.equal(resolveEpistemicPriority(oldSnapshot, newSnapshot), newSnapshot);
});

test('epistêmico 17: contexto conversacional não cria fato', () => {
  const verifier = runEpistemicVerifier({
    now: '2026-07-30T10:00:00.000Z',
    operationalMemory: { lastValue: 50 },
    plan: null,
  });
  const contextItem = verifier.items.find((entry) => entry.subject === 'amount');
  assert.ok(contextItem, 'item de contexto deve existir');
  assert.equal(contextItem.claimType, 'inference');
  assert.equal(contextItem.epistemicStatus, 'possible');
  assert.equal(contextItem.source, 'operational_memory');
});

test('epistêmico: prioridades da política são ordenadas como a especificação', () => {
  const order = [
    'database_record',
    'financial_snapshot',
    'user_confirmation',
    'user_correction',
    'user_explicit_statement',
    'persistent_memory',
    'operational_memory',
    'conversation_context',
    'deterministic_inference',
    'system_rule',
    'external_source',
    'unknown',
  ];
  const priorities = order.map((source) => getSourcePriority(source));
  for (let i = 1; i < priorities.length; i += 1) {
    assert.ok(priorities[i - 1] <= priorities[i], `${order[i]} fora da ordem`);
  }
  assert.equal(getSourcePriority('unknown'), EPISTEMIC_POLICY.sourcePriority.unknown);
});
