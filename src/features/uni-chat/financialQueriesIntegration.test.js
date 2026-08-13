// Testes de integração das Consultas Financeiras Inteligentes.
//
// Verifica que o FinancialSnapshot é produzido pelo buildFinancialContext
// (mesmo caminho que o UniChatPage usa), que o motor resolve consultas sobre
// esse snapshot, e que o interpretador legado continua funcionando com o
// contexto enriquecido (accountsById) sem quebrar respostas existentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialContext } from './useUniChatFinancialData.js';
import { buildQueryResponse } from './financialQueryInterpreter.js';
import { resolveFinancialQuery } from './financialQueryEngine.js';
import { classifyIntent } from '../uni-intents/index.js';
import { parseFinancialText } from '../uni-intents/financialParser.js';

const ACCOUNTS = [
  { id: 'acc-nubank', name: 'Nubank', current_balance: 500 },
  { id: 'acc-itau', name: 'Itaú', current_balance: 200 },
];

const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação' },
  { id: 'cat-transport', name: 'Transporte' },
];

const TRANSACTIONS = [
  { id: 't1', account_id: 'acc-nubank', category_id: 'cat-food', transaction_type: 'expense', amount: 120.5, description: 'Mercado', transaction_date: '2026-07-14', status: 'confirmed' },
  { id: 't2', account_id: 'acc-itau', category_id: 'cat-transport', transaction_type: 'expense', amount: 45, description: 'Uber', transaction_date: '2026-07-10', status: 'confirmed' },
  { id: 't3', account_id: 'acc-nubank', category_id: null, transaction_type: 'income', amount: 3000, description: 'Salário', transaction_date: '2026-07-05', status: 'confirmed' },
];

const ACCOUNT_BALANCES = [
  { account_id: 'acc-nubank', derived_balance: 480.5 },
  { account_id: 'acc-itau', derived_balance: 260 },
];

const REFERENCE_DATE = '2026-07-15';

function buildCtx() {
  return buildFinancialContext({
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    transactions: TRANSACTIONS,
    workspaceBalance: 740.5,
    accountBalances: ACCOUNT_BALANCES,
    referenceDate: REFERENCE_DATE,
  });
}

test('buildFinancialContext passa a produzir o snapshot financeiro completo', () => {
  const ctx = buildCtx();
  assert.ok(ctx.snapshot, 'snapshot deve existir no contexto financeiro');
  assert.equal(ctx.snapshot.accountsById.get('acc-nubank').name, 'Nubank');
  assert.equal(ctx.snapshot.accountBalancesById.get('acc-nubank'), 480.5);
  assert.equal(ctx.snapshot.lastExpense.description, 'Mercado');
  assert.equal(ctx.snapshot.hasData, true);
});

test('campos legados do contexto continuam disponíveis e corretos', () => {
  const ctx = buildCtx();
  assert.equal(ctx.balance, 740.5);
  assert.equal(ctx.monthlyIncome, 3000);
  assert.equal(ctx.monthlyExpense, 165.5);
  assert.equal(ctx.topCategory.name, 'Alimentação');
  assert.equal(ctx.hasData, true);
});

test('o motor resolve consultas sobre o snapshot do próprio contexto (fluxo real)', () => {
  const ctx = buildCtx();
  const balance = resolveFinancialQuery({
    text: 'quanto tenho na conta Nubank?',
    snapshot: ctx.snapshot,
  });
  assert.equal(balance.handled, true);
  assert.match(balance.response.text, /R\$\s*480,50/);

  const last = resolveFinancialQuery({
    text: 'qual foi minha última despesa?',
    snapshot: ctx.snapshot,
  });
  assert.equal(last.handled, true);
  assert.match(last.response.text, /Mercado/);
  assert.match(last.response.text, /na conta Nubank/);
});

