import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildReportsSnapshot,
  calcAttentionSignals,
  calcBalanceEvolutionIndicator,
  calcExpenseVariationIndicator,
  calcGoalsProgressIndicator,
  calcMonthlyAverages,
  calcMonthlySeries,
  calcPercentChange,
} from './reportsCalculations.js';

// --- calcMonthlySeries ---------------------------------------------------

test('calcMonthlySeries retorna array vazio sem transacoes', () => {
  assert.deepEqual(calcMonthlySeries([]), []);
});

test('calcMonthlySeries agrupa por mes e soma receitas/despesas', () => {
  const series = calcMonthlySeries([
    { transaction_type: 'income', amount: 5000, transaction_date: '2026-01-15' },
    { transaction_type: 'expense', amount: 2000, transaction_date: '2026-01-20' },
    { transaction_type: 'income', amount: 5500, transaction_date: '2026-02-15' },
    { transaction_type: 'expense', amount: 2500, transaction_date: '2026-02-20' },
  ]);

  assert.equal(series.length, 2);
  assert.equal(series[0].key, '2026-01');
  assert.equal(series[0].income, 5000);
  assert.equal(series[0].expense, 2000);
  assert.equal(series[0].net, 3000);
  assert.equal(series[1].key, '2026-02');
  assert.equal(series[1].net, 3000);
});

test('calcMonthlySeries ordena cronologicamente ascendente', () => {
  const series = calcMonthlySeries([
    { transaction_type: 'income', amount: 100, transaction_date: '2026-03-01' },
    { transaction_type: 'income', amount: 100, transaction_date: '2026-01-01' },
    { transaction_type: 'income', amount: 100, transaction_date: '2026-02-01' },
  ]);

  assert.deepEqual(series.map((m) => m.key), ['2026-01', '2026-02', '2026-03']);
});

test('calcMonthlySeries nunca preenche meses vazios com zero (so meses com dado real entram)', () => {
  const series = calcMonthlySeries([
    { transaction_type: 'income', amount: 100, transaction_date: '2026-01-01' },
    { transaction_type: 'income', amount: 100, transaction_date: '2026-05-01' },
  ]);

  assert.deepEqual(series.map((m) => m.key), ['2026-01', '2026-05']);
});

test('calcMonthlySeries limita aos ultimos monthsBack meses com dado', () => {
  const transactions = [
    { transaction_type: 'income', amount: 100, transaction_date: '2026-01-01' },
    { transaction_type: 'income', amount: 100, transaction_date: '2026-02-01' },
    { transaction_type: 'income', amount: 100, transaction_date: '2026-03-01' },
  ];
  const series = calcMonthlySeries(transactions, 2);
  assert.deepEqual(series.map((m) => m.key), ['2026-02', '2026-03']);
});

test('calcMonthlySeries ignora transacao com data invalida ou ausente', () => {
  const series = calcMonthlySeries([
    { transaction_type: 'income', amount: 100, transaction_date: 'invalido' },
    { transaction_type: 'income', amount: 100 },
    { transaction_type: 'income', amount: 100, transaction_date: '2026-01-01' },
  ]);
  assert.equal(series.length, 1);
  assert.equal(series[0].income, 100);
});

test('calcMonthlySeries ignora transaction_type desconhecido (nem soma em income nem expense)', () => {
  const series = calcMonthlySeries([
    { transaction_type: 'transfer', amount: 500, transaction_date: '2026-01-01' },
  ]);
  assert.equal(series[0].income, 0);
  assert.equal(series[0].expense, 0);
});

test('calcMonthlySeries protege contra amount invalido (NaN vira 0)', () => {
  const series = calcMonthlySeries([
    { transaction_type: 'income', amount: 'abc', transaction_date: '2026-01-01' },
  ]);
  assert.equal(series[0].income, 0);
});

// --- calcMonthlyAverages ---------------------------------------------------

test('calcMonthlyAverages retorna zeros para serie vazia', () => {
  assert.deepEqual(calcMonthlyAverages([]), { avgIncome: 0, avgExpense: 0, avgNet: 0, monthsWithData: 0 });
});

test('calcMonthlyAverages calcula medias corretamente', () => {
  const series = [
    { key: '2026-01', income: 5000, expense: 2000, net: 3000 },
    { key: '2026-02', income: 6000, expense: 3000, net: 3000 },
  ];
  const averages = calcMonthlyAverages(series);
  assert.equal(averages.avgIncome, 5500);
  assert.equal(averages.avgExpense, 2500);
  assert.equal(averages.avgNet, 3000);
  assert.equal(averages.monthsWithData, 2);
});

