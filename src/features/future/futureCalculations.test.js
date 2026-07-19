import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcMonthlyAverages,
  calcProjectedBalance,
  calcScenarioAdjustment,
  calcScenarioProjection,
  calcAllScenarioProjections,
  calcSavingsCapacity,
  calcGoalProjection,
  calcAllGoalProjections,
  calcProjectionSummary,
  calcAccumulatedBalance,
  buildChartData,
} from './futureCalculations.js';
import { SCENARIOS } from './futureConstants.js';

// ── calcMonthlyAverages ─────────────────────────────────────────────────────

test('calcMonthlyAverages retorna zeros sem transacoes', () => {
  const result = calcMonthlyAverages([]);
  assert.equal(result.avgIncome, 0);
  assert.equal(result.avgExpense, 0);
  assert.equal(result.monthsWithData, 0);
  assert.equal(result.netResult, 0);
});

test('calcMonthlyAverages retorna zeros sem argumento', () => {
  const result = calcMonthlyAverages();
  assert.equal(result.avgIncome, 0);
  assert.equal(result.avgExpense, 0);
  assert.equal(result.monthsWithData, 0);
});

test('calcMonthlyAverages calcula medias por mes', () => {
  const transactions = [
    { transaction_type: 'income', amount: 5000, transaction_date: '2026-01-15' },
    { transaction_type: 'income', amount: 5500, transaction_date: '2026-02-15' },
    { transaction_type: 'expense', amount: 2000, transaction_date: '2026-01-20' },
    { transaction_type: 'expense', amount: 2500, transaction_date: '2026-02-20' },
  ];
  const result = calcMonthlyAverages(transactions);
  assert.equal(result.monthsWithData, 2);
  assert.equal(result.avgIncome, 5250);
  assert.equal(result.avgExpense, 2250);
  assert.equal(result.netResult, 3000);
});

test('calcMonthlyAverages ignora transacoes sem data', () => {
  const transactions = [
    { transaction_type: 'income', amount: 5000 },
    { transaction_type: 'expense', amount: 2000, transaction_date: '2026-01-20' },
  ];
  const result = calcMonthlyAverages(transactions);
  assert.equal(result.monthsWithData, 1);
  assert.equal(result.avgExpense, 2000);
  assert.equal(result.avgIncome, 0);
});

test('calcMonthlyAverages ignora transacoes com data invalida', () => {
  const transactions = [
    { transaction_type: 'income', amount: 5000, transaction_date: 'invalid-date' },
    { transaction_type: 'expense', amount: 2000, transaction_date: '2026-01-20' },
  ];
  const result = calcMonthlyAverages(transactions);
  assert.equal(result.monthsWithData, 1);
  assert.equal(result.avgExpense, 2000);
});

test('calcMonthlyAverages protege amount nao numerico', () => {
  const transactions = [
    { transaction_type: 'income', amount: 'abc', transaction_date: '2026-01-15' },
    { transaction_type: 'expense', amount: 2000, transaction_date: '2026-01-20' },
  ];
  const result = calcMonthlyAverages(transactions);
  assert.equal(result.avgIncome, 0);
  assert.equal(result.avgExpense, 2000);
});

// ── calcProjectedBalance ────────────────────────────────────────────────────

test('calcProjectedBalance projeta saldo corretamente', () => {
  assert.equal(calcProjectedBalance(10000, 2000, 6), 22000);
});

test('calcProjectedBalance aceita fluxo negativo', () => {
  assert.equal(calcProjectedBalance(5000, -1000, 3), 2000);
});

test('calcProjectedBalance protege months minimo 1', () => {
  assert.equal(calcProjectedBalance(10000, 2000, 0), 12000);
});

test('calcProjectedBalance protege valores NaN', () => {
  const result = calcProjectedBalance(NaN, NaN, 6);
  assert.equal(Number.isFinite(result), true);
  assert.equal(result, 0);
});

test('calcProjectedBalance protege Infinity', () => {
  const result = calcProjectedBalance(10000, Infinity, 6);
  assert.equal(Number.isFinite(result), true);
  assert.equal(result, 10000);
});

