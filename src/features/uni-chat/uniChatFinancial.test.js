import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialContext } from './useUniChatFinancialData.js';
import { classifyFinancialQuery, buildQueryResponse } from './financialQueryInterpreter.js';
import { buildConfirmationFromAction } from './uniChatAdapter.js';

test('buildFinancialContext retorna estrutura esperada', () => {
  const ctx = buildFinancialContext({
    accounts: [{ id: 'a1', name: 'Conta', current_balance: 5000 }],
    transactions: [],
    categories: [],
    workspaceBalance: 5000,
  });

  assert.equal(ctx.balance, 5000);
  assert.equal(ctx.monthlyIncome, 0);
  assert.equal(ctx.monthlyExpense, 0);
  assert.equal(ctx.result, 0);
  assert.deepEqual(ctx.recentTransactions, []);
  assert.equal(ctx.topCategory, null);
  assert.equal(ctx.hasData, true);
  assert.ok(ctx.categoriesById instanceof Map);
});

test('buildFinancialContext calcula income e expense mensais', () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const txDate = `${year}-${month}-15`;

  const ctx = buildFinancialContext({
    accounts: [],
    transactions: [
      { id: 't1', transaction_type: 'income', amount: 5000, transaction_date: txDate },
      { id: 't2', transaction_type: 'expense', amount: 1200, transaction_date: txDate },
      { id: 't3', transaction_type: 'expense', amount: 300, transaction_date: txDate },
    ],
    categories: [{ id: 'c1', name: 'Alimentação' }, { id: 'c2', name: 'Transporte' }],
    workspaceBalance: null,
  });

  assert.equal(ctx.monthlyIncome, 5000);
  assert.equal(ctx.monthlyExpense, 1500);
  assert.equal(ctx.result, 3500);
  assert.equal(ctx.recentTransactions.length, 3);
  assert.ok(ctx.hasData);
});

test('buildFinancialContext calcula topCategory', () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const d = `${year}-${month}-10`;

  const ctx = buildFinancialContext({
    transactions: [
      { id: 't1', transaction_type: 'expense', amount: 800, category_id: 'c1', transaction_date: d },
      { id: 't2', transaction_type: 'expense', amount: 200, category_id: 'c2', transaction_date: d },
      { id: 't3', transaction_type: 'expense', amount: 1500, category_id: 'c1', transaction_date: d },
    ],
    categories: [{ id: 'c1', name: 'Alimentação' }, { id: 'c2', name: 'Transporte' }],
    accounts: [],
    workspaceBalance: null,
  });

  assert.equal(ctx.topCategory.name, 'Alimentação');
  assert.equal(ctx.topCategory.amount, 2300);
});

test('buildFinancialContext retorna hasData false sem transacoes e sem saldo', () => {
  const ctx = buildFinancialContext({
    accounts: [],
    transactions: [],
    categories: [],
    workspaceBalance: null,
  });

  assert.equal(ctx.hasData, false);
  assert.equal(ctx.balance, 0);
  assert.equal(ctx.recentTransactions.length, 0);
});

test('classifyFinancialQuery reconhece "Qual é meu saldo?"', () => {
  assert.deepEqual(classifyFinancialQuery('Qual é meu saldo?'), { type: 'balance' });
});

test('classifyFinancialQuery reconhece "Quanto eu gastei este mês?"', () => {
  assert.deepEqual(classifyFinancialQuery('Quanto eu gastei este mês?'), { type: 'monthly_expenses' });
});

test('classifyFinancialQuery reconhece "Quanto entrou este mês?"', () => {
  assert.deepEqual(classifyFinancialQuery('Quanto entrou este mês?'), { type: 'monthly_income' });
});

test('classifyFinancialQuery reconhece "Como está meu mês?"', () => {
  assert.deepEqual(classifyFinancialQuery('Como está meu mês?'), { type: 'monthly_summary' });
});

test('classifyFinancialQuery reconhece "Quais foram minhas últimas transações?"', () => {
  assert.deepEqual(classifyFinancialQuery('Quais foram minhas últimas transações?'), { type: 'recent_transactions' });
});

test('classifyFinancialQuery reconhece "Em que categoria eu mais gastei?"', () => {
  assert.deepEqual(classifyFinancialQuery('Em que categoria eu mais gastei?'), { type: 'top_category' });
});

test('classifyFinancialQuery reconhece sugestão "Ver meu saldo"', () => {
  assert.deepEqual(classifyFinancialQuery('Ver meu saldo'), { type: 'balance' });
});

test('classifyFinancialQuery reconhece sugestão "Quanto gastei este mês?"', () => {
  assert.deepEqual(classifyFinancialQuery('Quanto gastei este mês?'), { type: 'monthly_expenses' });
});

