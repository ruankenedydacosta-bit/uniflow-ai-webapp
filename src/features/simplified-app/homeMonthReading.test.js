import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('período busca do primeiro dia do mês anterior ao fim do mês corrente', () => {
  assert.deepEqual(buildHomeMonthReadingRange(NOW), { dateFrom: '2026-09-01', dateTo: '2026-10-31' });
  assert.deepEqual(
    buildHomeMonthReadingRange(new Date(2026, 0, 15)),
    { dateFrom: '2025-12-01', dateTo: '2026-01-31' },
  );
});

test('ordena alta, maior categoria e queda, sem repetir categoria', () => {
  const transactions = [
    expense('alim', 812, '2026-10-05'),
    expense('alim', 952, '2026-09-04'),
    expense('lazer', 320, '2026-10-06'),
    expense('lazer', 230, '2026-09-02'),
    expense('transp', 60, '2026-10-02'),
    expense('transp', 200, '2026-09-03'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.deepEqual(readings.map((reading) => [reading.kind, reading.categoryId]), [
    [HOME_MONTH_READING_KINDS.INCREASE, 'lazer'],
    [HOME_MONTH_READING_KINDS.TOP, 'alim'],
    [HOME_MONTH_READING_KINDS.DECREASE, 'transp'],
  ]);
  assert.match(readings[0].title, /R\$\s90,00 a mais com Lazer que em setembro\./);
  assert.match(readings[0].detail, /^Até o dia 8: R\$\s320,00 em outubro e R\$\s230,00 em setembro\.$/);
  assert.match(readings[1].title, /^Você gastou R\$\s812,00 com Alimentação em outubro\.$/);
  assert.match(readings[1].detail, /^R\$\s140,00 a menos que no mesmo dia de setembro\.$/);
  assert.match(readings[2].title, /R\$\s140,00 a menos com Transporte que em setembro\./);
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
  assert.match(readings[0].detail, /R\$\s200,00 em setembro/);
});

test('variação pequena em reais ou em proporção não vira leitura', () => {
  const transactions = [
    // +R$ 40: abaixo do mínimo em reais.
    expense('lazer', 140, '2026-10-03'),
    expense('lazer', 100, '2026-09-03'),
    // +R$ 60 sobre R$ 1.000: abaixo do mínimo em proporção.
    expense('alim', 1060, '2026-10-03'),
    expense('alim', 1000, '2026-09-03'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.deepEqual(readings.map((reading) => reading.kind), [HOME_MONTH_READING_KINDS.TOP]);
  assert.equal(readings[0].categoryId, 'alim');
});

test('maior categoria sem histórico mostra a parte das saídas do mês', () => {
  const transactions = [
    expense('alim', 300, '2026-10-03'),
    expense('saude', 100, '2026-10-04'),
  ];

  const { readings } = buildHomeMonthReading({ transactions, categories: CATEGORIES, now: NOW });

  assert.equal(readings.length, 1);
  assert.equal(readings[0].detail, '75% das suas saídas de outubro.');
});

test('sem saídas no mês não há leitura', () => {
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
  assert.match(readings[1].detail, /R\$\s0,00 em outubro e R\$\s200,00 em setembro/);
});