// ── calcScenarioAdjustment ──────────────────────────────────────────────────

test('calcScenarioAdjustment retorna valores originais para provavel', () => {
  const result = calcScenarioAdjustment(5000, 2000, SCENARIOS.LIKELY);
  assert.equal(result.adjustedIncome, 5000);
  assert.equal(result.adjustedExpense, 2000);
  assert.equal(result.adjustedNet, 3000);
});

test('calcScenarioAdjustment aplica ajuste conservador', () => {
  const result = calcScenarioAdjustment(5000, 2000, SCENARIOS.CONSERVATIVE);
  assert.equal(result.adjustedIncome, 4600);
  assert.equal(result.adjustedExpense, 2100);
  assert.equal(result.adjustedNet, 2500);
});

test('calcScenarioAdjustment aplica ajuste acelerado', () => {
  const result = calcScenarioAdjustment(5000, 2000, SCENARIOS.ACCELERATED);
  assert.equal(result.adjustedIncome, 5400);
  assert.equal(result.adjustedExpense, 1900);
  assert.equal(result.adjustedNet, 3500);
});

test('calcScenarioAdjustment retorna valores originais para cenário desconhecido', () => {
  const result = calcScenarioAdjustment(5000, 2000, 'unknown');
  assert.equal(result.adjustedIncome, 5000);
  assert.equal(result.adjustedExpense, 2000);
  assert.equal(result.adjustedNet, 3000);
});

// ── calcScenarioProjection ──────────────────────────────────────────────────

test('calcScenarioProjection projeta saldo com dados', () => {
  const result = calcScenarioProjection(10000, 5000, 2000, SCENARIOS.LIKELY, 6);
  assert.equal(result.projectedBalance, 28000);
  assert.equal(result.monthlyResult, 3000);
  assert.equal(result.monthsProjected, 6);
  assert.equal(result.hasData, true);
});

test('calcScenarioProjection retorna hasData false sem receita/despesa', () => {
  const result = calcScenarioProjection(10000, 0, 0, SCENARIOS.LIKELY, 6);
  assert.equal(result.hasData, false);
  assert.equal(result.projectedBalance, 10000);
});

// ── calcAllScenarioProjections ──────────────────────────────────────────────

test('calcAllScenarioProjections retorna todos os cenarios', () => {
  const ids = [SCENARIOS.CONSERVATIVE, SCENARIOS.LIKELY, SCENARIOS.ACCELERATED];
  const result = calcAllScenarioProjections(10000, 5000, 2000, ids, 6);
  assert.ok(result[SCENARIOS.CONSERVATIVE]);
  assert.ok(result[SCENARIOS.LIKELY]);
  assert.ok(result[SCENARIOS.ACCELERATED]);
  assert.equal(result[SCENARIOS.LIKELY].projectedBalance, 28000);
  assert.equal(result[SCENARIOS.CONSERVATIVE].projectedBalance, 25000);
  assert.equal(result[SCENARIOS.ACCELERATED].projectedBalance, 31000);
});

test('calcAllScenarioProjections horizontes 3, 6, 12', () => {
  const ids = [SCENARIOS.LIKELY];
  for (const h of [3, 6, 12]) {
    const result = calcAllScenarioProjections(10000, 5000, 2000, ids, h);
    const months = result[SCENARIOS.LIKELY].monthsProjected;
    assert.equal(months, h);
  }
});

// ── calcSavingsCapacity ─────────────────────────────────────────────────────

test('calcSavingsCapacity retorna 0 para fluxo negativo', () => {
  assert.equal(calcSavingsCapacity(-1000, SCENARIOS.LIKELY), 0);
});

test('calcSavingsCapacity retorna 0 para fluxo zero', () => {
  assert.equal(calcSavingsCapacity(0, SCENARIOS.LIKELY), 0);
});

test('calcSavingsCapacity aplica ajuste conservador', () => {
  const result = calcSavingsCapacity(3000, SCENARIOS.CONSERVATIVE);
  assert.equal(result, 2550);
});

