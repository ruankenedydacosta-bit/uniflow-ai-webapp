import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeFutureSimulationOverrides,
  buildFutureSimulation,
} from './futureSimulation.js';
import { calcMonthlyAverages } from './futureCalculations.js';
import { buildFutureProjections } from './futureService.js';
import { SCENARIOS } from './futureConstants.js';

function oneMonthTransactions() {
  return [
    { transaction_type: 'income', amount: 5000, transaction_date: '2026-01-10' },
    { transaction_type: 'expense', amount: 2000, transaction_date: '2026-01-20' },
  ];
}

function twoMonthTransactions() {
  return [
    { transaction_type: 'income', amount: 5000, transaction_date: '2026-01-10' },
    { transaction_type: 'expense', amount: 2000, transaction_date: '2026-01-20' },
    { transaction_type: 'income', amount: 5000, transaction_date: '2026-02-10' },
    { transaction_type: 'expense', amount: 2000, transaction_date: '2026-02-20' },
  ];
}

// ── normalizeFutureSimulationOverrides ──────────────────────────────────────

test('normalizeFutureSimulationOverrides: objeto vazio vira tudo zero', () => {
  assert.deepEqual(normalizeFutureSimulationOverrides({}), {
    monthlyIncomeDelta: 0,
    monthlyExpenseDelta: 0,
    initialBalanceDelta: 0,
  });
});

test('normalizeFutureSimulationOverrides: campos ausentes viram zero', () => {
  const result = normalizeFutureSimulationOverrides({ monthlyIncomeDelta: 100 });
  assert.equal(result.monthlyIncomeDelta, 100);
  assert.equal(result.monthlyExpenseDelta, 0);
  assert.equal(result.initialBalanceDelta, 0);
});

test('normalizeFutureSimulationOverrides: null vira objeto zerado', () => {
  assert.deepEqual(normalizeFutureSimulationOverrides(null), {
    monthlyIncomeDelta: 0,
    monthlyExpenseDelta: 0,
    initialBalanceDelta: 0,
  });
});

test('normalizeFutureSimulationOverrides: undefined vira objeto zerado', () => {
  assert.deepEqual(normalizeFutureSimulationOverrides(undefined), {
    monthlyIncomeDelta: 0,
    monthlyExpenseDelta: 0,
    initialBalanceDelta: 0,
  });
});

test('normalizeFutureSimulationOverrides: strings numericas NAO sao aceitas silenciosamente', () => {
  const result = normalizeFutureSimulationOverrides({ monthlyIncomeDelta: '1500' });
  assert.equal(result.monthlyIncomeDelta, 0);
});

test('normalizeFutureSimulationOverrides: NaN vira zero', () => {
  const result = normalizeFutureSimulationOverrides({ monthlyIncomeDelta: NaN });
  assert.equal(result.monthlyIncomeDelta, 0);
});

test('normalizeFutureSimulationOverrides: Infinity e -Infinity viram zero', () => {
  const result = normalizeFutureSimulationOverrides({
    monthlyIncomeDelta: Infinity,
    monthlyExpenseDelta: -Infinity,
  });
  assert.equal(result.monthlyIncomeDelta, 0);
  assert.equal(result.monthlyExpenseDelta, 0);
});

test('normalizeFutureSimulationOverrides: numeros negativos validos sao preservados', () => {
  const result = normalizeFutureSimulationOverrides({ monthlyExpenseDelta: -300, initialBalanceDelta: -500 });
  assert.equal(result.monthlyExpenseDelta, -300);
  assert.equal(result.initialBalanceDelta, -500);
});

test('normalizeFutureSimulationOverrides: propriedades desconhecidas sao ignoradas', () => {
  const result = normalizeFutureSimulationOverrides({ monthlyIncomeDelta: 100, hackerField: 999999 });
  assert.deepEqual(Object.keys(result).sort(), ['initialBalanceDelta', 'monthlyExpenseDelta', 'monthlyIncomeDelta']);
});

test('normalizeFutureSimulationOverrides: nao muta a entrada e retorna objeto novo', () => {
  const input = Object.freeze({ monthlyIncomeDelta: 100 });
  const result = normalizeFutureSimulationOverrides(input);
  assert.notEqual(result, input);
  assert.deepEqual(input, { monthlyIncomeDelta: 100 });
});

// ── Ativação (isActive) ──────────────────────────────────────────────────

test('isActive: tudo zero -> inativo', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 1000,
    transactions: oneMonthTransactions(),
    overrides: { monthlyIncomeDelta: 0, monthlyExpenseDelta: 0, initialBalanceDelta: 0 },
  });
  assert.equal(result.isActive, false);
});

