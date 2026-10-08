import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUDGET_SOURCES,
  buildHomeMonthFacts,
  buildHomeMonthReading,
  buildHomeMonthReadingRange,
  HOME_MONTH_READING_KINDS,
} from './homeMonthReading.js';

// 8 de outubro de 2026: compara 1–8/out com 1–8/set.
const NOW = new Date(2026, 9, 8, 21, 40);

const CATEGORIES = [
  { id: 'alim', name: 'Alimentação', category_type: 'expense' },
  { id: 'lazer', name: 'Lazer', category_type: 'expense' },
  { id: 'transp', name: 'Transporte', category_type: 'expense' },
  { id: 'saude', name: 'Saúde', category_type: 'expense' },
  { id: 'salario', name: 'Salário', category_type: 'income' },
];

let sequence = 0;
function expense(categoryId, amount, date) {
  sequence += 1;
  return {
    id: `t${sequence}`,
    status: 'completed',
    transaction_type: 'expense',
    category_id: categoryId,
    amount,
    transaction_date: date,
  };
}

test('período busca os 3 meses da média e o mês corrente', () => {
  assert.deepEqual(buildHomeMonthReadingRange(NOW), { dateFrom: '2026-07-01', dateTo: '2026-10-31' });
  assert.deepEqual(
    buildHomeMonthReadingRange(new Date(2026, 0, 15)),
    { dateFrom: '2025-10-01', dateTo: '2026-01-31' },
  );
});