test('interpretador legado continua funcionando com o contexto enriquecido', () => {
  const ctx = buildCtx();
  const response = buildQueryResponse('recent_transactions', ctx, 'pessoal');
  assert.ok(response.text.includes('Mercado'));
  assert.ok(response.text.includes('Nubank'), 'lista legada deve mostrar a conta');
});

test('consulta legada de saldo orienta Entradas e Saídas sem expor o valor do workspace', () => {
  const ctx = buildCtx();
  const response = buildQueryResponse('balance', ctx, 'pessoal');
  assert.match(response.text, /Entradas e Saídas/);
  assert.doesNotMatch(response.text, /R\$\s*740,50/);
});

test('snapshot isola os dados por workspace: outro conjunto não vaza no contexto', () => {
  const otherCtx = buildFinancialContext({
    accounts: [],
    categories: [],
    transactions: [],
    workspaceBalance: 0,
    accountBalances: [],
  });
  assert.equal(otherCtx.snapshot.hasData, false);
  assert.equal(otherCtx.snapshot.accountsById.size, 0);
  assert.equal(otherCtx.hasData, false);
});

// ============================================================================
// CORREÇÃO URGENTE (prioridade declaração > consulta):
// no fluxo real, frases declarativas são classificadas como AÇÃO antes de
// qualquer motor de consulta rodar -- e os motores devolvem handled:false
// para elas, garantindo que o fluxo de registro (com confirmação) acontece.
// ============================================================================

test('CORREÇÃO URGENTE: fluxo real -- "Recebi mil reais" é ação de registro, os motores de consulta ficam de fora', () => {
  const ctx = buildCtx();
  // Passo 1 (gate do UniChatPage): classifyIntent enxerga ação declarada.
  assert.equal(classifyIntent('Recebi mil reais').intent, 'register_income');
  assert.equal(classifyIntent('Meu saldo no Nubank é mil reais').intent, 'set_balance');
  // Passo 2: o motor de consulta NÃO responde a declarações (handled:false),
  // então o fluxo não pode desviar para resposta de consulta.
  assert.equal(resolveFinancialQuery({ text: 'Recebi mil reais', snapshot: ctx.snapshot }).handled, false);
  assert.equal(resolveFinancialQuery({ text: 'Meu saldo no Nubank é mil reais', snapshot: ctx.snapshot }).handled, false);
  // Passo 3: o parser de registro interpreta e fica pronto para confirmação.
  const parsed = parseFinancialText('Recebi mil reais');
  assert.equal(parsed.intent, 'register_income');
  assert.equal(parsed.entities.amount, 1000);
  assert.equal(parsed.ready, true);
});

test('CORREÇÃO URGENTE: fluxo real -- "Tenho mil reais" pede decisão (ambiguidade), nunca responde saldo', () => {
  const ctx = buildCtx();
  assert.equal(classifyIntent('Tenho mil reais').intent, 'ambiguous_balance_or_income');
  assert.equal(resolveFinancialQuery({ text: 'Tenho mil reais', snapshot: ctx.snapshot }).handled, false);
  const parsed = parseFinancialText('Tenho mil reais');
  assert.equal(parsed.intent, 'ambiguous_balance_or_income');
  assert.equal(parsed.entities.amount, 1000);
});

test('CORREÇÃO URGENTE: fluxo real -- consultas genuínas continuam respondendo pelo motor/interpretador', () => {
  const ctx = buildCtx();
  assert.equal(classifyIntent('Quanto tenho no Nubank?').intent, 'check_balance');
  assert.equal(resolveFinancialQuery({ text: 'Quanto tenho no Nubank?', snapshot: ctx.snapshot }).handled, true);
  assert.equal(classifyIntent('Quanto recebi este mês?').intent, 'question');
  assert.equal(resolveFinancialQuery({ text: 'Quanto recebi este mês?', snapshot: ctx.snapshot }).handled, false);
  const income = buildQueryResponse({ type: 'monthly_income' }, ctx, 'pessoal');
  assert.ok(income.text.includes('3.000') || income.text.includes('3000'), 'receita do mês deve ser respondida com o valor real');
});
