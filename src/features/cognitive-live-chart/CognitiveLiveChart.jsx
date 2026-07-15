import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import styles from './CognitiveLiveChart.module.css';
import CognitiveChartTooltip from './CognitiveChartTooltip';
import UniChartInsight from './UniChartInsight';
import {
  createLinearScale,
  getDomain,
  toScreenPoints,
  buildSmoothPath,
  buildAreaPath,
  findNearestIndex,
  formatBRL,
  formatPercent,
  prefersReducedMotion,
  clamp,
} from './cognitiveLiveChart.utils';
import {
  currentMonthData,
  forecastMonthData,
  previousMonthData,
  uniInsightHighlight,
  comparisonInsight,
  forecastInsight,
  periodOptions,
  modeOptions,
  TODAY_DAY,
} from './cognitiveLiveChart.mock';

const VIEWBOX_WIDTH = 340;
const MARGIN = { top: 20, right: 14, bottom: 28, left: 14 };

const VARIANT_HEIGHT = {
  compact: 240,
  detailed: 340,
};

/**
 * UNIFLOW COGNITIVE LIVE CHART V1
 *
 * Gráfico vivo de Receitas x Despesas que "conversa com a Uni". Não integra
 * dados reais — recebe tudo via props com fallback para os mocks locais,
 * para ser plugado futuramente aos módulos reais da UniFlow.
 *
 * Variantes:
 * - `compact`: usada na Home, foco na interpretação, poucos controles.
 * - `detailed`: usada no Financeiro, com legenda, seletor de período e
 *   tooltip completo.
 */