test('calcSavingsCapacity aplica ajuste acelerado', () => {
  const result = calcSavingsCapacity(3000, SCENARIOS.ACCELERATED);
  assert.equal(result, 3450);
});

test('calcSavingsCapacity sem ajuste no provavel', () => {
  assert.equal(calcSavingsCapacity(3000, SCENARIOS.LIKELY), 3000);
});

// ── calcAccumulatedBalance ──────────────────────────────────────────────────

test('calcAccumulatedBalance calcula acumulo mensal', () => {
  assert.equal(calcAccumulatedBalance(10000, 2000, 6), 22000);
});

test('calcAccumulatedBalance retorna saldo atual para months <= 0', () => {
  assert.equal(calcAccumulatedBalance(10000, 2000, 0), 10000);
  assert.equal(calcAccumulatedBalance(10000, 2000, -1), 10000);
});

// ── buildChartData ──────────────────────────────────────────────────────────

test('buildChartData gera pontos para todos os cenarios', () => {
  const ids = [SCENARIOS.LIKELY];
  const data = buildChartData(10000, 5000, 2000, ids, 3);
  assert.equal(data.length, 4);
  assert.equal(data[0].label, 'Hoje');
  assert.equal(data[0][SCENARIOS.LIKELY], 10000);
  assert.equal(data[3][SCENARIOS.LIKELY], 19000);
});

test('buildChartData gprimeiro ponto igual ao saldo atual', () => {
  const ids = [SCENARIOS.LIKELY];
  const data = buildChartData(50000, 10000, 6000, ids, 12);
  assert.equal(data[0][SCENARIOS.LIKELY], 50000);
});

test('buildChartData ultimo ponto projetado para 12 meses', () => {
  const ids = [SCENARIOS.LIKELY];
  const data = buildChartData(10000, 5000, 2000, ids, 12);
  assert.equal(data[12][SCENARIOS.LIKELY], 46000);
});

// ── calcGoalProjection ──────────────────────────────────────────────────────

test('calcGoalProjection meta ja concluida retorna viavel', () => {
  const goal = {
    id: 'g1', name: 'Concluída', status: 'completed',
    current_amount: 10000, target_amount: 10000,
    planned_monthly_amount: 500,
    completed_at: '2026-01-15',
  };
  const result = calcGoalProjection(goal, 3000, SCENARIOS.LIKELY);
  assert.equal(result.feasibility, 'viable');
  assert.equal(result.estimatedMonths, 0);
  assert.match(result.suggestedAction, /concluída/);
});

test('calcGoalProjection meta sem fluxo retorna inviavel', () => {
  const goal = {
    id: 'g2', name: 'Sem fluxo', status: 'active',
    current_amount: 1000, target_amount: 10000,
    planned_monthly_amount: 500,
    target_date: '2027-01-01',
  };
  const result = calcGoalProjection(goal, 0, SCENARIOS.LIKELY);
  assert.equal(result.feasibility, 'unviable');
  assert.match(result.suggestedAction, /Fluxo/);
});

test('calcGoalProjection meta viavel com fluxo suficiente', () => {
  const goal = {
    id: 'g3', name: 'Carro', status: 'active',
    current_amount: 5000, target_amount: 15000,
    planned_monthly_amount: 2000,
    target_date: '2028-01-01',
  };
  const result = calcGoalProjection(goal, 5000, SCENARIOS.LIKELY);
  assert.equal(result.feasibility, 'viable');
  assert.ok(result.estimatedMonths < 10);
});

test('calcGoalProjection meta sem prazo e viavel', () => {
  const goal = {
    id: 'g4', name: 'Sem prazo', status: 'active',
    current_amount: 0, target_amount: 10000,
    planned_monthly_amount: 500,
  };
  const result = calcGoalProjection(goal, 3000, SCENARIOS.LIKELY);
  assert.equal(result.feasibility, 'viable');
  assert.match(result.suggestedAction, /Sem prazo/);
});