test('isActive: apenas receita -> ativo', () => {
  const result = buildFutureSimulation({
    transactions: oneMonthTransactions(),
    overrides: { monthlyIncomeDelta: 500 },
  });
  assert.equal(result.isActive, true);
});

test('isActive: apenas despesa -> ativo', () => {
  const result = buildFutureSimulation({
    transactions: oneMonthTransactions(),
    overrides: { monthlyExpenseDelta: -200 },
  });
  assert.equal(result.isActive, true);
});

test('isActive: apenas saldo inicial -> ativo', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 1000,
    transactions: oneMonthTransactions(),
    overrides: { initialBalanceDelta: 5000 },
  });
  assert.equal(result.isActive, true);
});

test('isActive: valores invalidos normalizados para zero -> inativo', () => {
  const result = buildFutureSimulation({
    transactions: oneMonthTransactions(),
    overrides: { monthlyIncomeDelta: '1500', monthlyExpenseDelta: NaN, initialBalanceDelta: Infinity },
  });
  assert.equal(result.isActive, false);
});

// ── Saldo ────────────────────────────────────────────────────────────────

test('saldo: delta positivo soma ao saldo real', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 1000,
    transactions: oneMonthTransactions(),
    overrides: { initialBalanceDelta: 5000 },
  });
  assert.equal(result.simulatedInputs.workspaceBalance, 6000);
});

test('saldo: delta negativo subtrai do saldo real', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 1000,
    transactions: oneMonthTransactions(),
    overrides: { initialBalanceDelta: -2000 },
  });
  assert.equal(result.simulatedInputs.workspaceBalance, -1000);
});

test('saldo: saldo simulado negativo e aceito, sem fallback para zero', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 100,
    transactions: oneMonthTransactions(),
    overrides: { initialBalanceDelta: -5000 },
  });
  assert.equal(result.simulatedInputs.workspaceBalance, -4900);
});

test('saldo: saldo real (baseInputs) permanece intacto', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 1000,
    transactions: oneMonthTransactions(),
    overrides: { initialBalanceDelta: 5000 },
  });
  assert.equal(result.baseInputs.workspaceBalance, 1000);
});

// ── Receita ──────────────────────────────────────────────────────────────

test('receita: aumento mensal reflete exatamente o delta na media simulada', () => {
  const transactions = oneMonthTransactions();
  const result = buildFutureSimulation({
    workspaceBalance: 0,
    transactions,
    overrides: { monthlyIncomeDelta: 1000 },
  });
  const { avgIncome } = calcMonthlyAverages(result.simulatedInputs.transactions);
  assert.equal(avgIncome, 6000); // base 5000 + delta 1000
});

test('receita: reducao mensal reflete exatamente o delta', () => {
  const transactions = oneMonthTransactions();
  const result = buildFutureSimulation({
    transactions,
    overrides: { monthlyIncomeDelta: -1000 },
  });
  const { avgIncome } = calcMonthlyAverages(result.simulatedInputs.transactions);
  assert.equal(avgIncome, 4000); // base 5000 - 1000
});

test('receita: reducao maior que a base resulta em zero, nunca negativo', () => {
  const transactions = oneMonthTransactions();
  const result = buildFutureSimulation({
    transactions,
    overrides: { monthlyIncomeDelta: -999999 },
  });
  const { avgIncome } = calcMonthlyAverages(result.simulatedInputs.transactions);
  assert.equal(avgIncome, 0);
});

test('receita: distribui o delta corretamente em multiplos meses (prova a estrategia de transacoes sinteticas)', () => {
  const transactions = twoMonthTransactions();
  const result = buildFutureSimulation({
    transactions,
    overrides: { monthlyIncomeDelta: 300 },
  });
  const { avgIncome, monthsWithData } = calcMonthlyAverages(result.simulatedInputs.transactions);
  assert.equal(monthsWithData, 2); // nao cria mes novo
  assert.equal(avgIncome, 5300); // base 5000 + delta 300, exatamente
});

test('receita: base sem historico nao produz NaN e mantem hasHistory falso', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 1000,
    transactions: [],
    overrides: { monthlyIncomeDelta: 1000 },
  });
  assert.equal(result.simulatedProjections.hasHistory, false);
  assert.equal(Number.isNaN(result.simulatedProjections.avgIncome), false);
});

test('receita: delta invalido (string) e tratado como zero, sem alterar a media', () => {
  const transactions = oneMonthTransactions();
  const result = buildFutureSimulation({
    transactions,
    overrides: { monthlyIncomeDelta: '1500' },
  });
  const { avgIncome } = calcMonthlyAverages(result.simulatedInputs.transactions);
  assert.equal(avgIncome, 5000);
});

