import { useMemo, useState } from 'react';
import { formatCurrency } from '../../utils/formatters';
import styles from './FinanceProjectionChart.module.css';

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const PADDING = {
  top: 26,
  right: 26,
  bottom: 44,
  left: 34,
};

const SERIES_CLASSES = {
  income: styles.income,
  expenses: styles.expenses,
  subscriptions: styles.subscriptions,
  goals: styles.goals,
  taxes: styles.taxes,
  suppliers: styles.suppliers,
  balance: styles.balance,
};

const INITIAL_LEGEND_LIMIT = 4;

function getSeriesValues(points, seriesKey) {
  return points.map((point) => Number(point[seriesKey] || 0));
}

function getPointCoordinates(points, seriesKey, maxValue) {
  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const lastIndex = Math.max(points.length - 1, 1);

  return points.map((point, index) => {
    const value = Number(point[seriesKey] || 0);
    const x = PADDING.left + (innerWidth / lastIndex) * index;
    const y = PADDING.top + innerHeight - (value / maxValue) * innerHeight;

    return {
      label: point.label,
      value,
      x,
      y,
    };
  });
}

function buildLinePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function buildAreaPath(points) {
  const baseline = CHART_HEIGHT - PADDING.bottom;
  const linePath = buildLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];

  return `${linePath} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

function getSeriesTotal(points, seriesKey) {
  const values = getSeriesValues(points, seriesKey);
  const lastValue = values[values.length - 1] || 0;

  return lastValue;
}

function getYAtX(points, x) {
  if (x <= points[0].x) {
    return points[0].y;
  }

  const lastPoint = points[points.length - 1];

  if (x >= lastPoint.x) {
    return lastPoint.y;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];

    if (x >= current.x && x <= next.x) {
      const progress = (x - current.x) / (next.x - current.x);

      return current.y + (next.y - current.y) * progress;
    }
  }

  return lastPoint.y;
}

function FinanceProjectionChart({ chart }) {
  const [activeKey, setActiveKey] = useState(null);
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);
  const activeSeries = chart.series.find((series) => series.key === activeKey) ?? null;

  const chartSeries = useMemo(() => {
    const maxValue = Math.max(
      ...chart.series.flatMap((series) => getSeriesValues(chart.points, series.key)),
      1
    );

    return chart.series.map((series) => {
      const coordinates = getPointCoordinates(chart.points, series.key, maxValue);

      return {
        ...series,
        areaPath: buildAreaPath(coordinates),
        linePath: buildLinePath(coordinates),
        points: coordinates,
        total: getSeriesTotal(chart.points, series.key),
      };
    });
  }, [chart]);

  const activeChartSeries = chartSeries.find((series) => series.key === activeSeries?.key) ?? null;
  const activeMiddlePoint = activeChartSeries?.points[Math.floor(activeChartSeries.points.length / 2)];
  const tooltipX = activeMiddlePoint ? Math.min(Math.max((activeMiddlePoint.x / CHART_WIDTH) * 100, 18), 76) : 18;
  const tooltipY = activeMiddlePoint ? Math.min(Math.max((activeMiddlePoint.y / CHART_HEIGHT) * 100, 12), 54) : 18;
  const visibleLegendSeries = isLegendExpanded ? chartSeries : chartSeries.slice(0, INITIAL_LEGEND_LIMIT);
  const hasMoreLegendItems = chartSeries.length > INITIAL_LEGEND_LIMIT;

  function activateSeries(seriesKey) {
    setActiveKey((currentKey) => (currentKey === seriesKey ? currentKey : seriesKey));
  }

  function handleChartPointerMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    const y = ((event.clientY - bounds.top) / bounds.height) * CHART_HEIGHT;
    const closestSeries = chartSeries.reduce(
      (closest, series) => {
        const seriesY = getYAtX(series.points, x);
        const distance = Math.abs(seriesY - y);

        return distance < closest.distance ? { key: series.key, distance } : closest;
      },
      { key: activeKey, distance: Number.POSITIVE_INFINITY }
    );

    if (closestSeries.key !== activeKey) {
      activateSeries(closestSeries.key);
    }
  }

  return (
    <div
      className={styles.chart}
      aria-label="Projeção financeira por entradas, saídas e saldo"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setActiveKey(null);
        }
      }}
      onMouseLeave={() => setActiveKey(null)}
    >
      {activeSeries && activeChartSeries && (
        <div
          className={`${styles.tooltip} ${tooltipX > 58 ? styles.tooltipLeft : ''}`}
          role="status"
          aria-live="polite"
          style={{
            '--tooltip-x': `${tooltipX}%`,
            '--tooltip-y': `${tooltipY}%`,
          }}
        >
          <span className={styles.tooltipLabel}>{activeSeries.label}</span>
          <strong>{formatCurrency(activeChartSeries.total)}</strong>
          <p>{activeSeries.summary}</p>
          <small>{activeSeries.insight}</small>
        </div>
      )}

      <svg
        className={styles.svg}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="Gráfico de projeção financeira para hoje, 7 dias e 30 dias"
        onMouseMove={handleChartPointerMove}
        onMouseLeave={() => setActiveKey(null)}
      >
        <defs>
          <linearGradient id="finance-income" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--uf-color-success)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--uf-color-success)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="finance-expenses" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--uf-color-warning)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--uf-color-warning)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="finance-subscriptions" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--uf-blue-400)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--uf-blue-400)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="finance-goals" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--uf-green-300)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--uf-green-300)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="finance-taxes" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--uf-red-400)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--uf-red-400)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="finance-suppliers" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--uf-blue-400)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--uf-blue-400)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="finance-balance" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--uf-color-ai)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--uf-color-ai)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {[0, 1, 2].map((line) => {
          const y = PADDING.top + ((CHART_HEIGHT - PADDING.top - PADDING.bottom) / 2) * line;

          return <line key={line} className={styles.gridLine} x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={y} y2={y} />;
        })}

        {chart.points.map((point, index) => {
          const x = PADDING.left + ((CHART_WIDTH - PADDING.left - PADDING.right) / Math.max(chart.points.length - 1, 1)) * index;

          return (
            <text key={point.label} className={styles.axisLabel} x={x} y={CHART_HEIGHT - 14} textAnchor="middle">
              {point.label}
            </text>
          );
        })}

        {chartSeries.map((series) => (
          <g
            key={series.key}
            className={`${styles.series} ${SERIES_CLASSES[series.key]} ${activeKey === series.key ? styles.active : ''}`}
            onFocus={() => activateSeries(series.key)}
            tabIndex="0"
            role="button"
            aria-label={`${series.label}: ${series.summary}`}
          >
            <path className={styles.area} d={series.areaPath} />
            <path className={styles.line} d={series.linePath} />
            {series.points.map((point) => (
              <circle key={`${series.key}-${point.label}`} className={styles.point} cx={point.x} cy={point.y} r="5" />
            ))}
          </g>
        ))}

        {chartSeries.map((series) => (
          <g key={`${series.key}-hit`} className={styles.hitLayer} aria-hidden="true">
            <path
              className={styles.hitArea}
              d={series.areaPath}
            />
            <path
              className={styles.hitLine}
              d={series.linePath}
            />
            {series.points.map((point) => (
              <circle
                key={`${series.key}-${point.label}-hit`}
                className={styles.pointHitArea}
                cx={point.x}
                cy={point.y}
                r="18"
              />
            ))}
          </g>
        ))}
      </svg>

      <div className={styles.legendShell}>
        {hasMoreLegendItems && (
          <button type="button" className={styles.legendToggle} onClick={() => setIsLegendExpanded((current) => !current)}>
            {isLegendExpanded ? 'Menos sinais' : 'Mais sinais'}
          </button>
        )}

        <div
          className={`${styles.legend} ${isLegendExpanded ? styles.legendExpanded : ''}`}
          aria-label="Legenda do gráfico"
          onMouseLeave={() => setActiveKey(null)}
        >
          {visibleLegendSeries.map((series) => (
            <button
              key={series.key}
              type="button"
              className={`${styles.legendItem} ${SERIES_CLASSES[series.key]} ${activeKey === series.key ? styles.activeLegend : ''}`}
              onMouseEnter={() => activateSeries(series.key)}
              onFocus={() => activateSeries(series.key)}
            >
              <span aria-hidden="true" />
              {series.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FinanceProjectionChart;
