import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHomeFinancialGraphData,
  buildHomeSeries,
  buildRecentMovements,
} from './homeFinancialGraphData.js';
import { getMonthRange, summarizeMonth } from './simplifiedRecordsData.js';

const NOW = new Date(2026, 7, 19, 12); // 19/08/2026

const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação' },
  { id: 'cat-transport', name: 'Transporte' },
  { id: 'cat-salary', name: 'Salário' },
];

function tx({
  id,
  type,
  amount,
  categoryId = null,
  date = '2026-08-10',
  status = 'completed',
  description = 'Lançamento',
  createdAt = '2026-08-10T10:00:00Z',
  adjustmentTarget = null,
  adjustmentDelta = null,
}) {
  return {
    id,
    transaction_type: type,
    amount,
    category_id: categoryId,
    transaction_date: date,
    status,
    description,
    created_at: createdAt,
    adjustment_target: adjustmentTarget,
    adjustment_delta: adjustmentDelta,
  };
}

// ============================================================================
// TESTE DA FONTE DE VERDADE -- o bug real da V1.
//
// Registros usa summarizeMonth (lançamentos + delta dos ajustes). A V1 do
// gráfico usava totalByType (só lançamentos), então quem tivesse usado
// "Atualizar saídas" via os dois números discordarem PARA SEMPRE, mesmo
// recarregando -- a divergência era de regra, não de cache.
// ============================================================================

test('FONTE DE VERDADE: totais do gráfico saem exatamente de summarizeMonth (mesma função de Registros)', () => {
  const transactions = [
    tx({ id: 1, type: 'expense', amount: 92.8, categoryId: 'cat-food', date: '2026-08-05' }),
    tx({ id: 2, type: 'expense', amount: 50, categoryId: 'cat-food', date: '2026-08-19' }),
    tx({ id: 3, type: 'income', amount: 300, categoryId: 'cat-salary', date: '2026-08-10' }),
    tx({
      id: 4, type: 'adjustment', amount: 0, date: '2026-08-15', adjustmentTarget: 'expense', adjustmentDelta: 50,
    }),
  ];

  const registros = summarizeMonth(transactions);
  const home = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });

  assert.equal(home.expense, registros.expense);
  assert.equal(home.income, registros.income);
});

test('REGRESSÃO DO BUG FÍSICO: ajuste de saídas entra no total (R$ 192,80), nunca os R$ 143 da V1', () => {
  const transactions = [
    tx({ id: 1, type: 'expense', amount: 92.8, categoryId: 'cat-food', date: '2026-08-05' }),
    tx({ id: 2, type: 'expense', amount: 50, categoryId: 'cat-food', date: '2026-08-19' }),
    tx({
      id: 3, type: 'adjustment', amount: 0, date: '2026-08-15', adjustmentTarget: 'expense', adjustmentDelta: 50,
    }),
  ];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.equal(result.expense, 192.8);
  // Centavos preservados na UI -- nunca arredondar 192,80 para "R$ 193".
  assert.match(result.expenseLabel, /192,80/);
});

test('PRECISÃO: valores com centavos nunca são arredondados nos cards', () => {
  const transactions = [tx({ id: 1, type: 'income', amount: 1234.56, categoryId: 'cat-salary' })];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.match(result.incomeLabel, /1\.234,56/);
});

test('ajuste com target "balance" nunca entra em entradas/saídas (mesma regra de Registros)', () => {
  const transactions = [
    tx({ id: 1, type: 'expense', amount: 100, categoryId: 'cat-food' }),
    tx({
      id: 2, type: 'adjustment', amount: 0, adjustmentTarget: 'balance', adjustmentDelta: 999,
    }),
  ];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.equal(result.expense, 100);
});

test('nenhum campo de saldo é exposto no resultado', () => {
  const result = buildHomeFinancialGraphData({ transactions: [], categories: [], now: NOW });
  assert.equal('balance' in result, false);
  assert.equal('workspaceBalance' in result, false);
});

// ============================================================================
// Período -- os totais e a curva pertencem ao MESMO mês exibido.
// ============================================================================

test('período usa getMonthRange (mesma função de Registros) e rotula o mês corrente', () => {
  const result = buildHomeFinancialGraphData({ transactions: [], categories: [], now: NOW });
  assert.equal(result.monthRange.dateFrom, getMonthRange(NOW).dateFrom);
  assert.equal(result.monthRange.dateTo, getMonthRange(NOW).dateTo);
  assert.match(result.periodLabel, /agosto de 2026/i);
});

test('curva do mês corrente para no dia de hoje, nunca num dia futuro do mês', () => {
  const result = buildHomeFinancialGraphData({ transactions: [], categories: [], now: NOW });
  assert.equal(result.chart.todayDay, 19);
});

// ============================================================================
// Série -- último ponto da curva SEMPRE bate com o total exibido.
// ============================================================================

