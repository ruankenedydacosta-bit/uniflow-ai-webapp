import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFinancialQuery, buildQueryResponse } from './financialQueryInterpreter.js';

function mockCtx(overrides = {}) {
  return {
    balance: 15000,
    monthlyIncome: 8000,
    monthlyExpense: 5000,
    result: 3000,
    recentTransactions: [],
    expensesByCategory: {},
    topCategory: null,
    categoriesById: new Map(),
    hasData: true,
    ...overrides,
  };
}

function mockProjections(overrides = {}) {
  return {
    currentBalance: 15000,
    netResult: 3000,
    monthsWithData: 3,
    hasHistory: true,
    selectedHorizon: 6,
    scenarioProjections: {
      likely: { projectedBalance: 33000, monthlyResult: 3000, hasData: true },
      conservative: { projectedBalance: 25000, monthlyResult: 2500, hasData: true },
      accelerated: { projectedBalance: 41000, monthlyResult: 3500, hasData: true },
    },
    goalProjections: [],
    goalSummary: { total: 0, viable: 0, attention: 0, unviable: 0 },
    ...overrides,
  };
}

// ── classifyFinancialQuery ─────────────────────────────────────────────────

test('classifyFinancialQuery: balance', () => {
  const result = classifyFinancialQuery('qual meu saldo?');
  assert.equal(result.type, 'balance');
});

test('classifyFinancialQuery: monthly_expenses', () => {
  const result = classifyFinancialQuery('quanto gastei esse mês?');
  assert.equal(result.type, 'monthly_expenses');
});

test('classifyFinancialQuery: monthly_income', () => {
  const result = classifyFinancialQuery('quanto entrou esse mês?');
  assert.equal(result.type, 'monthly_income');
});

test('classifyFinancialQuery: monthly_summary', () => {
  const result = classifyFinancialQuery('como está o mês?');
  assert.equal(result.type, 'monthly_summary');
});

test('classifyFinancialQuery: recent_transactions', () => {
  const result = classifyFinancialQuery('últimas transações');
  assert.equal(result.type, 'recent_transactions');
});

test('classifyFinancialQuery: top_category', () => {
  const result = classifyFinancialQuery('qual categoria mais gastou?');
  assert.equal(result.type, 'top_category');
});

// ── Future-related intents ─────────────────────────────────────────────────

test('classifyFinancialQuery: future_projection 3 meses', () => {
  const result = classifyFinancialQuery('como estarão minhas finanças em 3 meses?');
  assert.equal(result.type, 'future_projection');
});

test('classifyFinancialQuery: future_projection 6 meses', () => {
  const result = classifyFinancialQuery('projeção para 6 meses');
  assert.equal(result.type, 'future_projection');
});

test('classifyFinancialQuery: future_projection 12 meses', () => {
  const result = classifyFinancialQuery('cenário para 12 meses');
  assert.equal(result.type, 'future_projection');
});

test('classifyFinancialQuery: goal_feasibility', () => {
  const result = classifyFinancialQuery('vou conseguir atingir minha meta?');
  assert.equal(result.type, 'goal_feasibility');
});

test('classifyFinancialQuery: goal_feasibility variante', () => {
  const result = classifyFinancialQuery('consigo alcançar meu objetivo?');
  assert.equal(result.type, 'goal_feasibility');
});

test('classifyFinancialQuery: goal_risk', () => {
  const result = classifyFinancialQuery('qual meta está em risco?');
  assert.equal(result.type, 'goal_risk');
});

test('classifyFinancialQuery: goal_risk atencao', () => {
  const result = classifyFinancialQuery('metas em atenção');
  assert.equal(result.type, 'goal_risk');
});

test('classifyFinancialQuery: required_monthly', () => {
  const result = classifyFinancialQuery('quanto preciso guardar por mês?');
  assert.equal(result.type, 'required_monthly');
});

test('classifyFinancialQuery: balance_trend', () => {
  const result = classifyFinancialQuery('meu saldo vai melhorar?');
  assert.equal(result.type, 'balance_trend');
});

test('classifyFinancialQuery: goal_completion', () => {
  const result = classifyFinancialQuery('quando vou concluir minha meta?');
  assert.equal(result.type, 'goal_completion');
});

test('classifyFinancialQuery: goal_completion variante', () => {
  const result = classifyFinancialQuery('quando vou atingir meu objetivo?');
  assert.equal(result.type, 'goal_completion');
});

