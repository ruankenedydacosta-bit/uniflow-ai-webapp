import { buildHomeSeries } from './homeFinancialGraphData.js';

// Modelo do gráfico do card do mês no Financeiro (tela 04 do handoff, #89):
// entradas e saídas acumuladas, dia a dia, com a linha de "hoje". Puro,
// sem React: testável via node --test. Usa a mesma série de
// homeFinancialGraphData, então o último ponto sempre bate com os totais.

export const CHART_WIDTH = 320;
export const CHART_HEIGHT = 90;
const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

function dayOfMonth(dateKey) {
  return Number(String(dateKey).slice(8, 10));
}

/** "23 out" a partir do dia e do mês do período. */
export function formatChartDay(monthRange, day) {
  const [year, month] = String(monthRange.dateFrom).split('-').map(Number);
  const label = MONTH_SHORT_FORMATTER.format(new Date(year, month - 1, day, 12)).replace('.', '');
  return `${day} ${label}`;
}

function stepPoints(startDay, startValue, lastDay, planned, key, xFor, yFor) {
  const byDay = new Map();
  planned.forEach((transaction) => {
    const day = Math.max(startDay, dayOfMonth(transaction.transaction_date));
    byDay.set(day, (byDay.get(day) ?? 0) + signedAmount(transaction, key));
  });
  const points = [`${xFor(startDay).toFixed(1)},${yFor(startValue).toFixed(1)}`];
  let value = startValue;
  [...byDay.keys()].sort((left, right) => left - right).forEach((day) => {
    if (byDay.get(day) === 0) return;
    points.push(`${xFor(day).toFixed(1)},${yFor(value).toFixed(1)}`);
    value += byDay.get(day);
    points.push(`${xFor(day).toFixed(1)},${yFor(value).toFixed(1)}`);
  });
  points.push(`${xFor(lastDay).toFixed(1)},${yFor(value).toFixed(1)}`);
  return { points: points.join(' '), end: value };
}

function signedAmount(transaction, key) {
  const wanted = key === 'receita' ? 'income' : 'expense';
  return transaction.transaction_type === wanted ? Number(transaction.amount || 0) : 0;
}

export function buildMonthChartModel({ transactions, monthRange, plannedTransactions = [], now = new Date() }) {
  const lastDay = dayOfMonth(monthRange.dateTo);
  const isCurrentMonth = String(monthRange.dateFrom).slice(0, 7)
    === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isFutureMonth = String(monthRange.dateFrom) > todayKey;
  const todayDay = isCurrentMonth ? Math.min(now.getDate(), lastDay) : null;
  const effectiveLastDay = todayDay ?? lastDay;
  const series = buildHomeSeries(transactions, monthRange, effectiveLastDay);
  const last = series[series.length - 1];
  // Previsto só existe daqui para a frente: mês atual (de hoje ao fim) e
  // meses futuros (o mês todo). Mês passado não tem tracejado.
  const showPlanned = (isCurrentMonth || isFutureMonth) && plannedTransactions.length > 0;
  const plannedStartDay = todayDay ?? 1;
  const baseIncome = isFutureMonth ? 0 : last.receita;
  const baseExpense = isFutureMonth ? 0 : last.despesa;
  const plannedIncomeTotal = plannedTransactions.reduce((total, t) => total + signedAmount(t, 'receita'), 0);
  const plannedExpenseTotal = plannedTransactions.reduce((total, t) => total + signedAmount(t, 'despesa'), 0);
  const maxValue = Math.max(
    1,
    ...series.map((point) => Math.max(point.receita, point.despesa)),
    showPlanned ? baseIncome + plannedIncomeTotal : 0,
    showPlanned ? baseExpense + plannedExpenseTotal : 0,
  );
  const xFor = (day) => (lastDay <= 1 ? 0 : ((day - 1) / (lastDay - 1)) * CHART_WIDTH);
  const yFor = (value) => CHART_HEIGHT - 4 - (value / maxValue) * (CHART_HEIGHT - 10);
  const toPoints = (key) => series.map((point) => `${xFor(point.day).toFixed(1)},${yFor(point[key]).toFixed(1)}`);
  const incomePoints = toPoints('receita');
  const expensePoints = toPoints('despesa');
  const lastX = xFor(last.day);
  const plannedIncome = showPlanned
    ? stepPoints(plannedStartDay, baseIncome, lastDay, plannedTransactions, 'receita', xFor, yFor)
    : null;
  const plannedExpense = showPlanned
    ? stepPoints(plannedStartDay, baseExpense, lastDay, plannedTransactions, 'despesa', xFor, yFor)
    : null;
  return {
    showRealized: !isFutureMonth,
    plannedIncomePoints: plannedIncome?.points ?? null,
    plannedExpensePoints: plannedExpense?.points ?? null,
    endPlannedIncome: plannedIncome ? { x: xFor(lastDay), y: yFor(plannedIncome.end) } : null,
    endPlannedExpense: plannedExpense ? { x: xFor(lastDay), y: yFor(plannedExpense.end) } : null,
    incomePoints: incomePoints.join(' '),
    expensePoints: expensePoints.join(' '),
    incomeArea: `M${incomePoints.join(' L')} L${lastX.toFixed(1)} ${CHART_HEIGHT} L0 ${CHART_HEIGHT}Z`,
    endIncome: { x: lastX, y: yFor(last.receita) },
    endExpense: { x: lastX, y: yFor(last.despesa) },
    todayX: todayDay ? xFor(todayDay) : null,
    labels: {
      start: formatChartDay(monthRange, 1),
      today: todayDay ? `Hoje · ${formatChartDay(monthRange, todayDay)}` : null,
      end: formatChartDay(monthRange, lastDay),
    },
    hasMovements: showPlanned || series.some((point) => point.receita > 0 || point.despesa > 0),
  };
}

