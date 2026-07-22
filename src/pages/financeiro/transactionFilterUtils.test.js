import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_TRANSACTION_FILTERS,
  applyTransactionFilters,
  derivePaymentMethodOptions,
  filterTransactionsByDateRange,
  hasActiveTransactionFilters,
  isInstallmentTransaction,
  isRecurringTransaction,
  matchesSearchQuery,
  normalizeSearchText,
  sortTransactions,
} from './transactionFilterUtils.js';

const categoriesById = new Map([
  ['cat-1', { id: 'cat-1', name: 'Alimentação' }],
  ['cat-2', { id: 'cat-2', name: 'Salário' }],
]);
const accountsById = new Map([
  ['acc-1', { id: 'acc-1', name: 'Nubank' }],
  ['acc-2', { id: 'acc-2', name: 'Itaú' }],
]);

function tx(overrides = {}) {
  return {
    id: overrides.id ?? 'tx-1',
    description: 'Café da manhã',
    notes: null,
    amount: 10,
    transaction_date: '2026-07-01',
    transaction_type: 'expense',
    account_id: 'acc-1',
    category_id: 'cat-1',
    payment_method: 'Pix',
    is_recurring: false,
    installment_number: null,
    installment_total: null,
    metadata: null,
    ...overrides,
  };
}

test('normalizeSearchText remove acentos e caixa', () => {
  assert.equal(normalizeSearchText('Café AÇÃO'), 'cafe acao');
  assert.equal(normalizeSearchText(null), '');
  assert.equal(normalizeSearchText(undefined), '');
  assert.equal(normalizeSearchText('  Pão  '), 'pao');
});

test('matchesSearchQuery casa por descrição ignorando acento/caixa', () => {
  const t = tx({ description: 'Pão de queijo' });
  assert.equal(matchesSearchQuery(t, 'PAO'), true);
  assert.equal(matchesSearchQuery(t, 'queijo'), true);
  assert.equal(matchesSearchQuery(t, 'pizza'), false);
});

test('matchesSearchQuery casa por notes, categoria e conta via maps', () => {
  const t = tx({ description: 'x', notes: 'Reembolso da viagem' });
  assert.equal(matchesSearchQuery(t, 'reembolso'), true);
  assert.equal(matchesSearchQuery(t, 'alimentacao', { categoriesById }), true);
  assert.equal(matchesSearchQuery(t, 'nubank', { accountsById }), true);
});

test('matchesSearchQuery com query vazia sempre casa', () => {
  assert.equal(matchesSearchQuery(tx(), ''), true);
  assert.equal(matchesSearchQuery(tx(), '   '), true);
});

test('isInstallmentTransaction via installment_total ou metadata.installment_group_id', () => {
  assert.equal(isInstallmentTransaction(tx({ installment_total: 3 })), true);
  assert.equal(isInstallmentTransaction(tx({ installment_total: 1 })), false);
  assert.equal(isInstallmentTransaction(tx({ installment_total: null, metadata: { installment_group_id: 'g1' } })), true);
  assert.equal(isInstallmentTransaction(tx()), false);
  assert.equal(isInstallmentTransaction(null), false);
});

test('isRecurringTransaction exige is_recurring === true', () => {
  assert.equal(isRecurringTransaction(tx({ is_recurring: true })), true);
  assert.equal(isRecurringTransaction(tx({ is_recurring: false })), false);
  assert.equal(isRecurringTransaction(tx({ is_recurring: 'true' })), false);
});

test('derivePaymentMethodOptions deduplica, ordena e ignora vazios', () => {
  const options = derivePaymentMethodOptions([
    tx({ payment_method: 'Pix' }),
    tx({ payment_method: 'Cartão' }),
    tx({ payment_method: 'Pix' }),
    tx({ payment_method: '  ' }),
    tx({ payment_method: null }),
    tx({ payment_method: 'Boleto' }),
  ]);
  assert.deepEqual(options, ['Boleto', 'Cartão', 'Pix']);
});

test('sortTransactions recent/oldest por transaction_date', () => {
  const list = [tx({ id: 'a', transaction_date: '2026-07-01' }), tx({ id: 'b', transaction_date: '2026-07-10' })];
  assert.deepEqual(sortTransactions(list, 'recent').map((t) => t.id), ['b', 'a']);
  assert.deepEqual(sortTransactions(list, 'oldest').map((t) => t.id), ['a', 'b']);
});

test('sortTransactions highest/lowest por amount', () => {
  const list = [tx({ id: 'a', amount: 50 }), tx({ id: 'b', amount: 200 })];
  assert.deepEqual(sortTransactions(list, 'highest').map((t) => t.id), ['b', 'a']);
  assert.deepEqual(sortTransactions(list, 'lowest').map((t) => t.id), ['a', 'b']);
});

test('hasActiveTransactionFilters detecta qualquer filtro não-default', () => {
  assert.equal(hasActiveTransactionFilters(DEFAULT_TRANSACTION_FILTERS), false);
  assert.equal(hasActiveTransactionFilters({ search: 'x' }), true);
  assert.equal(hasActiveTransactionFilters({ type: 'income' }), true);
  assert.equal(hasActiveTransactionFilters({ accountId: 'acc-1' }), true);
  assert.equal(hasActiveTransactionFilters({ categoryId: 'cat-1' }), true);
  assert.equal(hasActiveTransactionFilters({ paymentMethod: 'Pix' }), true);
  assert.equal(hasActiveTransactionFilters({ installment: 'installment' }), true);
  assert.equal(hasActiveTransactionFilters({ recurring: 'recurring' }), true);
});