test('classifyFinancialQuery: null para texto sem match', () => {
  const result = classifyFinancialQuery('qual a previsão do tempo?');
  assert.equal(result, null);
});

// ── buildQueryResponse: future_projection ──────────────────────────────────

test('buildQueryResponse future_projection retorna projeção', () => {
  const response = buildQueryResponse(
    { type: 'future_projection' },
    mockCtx(),
    'personal',
    { projections: mockProjections() },
  );
  assert.ok(response);
  assert.ok(response.text.includes('Projeção'));
  assert.ok(response.text.includes('33.000'));
  assert.ok(response.text.toLowerCase().includes('estim'));
  assert.ok(response.highlight);
});

test('buildQueryResponse future_projection sem histórico', () => {
  const response = buildQueryResponse(
    { type: 'future_projection' },
    mockCtx(),
    'personal',
    { projections: mockProjections({ hasHistory: false }) },
  );
  assert.ok(response);
  assert.ok(response.text.includes('dados financeiros suficientes'));
});

test('buildQueryResponse future_projection sem projeções', () => {
  const response = buildQueryResponse(
    { type: 'future_projection' },
    mockCtx(),
    'personal',
    {},
  );
  assert.ok(response);
  assert.ok(response.text.includes('dados financeiros suficientes'));
});

// ── buildQueryResponse: goal_feasibility ───────────────────────────────────

test('buildQueryResponse goal_feasibility com metas', () => {
  const goalProjections = [
    { goalId: 'g1', name: 'Reserva', feasibility: 'viable', estimatedMonths: 4 },
    { goalId: 'g2', name: 'Carro', feasibility: 'attention', estimatedMonths: 10 },
  ];
  const response = buildQueryResponse(
    { type: 'goal_feasibility' },
    mockCtx(),
    'personal',
    { goalProjections },
  );
  assert.ok(response);
  assert.ok(response.text.includes('Reserva'));
  assert.ok(response.text.includes('Viável'));
  assert.ok(response.text.includes('Carro'));
  assert.ok(response.text.includes('Atenção'));
});

test('buildQueryResponse goal_feasibility sem metas', () => {
  const response = buildQueryResponse(
    { type: 'goal_feasibility' },
    mockCtx(),
    'personal',
    { goalProjections: [] },
  );
  assert.ok(response);
  assert.ok(response.text.includes('metas ativas'));
});

// ── buildQueryResponse: goal_risk ──────────────────────────────────────────

test('buildQueryResponse goal_risk com metas em risco', () => {
  const goalProjections = [
    { goalId: 'g1', name: 'Segura', feasibility: 'viable' },
    { goalId: 'g2', name: 'Perigosa', feasibility: 'attention', suggestedAction: 'Aumentar aporte' },
  ];
  const response = buildQueryResponse(
    { type: 'goal_risk' },
    mockCtx(),
    'personal',
    { goalProjections },
  );
  assert.ok(response);
  assert.ok(response.text.includes('Perigosa'));
  assert.ok(response.text.includes('risco'));
});

test('buildQueryResponse goal_risk sem metas em risco', () => {
  const goalProjections = [
    { goalId: 'g1', name: 'Segura', feasibility: 'viable' },
  ];
  const response = buildQueryResponse(
    { type: 'goal_risk' },
    mockCtx(),
    'personal',
    { goalProjections },
  );
  assert.ok(response);
  assert.ok(response.text.includes('Boas notícias'));
});

// ── buildQueryResponse: required_monthly ───────────────────────────────────

test('buildQueryResponse required_monthly com metas', () => {
  const goalProjections = [
    { goalId: 'g1', name: 'Reserva', requiredContribution: 1200, currentContribution: 500 },
  ];
  const response = buildQueryResponse(
    { type: 'required_monthly' },
    mockCtx(),
    'personal',
    { goalProjections },
  );
  assert.ok(response);
  assert.ok(response.text.includes('Reserva'));
  assert.ok(response.text.toLowerCase().includes('estim'));
});

// ── buildQueryResponse: balance_trend ──────────────────────────────────────

test('buildQueryResponse balance_trend com dados', () => {
  const response = buildQueryResponse(
    { type: 'balance_trend' },
    mockCtx(),
    'personal',
    { projections: mockProjections() },
  );
  assert.ok(response);
  assert.ok(response.text.includes('melhorar'));
  assert.ok(response.text.includes('15.000'));
  assert.ok(response.text.includes('33.000'));
});

