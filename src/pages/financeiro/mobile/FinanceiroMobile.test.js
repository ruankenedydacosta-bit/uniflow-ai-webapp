import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildFinanceiroMobileData,
  getFinancialPeriod,
} from './financeiroMobileData.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const NOW = new Date(2026, 6, 19, 12); // Sunday, July 19 2026
const accounts = [
  {
    id: 'account-origin',
    name: 'Conta principal',
    account_type: 'checking',
    initial_balance: 100,
    current_balance: 999999,
    is_active: true,
  },
  {
    id: 'account-destination',
    name: 'Reserva',
    account_type: 'savings',
    initial_balance: 50,
    is_active: true,
  },
];
const categories = [
  { id: 'category-income', name: 'Salário', category_type: 'income' },
  { id: 'category-expense', name: 'Moradia', category_type: 'expense' },
];
const transactions = [
  { id: 'income', account_id: 'account-origin', category_id: 'category-income', transaction_type: 'income', description: 'Receita', amount: 500, transaction_date: '2026-07-03', status: 'completed' },
  { id: 'expense', account_id: 'account-origin', category_id: 'category-expense', transaction_type: 'expense', description: 'Despesa', amount: 120, transaction_date: '2026-07-05', status: 'completed' },
  { id: 'transfer', account_id: 'account-origin', destination_account_id: 'account-destination', transaction_type: 'transfer', description: 'Transferência', amount: 80, transaction_date: '2026-07-07', status: 'completed' },
  { id: 'pending', account_id: 'account-origin', transaction_type: 'expense', description: 'Pendente', amount: 999, transaction_date: '2026-07-08', status: 'pending' },
  { id: 'previous', account_id: 'account-origin', transaction_type: 'expense', description: 'Mês anterior', amount: 100, transaction_date: '2026-06-08', status: 'completed' },
];

function buildData(overrides = {}) {
  return buildFinanceiroMobileData({
    accounts,
    accountBalances: [
      { account_id: 'account-origin', derived_balance: 400 },
      { account_id: 'account-destination', derived_balance: 130 },
    ],
    categories,
    transactions,
    workspaceBalance: 530,
    now: NOW,
    ...overrides,
  });
}

test('períodos Semana, Mês e Trimestre são calculados deterministicamente', () => {
  assert.equal(getFinancialPeriod({ now: NOW }).label, 'Julho de 2026');
  assert.equal(getFinancialPeriod({ mode: 'Semana', now: NOW }).label, '13/07 a 19/07');
  assert.equal(getFinancialPeriod({ mode: 'Trimestre', now: NOW }).label, '3º trimestre de 2026');
  assert.equal(getFinancialPeriod({ mode: 'Semana', offset: -1, now: NOW }).startKey, '2026-07-06');
  assert.equal(getFinancialPeriod({ mode: 'Trimestre', offset: -1, now: NOW }).startKey, '2026-04-01');
});

test('mobile consolida somente lançamentos concluídos do período', () => {
  const data = buildData();

  assert.equal(data.income, 'R$ 500,00');
  assert.equal(data.expense, 'R$ 120,00');
  assert.equal(data.transactions.length, 3);
  assert.equal(data.categories[0].label, 'Moradia');
  assert.equal(data.comparison, '+20% em despesas vs. período anterior');
  assert.doesNotMatch(JSON.stringify(data), /Pendente|999,00/);
});

test('período Semana filtra transações da semana corrente', () => {
  const dataSemanaAnterior = buildData({ mode: 'Semana', periodOffset: -1 });
  const dataSemanaAtual = buildData({ mode: 'Semana', periodOffset: 0 });

  assert.equal(dataSemanaAtual.transactions.length, 0);
  assert.equal(dataSemanaAnterior.transactions.length, 1);
  assert.equal(dataSemanaAnterior.transactions[0].id, 'transfer');
});

test('período Trimestre filtra transações do trimestre', () => {
  const data = buildData({ mode: 'Trimestre' });

  assert.equal(data.income, 'R$ 500,00');
  assert.equal(data.expense, 'R$ 120,00');
  assert.equal(data.transactions.length, 3);
});

test('saldo exibido usa RPC derivada e nunca current_balance', () => {
  const data = buildData();

  assert.equal(data.balance, 'R$ 530,00');
  assert.equal(data.accounts[0].derived_balance, 400);
  assert.equal(data.accounts[0].balance, 'R$ 400,00');
  assert.notEqual(data.accounts[0].derived_balance, accounts[0].current_balance);
});

test('transferência é exibida sem contaminar totais de entrada e saída', () => {
  const data = buildData();
  const transfer = data.transactions.find((transaction) => transaction.id === 'transfer');

  assert.equal(transfer.tone, 'neutral');
  assert.match(transfer.amountLabel, /^↔/);
  assert.equal(data.income, 'R$ 500,00');
  assert.equal(data.expense, 'R$ 120,00');
});

test('objetos vazios produzem uma visualização segura', () => {
  const data = buildFinanceiroMobileData({ now: NOW });

  assert.deepEqual(data.accounts, []);
  assert.deepEqual(data.transactions, []);
  assert.deepEqual(data.categories, []);
  assert.equal(data.chart.data.length, 2);
  assert.equal(data.comparison, 'Sem base anterior para comparação');
});