// --- calcPercentChange ---------------------------------------------------

test('calcPercentChange calcula variacao percentual normal', () => {
  assert.equal(calcPercentChange(120, 100), 20);
  assert.equal(calcPercentChange(80, 100), -20);
});

test('calcPercentChange com previous negativo usa valor absoluto na base (melhora de -100 para -50 e +50%)', () => {
  assert.equal(calcPercentChange(-50, -100), 50);
});

test('calcPercentChange: previous=0 e current=0 retorna 0', () => {
  assert.equal(calcPercentChange(0, 0), 0);
});

test('calcPercentChange: previous=0 e current!=0 retorna null (percentual indefinido, nunca inventado)', () => {
  assert.equal(calcPercentChange(500, 0), null);
  assert.equal(calcPercentChange(-500, 0), null);
});

// --- calcBalanceEvolutionIndicator ---------------------------------------

test('calcBalanceEvolutionIndicator com menos de 2 meses retorna percentChange null', () => {
  const result = calcBalanceEvolutionIndicator([{ key: '2026-01', income: 100, expense: 50, net: 50 }]);
  assert.equal(result.currentNet, 50);
  assert.equal(result.previousNet, null);
  assert.equal(result.percentChange, null);
});

test('calcBalanceEvolutionIndicator sem nenhum mes retorna zeros seguros', () => {
  const result = calcBalanceEvolutionIndicator([]);
  assert.equal(result.currentNet, 0);
  assert.equal(result.previousNet, null);
  assert.equal(result.percentChange, null);
});

test('calcBalanceEvolutionIndicator compara ultimo mes com penultimo', () => {
  const series = [
    { key: '2026-01', income: 5000, expense: 3000, net: 2000 },
    { key: '2026-02', income: 5000, expense: 2000, net: 3000 },
  ];
  const result = calcBalanceEvolutionIndicator(series);
  assert.equal(result.currentNet, 3000);
  assert.equal(result.previousNet, 2000);
  assert.equal(result.percentChange, 50);
});

// --- calcExpenseVariationIndicator ---------------------------------------

test('calcExpenseVariationIndicator com menos de 2 meses retorna percentChange null', () => {
  const result = calcExpenseVariationIndicator([{ key: '2026-01', income: 100, expense: 50, net: 50 }]);
  assert.equal(result.currentExpense, 50);
  assert.equal(result.percentChange, null);
});

test('calcExpenseVariationIndicator compara despesa do ultimo mes com penultimo', () => {
  const series = [
    { key: '2026-01', income: 5000, expense: 2000, net: 3000 },
    { key: '2026-02', income: 5000, expense: 2500, net: 2500 },
  ];
  const result = calcExpenseVariationIndicator(series);
  assert.equal(result.currentExpense, 2500);
  assert.equal(result.previousExpense, 2000);
  assert.equal(result.percentChange, 25);
});

// --- calcGoalsProgressIndicator ------------------------------------------

test('calcGoalsProgressIndicator sem metas retorna zeros', () => {
  assert.deepEqual(calcGoalsProgressIndicator([]), { averageProgress: 0, activeGoalsCount: 0 });
});

test('calcGoalsProgressIndicator ignora metas completed/canceled', () => {
  const goals = [
    { status: 'completed', current_amount: 1000, target_amount: 1000 },
    { status: 'canceled', current_amount: 0, target_amount: 1000 },
    { status: 'active', current_amount: 500, target_amount: 1000 },
  ];
  const result = calcGoalsProgressIndicator(goals);
  assert.equal(result.activeGoalsCount, 1);
  assert.equal(result.averageProgress, 50);
});

test('calcGoalsProgressIndicator capa progresso em 100% por meta (nunca ultrapassa)', () => {
  const goals = [
    { status: 'active', current_amount: 2000, target_amount: 1000 },
    { status: 'paused', current_amount: 0, target_amount: 1000 },
  ];
  const result = calcGoalsProgressIndicator(goals);
  assert.equal(result.averageProgress, 50);
});

test('calcGoalsProgressIndicator ignora meta com target_amount invalido (<=0)', () => {
  const goals = [{ status: 'active', current_amount: 500, target_amount: 0 }];
  const result = calcGoalsProgressIndicator(goals);
  assert.equal(result.activeGoalsCount, 1);
  assert.equal(result.averageProgress, 0);
});

// --- calcAttentionSignals -------------------------------------------------

