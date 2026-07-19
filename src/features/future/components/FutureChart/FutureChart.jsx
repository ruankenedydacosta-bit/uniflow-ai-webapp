import { useMemo, useRef } from 'react';
import { cx } from '../../../../utils/cx';
import { formatCurrency } from '../../../../utils/formatters';
import { SCENARIOS, SCENARIO_CONFIG } from '../../futureConstants';
import styles from './FutureChart.module.css';

const CHART_COLORS = {
  [SCENARIOS.CONSERVATIVE]: 'var(--uf-red-500)',
  [SCENARIOS.LIKELY]: 'var(--uf-blue-500)',
  [SCENARIOS.ACCELERATED]: 'var(--uf-green-500)',
};

const CHART_WIDTH = 600;
const CHART_HEIGHT = 280;
const MARGIN = { top: 24, right: 16, bottom: 32, left: 16 };
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

function getDomain(data, scenarioIds) {
  if (!data || !data.length) return [0, 0];
  let min = Infinity;
  let max = -Infinity;
  for (const point of data) {
    for (const sid of scenarioIds) {
      const val = point[sid];
      if (val !== undefined && Number.isFinite(val)) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 0];
  const padding = Math.max(Math.abs(max - min) * 0.1, 100);
  return [Math.min(0, min - padding), max + padding];
}

export default function FutureChart({
  chartData = [],
  scenarioIds = [],
  selectedScenario,
  hasData,
  className,
}) {
  const containerRef = useRef(null);

  const domain = useMemo(() => getDomain(chartData, scenarioIds), [chartData, scenarioIds]);
  const [yMin, yMax] = domain;

  function scaleX(idx) {
    if (!chartData.length) return 0;
    const maxIdx = chartData.length - 1;
    return MARGIN.left + (idx / maxIdx) * PLOT_WIDTH;
  }

  function scaleY(val) {
    if (yMax === yMin) return PLOT_HEIGHT / 2 + MARGIN.top;
    return MARGIN.top + PLOT_HEIGHT - ((val - yMin) / (yMax - yMin)) * PLOT_HEIGHT;
  }

  const zeroY = scaleY(0);

  const yTicks = useMemo(() => {
    const roughStep = (yMax - yMin) / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const step = Math.ceil(roughStep / magnitude) * magnitude;
    const ticks = [];
    let tick = Math.ceil(yMin / step) * step;
    while (tick <= yMax) {
      ticks.push(tick);
      tick += step;
    }
    return ticks;
  }, [yMin, yMax]);

  if (!hasData || !chartData.length) {
    return (
      <section className={cx(styles.section, className)} aria-labelledby="future-chart-title">
        <h3 id="future-chart-title" className={styles.sectionTitle}>Evolução projetada</h3>
        <div className={styles.emptyChart}>
          <p>Dados insuficientes para gerar o gráfico de evolução.</p>
          <p className={styles.emptyHint}>
            Adicione transações financeiras para visualizar as projeções.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={cx(styles.section, className)} aria-labelledby="future-chart-title">
      <div className={styles.chartHeader}>
        <h3 id="future-chart-title" className={styles.sectionTitle}>Evolução projetada</h3>
        <div className={styles.legend}>
          {scenarioIds.map((sid) => {
            const config = SCENARIO_CONFIG[sid];
            return (
              <div key={sid} className={styles.legendItem}>
                <span
                  className={styles.legendSwatch}
                  style={{ background: CHART_COLORS[sid] }}
                />
                <span className={cx(
                  styles.legendLabel,
                  selectedScenario === sid && styles.legendLabelActive,
                )}>
                  {config?.label || sid}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div ref={containerRef} className={styles.chartWrapper}>
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className={styles.svg}
          role="img"
          aria-label="Gráfico de evolução do saldo projetado em três cenários"
          style={{ width: '100%', height: 'auto' }}
        >
          <title>Evolução do saldo projetado</title>

          <line
            x1={MARGIN.left}
            y1={zeroY}
            x2={CHART_WIDTH - MARGIN.right}
            y2={zeroY}
            className={styles.zeroLine}
          />

          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                y1={scaleY(tick)}
                x2={CHART_WIDTH - MARGIN.right}
                y2={scaleY(tick)}
                className={styles.gridLine}
              />
              <text
                x={MARGIN.left - 4}
                y={scaleY(tick) + 4}
                className={styles.tickLabel}
                textAnchor="end"
              >
                {formatCurrency(tick)}
              </text>
            </g>
          ))}

          {scenarioIds.map((sid) => {
            const path = chartData
              .map((d, i) => {
                const x = scaleX(i);
                const y = scaleY(d[sid]);
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              })
              .join(' ');

            return (
              <g key={sid}>
                <path
                  d={path}
                  className={cx(
                    styles.line,
                    selectedScenario === sid && styles.lineHighlight,
                  )}
                  style={{ stroke: CHART_COLORS[sid] }}
                />
                {chartData.map((d, i) => (
                  <circle
                    key={i}
                    cx={scaleX(i)}
                    cy={scaleY(d[sid])}
                    r={selectedScenario === sid ? 3.5 : 2}
                    className={styles.dot}
                    style={{ fill: CHART_COLORS[sid] }}
                  />
                ))}
              </g>
            );
          })}

          {chartData.map((d, i) => (
            <text
              key={i}
              x={scaleX(i)}
              y={CHART_HEIGHT - 6}
              className={styles.xLabel}
              textAnchor="middle"
            >
              {i === 0 ? 'Hoje' : `${i}`}
            </text>
          ))}
        </svg>
      </div>

      <p className={styles.chartDisclaimer}>
        Gráfico ilustrativo com base nos dados atuais. Projeções são estimativas e não garantem resultados futuros.
      </p>
    </section>
  );
}
