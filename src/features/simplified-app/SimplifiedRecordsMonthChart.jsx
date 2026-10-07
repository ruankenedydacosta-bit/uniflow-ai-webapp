import { useId, useMemo } from 'react';
import { buildMonthChartModel, CHART_HEIGHT, CHART_WIDTH } from './simplifiedRecordsMonthChart.js';
import styles from './simplifiedRecords.module.css';

// Gráfico do card do mês no Financeiro (tela 04 do handoff, #89): entradas
// e saídas acumuladas, dia a dia, com a linha de "hoje" tracejada. Usa a
// mesma série de simplifiedRecordsData/homeFinancialGraphData, então o
// último ponto sempre bate com os totais do card.

function SimplifiedRecordsMonthChart({ transactions, monthRange }) {
  const gradientId = useId().replace(/:/g, '');
  const model = useMemo(
    () => buildMonthChartModel({ transactions, monthRange }),
    [transactions, monthRange],
  );

  if (!model.hasMovements) return null;

  return (
    <>
      <svg
        className={styles.monthChart}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Entradas e saídas acumuladas no mês"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop className={styles.monthChartAreaStart} offset="0" />
            <stop className={styles.monthChartAreaEnd} offset="1" />
          </linearGradient>
        </defs>
        {model.todayX !== null ? (
          <line className={styles.monthChartToday} x1={model.todayX} y1="0" x2={model.todayX} y2={CHART_HEIGHT} />
        ) : null}
        <path className={styles.monthChartArea} d={model.incomeArea} fill={`url(#${gradientId})`} />
        <polyline className={styles.monthChartIncome} points={model.incomePoints} />
        <polyline className={styles.monthChartExpense} points={model.expensePoints} />
        <circle className={styles.monthChartDotIncome} cx={model.endIncome.x} cy={model.endIncome.y} r="3.5" />
        <circle className={styles.monthChartDotExpense} cx={model.endExpense.x} cy={model.endExpense.y} r="3.5" />
      </svg>
      <div className={styles.monthChartAxis} aria-hidden="true">
        <span>{model.labels.start}</span>
        {model.labels.today ? <span>{model.labels.today}</span> : null}
        <span>{model.labels.end}</span>
      </div>
    </>
  );
}

export default SimplifiedRecordsMonthChart;
