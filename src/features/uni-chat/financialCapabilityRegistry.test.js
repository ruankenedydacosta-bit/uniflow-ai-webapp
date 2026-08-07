// Sprint 4 (Bloco 4.2.3) — testes comportamentais do registro central de
// capacidades financeiras.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialSnapshot } from './financialSnapshot.js';
import {
  FINANCIAL_CAPABILITY_REGISTRY,
  getCapability,
  listAvailableCapabilities,
  executeCapability,
} from './financialCapabilityRegistry.js';

const REFERENCE_DATE = '2026-07-15';

const ACCOUNTS = [
  { id: 'acc-nubank', name: 'Nubank', current_balance: 500 },
  { id: 'acc-itau', name: 'Itaú', current_balance: 200 },
];
const CATEGORIES = [{ id: 'cat-food', name: 'Alimentação' }];
const TRANSACTIONS = [
  { id: 't1', account_id: 'acc-nubank', category_id: 'cat-food', transaction_type: 'expense', amount: 120.5, description: 'Mercado', transaction_date: '2026-07-14', status: 'confirmed' },
  { id: 't2', account_id: 'acc-itau', category_id: null, transaction_type: 'expense', amount: 45, description: 'Uber', transaction_date: '2026-07-10', status: 'confirmed' },
  { id: 't3', account_id: 'acc-nubank', category_id: null, transaction_type: 'income', amount: 3000, description: 'Salário', transaction_date: '2026-07-05', status: 'confirmed' },
  { id: 't4', account_id: 'acc-itau', category_id: null, transaction_type: 'expense', amount: 90, description: 'Aluguel', transaction_date: '2026-06-28', status: 'confirmed' },
];
const ACCOUNT_BALANCES = [
  { account_id: 'acc-nubank', derived_balance: 480.5 },
  { account_id: 'acc-itau', derived_balance: 155 },
];

function buildSnapshot() {
  return buildFinancialSnapshot({
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    transactions: TRANSACTIONS,
    accountBalances: ACCOUNT_BALANCES,
    referenceDate: REFERENCE_DATE,
  });
}

test('registro expõe as 7 capacidades novas conectadas nesta Sprint, todas de leitura', () => {
  const ids = FINANCIAL_CAPABILITY_REGISTRY.map((c) => c.id);
  assert.deepEqual(ids.sort(), [
    'financial_summary', 'income_by_account', 'income_by_category',
    'recent_transactions', 'top_expenses', 'total_balance', 'total_income',
  ]);
  assert.ok(FINANCIAL_CAPABILITY_REGISTRY.every((c) => c.operation === 'read'));
  assert.ok(FINANCIAL_CAPABILITY_REGISTRY.every((c) => c.requiresConfirmation === false));
});

test('listAvailableCapabilities nunca anuncia capacidade inexistente -- só o que está no registro', () => {
  const list = listAvailableCapabilities();
  assert.equal(list.length, FINANCIAL_CAPABILITY_REGISTRY.length);
  assert.ok(list.every((c) => typeof c.description === 'string' && c.description.length > 0));
});

test('executeCapability com id desconhecido devolve null, nunca inventa resultado', () => {
  const snapshot = buildSnapshot();
  assert.equal(executeCapability('capacidade_que_nao_existe', snapshot), null);
});

test('executeCapability com snapshot ausente devolve null, nunca lança', () => {
  assert.equal(executeCapability('total_balance', null), null);
});

test('total_balance retorna o saldo real do snapshot', () => {
  const result = executeCapability('total_balance', buildSnapshot());
  assert.equal(result.ok, true);
  assert.equal(result.data.totalBalance, 635.5);
  assert.match(result.text, /635,5/);
});

test('financial_summary retorna receitas/despesas/resultado reais do mês corrente', () => {
  const result = executeCapability('financial_summary', buildSnapshot());
  assert.equal(result.data.income, 3000);
  assert.equal(result.data.expenses, 165.5);
  assert.equal(result.data.result, 2834.5);
});

// Sprint 4 Ciclo 3 (Bloco 4.5): "mês passado" agora É suportado -- a
// capacidade não fica mais presa ao mês corrente. Junho/2026 no fixture
// tem só a transação t4 (90 de despesa).
test('financial_summary com "mês passado" agora funciona de verdade (Bloco 4.5) -- nunca mais recusa período comum', () => {
  const result = executeCapability('financial_summary', buildSnapshot(), { period: 'mês passado' });
  assert.equal(result.ok, true);
  assert.equal(result.data.income, 0);
  assert.equal(result.data.expenses, 90);
  assert.equal(result.data.result, -90);
  assert.match(result.text, /90,00/);
});