// ── Despesa ──────────────────────────────────────────────────────────────

test('despesa: aumento mensal reflete exatamente o delta', () => {
  const transactions = oneMonthTransactions();
  const result = buildFutureSimulation({
    transactions,
    overrides: { monthlyExpenseDelta: 500 },
  });
  const { avgExpense } = calcMonthlyAverages(result.simulatedInputs.transactions);
  assert.equal(avgExpense, 2500); // base 2000 + 500
});

test('despesa: reducao mensal reflete exatamente o delta', () => {
  const transactions = oneMonthTransactions();
  const result = buildFutureSimulation({
    transactions,
    overrides: { monthlyExpenseDelta: -500 },
  });
  const { avgExpense } = calcMonthlyAverages(result.simulatedInputs.transactions);
  assert.equal(avgExpense, 1500); // base 2000 - 500
});

test('despesa: reducao maior que a base resulta em zero, nunca negativo', () => {
  const transactions = oneMonthTransactions();
  const result = buildFutureSimulation({
    transactions,
    overrides: { monthlyExpenseDelta: -999999 },
  });
  const { avgExpense } = calcMonthlyAverages(result.simulatedInputs.transactions);
  assert.equal(avgExpense, 0);
});

test('despesa: base sem historico nao produz NaN', () => {
  const result = buildFutureSimulation({
    transactions: [],
    overrides: { monthlyExpenseDelta: -500 },
  });
  assert.equal(result.simulatedProjections.hasHistory, false);
  assert.equal(Number.isNaN(result.simulatedProjections.avgExpense), false);
});

test('despesa: delta invalido (NaN) e tratado como zero', () => {
  const transactions = oneMonthTransactions();
  const result = buildFutureSimulation({
    transactions,
    overrides: { monthlyExpenseDelta: NaN },
  });
  const { avgExpense } = calcMonthlyAverages(result.simulatedInputs.transactions);
  assert.equal(avgExpense, 2000);
});

// ── Projeção ─────────────────────────────────────────────────────────────

test('projecao: horizonte informado e mantido na simulacao', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 10000,
    transactions: oneMonthTransactions(),
    overrides: { monthlyIncomeDelta: 500 },
    selectedHorizon: 12,
  });
  assert.equal(result.simulatedProjections.selectedHorizon, 12);
});

test('projecao: cenarios informados sao mantidos', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 10000,
    transactions: oneMonthTransactions(),
    overrides: { monthlyIncomeDelta: 500 },
    scenarioIds: [SCENARIOS.LIKELY],
  });
  assert.deepEqual(Object.keys(result.simulatedProjections.scenarioProjections), [SCENARIOS.LIKELY]);
});

test('projecao: usa exatamente a mesma formula do motor oficial (verificacao numerica)', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 10000,
    transactions: oneMonthTransactions(), // avgIncome 5000, avgExpense 2000
    overrides: { monthlyIncomeDelta: 1000, monthlyExpenseDelta: -500 },
    scenarioIds: [SCENARIOS.LIKELY],
    selectedHorizon: 6,
  });
  // netResult simulado esperado: (5000+1000) - (2000-500) = 6000 - 1500 = 4500
  const expectedMonthlyResult = 4500;
  const expectedProjectedBalance = 10000 + expectedMonthlyResult * 6;
  const likely = result.simulatedProjections.scenarioProjections[SCENARIOS.LIKELY];
  assert.equal(likely.monthlyResult, expectedMonthlyResult);
  assert.equal(likely.projectedBalance, expectedProjectedBalance);
});

test('projecao: simulada difere da oficial somente pelos overrides', () => {
  const transactions = oneMonthTransactions();
  const officialProjections = buildFutureProjections({
    workspaceBalance: 10000,
    transactions,
    scenarioIds: [SCENARIOS.LIKELY],
    selectedHorizon: 6,
  });
  const result = buildFutureSimulation({
    workspaceBalance: 10000,
    transactions,
    overrides: { monthlyIncomeDelta: 1000 },
    scenarioIds: [SCENARIOS.LIKELY],
    selectedHorizon: 6,
  });
  assert.notEqual(
    result.simulatedProjections.scenarioProjections[SCENARIOS.LIKELY].projectedBalance,
    officialProjections.scenarioProjections[SCENARIOS.LIKELY].projectedBalance,
  );
});

