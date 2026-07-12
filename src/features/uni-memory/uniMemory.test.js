import assert from 'node:assert/strict';
import test from 'node:test';
import { listFinancialMemories, sanitizeMemoryValue } from '../../services/uniMemoryService.js';
import {
  analyzeSpendingPatterns,
  buildMemoryCandidates,
  createFinancialSnapshot,
  detectFinancialAnomalies,
  detectRecurrences,
  explainMemoryEvidence,
  resolveMemoryCandidate,
} from './index.js';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const accounts = [
  { id: 'account-main', name: 'Conta principal' },
  { id: 'account-card', name: 'Cartão' },
];
const categories = [
  { id: 'category-income', name: 'Salário' },
  { id: 'category-home', name: 'Moradia' },
  { id: 'category-food', name: 'Alimentação' },
];

function transaction(id, type, amount, date, description, categoryId, accountId = 'account-main') {
  return {
    id,
    workspace_id: WORKSPACE_ID,
    transaction_type: type,
    amount,
    transaction_date: date,
    description,
    category_id: categoryId,
    account_id: accountId,
    status: 'completed',
  };
}

test('snapshot resume receitas, despesas, fluxo e agrupamentos sem copiar histórico', () => {
  const snapshot = createFinancialSnapshot({
    accounts,
    categories,
    transactions: [
      transaction('income-1', 'income', 5000, '2026-06-05', 'Salário', 'category-income'),
      transaction('expense-1', 'expense', 1200, '2026-06-08', 'Aluguel', 'category-home'),
      transaction('expense-2', 'expense', 300, '2026-06-10', 'Mercado', 'category-food'),
    ],
  });

  assert.deepEqual(snapshot.totals, {
    income: 5000,
    expenses: 1500,
    netFlow: 3500,
    transactionCount: 3,
  });
  assert.equal(snapshot.categoryTotals.find((item) => item.id === 'category-home').average, 1200);
  assert.equal(snapshot.accountTotals[0].count, 3);
  assert.equal(Object.hasOwn(snapshot, 'transactions'), false);
});

test('detecta receita recorrente mensal com evidências', () => {
  const result = detectRecurrences([
    transaction('salary-1', 'income', 5000, '2026-04-05', 'Salário empresa', 'category-income'),
    transaction('salary-2', 'income', 5000, '2026-05-05', 'Salário empresa', 'category-income'),
    transaction('salary-3', 'income', 5050, '2026-06-05', 'Salário empresa', 'category-income'),
  ]);

  assert.equal(result[0].transactionType, 'income');
  assert.equal(result[0].frequency, 'monthly');
  assert.equal(result[0].occurrences, 3);
  assert.ok(result[0].confidence >= 0.8);
});

test('detecta despesa recorrente mensal', () => {
  const result = detectRecurrences([
    transaction('rent-1', 'expense', 1800, '2026-04-10', 'Aluguel', 'category-home'),
    transaction('rent-2', 'expense', 1800, '2026-05-10', 'Aluguel', 'category-home'),
    transaction('rent-3', 'expense', 1800, '2026-06-10', 'Aluguel', 'category-home'),
  ]);

  assert.equal(result[0].transactionType, 'expense');
  assert.equal(result[0].frequency, 'monthly');
  assert.equal(result[0].averageAmount, 1800);
});

test('agrupa descrições semelhantes com valores aproximados', () => {
  const result = detectRecurrences([
    transaction('stream-1', 'expense', 39.9, '2026-04-12', 'Netflix abril', 'category-home'),
    transaction('stream-2', 'expense', 41.9, '2026-05-12', 'Netflix maio', 'category-home'),
    transaction('stream-3', 'expense', 42.9, '2026-06-12', 'Netflix junho', 'category-home'),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].occurrences, 3);
  assert.equal(result[0].frequency, 'monthly');
});

test('identifica aumento relevante por categoria', () => {
  const patterns = analyzeSpendingPatterns([
    transaction('may-1', 'expense', 100, '2026-05-10', 'Mercado', 'category-food'),
    transaction('may-2', 'expense', 100, '2026-05-20', 'Mercado', 'category-food'),
    transaction('jun-1', 'expense', 200, '2026-06-10', 'Mercado', 'category-food'),
    transaction('jun-2', 'expense', 200, '2026-06-20', 'Mercado', 'category-food'),
  ], { referenceDate: '2026-06-30', periodDays: 30 });

  const increase = patterns.find((item) => item.type === 'category_increase');
  assert.equal(increase.changePercent, 100);
  assert.equal(increase.categoryId, 'category-food');
});

test('identifica redução relevante por categoria', () => {
  const patterns = analyzeSpendingPatterns([
    transaction('may-1', 'expense', 200, '2026-05-10', 'Mercado', 'category-food'),
    transaction('may-2', 'expense', 200, '2026-05-20', 'Mercado', 'category-food'),
    transaction('jun-1', 'expense', 100, '2026-06-10', 'Mercado', 'category-food'),
    transaction('jun-2', 'expense', 100, '2026-06-20', 'Mercado', 'category-food'),
  ], { referenceDate: '2026-06-30', periodDays: 30 });

  const reduction = patterns.find((item) => item.type === 'category_decrease');
  assert.equal(reduction.changePercent, -50);
});