test('buildQueryResponse balance_trend sem histórico', () => {
  const response = buildQueryResponse(
    { type: 'balance_trend' },
    mockCtx(),
    'personal',
    { projections: mockProjections({ hasHistory: false }) },
  );
  assert.ok(response);
  assert.ok(response.text.includes('dados suficientes'));
});

// ── buildQueryResponse: goal_completion ────────────────────────────────────

test('buildQueryResponse goal_completion com metas', () => {
  const goalProjections = [
    { goalId: 'g1', name: 'Reserva', status: 'active', estimatedMonths: 6, estimatedDate: '2027-01-15' },
  ];
  const response = buildQueryResponse(
    { type: 'goal_completion' },
    mockCtx(),
    'personal',
    { goalProjections },
  );
  assert.ok(response);
  assert.ok(response.text.includes('Reserva'));
  assert.ok(response.text.includes('6 meses'));
  assert.ok(response.text.toLowerCase().includes('estim'));
});

test('buildQueryResponse goal_completion meta concluida', () => {
  const goalProjections = [
    { goalId: 'g1', name: 'Feita', status: 'completed' },
  ];
  const response = buildQueryResponse(
    { type: 'goal_completion' },
    mockCtx(),
    'personal',
    { goalProjections },
  );
  assert.ok(response);
  assert.ok(response.text.includes('concluída'));
});

// ── No NaN / Infinity ──────────────────────────────────────────────────────

test('respostas future_projection sem NaN ou Infinity', () => {
  const response = buildQueryResponse(
    { type: 'future_projection' },
    mockCtx(),
    'personal',
    { projections: mockProjections() },
  );
  assert.doesNotThrow(() => JSON.stringify(response));
  assert.equal(response.text.includes('NaN'), false);
  assert.equal(response.text.includes('Infinity'), false);
});

test('respostas goal_feasibility sem NaN ou Infinity', () => {
  const response = buildQueryResponse(
    { type: 'goal_feasibility' },
    mockCtx(),
    'personal',
    { goalProjections: [] },
  );
  assert.equal(response.text.includes('NaN'), false);
  assert.equal(response.text.includes('Infinity'), false);
});

test('respostas balance_trend sem NaN ou Infinity', () => {
  const response = buildQueryResponse(
    { type: 'balance_trend' },
    mockCtx(),
    'personal',
    { projections: mockProjections() },
  );
  assert.equal(response.text.includes('NaN'), false);
  assert.equal(response.text.includes('Infinity'), false);
});

// ── Aviso de estimativa ────────────────────────────────────────────────────

test('respostas future_projection incluem aviso de estimativa', () => {
  const response = buildQueryResponse(
    { type: 'future_projection' },
    mockCtx(),
    'personal',
    { projections: mockProjections() },
  );
  assert.ok(response.text.toLowerCase().includes('estim'));
});

test('respostas goal_feasibility incluem aviso de estimativa', () => {
  const goalProjections = [
    { goalId: 'g1', name: 'Teste', feasibility: 'viable', estimatedMonths: 4 },
  ];
  const response = buildQueryResponse(
    { type: 'goal_feasibility' },
    mockCtx(),
    'personal',
    { goalProjections },
  );
  assert.ok(response.text.toLowerCase().includes('estim'));
});

// ── Isolamento PF/PJ ───────────────────────────────────────────────────────

test('buildQueryResponse respeita modo personal x business', () => {
  const personal = buildQueryResponse(
    { type: 'balance' },
    mockCtx(),
    'personal',
  );
  const business = buildQueryResponse(
    { type: 'balance' },
    mockCtx(),
    'empresa',
  );
  assert.notEqual(personal.text, business.text);
});

// ── Workspace sem dados ────────────────────────────────────────────────────

test('respostas com ctx sem dados informam cadastro', () => {
  const ctx = mockCtx({ hasData: false, balance: 0, transactions: [] });
  // These will still trigger the 'no data' path inside the handlers
  const response = buildQueryResponse(
    { type: 'future_projection' },
    ctx,
    'personal',
    { projections: mockProjections({ hasHistory: false }) },
  );
  assert.ok(response.text.includes('dados'));
});
