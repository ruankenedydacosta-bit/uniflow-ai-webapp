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

export function buildMonthChartModel({ transactions, monthRange, now = new Date() }) {
  const lastDay = dayOfMonth(monthRange.dateTo);
  const isCurrentMonth = String(monthRange.dateFrom).slice(0, 7)
    === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayDay = isCurrentMonth ? Math.min(now.getDate(), lastDay) : null;
  const effectiveLastDay = todayDay ?? lastDay;
  const series = buildHomeSeries(transactions, monthRange, effectiveLastDay);
  const maxValue = Math.max(1, ...series.map((point) => Math.max(point.receita, point.despesa)));
  const xFor = (day) => (lastDay <= 1 ? 0 : ((day - 1) / (lastDay - 1)) * CHART_WIDTH);
  const yFor = (value) => CHART_HEIGHT - 4 - (value / maxValue) * (CHART_HEIGHT - 10);
  const toPoints = (key) => series.map((point) => `${xFor(point.day).toFixed(1)},${yFor(point[key]).toFixed(1)}`);
  const incomePoints = toPoints('receita');
  const expensePoints = toPoints('despesa');
  const last = series[series.length - 1];
  const lastX = xFor(last.day);
  return {
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
    hasMovements: series.some((point) => point.receita > 0 || point.despesa > 0),
  };
}