test('calcGoalProjection meta em atencao', () => {
  const goal = {
    id: 'g5', name: 'Aperto', status: 'active',
    current_amount: 500, target_amount: 50000,
    planned_monthly_amount: 200,
    target_date: '2027-06-01',
  };
  const result = calcGoalProjection(goal, 1000, SCENARIOS.LIKELY);
  assert.ok(result.feasibility === 'attention' || result.feasibility === 'unviable');
});

// ── calcAllGoalProjections ──────────────────────────────────────────────────

test('calcAllGoalProjections filtra apenas ativas e pausadas', () => {
  const goals = [
    { id: 'g1', name: 'A', status: 'active', current_amount: 0, target_amount: 1000, planned_monthly_amount: 100 },
    { id: 'g2', name: 'B', status: 'completed', current_amount: 1000, target_amount: 1000 },
    { id: 'g3', name: 'C', status: 'canceled', current_amount: 0, target_amount: 1000 },
    { id: 'g4', name: 'D', status: 'paused', current_amount: 0, target_amount: 1000, planned_monthly_amount: 100 },
  ];
  const result = calcAllGoalProjections(goals, 2000, SCENARIOS.LIKELY);
  assert.equal(result.length, 2);
  assert.equal(result[0].goalId, 'g1');
  assert.equal(result[1].goalId, 'g4');
});

// ── calcProjectionSummary ───────────────────────────────────────────────────

test('calcProjectionSummary conta viabilidade', () => {
  const projections = [
    { feasibility: 'viable' },
    { feasibility: 'viable' },
    { feasibility: 'attention' },
    { feasibility: 'unviable' },
  ];
  const result = calcProjectionSummary(projections);
  assert.equal(result.total, 4);
  assert.equal(result.viable, 2);
  assert.equal(result.attention, 1);
  assert.equal(result.unviable, 1);
});

test('calcProjectionSummary retorna zeros para array vazio', () => {
  const result = calcProjectionSummary([]);
  assert.equal(result.total, 0);
  assert.equal(result.viable, 0);
  assert.equal(result.attention, 0);
  assert.equal(result.unviable, 0);
});

// ── NaN / Infinity protection ────────────────────────────────────────────────

test('calculos protegem contra NaN', () => {
  const result = calcScenarioProjection(NaN, NaN, NaN, SCENARIOS.LIKELY, 6);
  assert.equal(Number.isFinite(result.projectedBalance), true);
  assert.equal(Number.isFinite(result.monthlyResult), true);
});

test('calculos protegem contra Infinity', () => {
  const result = calcScenarioProjection(Infinity, 5000, 2000, SCENARIOS.LIKELY, 6);
  assert.equal(Number.isFinite(result.projectedBalance), true);
});

// ── Valores iguais aos dados de origem ──────────────────────────────────────

test('projecao com dados reais retorna valores consistentes', () => {
  const balance = 15000;
  const income = 8000;
  const expense = 5000;
  const result = calcScenarioProjection(balance, income, expense, SCENARIOS.LIKELY, 3);
  const expectedMonthly = income - expense;
  const expectedBalance = balance + expectedMonthly * 3;
  assert.equal(result.monthlyResult, expectedMonthly);
  assert.equal(result.projectedBalance, expectedBalance);
});

// ── Isolamento PF/PJ ────────────────────────────────────────────────────────

test('calcMonthlyAverages isola por transacoes recebidas (PF/PJ pelo workspace)', () => {
  const pfTransactions = [
    { transaction_type: 'income', amount: 5000, transaction_date: '2026-01-15' },
    { transaction_type: 'expense', amount: 3000, transaction_date: '2026-01-20' },
  ];
  const pjTransactions = [
    { transaction_type: 'income', amount: 20000, transaction_date: '2026-01-15' },
    { transaction_type: 'expense', amount: 15000, transaction_date: '2026-01-20' },
  ];

  const pfResult = calcMonthlyAverages(pfTransactions);
  const pjResult = calcMonthlyAverages(pjTransactions);

  assert.equal(pfResult.avgIncome, 5000);
  assert.equal(pjResult.avgIncome, 20000);
  assert.equal(pfResult.avgExpense, 3000);
  assert.equal(pjResult.avgExpense, 15000);
});
