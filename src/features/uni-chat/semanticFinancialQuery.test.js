// Sprint 3 (Interpretação Semântica): testes da ponte intent estruturado
// -> motor determinístico existente. Cobre validação de entidades,
// confiança/ambiguidade e reuso do resolveFinancialQuery já testado.
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSemanticFinancialIntent } from './semanticFinancialQuery.js';
import { buildFinancialSnapshot } from './financialSnapshot.js';

const REFERENCE_DATE = '2026-07-15';

const ACCOUNTS = [
  { id: 'acc-nubank', name: 'Nubank', current_balance: 500 },
  { id: 'acc-itau', name: 'Itaú', current_balance: 200 },
];
const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação' },
];
const TRANSACTIONS = [
  { id: 't1', account_id: 'acc-nubank', category_id: 'cat-food', transaction_type: 'expense', amount: 120.5, description: 'Mercadinho', transaction_date: '2026-07-14', status: 'confirmed' },
  { id: 't2', account_id: 'acc-itau', category_id: 'cat-food', transaction_type: 'expense', amount: 45, description: 'Padaria', transaction_date: '2026-07-10', status: 'confirmed' },
];

function buildSnapshot() {
  return buildFinancialSnapshot({
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    transactions: TRANSACTIONS,
    workspaceBalance: 700,
    accountBalances: [],
    referenceDate: REFERENCE_DATE,
  });
}

function baseInterpretation(overrides = {}) {
  return {
    status: 'resolved',
    intent: 'total_expenses',
    confidence: 0.9,
    entities: {
      transactionType: null, amount: null, account: null, category: null,
      description: null, period: null, comparisonPeriod: null,
    },
    suggestedTool: null,
    clarificationQuestion: null,
    reasoningTags: [],
    ...overrides,
  };
}

test('total_expenses de alta confiança executa e devolve o total real do período (reaproveita resolveFinancialQuery)', () => {
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({ entities: { ...baseInterpretation().entities, period: 'este mês' } }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /R\$\s*165,50/);
  assert.equal(result.semantic, true);
});

test('account_balance com conta mencionada usa resumo público sem expor nome ou balance', () => {
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({
      intent: 'account_balance',
      entities: { ...baseInterpretation().entities, account: 'Nu' },
    }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Entradas e Saídas/);
  assert.doesNotMatch(result.response.text, /Nubank|\bNu\b|saldo|resultado/i);
});

test('expenses_by_account com conta ambígua pergunta -- nunca escolhe sozinho', () => {
  const snapshot = buildFinancialSnapshot({
    accounts: [
      { id: 'a1', name: 'Nubank Pessoal', current_balance: 100 },
      { id: 'a2', name: 'Nubank Empresa', current_balance: 100 },
    ],
    categories: CATEGORIES,
    transactions: TRANSACTIONS,
    workspaceBalance: 200,
    referenceDate: REFERENCE_DATE,
  });
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({
      intent: 'expenses_by_account',
      entities: { ...baseInterpretation().entities, account: 'Nubank' },
    }),
    snapshot,
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Encontrei 2 contas parecidas/);
});

test('account_balance com conta inexistente também não expõe detalhes de conta', () => {
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({
      intent: 'account_balance',
      entities: { ...baseInterpretation().entities, account: 'Conta Fantasma' },
    }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Entradas e Saídas/);
  assert.doesNotMatch(result.response.text, /Conta Fantasma|Não encontrei a conta|saldo|resultado/i);
});

test('confiança baixa nunca executa -- usa a pergunta de esclarecimento da própria LLM quando existe', () => {
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({ confidence: 0.2, clarificationQuestion: 'Você quer o total deste mês ou de um mês específico?' }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Você quer o total/);
});

test('confiança baixa sem pergunta pronta cai no fallback seguro (handled:false)', () => {
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({ confidence: 0.2, clarificationQuestion: null }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.deepEqual(result, { handled: false });
});

test('status needs_clarification sempre usa a pergunta formulada, nunca executa a consulta', () => {
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({
      status: 'needs_clarification',
      clarificationQuestion: 'Você quer saber o total gasto neste mês ou apenas os gastos da conta Nubank?',
    }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(result.handled, true);
  assert.match(result.response.text, /Nubank/);
});

test('status not_financial / unsupported nunca são tratados aqui -- caem no fallback conversacional normal', () => {
  for (const status of ['not_financial', 'unsupported']) {
    const result = resolveSemanticFinancialIntent({
      interpretation: baseInterpretation({ status, intent: null }),
      snapshot: buildSnapshot(),
      referenceDate: REFERENCE_DATE,
    });
    assert.deepEqual(result, { handled: false });
  }
});

test('intenção de escrita (create_expense) NUNCA é executada aqui -- sempre handled:false', () => {
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({
      intent: 'create_expense',
      entities: { ...baseInterpretation().entities, amount: 50, description: 'mercado' },
    }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.deepEqual(result, { handled: false });
});

test('intenção de leitura sem equivalente no motor determinístico (ex.: financial_summary) cai no fallback seguro', () => {
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({ intent: 'financial_summary' }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.deepEqual(result, { handled: false });
});

test('period_comparison reaproveita a branch de comparação já existente (nenhuma lógica nova)', () => {
  const result = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({
      intent: 'period_comparison',
      entities: { ...baseInterpretation().entities, comparisonPeriod: 'mês passado' },
    }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(result.handled, true);
  assert.equal(result.queryType, 'period_comparison');
});

test('query_refinement com conta reaproveita "só na conta X"', () => {
  const first = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({ entities: { ...baseInterpretation().entities, period: 'este mês' } }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  const refined = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({
      intent: 'query_refinement',
      entities: { ...baseInterpretation().entities, account: 'Nubank' },
    }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
    lastQuery: { queryType: first.queryType, queryParams: first.queryParams },
  });
  assert.equal(refined.handled, true);
  assert.match(refined.response.text, /Nubank/);
});

test('reasoningTags com emotional_concern acolhe antes do dado, sem alterar o número', () => {
  const withoutEmotion = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({ entities: { ...baseInterpretation().entities, period: 'este mês' } }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  const withEmotion = resolveSemanticFinancialIntent({
    interpretation: baseInterpretation({
      entities: { ...baseInterpretation().entities, period: 'este mês' },
      reasoningTags: ['expense_query', 'emotional_concern'],
    }),
    snapshot: buildSnapshot(),
    referenceDate: REFERENCE_DATE,
  });
  assert.match(withEmotion.response.text, /^Entendo a preocupação\./);
  assert.equal(withEmotion.response.text.endsWith(withoutEmotion.response.text), true);
});

test('sem interpretação ou sem snapshot, nunca lança -- handled:false', () => {
  assert.deepEqual(resolveSemanticFinancialIntent({}), { handled: false });
  assert.deepEqual(resolveSemanticFinancialIntent({ interpretation: baseInterpretation() }), { handled: false });
});
