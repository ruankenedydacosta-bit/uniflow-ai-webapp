import assert from 'node:assert/strict';
import test from 'node:test';
import { getMonthRange } from './simplifiedRecordsData.js';
import { buildMonthChartModel, CHART_HEIGHT, CHART_WIDTH, formatChartDay } from './simplifiedRecordsMonthChart.js';

const NOW = new Date(2026, 9, 23, 12);
const MONTH = getMonthRange(NOW);

function transaction(overrides) {
  return { status: 'completed', created_at: '2026-10-01T00:00:00Z', ...overrides };
}

test('formatChartDay: "1 out", "23 out", sem ponto depois do mês', () => {
  assert.equal(formatChartDay(MONTH, 1), '1 out');
  assert.equal(formatChartDay(MONTH, 23), '23 out');
});

test('no mês corrente, a curva para em hoje e a linha tracejada marca o dia', () => {
  const model = buildMonthChartModel({
    transactions: [
      transaction({ id: 'a', transaction_type: 'income', amount: 6500, transaction_date: '2026-10-05' }),
      transaction({ id: 'b', transaction_type: 'expense', amount: 42, transaction_date: '2026-10-23' }),
    ],
    monthRange: MONTH,
    now: NOW,
  });
  assert.equal(model.hasMovements, true);
  assert.equal(model.labels.start, '1 out');
  assert.equal(model.labels.today, 'Hoje · 23 out');
  assert.equal(model.labels.end, '31 out');
  assert.ok(model.todayX > 0 && model.todayX < CHART_WIDTH);
  // O último ponto da entrada é o maior valor: fica no topo útil do gráfico.
  assert.equal(model.endIncome.y, 6);
  assert.ok(model.endExpense.y < CHART_HEIGHT && model.endExpense.y > model.endIncome.y);
});

test('mês passado: sem linha de hoje, curva até o último dia', () => {
  const past = getMonthRange(new Date(2026, 8, 10));
  const model = buildMonthChartModel({
    transactions: [transaction({ id: 'a', transaction_type: 'expense', amount: 10, transaction_date: '2026-09-02' })],
    monthRange: past,
    now: NOW,
  });
  assert.equal(model.todayX, null);
  assert.equal(model.labels.today, null);
  assert.equal(model.labels.end, '30 set');
  assert.equal(model.endExpense.x, CHART_WIDTH);
});

test('sem movimentação completada, hasMovements é false e o gráfico não aparece', () => {
  const model = buildMonthChartModel({ transactions: [], monthRange: MONTH, now: NOW });
  assert.equal(model.hasMovements, false);
});
