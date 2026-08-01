// Testes de confiança determinística (Fase 4 — seção 8).
// Itens 18-23: evidência direta alta; inferência isolada baixa; conflito
// reduz; stale reduz; confirmação aumenta; duplicação não infla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEpistemicConfidence } from './computeEpistemicConfidence.js';
import {
  evidenceFromDatabaseRecord,
  evidenceFromDeterministicRule,
  evidenceFromFinancialSnapshot,
  evidenceFromUserConfirmation,
  evidenceFromUserStatement,
  evidenceFromContradiction,
} from './buildEpistemicEvidence.js';
import { describeConfidence } from './epistemicPolicy.js';

const NOW = '2026-07-30T10:00:00.000Z';

test('epistêmico 18: evidência direta de banco gera confiança alta (>= 0.70)', () => {
  const confidence = computeEpistemicConfidence({
    source: 'financial_snapshot',
    evidence: [evidenceFromFinancialSnapshot({ subject: 'balance:total', value: 950, observedAt: NOW })],
  });
  assert.ok(confidence >= 0.7, `confiança ${confidence} deveria ser alta`);
  assert.equal(describeConfidence(confidence), 'high');
});

test('epistêmico 19: inferência isolada gera confiança baixa (< 0.50)', () => {
  const confidence = computeEpistemicConfidence({
    source: 'deterministic_inference',
    evidence: [evidenceFromDeterministicRule({ subject: 'category:x', value: 'Alimentação', observedAt: NOW })],
  });
  assert.ok(confidence < 0.5, `confiança ${confidence} deveria ser baixa`);
  assert.ok(['insufficient', 'low'].includes(describeConfidence(confidence)));
});

test('epistêmico 20: conflito reduz a confiança', () => {
  const base = computeEpistemicConfidence({
    source: 'user_explicit_statement',
    evidence: [evidenceFromUserStatement({ subject: 'balance:total', value: 1000, observedAt: NOW })],
  });
  const conflicted = computeEpistemicConfidence({
    source: 'user_explicit_statement',
    evidence: [evidenceFromUserStatement({ subject: 'balance:total', value: 1000, observedAt: NOW })],
    contradictions: [{ source: 'financial_snapshot', value: 950 }],
  });
  assert.ok(conflicted < base, `conflito deveria reduzir: ${conflicted} vs ${base}`);
});

test('epistêmico 21: staleness reduz a confiança', () => {
  const fresh = computeEpistemicConfidence({
    source: 'financial_snapshot',
    evidence: [evidenceFromFinancialSnapshot({ subject: 'balance:total', value: 950, observedAt: NOW })],
  });
  const stale = computeEpistemicConfidence({
    source: 'financial_snapshot',
    evidence: [evidenceFromFinancialSnapshot({ subject: 'balance:total', value: 950, observedAt: NOW })],
    stale: true,
  });
  assert.ok(stale < fresh, `stale deveria reduzir: ${stale} vs ${fresh}`);
});

test('epistêmico 22: confirmação explícita aumenta a confiança', () => {
  const statementOnly = computeEpistemicConfidence({
    source: 'user_explicit_statement',
    evidence: [evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: NOW })],
  });
  const confirmed = computeEpistemicConfidence({
    source: 'user_confirmation',
    evidence: [
      evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: NOW }),
      evidenceFromUserConfirmation({ subject: 'amount', value: 50, observedAt: NOW }),
    ],
    confirmed: true,
  });
  assert.ok(confirmed > statementOnly, `confirmação deveria aumentar: ${confirmed} vs ${statementOnly}`);
});

test('epistêmico 23: duplicação não infla a confiança', () => {
  const single = computeEpistemicConfidence({
    source: 'user_explicit_statement',
    evidence: [evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: NOW })],
  });
  const duplicated = computeEpistemicConfidence({
    source: 'user_explicit_statement',
    evidence: [
      evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: NOW }),
      evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: NOW }),
      evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: NOW }),
    ],
  });
  assert.equal(duplicated, single, 'evidências idênticas contam uma única vez');
});

test('epistêmico: sem evidência a confiança é zero', () => {
  assert.equal(computeEpistemicConfidence({ source: 'unknown', evidence: [] }), 0);
});

test('epistêmico: evidência contraditória reduz a confiança em relação à base', () => {
  const base = computeEpistemicConfidence({
    source: 'financial_snapshot',
    evidence: [evidenceFromDatabaseRecord({ subject: 'balance:total', value: 950, observedAt: NOW })],
  });
  const contradicted = computeEpistemicConfidence({
    source: 'financial_snapshot',
    evidence: [
      evidenceFromDatabaseRecord({ subject: 'balance:total', value: 950, observedAt: NOW }),
      evidenceFromContradiction({ subject: 'balance:total', value: 1000, observedAt: NOW }),
    ],
  });
  assert.ok(contradicted < base);
});