test('classifyFinancialQuery retorna null para texto nao reconhecido', () => {
  assert.equal(classifyFinancialQuery('Registrar uma despesa de 50 reais'), null);
  assert.equal(classifyFinancialQuery('Planejar uma meta'), null);
  assert.equal(classifyFinancialQuery('Oi, tudo bem?'), null);
});

test('buildQueryResponse monta texto de saldo', () => {
  const ctx = buildFinancialContext({
    accounts: [],
    transactions: [],
    categories: [],
    workspaceBalance: 3240,
  });

  const response = buildQueryResponse('balance', ctx, 'pessoal');
  assert.ok(response.text.includes('R$'));
  assert.ok(response.text.includes('3.240'));
  assert.ok(response.highlight.includes('3.240'));
});

test('buildQueryResponse monta texto de despesas do mes', () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const d = `${year}-${month}-05`;

  const ctx = buildFinancialContext({
    accounts: [],
    transactions: [
      { id: 't1', transaction_type: 'expense', amount: 1180, transaction_date: d },
    ],
    categories: [],
    workspaceBalance: null,
  });

  const response = buildQueryResponse('monthly_expenses', ctx, 'pessoal');
  assert.ok(response.text.includes('1.180'));
  assert.ok(response.highlight.includes('1.180'));
});

test('buildQueryResponse monta texto de ultimas transacoes', () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();

  const ctx = buildFinancialContext({
    accounts: [],
    transactions: [
      {
        id: 't1', transaction_type: 'expense', amount: 50,
        description: 'Almoço', category_id: 'c1',
        transaction_date: `${year}-${month}-10`,
      },
    ],
    categories: [{ id: 'c1', name: 'Alimentação' }],
    workspaceBalance: null,
  });

  const response = buildQueryResponse('recent_transactions', ctx, 'pessoal');
  assert.ok(response.text.includes('Almoço'));
});

test('buildQueryResponse adapta texto para modo empresa', () => {
  const ctx = buildFinancialContext({
    accounts: [],
    transactions: [],
    categories: [],
    workspaceBalance: 18430,
  });

  const response = buildQueryResponse('balance', ctx, 'empresa');
  assert.ok(response.text.includes('da sua empresa'));
  assert.ok(response.text.includes('18.430'));
});

test('buildQueryResponse retorna fallback para workspace sem dados', () => {
  const ctx = buildFinancialContext({
    accounts: [],
    transactions: [],
    categories: [],
    workspaceBalance: null,
  });

  const response = buildQueryResponse('recent_transactions', ctx, 'pessoal');
  assert.ok(response.text.includes('não tem transações registradas'));
});

// ============================================================================
// BUG REAL (BUG 5): chaves React duplicadas no card de confirmação. O card
// usava key={label}; transferência montava DUAS linhas "Conta" (origem e
// destino com o mesmo rótulo) -- chave duplicada no React. Agora cada linha
// tem key semântica estável e o destino é rotulado "Conta de destino".
// ============================================================================

test('BUG REAL (BUG 5): card de transferência tem keys únicas e rótulos distintos (origem/destino)', () => {
  const card = buildConfirmationFromAction({
    typeLabel: 'Transferência',
    transactionType: 'transfer',
    account: { name: 'Nubank' },
    destinationAccount: { name: 'Inter' },
    amount: 100,
    date: '2026-07-11',
    category: null,
    description: 'Transferência para Inter',
  });

  assert.ok(card, 'card montado');
  const keys = card.rows.map((row) => row.key);
  assert.equal(new Set(keys).size, keys.length, 'todas as keys são únicas');
  const contaRows = card.rows.filter((row) => row.label === 'Conta');
  assert.equal(contaRows.length, 0, 'nenhuma linha sem discriminar origem/destino');
  assert.equal(card.rows.find((row) => row.key === 'account').label, 'Conta de origem');
  assert.equal(card.rows.find((row) => row.key === 'account').value, 'Nubank');
  assert.equal(card.rows.find((row) => row.key === 'destination-account').label, 'Conta de destino');
  assert.equal(card.rows.find((row) => row.key === 'destination-account').value, 'Inter');
  assert.equal(card.rows.find((row) => row.key === 'amount').label, 'Valor');
});