test('aponta valor fora da média sem diagnóstico alarmista', () => {
  const anomalies = detectFinancialAnomalies([
    transaction('food-1', 'expense', 90, '2026-06-01', 'Mercado', 'category-food'),
    transaction('food-2', 'expense', 100, '2026-06-08', 'Mercado', 'category-food'),
    transaction('food-3', 'expense', 110, '2026-06-15', 'Mercado', 'category-food'),
    transaction('food-4', 'expense', 450, '2026-06-22', 'Mercado especial', 'category-food'),
  ]);

  const anomaly = anomalies.find((item) => item.type === 'amount_above_category_average');
  assert.equal(anomaly.transactionId, 'food-4');
  assert.equal(anomaly.evidence.categoryAverage, 100);
});

test('dados insuficientes não geram memória inferida', () => {
  const snapshot = createFinancialSnapshot({
    accounts,
    categories,
    transactions: [transaction('single', 'expense', 50, '2026-06-01', 'Mercado', 'category-food')],
  });
  const candidates = buildMemoryCandidates({ workspaceId: WORKSPACE_ID, snapshot });

  assert.deepEqual(candidates, []);
});

test('preferência explícita vence inferência não confirmada', () => {
  const candidate = {
    type: 'conversation_preference', key: 'response_detail', value: { preference: 'concise' },
    confidence: 1, source: 'explicit_user', lastObservedAt: '2026-07-01', requiresConfirmation: false,
  };
  const existing = [{
    type: 'conversation_preference', key: 'response_detail', value: { preference: 'detailed' },
    confidence: 0.7, source: 'conversation_context', status: 'candidate', lastObservedAt: '2026-06-01',
  }];

  const resolved = resolveMemoryCandidate(candidate, existing, { now: '2026-07-02' });
  assert.equal(resolved.decision, 'prefer_explicit');
  assert.deepEqual(resolved.memory.value, { preference: 'concise' });
});

test('memória confirmada contraditória exige revisão', () => {
  const candidate = {
    type: 'account_preference', key: 'main', value: { accountId: 'account-card' },
    confidence: 0.9, source: 'transaction_pattern', lastObservedAt: '2026-07-01', requiresConfirmation: true,
  };
  const existing = [{
    type: 'account_preference', key: 'main', value: { accountId: 'account-main' },
    confidence: 1, source: 'explicit_user', status: 'confirmed', lastObservedAt: '2026-06-01',
  }];

  const resolved = resolveMemoryCandidate(candidate, existing, { now: '2026-07-02' });
  assert.equal(resolved.decision, 'review_required');
  assert.equal(resolved.requiresReview, true);
  assert.deepEqual(resolved.memory.value, { accountId: 'account-main' });
});

test('memória temporária expirada não permanece ativa', () => {
  const candidate = {
    type: 'financial_goal_context', key: 'viagem', value: { name: 'Viagem' },
    confidence: 0.7, source: 'conversation_context', expiresAt: '2026-06-30T00:00:00.000Z',
  };
  const resolved = resolveMemoryCandidate(candidate, [], { now: '2026-07-01T00:00:00.000Z' });

  assert.equal(resolved.decision, 'expired');
  assert.equal(resolved.memory.status, 'expired');
});

test('explicação determinística inclui evidências observáveis', () => {
  const explanation = explainMemoryEvidence('recurring_expense', {
    occurrences: 3,
    averageIntervalDays: 30,
  });

  assert.match(explanation, /3 lançamentos semelhantes/i);
  assert.match(explanation, /30 dias/);
});

test('analisadores não alteram os dados de entrada e congelam o resultado', () => {
  const input = [transaction('immutable', 'expense', 80, '2026-06-01', 'Mercado', 'category-food')];
  const before = structuredClone(input);
  const snapshot = createFinancialSnapshot({ accounts, categories, transactions: input });

  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.totals), true);
});

test('sanitização remove campos proibidos em qualquer nível', () => {
  const sanitized = sanitizeMemoryValue({
    merchant: 'Mercado',
    accessToken: 'não pode ficar',
    nested: { private_key: 'não pode ficar', amount: 80 },
    transcript: 'fala completa',
  });

  assert.deepEqual(sanitized, { merchant: 'Mercado', nested: { amount: 80 } });
});

test('service retorna fallback seguro quando Supabase não está configurado', async () => {
  const result = await listFinancialMemories(WORKSPACE_ID);

  assert.deepEqual(result.data, []);
  assert.equal(result.error.code, 'SUPABASE_NOT_CONFIGURED');
  assert.match(result.error.message, /modo seguro/i);
});