test('applyTransactionFilters filtra por tipo', () => {
  const list = [tx({ id: 'a', transaction_type: 'income' }), tx({ id: 'b', transaction_type: 'expense' })];
  const result = applyTransactionFilters(list, { type: 'income' });
  assert.deepEqual(result.map((t) => t.id), ['a']);
});

test('applyTransactionFilters trata adjustment como tipo próprio, não incluso em income/expense/transfer', () => {
  const list = [
    tx({ id: 'a', transaction_type: 'adjustment' }),
    tx({ id: 'b', transaction_type: 'income' }),
  ];
  assert.deepEqual(applyTransactionFilters(list, { type: 'income' }).map((t) => t.id), ['b']);
  assert.deepEqual(applyTransactionFilters(list, { type: 'adjustment' }).map((t) => t.id), ['a']);
  // "all" inclui adjustment também (nenhuma transação real é descartada silenciosamente)
  assert.deepEqual(applyTransactionFilters(list, { type: 'all' }).map((t) => t.id).sort(), ['a', 'b']);
});

test('applyTransactionFilters filtra por conta e categoria', () => {
  const list = [tx({ id: 'a', account_id: 'acc-1', category_id: 'cat-1' }), tx({ id: 'b', account_id: 'acc-2', category_id: 'cat-2' })];
  assert.deepEqual(applyTransactionFilters(list, { accountId: 'acc-1' }).map((t) => t.id), ['a']);
  assert.deepEqual(applyTransactionFilters(list, { categoryId: 'cat-2' }).map((t) => t.id), ['b']);
});

test('applyTransactionFilters filtra por forma de pagamento exata', () => {
  const list = [tx({ id: 'a', payment_method: 'Pix' }), tx({ id: 'b', payment_method: 'Boleto' })];
  assert.deepEqual(applyTransactionFilters(list, { paymentMethod: 'Pix' }).map((t) => t.id), ['a']);
});

test('applyTransactionFilters filtra parcelados/não-parcelados', () => {
  const list = [
    tx({ id: 'a', installment_total: 3 }),
    tx({ id: 'b', installment_total: null, metadata: { installment_group_id: 'g1' } }),
    tx({ id: 'c' }),
  ];
  assert.deepEqual(applyTransactionFilters(list, { installment: 'installment' }).map((t) => t.id).sort(), ['a', 'b']);
  assert.deepEqual(applyTransactionFilters(list, { installment: 'single' }).map((t) => t.id), ['c']);
});

test('applyTransactionFilters filtra recorrentes/não-recorrentes', () => {
  const list = [tx({ id: 'a', is_recurring: true }), tx({ id: 'b', is_recurring: false })];
  assert.deepEqual(applyTransactionFilters(list, { recurring: 'recurring' }).map((t) => t.id), ['a']);
  assert.deepEqual(applyTransactionFilters(list, { recurring: 'single' }).map((t) => t.id), ['b']);
});

test('applyTransactionFilters combina busca + filtros + ordenação', () => {
  const list = [
    tx({ id: 'a', description: 'Padaria', amount: 20, transaction_date: '2026-07-01', transaction_type: 'expense' }),
    tx({ id: 'b', description: 'Padaria da esquina', amount: 80, transaction_date: '2026-07-05', transaction_type: 'expense' }),
    tx({ id: 'c', description: 'Salário', amount: 5000, transaction_date: '2026-07-03', transaction_type: 'income' }),
  ];
  const result = applyTransactionFilters(list, { search: 'padaria', type: 'expense', sortOrder: 'highest' });
  assert.deepEqual(result.map((t) => t.id), ['b', 'a']);
});

test('applyTransactionFilters sem filtros retorna tudo ordenado por padrão (recent)', () => {
  const list = [tx({ id: 'a', transaction_date: '2026-07-01' }), tx({ id: 'b', transaction_date: '2026-07-10' })];
  assert.deepEqual(applyTransactionFilters(list).map((t) => t.id), ['b', 'a']);
});

test('filterTransactionsByDateRange restringe por transaction_date (inclusive)', () => {
  const list = [
    tx({ id: 'before', transaction_date: '2026-06-30' }),
    tx({ id: 'start', transaction_date: '2026-07-01' }),
    tx({ id: 'inside', transaction_date: '2026-07-15' }),
    tx({ id: 'end', transaction_date: '2026-07-31' }),
    tx({ id: 'after', transaction_date: '2026-08-01' }),
  ];
  const result = filterTransactionsByDateRange(list, { startKey: '2026-07-01', endKey: '2026-07-31' });
  assert.deepEqual(result.map((t) => t.id), ['start', 'inside', 'end']);
});

test('filterTransactionsByDateRange sem startKey/endKey retorna a lista sem alterações', () => {
  const list = [tx({ id: 'a' }), tx({ id: 'b' })];
  assert.deepEqual(filterTransactionsByDateRange(list, {}), list);
  assert.deepEqual(filterTransactionsByDateRange(list), list);
});
