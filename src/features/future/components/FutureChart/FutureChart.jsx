import { useMemo, useRef } from 'react';
import { cx } from '../../../../utils/cx';
import { formatCurrency } from '../../../../utils/formatters';
import { SCENARIOS, SCENARIO_CONFIG } from '../../futureConstants';
import { buildComparisonTooltipText } from './futureChartTooltip.js';
import styles from './FutureChart.module.css';

const CHART_COLORS = {
  [SCENARIOS.CONSERVATIVE]: 'var(--uf-red-500)',
  [SCENARIOS.LIKELY]: 'var(--uf-blue-500)',
  [SCENARIOS.ACCELERATED]: 'var(--uf-green-500)',
};

// Cores da comparação Real × Simulado (F5.5) — tokens já existentes, nunca
// vermelho (não é um alerta). A diferenciação nunca depende só da cor: a
// série simulada também usa traço tracejado e rótulo textual próprios.
const COMPARISON_COLORS = {
  real: 'var(--uf-blue-500)',
  simulated: 'var(--uf-purple-500)',
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

function getComparisonDomain(points) {
  if (!points || !points.length) return [0, 0];
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    for (const val of [point.realValue, point.simulatedValue]) {
      if (typeof val === 'number' && Number.isFinite(val)) {
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
  comparisonSeries = null,
  className,
}) {
  const containerRef = useRef(null);

  // Comparação Real × Simulado (F5.5): só ativa com simulação ligada E dados
  // efetivamente comparáveis. Fora disso, o gráfico original (N cenários)
  // permanece exatamente como antes — nenhuma mudança visual regressiva.
  const isComparing = Boolean(comparisonSeries?.isComparable && comparisonSeries.points?.length);
  const comparisonPoints = isComparing ? comparisonSeries.points : [];
  const pointCount = isComparing ? comparisonPoints.length : chartData.length;

  const domain = useMemo(
    () => (isComparing ? getComparisonDomain(comparisonPoints) : getDomain(chartData, scenarioIds)),
    [isComparing, comparisonPoints, chartData, scenarioIds],
  );
  const [yMin, yMax] = domain;

  function scaleX(idx) {
    if (!pointCount) return 0;
    const maxIdx = pointCount - 1;
    if (maxIdx === 0) return MARGIN.left;
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
          {isComparing ? (
            <>
              <div className={styles.legendItem}>
                <span className={cx(styles.legendSwatch, styles.legendSwatchSolid)} style={{ background: COMPARISON_COLORS.real }} />
                <span className={styles.legendLabel}>
                  Real{SCENARIO_CONFIG[comparisonSeries.scenarioId]?.label ? ` — ${SCENARIO_CONFIG[comparisonSeries.scenarioId].label}` : ''}
                </span>
              </div>
              <div className={styles.legendItem}>
                <span className={cx(styles.legendSwatch, styles.legendSwatchDashed)} style={{ background: COMPARISON_COLORS.simulated }} />
                <span className={styles.legendLabel}>
                  Simulado{SCENARIO_CONFIG[comparisonSeries.scenarioId]?.label ? ` — ${SCENARIO_CONFIG[comparisonSeries.scenarioId].label}` : ''}
                </span>
              </div>
            </>
          ) : (
            scenarioIds.map((sid) => {
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
            })
          )}
        </div>
      </div>

      <div ref={containerRef} className={styles.chartWrapper}>
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className={styles.svg}
          role="img"
          aria-label={
            isComparing
              ? 'Gráfico comparando a evolução financeira projetada real e simulada'
              : 'Gráfico de evolução financeira projetada em três cenários'
          }
          style={{ width: '100%', height: 'auto' }}
        >
          <title>{isComparing ? 'Evolução financeira: real × simulado' : 'Evolução financeira projetada'}</title>

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

          {isComparing ? (
            <>
              {[
                { series: 'realValue', color: COMPARISON_COLORS.real, dashed: false },
                { series: 'simulatedValue', color: COMPARISON_COLORS.simulated, dashed: true },
              ].map(({ series, color, dashed }) => {
                let path = '';
                let started = false;
                comparisonPoints.forEach((point, i) => {
                  const val = point[series];
                  if (typeof val !== 'number' || !Number.isFinite(val)) return;
                  const x = scaleX(i);
                  const y = scaleY(val);
                  path += `${!started ? 'M' : 'L'} ${x} ${y} `;
                  started = true;
                });

                return (
                  <g key={series}>
                    <path
                      d={path}
                      className={cx(styles.comparisonLine, dashed && styles.lineDashed)}
                      style={{ stroke: color }}
                    />
                    {comparisonPoints.map((point, i) => {
                      const val = point[series];
                      if (typeof val !== 'number' || !Number.isFinite(val)) return null;
                      return (
                        <circle
                          key={point.key}
                          cx={scaleX(i)}
                          cy={scaleY(val)}
                          r={2.5}
                          className={styles.comparisonDot}
                          style={{ fill: color }}
                        >
                          <title>{buildComparisonTooltipText(point)}</title>
                        </circle>
                      );
                    })}
                  </g>
                );
              })}
            </>
          ) : (
            scenarioIds.map((sid) => {
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
            })
          )}

          {(isComparing ? comparisonPoints : chartData).map((d, i) => (
            <text
              key={isComparing ? d.key : i}
              x={scaleX(i)}
              y={CHART_HEIGHT - 6}
              className={styles.xLabel}
              textAnchor="middle"
            >
              {isComparing ? d.label : (i === 0 ? 'Hoje' : `${i}`)}
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