test('sem categoria perto do orçamento, ordena alta, maior categoria e queda', () => {
  const transactions = [
    expense('alim', 812, '2026-10-05'),
    expense('alim', 952, '2026-09-04'),
    expense('lazer', 320, '2026-10-06'),
    expense('lazer', 230, '2026-09-02'),
    expense('transp', 60, '2026-10-02'),
    expense('transp', 200, '2026-09-03'),
    // Gastos do fim de setembro: a média fica alta e nenhuma categoria chega
    // a 80% dela.
    expense('alim', 2000, '2026-09-25'),
    expense('lazer', 1000, '2026-09-20'),
    expense('transp', 500, '2026-09-20'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.deepEqual(readings.map((reading) => [reading.kind, reading.categoryId]), [
    [HOME_MONTH_READING_KINDS.INCREASE, 'lazer'],
    [HOME_MONTH_READING_KINDS.TOP, 'alim'],
    [HOME_MONTH_READING_KINDS.DECREASE, 'transp'],
  ]);
  assert.match(readings[0].title, /R\$\s90,00 a mais com Lazer que no mesmo período de setembro\./);
  assert.match(readings[0].detail, /^De 1 a 8 de outubro: R\$\s320,00\. De 1 a 8 de setembro: R\$\s230,00\.$/);
  assert.match(readings[1].title, /^Você gastou R\$\s812,00 com Alimentação de 1 a 8 de outubro\.$/);
  assert.match(readings[1].detail, /^R\$\s140,00 a menos que no mesmo período de setembro\.$/);
  assert.match(readings[2].title, /R\$\s140,00 a menos com Transporte que no mesmo período de setembro\./);
});

test('compara só até o mesmo dia do mês anterior', () => {
  const transactions = [
    expense('lazer', 300, '2026-10-03'),
    // Depois do dia 8 de setembro: fica fora da comparação.
    expense('lazer', 900, '2026-09-20'),
    expense('lazer', 200, '2026-09-07'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.equal(readings[0].kind, HOME_MONTH_READING_KINDS.INCREASE);
  assert.match(readings[0].detail, /De 1 a 8 de setembro: R\$\s200,00\./);
});

test('variação pequena em reais ou em proporção não vira leitura', () => {
  const transactions = [
    // +R$ 40: abaixo do mínimo em reais.
    expense('lazer', 140, '2026-10-03'),
    expense('lazer', 100, '2026-09-03'),
    // +R$ 60 sobre R$ 1.000: abaixo do mínimo em proporção.
    expense('alim', 1060, '2026-10-03'),
    expense('alim', 1000, '2026-09-03'),
    expense('lazer', 500, '2026-09-20'),
    expense('alim', 2000, '2026-09-20'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.deepEqual(readings.map((reading) => reading.kind), [
    HOME_MONTH_READING_KINDS.TOP,
    HOME_MONTH_READING_KINDS.ON_TRACK,
  ]);
  assert.equal(readings[0].categoryId, 'alim');
});

test('maior categoria sem histórico mostra a parte das saídas do mês', () => {
  const transactions = [
    expense('alim', 300, '2026-10-03'),
    expense('saude', 100, '2026-10-04'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.equal(readings.length, 1);
  assert.equal(readings[0].detail, '75% das suas saídas de 1 a 8 de outubro.');
});

test('saída sem categoria conta no total, mas não vira leitura', () => {
  const transactions = [
    expense(null, 900, '2026-10-03'),
    expense('alim', 300, '2026-10-04'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.deepEqual(readings.map((reading) => reading.categoryId), ['alim']);
  assert.equal(readings[0].detail, '25% das suas saídas de 1 a 8 de outubro.');
});

test('no dia 1 compara só o primeiro dia de cada mês', () => {
  const transactions = [
    expense('lazer', 300, '2026-10-01'),
    expense('lazer', 100, '2026-09-01'),
    expense('lazer', 500, '2026-09-02'),
  ];

  const { readings } = buildHomeMonthReading({
    transactions,
    categories: CATEGORIES,
    now: new Date(2026, 9, 1, 9),
  });

  assert.equal(readings[0].kind, HOME_MONTH_READING_KINDS.INCREASE);
  assert.match(readings[0].detail, /^Em 1º de outubro: R\$\s300,00\. Em 1º de setembro: R\$\s100,00\.$/);
});

test('saída lançada para depois de hoje não entra na comparação', () => {
  const transactions = [
    { ...expense('salario', 5000, '2026-10-05'), transaction_type: 'income' },
    expense('alim', 400, '2026-10-20'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.deepEqual(readings, []);
});

test('queda aparece mesmo sem saída no mês corrente', () => {
  const transactions = [
    expense('alim', 500, '2026-10-02'),
    expense('transp', 200, '2026-09-03'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.deepEqual(readings.map((reading) => reading.categoryId), ['alim', 'transp']);
  assert.match(readings[1].detail, /De 1 a 8 de outubro: R\$\s0,00\. De 1 a 8 de setembro: R\$\s200,00\./);
});

test('teto definido vale no lugar da média', () => {
  const transactions = [
    expense('lazer', 450, '2026-10-03'),
    expense('lazer', 2000, '2026-09-15'),
  ];
  const budgets = [{ category_id: 'lazer', monthly_limit: 400 }];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, budgets, now: NOW });

  assert.equal(readings[0].kind, HOME_MONTH_READING_KINDS.OVER_BUDGET);
  assert.match(readings[0].title, /^Você passou R\$\s50,00 do orçamento de Lazer\.$/);
  assert.match(readings[0].detail, /^O teto é R\$\s400,00 por mês\. De 1 a 8 de outubro: R\$\s450,00\.$/);
});

test('perto do teto avisa quanto resta', () => {
  const transactions = [expense('lazer', 344, '2026-10-03')];
  const budgets = [{ category_id: 'lazer', monthly_limit: 400 }];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, budgets, now: NOW });

  assert.equal(readings[0].kind, HOME_MONTH_READING_KINDS.NEAR_BUDGET);
  assert.equal(readings[0].title, 'Você já usou 86% do orçamento de Lazer.');
  assert.match(readings[0].detail, /^Restam R\$\s56,00 até o fim do mês\.$/);
});

test('sem teto, a média divide só pelos meses em que houve saída', () => {
  const transactions = [
    // Só setembro tem saídas: a média é o próprio setembro, não um terço dele.
    expense('alim', 1000, '2026-09-10'),
    expense('alim', 850, '2026-10-03'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.equal(readings[0].kind, HOME_MONTH_READING_KINDS.NEAR_BUDGET);
  assert.equal(readings[0].title, 'Você já gastou 85% do que costuma gastar com Alimentação no mês.');
  assert.match(readings[0].detail, /^Restam R\$\s150,00 para chegar à média dos últimos 3 meses\.$/);
});

test('média de três meses e passou da média', () => {
  const transactions = [
    expense('alim', 300, '2026-07-10'),
    expense('alim', 600, '2026-08-10'),
    expense('alim', 900, '2026-09-10'),
    expense('alim', 700, '2026-10-03'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.equal(readings[0].kind, HOME_MONTH_READING_KINDS.OVER_BUDGET);
  assert.match(readings[0].title, /^Você já gastou R\$\s100,00 a mais que a sua média com Alimentação\.$/);
});

test('média pequena não vira orçamento', () => {
  const transactions = [
    expense('lazer', 30, '2026-09-10'),
    expense('lazer', 45, '2026-10-03'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.deepEqual(readings.map((reading) => reading.kind), [HOME_MONTH_READING_KINDS.TOP]);
});

test('resumo lista as categorias fora do orçamento', () => {
  const transactions = [expense('lazer', 450, '2026-10-03'), expense('alim', 100, '2026-10-04')];
  const budgets = [
    { category_id: 'lazer', monthly_limit: 400 },
    { category_id: 'alim', monthly_limit: 1000 },
    { category_id: 'transp', monthly_limit: 300 },
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, budgets, now: NOW });
  const summary = readings.find((reading) => reading.kind === HOME_MONTH_READING_KINDS.ON_TRACK);

  assert.equal(summary.title, 'Você está dentro do orçamento em 2 de 3 categorias.');
  assert.equal(summary.detail, 'Fora do orçamento: Lazer.');
  assert.equal(summary.categoryId, null);
});

test('fatos trazem gasto, média, teto e orçamento por categoria', () => {
  const transactions = [
    expense('alim', 600, '2026-08-10'),
    expense('alim', 900, '2026-09-10'),
    expense('alim', 200, '2026-10-03'),
  ];
  const facts = buildHomeMonthFacts({
    transactions,
    categories: CATEGORIES,
    budgets: [{ category_id: 'lazer', monthly_limit: 400 }],
    now: NOW,
  });
  const alim = facts.rows.find((row) => row.id === 'alim');
  const lazer = facts.rows.find((row) => row.id === 'lazer');

  assert.equal(facts.period.day, 8);
  assert.equal(facts.period.daysInMonth, 31);
  assert.equal(alim.average, 750);
  assert.deepEqual(alim.budget, { amount: 750, source: BUDGET_SOURCES.AVERAGE });
  assert.deepEqual(lazer.budget, { amount: 400, source: BUDGET_SOURCES.LIMIT });
  assert.equal(lazer.usedShare, 0);
});

test('com espaço sobrando, o resumo diz que está tudo dentro do orçamento', () => {
  const transactions = [
    expense('alim', 300, '2026-10-03'),
    expense('alim', 1000, '2026-09-20'),
    expense('lazer', 500, '2026-09-20'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });
  const summary = readings.find((reading) => reading.kind === HOME_MONTH_READING_KINDS.ON_TRACK);

  assert.equal(summary.title, 'Você está dentro do orçamento em 2 de 2 categorias.');
  assert.equal(summary.detail, 'Até agora você tem ido bem no seu orçamento.');
});