test('BUG REAL (BUG 5): card de despesa mantém uma única linha "Conta" com key estável', () => {
  const card = buildConfirmationFromAction({
    typeLabel: 'Despesa',
    transactionType: 'expense',
    account: { name: 'Nubank' },
    category: { name: 'Alimentação' },
    description: 'Mercado',
    amount: 85,
    date: '2026-07-11',
  });

  const keys = card.rows.map((row) => row.key);
  assert.equal(new Set(keys).size, keys.length);
  const contaRows = card.rows.filter((row) => row.label === 'Conta');
  assert.equal(contaRows.length, 1);
  assert.equal(contaRows[0].key, 'account');
  assert.equal(card.rows.find((row) => row.key === 'category').label, 'Categoria');
});

// ============================================================================
// FASE ESTADOS DE PROCESSAMENTO: buildConfirmationFromAction expõe
// actionKind (campo aditivo) -- alimenta useUniProcessingMessage('executing',
// { actionKind }) para um rótulo honesto durante a execução real.
// ============================================================================

test('actionKind é "adjustment" para ajuste de saldo, mesmo que transactionType também seja "adjustment"', () => {
  const card = buildConfirmationFromAction({
    typeLabel: 'Ajuste',
    transactionType: 'adjustment',
    balanceTarget: 1200,
    balanceDelta: 200,
    currentBalance: 1000,
    account: { name: 'Nubank' },
  });
  assert.equal(card.actionKind, 'adjustment');
});

test('actionKind reflete transactionType real para despesa/entrada/transferência', () => {
  const expense = buildConfirmationFromAction({
    typeLabel: 'Despesa', transactionType: 'expense', account: { name: 'Nubank' }, amount: 10, date: '2026-07-11',
  });
  const income = buildConfirmationFromAction({
    typeLabel: 'Entrada', transactionType: 'income', account: { name: 'Nubank' }, amount: 10, date: '2026-07-11',
  });
  const transfer = buildConfirmationFromAction({
    typeLabel: 'Transferência',
    transactionType: 'transfer',
    account: { name: 'Nubank' },
    destinationAccount: { name: 'Inter' },
    amount: 10,
    date: '2026-07-11',
  });
  assert.equal(expense.actionKind, 'expense');
  assert.equal(income.actionKind, 'income');
  assert.equal(transfer.actionKind, 'transfer');
});

test('actionKind é null quando a ação não informa transactionType', () => {
  const card = buildConfirmationFromAction({ typeLabel: 'Movimentação', account: { name: 'Nubank' } });
  assert.equal(card.actionKind, null);
});

// ============================================================================
// A pedido do usuário: o card de confirmação de lançamento não mostra mais
// qual espaço (Pessoal/Empresa) recebe o lançamento -- campo redundante com
// o resto da UI. buildConfirmationFromAction() não recebe mais workspaceType.
// ============================================================================

test('card de despesa nunca tem a linha Espaço/workspace', () => {
  const card = buildConfirmationFromAction({
    typeLabel: 'Despesa',
    transactionType: 'expense',
    category: { name: 'Alimentação' },
    description: 'Mercado',
    amount: 200,
    date: '2026-08-12',
  });
  assert.equal(card.rows.some((row) => row.key === 'workspace' || row.label === 'Espaço'), false);
});

test('card de receita nunca tem a linha Espaço/workspace', () => {
  const card = buildConfirmationFromAction({
    typeLabel: 'Receita',
    transactionType: 'income',
    category: { name: 'Salário' },
    description: 'Cliente',
    amount: 2000,
    date: '2026-08-12',
  });
  assert.equal(card.rows.some((row) => row.key === 'workspace' || row.label === 'Espaço'), false);
});

test('card de transferência e de ajuste de saldo também nunca têm a linha Espaço/workspace', () => {
  const transfer = buildConfirmationFromAction({
    typeLabel: 'Transferência',
    transactionType: 'transfer',
    account: { name: 'Nubank' },
    destinationAccount: { name: 'Inter' },
    amount: 100,
    date: '2026-08-12',
  });
  const adjustment = buildConfirmationFromAction({
    typeLabel: 'Ajuste',
    transactionType: 'adjustment',
    balanceTarget: 1200,
    balanceDelta: 200,
    currentBalance: 1000,
    account: { name: 'Nubank' },
  });
  assert.equal(transfer.rows.some((row) => row.key === 'workspace'), false);
  assert.equal(adjustment.rows.some((row) => row.key === 'workspace'), false);
});

test('card de despesa/receita segue mostrando exatamente Tipo, Categoria, Descrição, Valor, Data -- nessa ordem, sem Espaço', () => {
  const card = buildConfirmationFromAction({
    typeLabel: 'Despesa',
    transactionType: 'expense',
    category: { name: 'Transporte' },
    description: 'Gasolina',
    amount: 200,
    date: '2026-08-12',
  });
  assert.deepEqual(card.rows.map((row) => row.label), ['Tipo', 'Categoria', 'Descrição', 'Valor', 'Data']);
});