test('último ponto da série é idêntico aos totais dos cards (curva e cards nunca divergem)', () => {
  const transactions = [
    tx({ id: 1, type: 'expense', amount: 92.8, date: '2026-08-05' }),
    tx({ id: 2, type: 'income', amount: 300, date: '2026-08-10' }),
    tx({
      id: 3, type: 'adjustment', amount: 0, date: '2026-08-15', adjustmentTarget: 'expense', adjustmentDelta: 50,
    }),
  ];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  const lastPoint = result.chart.data[result.chart.data.length - 1];
  assert.equal(lastPoint.despesa, result.expense);
  assert.equal(lastPoint.receita, result.income);
});

test('série é acumulada e monotônica, começando no dia 1', () => {
  const transactions = [
    tx({ id: 1, type: 'expense', amount: 10, date: '2026-08-03' }),
    tx({ id: 2, type: 'expense', amount: 10, date: '2026-08-12' }),
  ];
  const series = buildHomeSeries(transactions, getMonthRange(NOW), 19);
  assert.equal(series[0].day, 1);
  assert.equal(series[series.length - 1].day, 19);
  for (let index = 1; index < series.length; index += 1) {
    assert.ok(series[index].despesa >= series[index - 1].despesa);
  }
});

// ============================================================================
// Recentes -- no máximo 2 por tipo, ordem idêntica à de Registros.
// ============================================================================

test('no máximo 2 saídas recentes, mesmo com muitos lançamentos', () => {
  const transactions = [1, 2, 3, 4, 5].map((n) => tx({
    id: n, type: 'expense', amount: n * 10, date: `2026-08-0${n}`, createdAt: `2026-08-0${n}T10:00:00Z`,
  }));
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.equal(result.recent.expense.length, 2);
});

test('no máximo 2 entradas recentes', () => {
  const transactions = [1, 2, 3, 4].map((n) => tx({
    id: n, type: 'income', amount: n * 10, date: `2026-08-0${n}`, createdAt: `2026-08-0${n}T10:00:00Z`,
  }));
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.equal(result.recent.income.length, 2);
});

test('ordem dos recentes é a mais nova primeiro (transaction_date desc)', () => {
  const transactions = [
    tx({ id: 'antiga', type: 'expense', amount: 10, date: '2026-08-02' }),
    tx({ id: 'nova', type: 'expense', amount: 20, date: '2026-08-18' }),
    tx({ id: 'media', type: 'expense', amount: 15, date: '2026-08-10' }),
  ];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.deepEqual(result.recent.expense.map((m) => m.id), ['nova', 'media']);
});

test('movimentação recém-confirmada vira o PRIMEIRO item da lista', () => {
  const before = [
    tx({ id: 'antiga', type: 'expense', amount: 92.8, date: '2026-08-05' }),
  ];
  const after = [
    ...before,
    tx({
      id: 'nova-50', type: 'expense', amount: 50, categoryId: 'cat-food', date: '2026-08-19', description: 'Mercado',
    }),
  ];
  const result = buildHomeFinancialGraphData({ transactions: after, categories: CATEGORIES, now: NOW });
  assert.equal(result.recent.expense[0].id, 'nova-50');
  assert.equal(result.recent.expense[0].description, 'Mercado');
  assert.match(result.recent.expense[0].formattedAmount, /50,00/);
  // ...e o total acompanha na mesma derivação.
  assert.equal(result.expense, 142.8);
});

test('entradas e saídas nunca se misturam na lista de recentes', () => {
  const transactions = [
    tx({ id: 'e1', type: 'expense', amount: 10, date: '2026-08-18' }),
    tx({ id: 'i1', type: 'income', amount: 20, date: '2026-08-19' }),
  ];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.deepEqual(result.recent.expense.map((m) => m.id), ['e1']);
  assert.deepEqual(result.recent.income.map((m) => m.id), ['i1']);
});

test('categoria aparece como METADADO do registro, com fallback seguro', () => {
  const transactions = [
    tx({ id: 1, type: 'expense', amount: 10, categoryId: 'cat-food', date: '2026-08-18' }),
    tx({ id: 2, type: 'expense', amount: 10, categoryId: 'removida', date: '2026-08-17' }),
  ];
  const recent = buildRecentMovements(transactions, CATEGORIES, 'expense');
  assert.equal(recent[0].categoryName, 'Alimentação');
  assert.equal(recent[1].categoryName, 'Sem categoria');
});

test('lançamentos não concluídos nunca aparecem nos recentes nem nos totais', () => {
  const transactions = [
    tx({ id: 'pendente', type: 'expense', amount: 999, date: '2026-08-19', status: 'pending' }),
  ];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.equal(result.recent.expense.length, 0);
  assert.equal(result.expense, 0);
});

// ============================================================================
// Estado vazio -- nunca dado fictício.
// ============================================================================

test('sem movimentações: hasMovements=false, listas vazias, nenhum valor inventado', () => {
  const result = buildHomeFinancialGraphData({ transactions: [], categories: CATEGORIES, now: NOW });
  assert.equal(result.hasMovements, false);
  assert.equal(result.income, 0);
  assert.equal(result.expense, 0);
  assert.deepEqual(result.recent.expense, []);
  assert.deepEqual(result.recent.income, []);
  assert.ok(result.chart.data.length > 0, 'a curva existe (linha-base), mesmo sem dados');
});