test('calcAttentionSignals sem meses negativos nem metas atrasadas retorna zero sinais', () => {
  const series = [{ key: '2026-01', income: 5000, expense: 2000, net: 3000 }];
  const result = calcAttentionSignals(series, []);
  assert.equal(result.count, 0);
  assert.deepEqual(result.reasons, []);
});

test('calcAttentionSignals conta meses recentes (ate 3) com net negativo', () => {
  const series = [
    { key: '2026-01', income: 1000, expense: 2000, net: -1000 },
    { key: '2026-02', income: 1000, expense: 500, net: 500 },
    { key: '2026-03', income: 1000, expense: 2000, net: -1000 },
  ];
  const result = calcAttentionSignals(series, []);
  assert.equal(result.count, 2);
  assert.match(result.reasons[0], /2 meses recentes com resultado negativo/);
});

test('calcAttentionSignals so considera os ultimos 3 meses da serie', () => {
  const series = [
    { key: '2026-01', income: 0, expense: 1000, net: -1000 },
    { key: '2026-02', income: 1000, expense: 0, net: 1000 },
    { key: '2026-03', income: 1000, expense: 0, net: 1000 },
    { key: '2026-04', income: 1000, expense: 0, net: 1000 },
  ];
  const result = calcAttentionSignals(series, []);
  assert.equal(result.count, 0);
});

test('calcAttentionSignals conta meta ativa com prazo vencido e nao concluida', () => {
  const overdueGoal = {
    status: 'active',
    current_amount: 500,
    target_amount: 1000,
    target_date: '2020-01-01',
  };
  const result = calcAttentionSignals([], [overdueGoal]);
  assert.equal(result.count, 1);
  assert.match(result.reasons[0], /1 meta com prazo vencido/);
});

test('calcAttentionSignals nao conta meta vencida ja concluida (current >= target)', () => {
  const goal = { status: 'active', current_amount: 1000, target_amount: 1000, target_date: '2020-01-01' };
  const result = calcAttentionSignals([], [goal]);
  assert.equal(result.count, 0);
});

test('calcAttentionSignals nao conta meta sem target_date ou com status inativo', () => {
  const goals = [
    { status: 'active', current_amount: 100, target_amount: 1000, target_date: null },
    { status: 'completed', current_amount: 100, target_amount: 1000, target_date: '2020-01-01' },
  ];
  const result = calcAttentionSignals([], goals);
  assert.equal(result.count, 0);
});

// --- buildReportsSnapshot ---------------------------------------------------

test('buildReportsSnapshot sem transacoes nem metas retorna estrutura segura', () => {
  const snapshot = buildReportsSnapshot({});
  assert.deepEqual(snapshot.monthlySeries, []);
  assert.equal(snapshot.averages.monthsWithData, 0);
  assert.equal(snapshot.balanceEvolution.percentChange, null);
  assert.equal(snapshot.goalsProgress.activeGoalsCount, 0);
  assert.equal(snapshot.attentionSignals.count, 0);
});

test('buildReportsSnapshot orquestra todas as funcoes com dados reais consistentes', () => {
  const transactions = [
    { transaction_type: 'income', amount: 5000, transaction_date: '2026-01-15' },
    { transaction_type: 'expense', amount: 2000, transaction_date: '2026-01-20' },
    { transaction_type: 'income', amount: 5500, transaction_date: '2026-02-15' },
    { transaction_type: 'expense', amount: 3000, transaction_date: '2026-02-20' },
  ];
  const goals = [{ status: 'active', current_amount: 500, target_amount: 1000 }];

  const snapshot = buildReportsSnapshot({ transactions, goals, monthsBack: 6 });

  assert.equal(snapshot.monthlySeries.length, 2);
  assert.equal(snapshot.averages.avgNet, 2750);
  assert.equal(snapshot.balanceEvolution.currentNet, 2500);
  assert.equal(snapshot.expenseVariation.currentExpense, 3000);
  assert.equal(snapshot.goalsProgress.averageProgress, 50);
});

test('buildReportsSnapshot respeita monthsBack customizado', () => {
  const transactions = [
    { transaction_type: 'income', amount: 100, transaction_date: '2026-01-01' },
    { transaction_type: 'income', amount: 100, transaction_date: '2026-02-01' },
    { transaction_type: 'income', amount: 100, transaction_date: '2026-03-01' },
  ];
  const snapshot = buildReportsSnapshot({ transactions, monthsBack: 1 });
  assert.equal(snapshot.monthlySeries.length, 1);
  assert.equal(snapshot.monthlySeries[0].key, '2026-03');
});