test('período sem dados mantém o gráfico montado e delega o estado vazio ao CognitiveLiveChart', async () => {
  const contents = await source('components/IncomeExpenseChart.jsx');
  assert.match(contents, /emptyState=\{\{/);
  assert.match(contents, /Ainda não há movimentações neste período\./);
  assert.match(contents, /Registrar movimentação/);
  assert.doesNotMatch(contents, /financeMobileEmptyMessage/);
});

test('IncomeExpenseChart adapta linguagem por workspace (PF/PJ) sem duplicar o gráfico', async () => {
  const contents = await source('components/IncomeExpenseChart.jsx');
  assert.equal((contents.match(/<CognitiveLiveChart/g) ?? []).length, 1);
  assert.match(contents, /Entradas e saídas/);
  assert.match(contents, /Entradas e gastos/);
  assert.match(contents, /Saídas/);
  assert.match(contents, /Gastos/);
});

test('CTA do estado vazio reaproveita o fluxo existente de nova transação', async () => {
  const [chart, view] = await Promise.all([
    source('components/IncomeExpenseChart.jsx'),
    source('MobileFinanceiroView.jsx'),
  ]);
  assert.match(chart, /onCtaAction: onRegisterMovement/);
  assert.match(view, /onRegisterMovement=\{\(\) => onNewTransaction\(\)\}/);
  assert.doesNotMatch(chart, /FinanceTransactionModal/);
});

test('MobileFinanceiroView recebe o workspace ativo e repassa ao gráfico', async () => {
  const view = await source('MobileFinanceiroView.jsx');
  assert.match(view, /currentWorkspace = 'personal'/);
  assert.match(view, /workspace=\{currentWorkspace\}/);
});

test('fluxo mobile não importa nem exporta mock financeiro', async () => {
  const contents = await Promise.all([
    source('MobileFinanceiroView.jsx'),
    source('index.js'),
    source('financeiroMobileData.js'),
  ]);

  assert.doesNotMatch(contents.join('\n'), /financeiroMobileMock|financeiroMobile\.mock/);
});

test('gráfico detailed recebe séries reais sem SVG duplicado', async () => {
  const contents = await source('components/IncomeExpenseChart.jsx');
  assert.match(contents, /CognitiveLiveChart/);
  assert.match(contents, /variant="detailed"/);
  assert.match(contents, /data=\{chart\.data\}/);
  assert.match(contents, /comparisonData=\{chart\.comparisonData\}/);
  assert.doesNotMatch(contents, /<svg|<polyline|fetch\(/i);
});

test('ações rápidas preservam entrada, saída e transferência', async () => {
  const [sheet, view] = await Promise.all([
    source('components/QuickActionSheet.jsx'),
    source('MobileFinanceiroView.jsx'),
  ]);
  assert.match(sheet, /Registrar receita/);
  assert.match(sheet, /Registrar despesa/);
  assert.match(sheet, /Fazer transferência/);
  assert.match(view, /onNewTransaction\(transactionType\)/);
});

test('sheet de ações fica acima da navegação mobile', async () => {
  const css = await source('FinanceiroMobile.module.css');
  assert.match(
    css,
    /financeMobileSheetBackdrop\)[^{]*\{[^}]*z-index: var\(--uf-z-modal\)/,
  );
});

test('loading, vazio, erro e sucesso possuem caminhos explícitos', async () => {
  const contents = await source('MobileFinanceiroView.jsx');
  assert.match(contents, /if \(isLoading\)/);
  assert.match(contents, /FinanceiroSectionSkeleton/);
  assert.match(contents, /if \(error\)/);
  assert.match(contents, /FinanceiroErrorState/);
  assert.match(contents, /if \(!accounts\.length\)/);
  assert.match(contents, /FinanceiroEmptyState/);
  assert.match(contents, /AvailableBalanceCard/);
});

test('primeiro uso orienta a criação da conta sem CTA genérico', async () => {
  const emptyState = await source('components/FinanceiroEmptyState.jsx');
  const accountModal = await readFile(
    new URL('../FinanceAccountModal.jsx', import.meta.url),
    'utf8',
  );

  assert.match(emptyState, /Criar primeira conta/);
  assert.match(emptyState, /primeiro passo/);
  assert.match(accountModal, /Informe quanto havia na conta/);
  assert.match(accountModal, /melhor representa esta conta/);
  assert.match(accountModal, /Cadastre uma conta para começar/);
  assert.doesNotMatch(accountModal, /footer=|Nenhuma conta cadastrada neste espaço/);
});

test('CSS mantém responsividade, safe area e movimento reduzido', async () => {
  const contents = await source('FinanceiroMobile.module.css');
  assert.match(contents, /max-width: 767px/);
  assert.match(contents, /max-width: 359px/);
  assert.match(contents, /min-width: 390px/);
  assert.match(contents, /min-width: 430px/);
  assert.match(contents, /safe-area-inset-bottom/);
  assert.match(contents, /prefers-reduced-motion: reduce/);
});

test('mobile não acessa Supabase diretamente', async () => {
  const contents = await Promise.all([
    source('MobileFinanceiroView.jsx'),
    source('financeiroMobileData.js'),
    source('components/RecentTransactionsList.jsx'),
  ]);
  assert.doesNotMatch(contents.join('\n'), /supabase|axios|openai|elevenlabs/i);
});
