import { formatCurrency } from '../../utils/formatters';
import styles from './EvolutionChart.module.css';

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const CHART_PADDING = 28;

function buildPoints(monthlySeries, key, minValue, maxValue) {
  const availableWidth = CHART_WIDTH - CHART_PADDING * 2;
  const availableHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const valueRange = maxValue - minValue || 1;

  return monthlySeries.map((month, index) => {
    const x =
      CHART_PADDING +
      (availableWidth / Math.max(monthlySeries.length - 1, 1)) * index;
    const y =
      CHART_HEIGHT -
      CHART_PADDING -
      ((month[key] - minValue) / valueRange) * availableHeight;

    return { ...month, x, y };
  });
}

function getLinePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

/**
 * Grafico SVG puro (sem biblioteca) de receitas x despesas por mes, a
 * partir de reportsCalculations.buildReportsSnapshot -- sem dado
 * fabricado, sem comparacao "semana atual x semana anterior" (dado que
 * o produto nao coleta granularidade semanal): compara meses reais
 * disponiveis no historico.
 */
function EvolutionChart({ monthlySeries }) {
  const allValues = monthlySeries.flatMap((month) => [month.income, month.expense]);
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(...allValues) * 1.04 || 1;

  const incomePoints = buildPoints(monthlySeries, 'income', minValue, maxValue);
  const expensePoints = buildPoints(monthlySeries, 'expense', minValue, maxValue);
  const lastMonth = monthlySeries[monthlySeries.length - 1];

  return (
    <div className={styles.chartBlock}>
      <div className={styles.chartHeader}>
        <div>
          <span>Entradas x saídas</span>
          <strong>{formatCurrency(lastMonth.income)}</strong>
        </div>
      </div>

      <svg
        className={styles.chart}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="Evolução mensal de entradas e saídas"
      >
        <defs>
          <linearGradient id="reportsIncomeArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <path
          className={styles.incomeArea}
          d={`${getLinePath(incomePoints)} L ${CHART_WIDTH - CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} L ${CHART_PADDING} ${
            CHART_HEIGHT - CHART_PADDING
          } Z`}
        />
        <path className={styles.expenseLine} d={getLinePath(expensePoints)} />
        <path className={styles.incomeLine} d={getLinePath(incomePoints)} />

        {monthlySeries.map((month, index) => (
          <g key={month.key}>
            <circle className={styles.expensePoint} cx={expensePoints[index].x} cy={expensePoints[index].y} r="4" />
            <circle className={styles.incomePoint} cx={incomePoints[index].x} cy={incomePoints[index].y} r="5" />
            <text className={styles.chartLabel} x={incomePoints[index].x} y={CHART_HEIGHT - 6} textAnchor="middle">
              {month.label}
            </text>
          </g>
        ))}
      </svg>

      <div className={styles.chartLegend} aria-label="Legenda do gráfico">
        <span>
          <i className={styles.incomeLegend} aria-hidden="true" />
          Entradas
        </span>
        <span>
          <i className={styles.expenseLegend} aria-hidden="true" />
          Saídas
        </span>
      </div>
    </div>
  );
}

export default EvolutionChart;
