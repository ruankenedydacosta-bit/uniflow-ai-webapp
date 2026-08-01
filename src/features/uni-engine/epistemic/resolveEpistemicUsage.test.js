// Testes da política de uso (Fase 4 — seção 15).
// Itens 41-46: confirmed database → display; probable memory → suggestion;
// conflicting → ask; stale financial → refresh; missing → ask; invalid → block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEpistemicUsage, computeUsableFor } from './resolveEpistemicUsage.js';
import { createEpistemicItem } from './epistemicContracts.js';
import { getSourcePriority } from './epistemicPolicy.js';

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

test('epistêmico 41: confirmed + database_record → use_for_display', () => {
  const usage = resolveEpistemicUsage(item('database_record'));
  assert.equal(usage.usage, 'use_for_display');
});

test('epistêmico 41b: confirmed + financial_snapshot → use_for_display', () => {
  const usage = resolveEpistemicUsage(item('financial_snapshot'));
  assert.equal(usage.usage, 'use_for_display');
});

test('epistêmico 42: probable + persistent_memory → use_for_suggestion', () => {
  const usage = resolveEpistemicUsage(item('persistent_memory', {
    epistemicStatus: 'probable',
    confidence: 0.6,
  }));
  assert.equal(usage.usage, 'use_for_suggestion');
});

test('epistêmico 43: conflicting → ask_user (nunca escolhe sozinho)', () => {
  const usage = resolveEpistemicUsage(item('user_explicit_statement', {
    epistemicStatus: 'conflicting',
    contradictions: [{ source: 'financial_snapshot', value: 900 }],
  }));
  assert.equal(usage.usage, 'ask_user');
});

test('epistêmico 44: stale + estado financeiro → refresh_data', () => {
  const usage = resolveEpistemicUsage(item('financial_snapshot', {
    epistemicStatus: 'stale',
    subject: 'balance:total',
  }));
  assert.equal(usage.usage, 'refresh_data');
});

test('epistêmico 45: missing → ask_user', () => {
  const usage = resolveEpistemicUsage(item('deterministic_inference', {
    epistemicStatus: 'missing',
    claimType: 'absence',
    confidence: 0,
  }));
  assert.equal(usage.usage, 'ask_user');
});

test('epistêmico 46: invalid → block', () => {
  const usage = resolveEpistemicUsage(item('unknown', { epistemicStatus: 'invalid' }));
  assert.equal(usage.usage, 'block');
});

test('epistêmico: contexto exige confirmação → rebaixa para require_confirmation', () => {
  const usage = resolveEpistemicUsage(item('database_record'), { requiresConfirmation: true });
  assert.equal(usage.usage, 'require_confirmation');
});

test('epistêmico: propósito execute nunca é autorizado', () => {
  const usage = resolveEpistemicUsage(item('database_record'), { purpose: 'execute' });
  assert.equal(usage.usage, 'block');
  assert.equal(usage.reason, 'execution_blocked_shadow_mode');
});

test('epistêmico: usableFor mantém execution=false e expõe capacidades', () => {
  const capabilities = computeUsableFor(item('database_record'));
  assert.equal(capabilities.execution, false);
  assert.equal(capabilities.display, true);
  assert.equal(capabilities.suggestion, true);

  const weak = computeUsableFor(item('user_explicit_statement', {
    epistemicStatus: 'possible',
    confidence: 0.3,
  }));
  assert.equal(weak.display, false);
  assert.equal(weak.question, true);
});

test('epistêmico: item nulo nunca autoriza nada', () => {
  const usage = resolveEpistemicUsage(null);
  assert.equal(usage.usage, 'ignore');
  const capabilities = computeUsableFor(null);
  assert.equal(capabilities.execution, false);
  assert.equal(capabilities.none, true);
});
