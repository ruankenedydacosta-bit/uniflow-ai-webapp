import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyFinancialQuery,
  buildQueryResponse,
  detectFutureFinancialIntent,
  buildFutureSafetyResponse,
} from './financialQueryInterpreter.js';

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

test('classifyFinancialQuery: consulta geral de objetivo', () => {
  assert.deepEqual(classifyFinancialQuery('Quais são meus objetivos financeiros?'), {
    type: 'goal_overview',
  });
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

test('buildQueryResponse goal_overview usa somente metas reais recebidas', () => {
  const response = buildQueryResponse(
    { type: 'goal_overview' },
    mockCtx(),
    'pessoal',
    {
      goals: [{
        id: 'goal-1',
        name: 'Reserva',
        current_amount: 1200,
        target_amount: 5000,
        status: 'active',
      }],
    },
  );
  assert.match(response.text, /Reserva/);
  assert.match(response.text, /R\$\s*1\.200,00/);
  assert.match(response.text, /R\$\s*5\.000,00/);
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

// ── detectFutureFinancialIntent: perguntas futuras suportadas continuam
//    resolvidas pelo classificador especifico, nunca pela blindagem ────────

test('classifyFinancialQuery: projecao explicita continua sendo future_projection', () => {
  assert.deepEqual(classifyFinancialQuery('qual minha projeção para 6 meses?'), { type: 'future_projection' });
});

test('classifyFinancialQuery: "como estara" com horizonte continua sendo future_projection', () => {
  assert.deepEqual(classifyFinancialQuery('como estará meu saldo daqui a 12 meses?'), { type: 'future_projection' });
});

// ── detectFutureFinancialIntent: perguntas futuras amplas interceptadas ────

const WIDE_FUTURE_QUESTIONS = [
  'meu dinheiro vai durar?',
  'continuando assim, o que acontece?',
  'vou ficar no vermelho?',
  'esse ritmo é sustentável?',
  'como estarei financeiramente no fim do ano?',
  'minhas finanças estão melhorando ou piorando?',
];

for (const question of WIDE_FUTURE_QUESTIONS) {
  test(`detectFutureFinancialIntent detecta: "${question}"`, () => {
    assert.equal(detectFutureFinancialIntent(question), true);
  });

  test(`classifyFinancialQuery nao reconhece tipo especifico para: "${question}"`, () => {
    assert.equal(classifyFinancialQuery(question), null);
  });
}

// ── detectFutureFinancialIntent: falsos positivos evitados ─────────────────

const NON_FUTURE_QUESTIONS = [
  'qual foi meu saldo no mês passado?',
  'quanto gastei com mercado?',
  'como alterar meu perfil?',
  'o que significa futuro?',
  'marcar reunião para o fim do ano',
];

for (const question of NON_FUTURE_QUESTIONS) {
  test(`detectFutureFinancialIntent NAO detecta falso positivo: "${question}"`, () => {
    assert.equal(detectFutureFinancialIntent(question), false);
  });
}

test('detectFutureFinancialIntent trata entrada nao-string com seguranca', () => {
  assert.equal(detectFutureFinancialIntent(null), false);
  assert.equal(detectFutureFinancialIntent(undefined), false);
  assert.equal(detectFutureFinancialIntent(42), false);
});

// ── buildFutureSafetyResponse: nunca fabrica numero ─────────────────────────

test('buildFutureSafetyResponse sem historico orienta a registrar movimentacoes, sem numero', () => {
  const msg = buildFutureSafetyResponse(false);
  assert.match(msg, /histórico suficiente/);
  assert.match(msg, /Registre algumas receitas e despesas/);
  assert.doesNotMatch(msg, /R\$\s*[\d.,]+/);
});

test('buildFutureSafetyResponse com historico menciona capacidades disponiveis, sem numero', () => {
  const msg = buildFutureSafetyResponse(true);
  assert.match(msg, /tendência/);
  assert.match(msg, /3, 6 ou 12 meses/);
  assert.doesNotMatch(msg, /R\$\s*[\d.,]+/);
});

test('buildFutureSafetyResponse nunca contem NaN ou Infinity', () => {
  assert.doesNotMatch(buildFutureSafetyResponse(true), /NaN|Infinity/);
  assert.doesNotMatch(buildFutureSafetyResponse(false), /NaN|Infinity/);
});

// ============================================================================
// BLOCO A1 -- conversationStyle: 'simple' condensa respostas multi-linha
// numa unica linha (sem quebrar numeros/highlight); sem o parametro (ou
// 'normal'/'detailed'), o comportamento anterior fica inalterado.
// ============================================================================

test('buildQueryResponse sem conversationStyle mantem o formato multi-linha de sempre (comportamento inalterado)', () => {
  const response = buildQueryResponse({ type: 'monthly_summary' }, mockCtx(), 'personal', {});
  assert.ok(response.text.includes('\n'));
});

test('conversationStyle "simple" condensa monthly_summary numa unica linha, preservando os valores', () => {
  const response = buildQueryResponse(
    { type: 'monthly_summary' },
    mockCtx(),
    'personal',
    { conversationStyle: 'simple' },
  );
  assert.ok(response);
  assert.doesNotMatch(response.text, /\n/);
  assert.match(response.text, /15\.000/);
  assert.match(response.text, /8\.000/);
  assert.match(response.text, /5\.000/);
});

test('conversationStyle "simple" condensa goal_feasibility e remove o paragrafo de aviso final, preservando os nomes das metas', () => {
  const goalProjections = [
    { goalId: 'g1', name: 'Reserva', feasibility: 'viable', estimatedMonths: 4 },
    { goalId: 'g2', name: 'Carro', feasibility: 'attention', estimatedMonths: 10 },
  ];
  const response = buildQueryResponse(
    { type: 'goal_feasibility' },
    mockCtx(),
    'personal',
    { goalProjections, conversationStyle: 'simple' },
  );
  assert.doesNotMatch(response.text, /\n/);
  assert.match(response.text, /Reserva/);
  assert.match(response.text, /Carro/);
  assert.doesNotMatch(response.text, /⚠️ Esta é uma estimativa/);
});

test('conversationStyle "simple" nao afasta o highlight nem quebra respostas ja curtas (balance)', () => {
  const response = buildQueryResponse(
    { type: 'balance' },
    mockCtx(),
    'personal',
    { conversationStyle: 'simple' },
  );
  assert.ok(response.highlight);
  assert.doesNotMatch(response.text, /\n/);
});

test('conversationStyle "normal"/"detailed" nao condensam -- so "simple" muda a apresentacao', () => {
  const normal = buildQueryResponse({ type: 'monthly_summary' }, mockCtx(), 'personal', { conversationStyle: 'normal' });
  const detailed = buildQueryResponse({ type: 'monthly_summary' }, mockCtx(), 'personal', { conversationStyle: 'detailed' });
  assert.ok(normal.text.includes('\n'));
  assert.ok(detailed.text.includes('\n'));
});
