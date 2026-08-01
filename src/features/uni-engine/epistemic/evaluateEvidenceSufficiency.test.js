// Testes de suficiência de evidência (Fase 4 — seção 9).
// Itens 35-40: display permitido; suggestion permitido; ask recomendado;
// confirm exige dados completos; execute bloqueado; store_memory com
// evidência insuficiente bloqueado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEvidenceSufficiency } from './evaluateEvidenceSufficiency.js';
import { createEpistemicItem } from './epistemicContracts.js';
import { evidenceFromFinancialSnapshot } from './buildEpistemicEvidence.js';

function item(overrides = {}) {
  return createEpistemicItem({
    subject: 'balance:total',
    value: 950,
    claimType: 'fact',
    epistemicStatus: 'confirmed',
    confidence: 0.9,
    source: 'financial_snapshot',
    sourcePriority: 1,
    evidence: [evidenceFromFinancialSnapshot({ subject: 'balance:total', value: 950, observedAt: '2026-07-30T00:00:00.000Z' })],
    lastVerifiedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  });
}

test('epistêmico 35: display aceita supported com confiança suficiente', () => {
  const result = evaluateEvidenceSufficiency(
    item({ epistemicStatus: 'supported', confidence: 0.75 }),
    'display',
  );
  assert.equal(result.sufficient, true);
  assert.equal(result.reason, 'display_allowed');
});

test('epistêmico 36: suggestion aceita probable com confiança moderada', () => {
  const result = evaluateEvidenceSufficiency(
    item({ epistemicStatus: 'probable', confidence: 0.6 }),
    'suggest',
  );
  assert.equal(result.sufficient, true);
});

test('epistêmico 37: ask recomendado quando o dado está ausente ou conflitante', () => {
  const missing = evaluateEvidenceSufficiency(
    item({ epistemicStatus: 'missing', confidence: 0 }),
    'ask',
  );
  assert.equal(missing.sufficient, true);
  const conflicting = evaluateEvidenceSufficiency(
    item({ epistemicStatus: 'conflicting', confidence: 0.3 }),
    'ask',
  );
  assert.equal(conflicting.sufficient, true);
});

test('epistêmico 38: confirm exige dados completos, sem conflito e sem staleness', () => {
  const ready = evaluateEvidenceSufficiency(item(), 'confirm');
  assert.equal(ready.sufficient, true);

  const conflicted = evaluateEvidenceSufficiency(
    item({ epistemicStatus: 'conflicting', contradictions: [{ source: 'x', value: 1 }] }),
    'confirm',
  );
  assert.equal(conflicted.sufficient, false);
  assert.ok(conflicted.blockers.includes('conflicting'));

  const stale = evaluateEvidenceSufficiency(
    item({ epistemicStatus: 'stale' }),
    'confirm',
  );
  assert.equal(stale.sufficient, false);
  assert.ok(stale.blockers.includes('stale'));
});

test('epistêmico 39: execute é SEMPRE bloqueado em Shadow Mode', () => {
  const result = evaluateEvidenceSufficiency(item(), 'execute');
  assert.equal(result.sufficient, false);
  assert.ok(result.blockers.includes('shadow_mode_execution_blocked'));
  assert.equal(result.recommendedAction, 'block');
});

test('epistêmico 40: store_memory com evidência insuficiente é bloqueado', () => {
  const weak = evaluateEvidenceSufficiency(
    item({ epistemicStatus: 'possible', confidence: 0.3 }),
    'store_memory',
  );
  assert.equal(weak.sufficient, false);
  assert.ok(weak.blockers.some((blocker) => blocker.startsWith('insufficient')));

  const contradicted = evaluateEvidenceSufficiency(
    item({ epistemicStatus: 'supported', confidence: 0.9, contradictions: [{ source: 'x', value: 1 }] }),
    'store_memory',
  );
  assert.equal(contradicted.sufficient, false);

  const strong = evaluateEvidenceSufficiency(item(), 'store_memory');
  assert.equal(strong.sufficient, true);
});

test('epistêmico: propósito desconhecido retorna bloqueio seguro', () => {
  const result = evaluateEvidenceSufficiency(item(), 'voar');
  assert.equal(result.sufficient, false);
  assert.equal(result.recommendedAction, 'ignore');
});

test('epistêmico: item nulo retorna bloqueio seguro', () => {
  const result = evaluateEvidenceSufficiency(null, 'display');
  assert.equal(result.sufficient, false);
  assert.ok(result.blockers.includes('invalid_item'));
});