export default function CognitiveLiveChart({
  variant = 'compact',
  mode: controlledMode,
  defaultMode = 'overview',
  period: controlledPeriod,
  defaultPeriod = 'mes',
  data = currentMonthData,
  forecastData = forecastMonthData,
  comparisonData = previousMonthData,
  todayDay = TODAY_DAY,
  insightHighlight = uniInsightHighlight,
  comparisonMeta = comparisonInsight,
  forecastMeta = forecastInsight,
  onModeChange,
  onPeriodChange,
  onListenAnalysis = () => {},
  onViewDetails = () => {},
  className = '',
}) {
  const isDetailed = variant === 'detailed';
  const height = VARIANT_HEIGHT[variant] || VARIANT_HEIGHT.compact;

  const [internalMode, setInternalMode] = useState(defaultMode);
  const mode = controlledMode || internalMode;

  const [internalPeriod, setInternalPeriod] = useState(defaultPeriod);
  const period = controlledPeriod || internalPeriod;

  const [focusedIndex, setFocusedIndex] = useState(null);
  const [tooltipScreen, setTooltipScreen] = useState(null);
  const [containerWidth, setContainerWidth] = useState(VIEWBOX_WIDTH);

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const activePointerRef = useRef(null);
  const reduceMotion = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleModeChange = useCallback((nextMode) => {
    if (!controlledMode) setInternalMode(nextMode);
    onModeChange?.(nextMode);
    setFocusedIndex(null);
    setTooltipScreen(null);
  }, [controlledMode, onModeChange]);

  const handlePeriodChange = useCallback((nextPeriod) => {
    if (!controlledPeriod) setInternalPeriod(nextPeriod);
    onPeriodChange?.(nextPeriod);
  }, [controlledPeriod, onPeriodChange]);

  const handleTabListKeyDown = useCallback((event, options, currentValue, onChange) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === currentValue));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % options.length
          : (currentIndex - 1 + options.length) % options.length;
    onChange(options[nextIndex].value);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  }, []);

  const showForecastLine = mode === 'forecast';
  const showComparisonLine = mode === 'comparison';
  const showUniHighlight = mode === 'uni-insight';

  const combinedSeries = useMemo(() => {
    const series = [data];
    if (showForecastLine) series.push(forecastData);
    if (showComparisonLine) series.push(comparisonData);
    return series;
  }, [data, forecastData, comparisonData, showForecastLine, showComparisonLine]);

  const domainY = useMemo(
    () => getDomain(combinedSeries, 'receita').concat(getDomain(combinedSeries, 'despesa')),
    [combinedSeries],
  );
  const yMin = Math.min(...domainY);
  const yMax = Math.max(...domainY);

  const lastDay = showForecastLine
    ? forecastData[forecastData.length - 1].day
    : data[data.length - 1].day;

  const xScale = useMemo(
    () => createLinearScale([data[0].day, lastDay], [MARGIN.left, VIEWBOX_WIDTH - MARGIN.right]),
    [data, lastDay],
  );
  const yScale = useMemo(
    () => createLinearScale([yMin, yMax], [height - MARGIN.bottom, MARGIN.top]),
    [yMin, yMax, height],
  );

  const receitaPoints = useMemo(
    () => toScreenPoints(data, 'receita', xScale, yScale),
    [data, xScale, yScale],
  );
  const despesaPoints = useMemo(
    () => toScreenPoints(data, 'despesa', xScale, yScale),
    [data, xScale, yScale],
  );
  const forecastReceitaPoints = useMemo(
    () => (showForecastLine ? toScreenPoints(forecastData, 'receita', xScale, yScale) : []),
    [forecastData, xScale, yScale, showForecastLine],
  );
  const forecastDespesaPoints = useMemo(
    () => (showForecastLine ? toScreenPoints(forecastData, 'despesa', xScale, yScale) : []),
    [forecastData, xScale, yScale, showForecastLine],
  );
  const comparisonDespesaPoints = useMemo(
    () => (showComparisonLine ? toScreenPoints(comparisonData, 'despesa', xScale, yScale) : []),
    [comparisonData, xScale, yScale, showComparisonLine],
  );

  const receitaLinePath = useMemo(() => buildSmoothPath(receitaPoints), [receitaPoints]);
  const despesaLinePath = useMemo(() => buildSmoothPath(despesaPoints), [despesaPoints]);
  const forecastReceitaPath = useMemo(
    () => buildSmoothPath(forecastReceitaPoints),
    [forecastReceitaPoints],
  );
  const forecastDespesaPath = useMemo(
    () => buildSmoothPath(forecastDespesaPoints),
    [forecastDespesaPoints],
  );
  const comparisonDespesaPath = useMemo(
    () => buildSmoothPath(comparisonDespesaPoints),
    [comparisonDespesaPoints],
  );

  // Área sombreada entre a despesa atual e a do mês anterior, no mesmo
  // intervalo de dias — torna a diferença ("12% a menos") visível, não
  // apenas numérica.
  const comparisonGapPath = useMemo(() => {
    if (!showComparisonLine) return '';
    const comparisonByDay = new Map(
      comparisonDespesaPoints.map((point) => [point.day, point]),
    );
    const pairs = despesaPoints
      .map((current) => ({ current, comparison: comparisonByDay.get(current.day) }))
      .filter((pair) => pair.comparison);
    if (pairs.length < 2) return '';
    const forward = pairs.map(({ current }) => `${current.x} ${current.y}`).join(' L ');
    const backward = [...pairs]
      .reverse()
      .map(({ comparison }) => `${comparison.x} ${comparison.y}`)
      .join(' L ');
    return `M ${forward} L ${backward} Z`;
  }, [showComparisonLine, despesaPoints, comparisonDespesaPoints]);

  const receitaAreaPath = useMemo(
    () => buildAreaPath(receitaLinePath, receitaPoints, height - MARGIN.bottom),
    [receitaLinePath, receitaPoints, height],
  );

  const todayX = xScale(todayDay);
  const highlightXStart = showUniHighlight ? xScale(insightHighlight.startDay) : null;
  const highlightXEnd = showUniHighlight ? xScale(insightHighlight.endDay) : null;

  const focusedDataPoint = focusedIndex !== null ? data[focusedIndex] : null;

  const updateFocusFromClientX = useCallback((clientX) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relativeX = clamp(clientX - rect.left, 0, rect.width);
    const svgX = (relativeX / rect.width) * VIEWBOX_WIDTH;
    const index = findNearestIndex(receitaPoints, svgX);
    setFocusedIndex(index);
    setTooltipScreen({
      x: (receitaPoints[index].x / VIEWBOX_WIDTH) * rect.width,
      y: (receitaPoints[index].y / height) * rect.height,
      containerHeight: rect.height,
    });
  }, [receitaPoints, height]);

  const handlePointerDown = (event) => {
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFocusFromClientX(event.clientX);
  };
  const handlePointerMove = (event) => {
    if (activePointerRef.current !== event.pointerId) return;
    updateFocusFromClientX(event.clientX);
  };
  const finishPointerInteraction = (event) => {
    if (activePointerRef.current !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    activePointerRef.current = null;
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setFocusedIndex(null);
      setTooltipScreen(null);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setFocusedIndex((prev) => {
      const base = prev === null ? 0 : prev;
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? data.length - 1
          : event.key === 'ArrowRight'
            ? clamp(base + 1, 0, data.length - 1)
            : clamp(base - 1, 0, data.length - 1);
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        setTooltipScreen({
          x: (receitaPoints[next].x / VIEWBOX_WIDTH) * rect.width,
          y: (receitaPoints[next].y / height) * rect.height,
          containerHeight: rect.height,
        });
      }
      return next;
    });
  };

  const uniMessage = mode === 'uni-insight'
    ? insightHighlight.message
    : mode === 'comparison'
      ? comparisonMeta.message
      : mode === 'forecast'
        ? forecastMeta.message
        : null;

  const uniDetail = mode === 'uni-insight'
    ? insightHighlight.detail
    : mode === 'comparison'
      ? comparisonMeta.detail
      : mode === 'forecast'
        ? forecastMeta.detail
        : null;

  const chartDescription = `Gráfico de receitas e despesas acumuladas de julho de 2026. `
    + `Receitas somam ${formatBRL(data[data.length - 1].receita)} e despesas somam `
    + `${formatBRL(data[data.length - 1].despesa)} até o dia ${todayDay}. `
    + (uniMessage ? `Interpretação da Uni: ${uniMessage}` : 'Sem destaque ativo no momento.');

  return (
    <div
      ref={containerRef}
      className={`${styles.root} ${isDetailed ? styles.rootDetailed : styles.rootCompact} ${className}`}
    >
      {isDetailed ? (
        <div className={styles.toolbar}>
          <div className={styles.periodToggle} role="tablist" aria-label="Selecionar período">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={period === option.value}
                tabIndex={period === option.value ? 0 : -1}
                className={period === option.value ? styles.periodTabActive : styles.periodTab}
                onClick={() => handlePeriodChange(option.value)}
                onKeyDown={(event) => handleTabListKeyDown(
                  event,
                  periodOptions,
                  period,
                  handlePeriodChange,
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatchReceita} aria-hidden="true" />
          Receitas — linha cheia
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatchDespesa} aria-hidden="true" />
          Despesas — linha tracejada
        </span>
      </div>

      {isDetailed ? (
        <div className={styles.modeTabs} role="tablist" aria-label="Selecionar modo de análise">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={mode === option.value}
              tabIndex={mode === option.value ? 0 : -1}
              className={mode === option.value ? styles.modeTabActive : styles.modeTab}
              onClick={() => handleModeChange(option.value)}
              onKeyDown={(event) => handleTabListKeyDown(
                event,
                modeOptions,
                mode,
                handleModeChange,
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.chartWrapper}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
          className={`${styles.svg} ${showUniHighlight ? styles.svgDimmed : ''}`}
          role="img"
          aria-label={chartDescription}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <title>Receitas e despesas — julho de 2026</title>
          <desc>{chartDescription}</desc>

          {showUniHighlight ? (
            <rect
              x={highlightXStart}
              y={MARGIN.top - 4}
              width={highlightXEnd - highlightXStart}
              height={height - MARGIN.bottom - MARGIN.top + 4}
              rx={8}
              className={styles.highlightBand}
            />
          ) : null}

          <path d={receitaAreaPath} className={styles.receitaArea} />

          {showComparisonLine ? (
            <path d={comparisonGapPath} className={styles.comparisonGap} />
          ) : null}
          {showComparisonLine ? (
            <path d={comparisonDespesaPath} className={styles.comparisonLine} />
          ) : null}

          <path
            d={despesaLinePath}
            className={`${styles.despesaLine} ${!reduceMotion ? styles.lineAnimated : ''}`}
          />
          <path
            d={receitaLinePath}
            className={`${styles.receitaLine} ${!reduceMotion ? styles.lineAnimated : ''}`}
          />

          {showForecastLine ? (
            <>
              <path d={forecastReceitaPath} className={styles.forecastReceitaLine} />
              <path d={forecastDespesaPath} className={styles.forecastDespesaLine} />
            </>
          ) : null}

          <line
            x1={todayX}
            x2={todayX}
            y1={MARGIN.top}
            y2={height - MARGIN.bottom}
            className={styles.todayMarker}
          />
          <text x={todayX} y={MARGIN.top - 6} className={styles.todayLabel} textAnchor="middle">
            {showForecastLine ? 'Hoje' : `Dia ${todayDay}`}
          </text>

          {receitaPoints.map((point, index) => (
            <circle
              key={`receita-${point.day}`}
              cx={point.x}
              cy={point.y}
              r={focusedIndex === index ? 5 : 3}
              className={styles.pointReceita}
            />
          ))}
          {despesaPoints.map((point, index) => (
            <rect
              key={`despesa-${point.day}`}
              x={point.x - (focusedIndex === index ? 4 : 2.5)}
              y={point.y - (focusedIndex === index ? 4 : 2.5)}
              width={focusedIndex === index ? 8 : 5}
              height={focusedIndex === index ? 8 : 5}
              className={styles.pointDespesa}
            />
          ))}

          {focusedIndex !== null ? (
            <line
              x1={receitaPoints[focusedIndex].x}
              x2={receitaPoints[focusedIndex].x}
              y1={MARGIN.top}
              y2={height - MARGIN.bottom}
              className={styles.focusMarker}
            />
          ) : null}

          <text x={xScale(data[0].day)} y={height - 8} className={styles.axisLabel} textAnchor="start">
            {data[0].label}
          </text>
          {todayDay !== lastDay ? (
            <text x={todayX} y={height - 8} className={styles.axisLabel} textAnchor="middle">
              {`Dia ${todayDay}`}
            </text>
          ) : null}
          <text
            x={xScale(lastDay)}
            y={height - 8}
            className={styles.axisLabel}
            textAnchor="end"
          >
            {showForecastLine ? forecastData[forecastData.length - 1].label : data[data.length - 1].label}
          </text>

          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={VIEWBOX_WIDTH - MARGIN.left - MARGIN.right}
            height={height - MARGIN.top - MARGIN.bottom}
            className={styles.interactionOverlay}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerInteraction}
            onPointerCancel={finishPointerInteraction}
            onLostPointerCapture={() => { activePointerRef.current = null; }}
          />
        </svg>

        {tooltipScreen && focusedDataPoint ? (
          <CognitiveChartTooltip
            x={tooltipScreen.x}
            y={tooltipScreen.y}
            point={focusedDataPoint}
            containerWidth={containerWidth}
            containerHeight={tooltipScreen.containerHeight}
          />
        ) : null}
      </div>

      {uniMessage ? (
        <UniChartInsight
          message={uniMessage}
          detail={uniDetail}
          variant={variant}
          onListenAnalysis={onListenAnalysis}
          onViewDetails={onViewDetails}
        />
      ) : null}

      {mode === 'comparison' ? (
        <div className={styles.deltaBadge} aria-hidden="true">
          {formatPercent(comparisonMeta.deltaPercent)}
        </div>
      ) : null}
    </div>
  );
}
