// Testes do Resolvedor Temporal (Fase 16, Bloco 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTemporalReferences,
  extractTemporalEntities,
  buildTemporalContext,
} from '../temporal/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';

function buildSnapshot() {
  return buildFinancialReasoningSnapshot({
    accounts: [{ id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1000 }],
    categories: [{ id: 'cat-1', name: 'Salário', transaction_type: 'income' }],
    transactions: [
      { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 5000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
    ],
    referenceDate: '2026-08-15',
  });
}

test('temporal: texto vazio retorna out_of_scope', () => {
  const result = resolveTemporalReferences('');
  assert.equal(result.status, 'out_of_scope');
  assert.equal(result.confidence, 0);
});

test('temporal: "este mês" resolve para mês corrente', () => {
  const result = resolveTemporalReferences('este mês', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'current_month');
  assert.equal(result.resolved.start, '2026-08-01');
  assert.equal(result.resolved.end, '2026-08-31');
});

test('temporal: "mês passado" resolve para mês anterior', () => {
  const result = resolveTemporalReferences('mês passado', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'previous_month');
  assert.equal(result.resolved.start, '2026-07-01');
  assert.equal(result.resolved.end, '2026-07-31');
});

test('temporal: "últimos 3 meses" resolve janela de 3 meses', () => {
  const result = resolveTemporalReferences('últimos 3 meses', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'last_n_months');
  assert.equal(result.resolved.n, 3);
});

test('temporal: "janeiro 2026" resolve mês específico', () => {
  const result = resolveTemporalReferences('janeiro 2026', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'specific_month');
  assert.equal(result.resolved.year, 2026);
  assert.equal(result.resolved.month, 1);
});

test('temporal: "desde 01/01/2026" resolve data inicial', () => {
  const result = resolveTemporalReferences('desde 01/01/2026', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'since_date');
  assert.equal(result.resolved.date, '2026-01-01');
});

test('temporal: "até 31/12/2026" resolve data final', () => {
  const result = resolveTemporalReferences('até 31/12/2026', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'until_date');
  assert.equal(result.resolved.date, '2026-12-31');
});

test('temporal: "15/01/2026 a 20/01/2026" resolve range de datas', () => {
  const result = resolveTemporalReferences('15/01/2026 a 20/01/2026', '2026-08-15');
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolved.type, 'specific_date_range');
  assert.equal(result.resolved.start, '2026-01-15');
  assert.equal(result.resolved.end, '2026-01-20');
});

test('temporal: texto ambíguo retorna ambiguous', () => {
  const result = resolveTemporalReferences('algum dia', '2026-08-15');
  assert.equal(result.status, 'ambiguous');
});

test('temporal: extractTemporalEntities encontra entidades', () => {
  const entities = extractTemporalEntities('este mês e mês passado');
  assert.ok(entities.length >= 2);
  assert.ok(entities.some(e => e.type === 'current_month'));
  assert.ok(entities.some(e => e.type === 'previous_month'));
});

test('temporal: buildTemporalContext enriquece com snapshot', () => {
  const snapshot = buildSnapshot();
  const temporal = { status: 'resolved', resolved: { type: 'current_month', periodKey: '2026-08' } };
  const context = buildTemporalContext(temporal, snapshot);
  assert.ok(context);
  assert.equal(context.periodKey, '2026-08');
  assert.equal(context.isCurrentPeriod, true);
});