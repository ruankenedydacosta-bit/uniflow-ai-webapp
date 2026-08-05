// Testes do Contexto Conversacional Financeiro (Fase 16, Bloco 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichFinancialContext, getContextualMetrics } from '../context/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';

function buildSnapshot() {
  return buildFinancialReasoningSnapshot({
    accounts: [
      { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1500 },
      { id: 'acc-2', name: 'Poupança', account_type: 'savings', current_balance: 5000 },
    ],
    categories: [
      { id: 'cat-1', name: 'Salário', transaction_type: 'income' },
      { id: 'cat-2', name: 'Alimentação', transaction_type: 'expense' },
    ],
    transactions: [
      { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 5000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
      { id: 'tx-2', account_id: 'acc-1', transaction_type: 'expense', amount: 800, transaction_date: '2026-08-05', status: 'completed', category_id: 'cat-2', description: 'Mercado' },
    ],
    referenceDate: '2026-08-15',
  });
}

test('context: sem snapshot retorna hasData false', () => {
  const result = enrichFinancialContext({ snapshot: null });
  assert.equal(result.hasData, false);
  assert.equal(result.snapshot.present, false);
});

test('context: enriquece snapshot com métricas', () => {
  const snapshot = buildSnapshot();
  const result = enrichFinancialContext({ snapshot });
  assert.equal(result.hasData, true);
  assert.ok(result.metrics.totalBalance > 0);
  assert.ok(result.metrics.monthlyIncome > 0);
  assert.ok(result.metrics.monthlyExpense > 0);
  assert.ok(typeof result.metrics.savingsRate === 'number');
});

test('context: adiciona contexto temporal quando resolvido', () => {
  const snapshot = buildSnapshot();
  const temporal = { status: 'resolved', resolved: { type: 'current_month', periodKey: '2026-08' } };
  const result = enrichFinancialContext({ snapshot, temporalResolution: temporal });
  assert.ok(result.temporal?.context);
  assert.equal(result.temporal.context.periodKey, '2026-08');
  assert.equal(result.temporal.context.isCurrentPeriod, true);
});

test('context: adiciona contexto de intenção', () => {
  const snapshot = buildSnapshot();
  const intent = { type: 'expense_query', confidence: 0.9, resolvedEntities: [] };
  const result = enrichFinancialContext({ snapshot, intent });
  assert.ok(result.intent?.context);
  assert.equal(result.intent.context.type, 'expense_query');
  assert.equal(result.intent.context.requiresBreakdown, false);
});

test('context: adiciona histórico de conversa', () => {
  const snapshot = buildSnapshot();
  const history = [
    { intent: { type: 'balance_query' }, temporal: { resolved: { type: 'current_month' } }, timestamp: '2026-08-15T10:00:00Z' },
  ];
  const result = enrichFinancialContext({ snapshot, conversationHistory: history });
  assert.equal(result.conversation.turnCount, 1);
  assert.ok(result.conversation.hasFinancialContext);
});

test('context: getContextualMetrics retorna métricas focadas', () => {
  const snapshot = buildSnapshot();
  const enriched = enrichFinancialContext({ snapshot });
  const metrics = getContextualMetrics(enriched, 'expense_query');
  assert.ok(metrics);
  assert.equal(metrics.focus, 'monthlyExpense');
});

test('context: serializável', () => {
  const snapshot = buildSnapshot();
  const result = enrichFinancialContext({ snapshot });
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});