test('projecao: nenhum override ativo produz resultado equivalente a projecao real', () => {
  const transactions = oneMonthTransactions();
  const officialProjections = buildFutureProjections({
    workspaceBalance: 10000,
    transactions,
    scenarioIds: [SCENARIOS.LIKELY],
    selectedHorizon: 6,
  });
  const result = buildFutureSimulation({
    workspaceBalance: 10000,
    transactions,
    overrides: {},
    scenarioIds: [SCENARIOS.LIKELY],
    selectedHorizon: 6,
  });
  assert.equal(result.isActive, false);
  assert.deepEqual(result.simulatedProjections, officialProjections);
});

test('projecao: nunca contem NaN ou Infinity, mesmo com overrides extremos', () => {
  const result = buildFutureSimulation({
    workspaceBalance: 10000,
    transactions: twoMonthTransactions(),
    overrides: { monthlyIncomeDelta: -Infinity, monthlyExpenseDelta: Infinity, initialBalanceDelta: NaN },
    selectedHorizon: 12,
  });
  const serialized = JSON.stringify(result.simulatedProjections);
  assert.doesNotMatch(serialized, /NaN|Infinity/);
  for (const scenario of Object.values(result.simulatedProjections.scenarioProjections)) {
    assert.equal(Number.isFinite(scenario.projectedBalance), true);
    assert.equal(Number.isFinite(scenario.monthlyResult), true);
  }
});

// ── Imutabilidade ────────────────────────────────────────────────────────

test('imutabilidade: array original de transacoes nao muda', () => {
  const transactions = oneMonthTransactions();
  const originalLength = transactions.length;
  const originalSnapshot = JSON.stringify(transactions);
  buildFutureSimulation({
    transactions,
    overrides: { monthlyIncomeDelta: 1000, monthlyExpenseDelta: -500 },
  });
  assert.equal(transactions.length, originalLength);
  assert.equal(JSON.stringify(transactions), originalSnapshot);
});

test('imutabilidade: objetos originais de transacoes nao mudam (mesma referencia, mesmo conteudo)', () => {
  const transactions = oneMonthTransactions();
  const firstItemRef = transactions[0];
  buildFutureSimulation({
    transactions,
    overrides: { monthlyIncomeDelta: 1000 },
  });
  assert.equal(transactions[0], firstItemRef);
  assert.equal(transactions[0].amount, 5000);
});

test('imutabilidade: array original de metas nao muda', () => {
  const goals = [{ id: 'g1', status: 'active', current_amount: 100, target_amount: 1000, planned_monthly_amount: 50 }];
  const originalSnapshot = JSON.stringify(goals);
  buildFutureSimulation({
    transactions: oneMonthTransactions(),
    goals,
    overrides: { monthlyIncomeDelta: 1000 },
  });
  assert.equal(JSON.stringify(goals), originalSnapshot);
});

test('imutabilidade: objeto de overrides do chamador nao muda', () => {
  const overrides = Object.freeze({ monthlyIncomeDelta: 1000, monthlyExpenseDelta: -500, initialBalanceDelta: 200 });
  const result = buildFutureSimulation({
    transactions: oneMonthTransactions(),
    overrides,
  });
  assert.deepEqual(overrides, { monthlyIncomeDelta: 1000, monthlyExpenseDelta: -500, initialBalanceDelta: 200 });
  assert.notEqual(result.overrides, overrides);
});

test('imutabilidade: chamadas consecutivas com overrides diferentes nao acumulam deltas', () => {
  const transactions = oneMonthTransactions();
  const first = buildFutureSimulation({
    transactions,
    overrides: { monthlyIncomeDelta: 1000 },
  });
  const second = buildFutureSimulation({
    transactions,
    overrides: { monthlyIncomeDelta: 200 },
  });
  const { avgIncome: avgIncomeFirst } = calcMonthlyAverages(first.simulatedInputs.transactions);
  const { avgIncome: avgIncomeSecond } = calcMonthlyAverages(second.simulatedInputs.transactions);
  assert.equal(avgIncomeFirst, 6000); // 5000 + 1000
  assert.equal(avgIncomeSecond, 5200); // 5000 + 200 (nao 5000+1000+200)
  assert.equal(transactions.length, 2); // array real nunca ganhou entradas sinteticas
});

test('imutabilidade: mesma chamada repetida produz resultado identico (sem estado compartilhado)', () => {
  const transactions = oneMonthTransactions();
  const overrides = { monthlyIncomeDelta: 700, monthlyExpenseDelta: -100 };
  const first = buildFutureSimulation({ workspaceBalance: 5000, transactions, overrides, selectedHorizon: 6 });
  const second = buildFutureSimulation({ workspaceBalance: 5000, transactions, overrides, selectedHorizon: 6 });
  assert.deepEqual(first.simulatedProjections, second.simulatedProjections);
});