test('financial_summary com período não reconhecido (texto sem sentido temporal) pede esclarecimento honesto, nunca inventa um intervalo', () => {
  const result = executeCapability('financial_summary', buildSnapshot(), { period: 'xablau' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'period_not_recognized');
});

test('top_expenses ordena por valor e respeita limit, capado em 20', () => {
  const result = executeCapability('top_expenses', buildSnapshot(), { limit: 1 });
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].id, 't1');
});

test('top_expenses sem despesas no mês devolve lista vazia, nunca inventa uma despesa', () => {
  const emptySnapshot = buildFinancialSnapshot({ referenceDate: REFERENCE_DATE });
  const result = executeCapability('top_expenses', emptySnapshot);
  assert.deepEqual(result.data.items, []);
  assert.match(result.text, /Não encontrei/);
});

test('recent_transactions não depende de período (usa histórico geral, não só mês atual)', () => {
  const result = executeCapability('recent_transactions', buildSnapshot());
  assert.equal(result.data.items.length, 4);
});

test('income_by_account com conta específica existente retorna o valor real', () => {
  const result = executeCapability('income_by_account', buildSnapshot(), { account: 'Nubank' });
  assert.equal(result.data.income, 3000);
});

test('income_by_account com conta específica sem receita retorna 0, nunca inventa um valor', () => {
  const result = executeCapability('income_by_account', buildSnapshot(), { account: 'Itaú' });
  assert.equal(result.data.income, 0);
  assert.match(result.text, /Não encontrei/);
});

test('income_by_category sem categoria especificada lista todas as categorias reais', () => {
  const result = executeCapability('income_by_category', buildSnapshot());
  assert.deepEqual(result.data.entries, [['Sem categoria', 3000]]);
});

test('getCapability devolve null para id desconhecido', () => {
  assert.equal(getCapability('nao_existe'), null);
  assert.notEqual(getCapability('total_balance'), null);
});

test('snapshot incompleto (sem transactions) nunca lança -- devolve resultado honesto vazio, não um crash', () => {
  const brokenSnapshot = { referenceDate: REFERENCE_DATE, currentMonth: '2026-07' }; // sem transactions/accountsById
  const result = executeCapability('top_expenses', brokenSnapshot);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items, []);
});

// ── Sprint 4 Ciclo 3 (Bloco 4.5): suporte temporal completo ─────────────

test('top_expenses aceita "últimos 90 dias" e traz a despesa real de junho dentro da janela', () => {
  const result = executeCapability('top_expenses', buildSnapshot(), { period: 'últimos 90 dias' });
  assert.equal(result.ok, true);
  assert.ok(result.data.items.length >= 1);
});

test('recent_transactions aceita filtro por período explícito', () => {
  const result = executeCapability('recent_transactions', buildSnapshot(), { period: 'mês passado' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((t) => t.id), ['t4']);
});

test('recent_transactions com período não reconhecido pede esclarecimento honesto', () => {
  const result = executeCapability('recent_transactions', buildSnapshot(), { period: 'blablabla' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'period_not_recognized');
});

test('top_expenses filtra por conta real quando informada', () => {
  const result = executeCapability('top_expenses', buildSnapshot(), { account: 'Itaú' });
  assert.ok(result.data.items.every((tx) => tx.account_id === 'acc-itau'));
});

test('top_expenses com conta que não existe nunca inventa dados -- devolve lista vazia honesta', () => {
  const result = executeCapability('top_expenses', buildSnapshot(), { account: 'Banco Inexistente' });
  assert.deepEqual(result.data.items, []);
});

test('total_income com "este ano" agrega todo o histórico do fixture dentro do ano', () => {
  const result = executeCapability('total_income', buildSnapshot(), { period: 'este ano' });
  assert.equal(result.ok, true);
  assert.equal(result.data.income, 3000);
});

test('income_by_account com período "mês passado" não mistura dados do mês atual', () => {
  const result = executeCapability('income_by_account', buildSnapshot(), { period: 'mês passado' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.entries, []);
});

test('capacidades com periodSupport ANY declaram isso no registro (auditável, nunca escondido)', () => {
  const anyIds = ['financial_summary', 'total_income', 'income_by_account', 'income_by_category', 'top_expenses', 'recent_transactions'];
  for (const id of anyIds) {
    assert.equal(getCapability(id).periodSupport, 'any', `${id} deveria declarar periodSupport ANY`);
  }
  assert.equal(getCapability('total_balance').periodSupport, 'none');
});
