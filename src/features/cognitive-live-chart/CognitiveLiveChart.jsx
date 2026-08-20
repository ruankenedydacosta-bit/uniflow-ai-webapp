import {
  useState, useMemo, useRef, useEffect, useCallback, useId,
} from 'react';
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
  hasRealData,
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
  seriesLabels = { receita: 'Entradas', despesa: 'Saídas' },
  emptyState = null,
  className = '',
}) {
  const isDetailed = variant === 'detailed';
  const height = VARIANT_HEIGHT[variant] || VARIANT_HEIGHT.compact;
  // Estado vazio: nenhum lançamento real no período. O gráfico permanece
  // montado (título, legenda, eixos, linha-base) mas nenhuma linha/área/
  // ponto com valor é desenhada — apenas a mensagem e o CTA recebidos via
  // `emptyState`. Nunca inferido internamente a partir de dados fictícios.
  const isEmptyView = Boolean(emptyState) && !hasRealData(data);

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
  const reactId = useId();
  const uid = `ucl-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      // HOME-GRAPH2: só reage quando a largura MUDA de verdade. O
      // ResizeObserver dispara a cada reflow do container (inclusive
      // quando só a ALTURA muda -- ex.: a lista de recentes trocando de
      // aba), e um setState com o mesmo valor ainda re-renderiza o
      // gráfico inteiro.
      const nextWidth = entry.contentRect.width;
      setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
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

  // Zona translúcida de incerteza sob a projeção — reforça que é uma
  // estimativa, não um valor garantido (reaproveita buildAreaPath já usado
  // para a área de receitas, sem novas dependências).
  const forecastUncertaintyPath = useMemo(
    () => (showForecastLine
      ? buildAreaPath(forecastReceitaPath, forecastReceitaPoints, height - MARGIN.bottom)
      : ''),
    [showForecastLine, forecastReceitaPath, forecastReceitaPoints, height],
  );

  const todayPoint = receitaPoints[receitaPoints.length - 1];
  const highlightCoreIndex = showUniHighlight
    ? despesaPoints.findIndex((p) => p.day === insightHighlight.startDay)
    : -1;
  const highlightCorePoint = highlightCoreIndex >= 0 ? despesaPoints[highlightCoreIndex] : null;

  const todayX = xScale(todayDay);
  // HOME-GRAPH2: os rótulos ancorados em `middle` sobre todayX transbordam
  // a viewBox quando "hoje" está perto de uma das pontas (o texto se
  // estende metade para cada lado). Trocar a âncora nas bordas mantém o
  // rótulo inteiro dentro do gráfico em qualquer largura, sem reservar
  // margem extra permanente só por causa dele.
  const todayLabelAnchor = todayX >= VIEWBOX_WIDTH - MARGIN.right - 20
    ? 'end'
    : todayX <= MARGIN.left + 20 ? 'start' : 'middle';
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

  const chartDescription = isEmptyView
    ? `Gráfico de ${seriesLabels.receita.toLowerCase()} e ${seriesLabels.despesa.toLowerCase()} sem lançamentos no período. `
      + `${emptyState.message} ${emptyState.support ?? ''}`.trim()
    : `Gráfico de ${seriesLabels.receita.toLowerCase()} e ${seriesLabels.despesa.toLowerCase()} acumuladas de julho de 2026. `
      + `${seriesLabels.receita} somam ${formatBRL(data[data.length - 1].receita)} e ${seriesLabels.despesa.toLowerCase()} somam `
      + `${formatBRL(data[data.length - 1].despesa)} até o dia ${todayDay}. `
      + (uniMessage ? `Interpretação da Uni: ${uniMessage}` : 'Sem destaque ativo no momento.');

  return (
    <div
      ref={containerRef}
      className={`${styles.root} ${isDetailed ? styles.rootDetailed : styles.rootCompact} ${className}`}
    >
      {isDetailed && !isEmptyView ? (
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
          {seriesLabels.receita} — linha cheia
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatchDespesa} aria-hidden="true" />
          {seriesLabels.despesa} — linha tracejada
        </span>
      </div>

      {isDetailed && !isEmptyView ? (
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
          <title>Entradas e saídas — julho de 2026</title>
          <desc>{chartDescription}</desc>

          <defs>
            <linearGradient id={`${uid}-receita-area-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--uni-green)" stopOpacity="0.32" />
              <stop offset="55%" stopColor="var(--uni-green)" stopOpacity="0.10" />
              <stop offset="100%" stopColor="var(--uni-green)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${uid}-comparison-gap-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--uni-red)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--uni-red)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`${uid}-forecast-uncertainty-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--uni-text-secondary)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--uni-text-secondary)" stopOpacity="0" />
            </linearGradient>
            <radialGradient id={`${uid}-today-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--uni-blue)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--uni-blue)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-highlight-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--uni-purple)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--uni-purple)" stopOpacity="0" />
            </radialGradient>
            <filter id={`${uid}-glow-receita`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" result="blur2" />
              <feMerge>
                <feMergeNode in="blur1" />
                <feMergeNode in="blur2" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`${uid}-glow-despesa`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur1" />
              <feMerge>
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {showUniHighlight && !isEmptyView ? (
            <g className={styles.modeFadeIn}>
              <ellipse
                cx={(highlightXStart + highlightXEnd) / 2}
                cy={(height - MARGIN.bottom + MARGIN.top) / 2}
                rx={(highlightXEnd - highlightXStart) / 1.4}
                ry={(height - MARGIN.bottom - MARGIN.top) / 1.6}
                fill={`url(#${uid}-highlight-glow)`}
                className={!reduceMotion ? styles.highlightGlowPulse : ''}
              />
              <rect
                x={highlightXStart}
                y={MARGIN.top - 4}
                width={highlightXEnd - highlightXStart}
                height={height - MARGIN.bottom - MARGIN.top + 4}
                rx={8}
                className={styles.highlightBand}
              />
            </g>
          ) : null}

          {!isEmptyView ? (
            <path
              d={receitaAreaPath}
              className={`${styles.receitaArea} ${!reduceMotion ? styles.areaAnimated : ''}`}
              style={{ fill: `url(#${uid}-receita-area-grad)` }}
            />
          ) : null}

          {showComparisonLine && !isEmptyView ? (
            <path
              d={comparisonGapPath}
              className={`${styles.comparisonGap} ${styles.modeFadeIn}`}
              style={{ fill: `url(#${uid}-comparison-gap-grad)` }}
            />
          ) : null}
          {showComparisonLine && !isEmptyView ? (
            <path d={comparisonDespesaPath} className={`${styles.comparisonLine} ${styles.modeFadeIn}`} />
          ) : null}

          {showForecastLine && !isEmptyView ? (
            <path
              d={forecastUncertaintyPath}
              className={styles.modeFadeIn}
              style={{ fill: `url(#${uid}-forecast-uncertainty-grad)` }}
            />
          ) : null}

          {!isEmptyView ? (
            <path
              d={despesaLinePath}
              className={`${styles.despesaLine} ${!reduceMotion ? styles.lineAnimated : ''}`}
              style={{ filter: `url(#${uid}-glow-despesa)` }}
            />
          ) : null}
          {!isEmptyView ? (
            <path
              d={receitaLinePath}
              className={`${styles.receitaLine} ${!reduceMotion ? styles.lineAnimated : ''}`}
              style={{ filter: `url(#${uid}-glow-receita)` }}
            />
          ) : null}

          {showForecastLine && !isEmptyView ? (
            <g className={styles.modeFadeIn}>
              <path d={forecastReceitaPath} className={styles.forecastReceitaLine} />
              <path d={forecastDespesaPath} className={styles.forecastDespesaLine} />
            </g>
          ) : null}

          {!isEmptyView ? (
            <>
              <line
                x1={todayX}
                x2={todayX}
                y1={MARGIN.top}
                y2={height - MARGIN.bottom}
                className={styles.todayMarker}
              />
              <text x={todayX} y={MARGIN.top - 6} className={styles.todayLabel} textAnchor={todayLabelAnchor}>
                {showForecastLine ? 'Hoje' : `Dia ${todayDay}`}
              </text>

              {/* Ponto "Hoje" vivo: núcleo sólido + halo translúcido com pulso lento. */}
              <circle
                cx={todayPoint.x}
                cy={todayPoint.y}
                r="11"
                fill={`url(#${uid}-today-glow)`}
                className={!reduceMotion ? styles.todayHaloPulse : ''}
              />
              <circle cx={todayPoint.x} cy={todayPoint.y} r="3.5" className={styles.todayCore} />
            </>
          ) : null}

          {highlightCorePoint && !isEmptyView ? (
            <circle
              cx={highlightCorePoint.x}
              cy={highlightCorePoint.y}
              r="4"
              className={`${styles.highlightCorePoint} ${!reduceMotion ? styles.highlightCorePulse : ''}`}
            />
          ) : null}

          {!isEmptyView ? receitaPoints.map((point, index) => (
            <circle
              key={`receita-${point.day}`}
              cx={point.x}
              cy={point.y}
              r={focusedIndex === index ? 5 : 3}
              className={`${styles.pointReceita} ${!reduceMotion ? styles.pointEnter : ''}`}
              style={!reduceMotion ? { animationDelay: `${300 + index * 45}ms` } : undefined}
            />
          )) : null}
          {!isEmptyView ? despesaPoints.map((point, index) => (
            <rect
              key={`despesa-${point.day}`}
              x={point.x - (focusedIndex === index ? 4 : 2.5)}
              y={point.y - (focusedIndex === index ? 4 : 2.5)}
              width={focusedIndex === index ? 8 : 5}
              height={focusedIndex === index ? 8 : 5}
              className={`${styles.pointDespesa} ${!reduceMotion ? styles.pointEnter : ''}`}
              style={!reduceMotion ? { animationDelay: `${300 + index * 45}ms` } : undefined}
            />
          )) : null}

          {focusedIndex !== null && !isEmptyView ? (
            <line
              x1={receitaPoints[focusedIndex].x}
              x2={receitaPoints[focusedIndex].x}
              y1={MARGIN.top}
              y2={height - MARGIN.bottom}
              className={styles.focusMarker}
            />
          ) : null}

          {isEmptyView ? (
            <line
              x1={MARGIN.left}
              x2={VIEWBOX_WIDTH - MARGIN.right}
              y1={height - MARGIN.bottom}
              y2={height - MARGIN.bottom}
              className={styles.emptyBaseline}
            />
          ) : null}

          <text x={xScale(data[0].day)} y={height - 8} className={styles.axisLabel} textAnchor="start">
            {data[0].label}
          </text>
          {todayDay !== lastDay && !isEmptyView ? (
            <text x={todayX} y={height - 8} className={styles.axisLabel} textAnchor={todayLabelAnchor}>
              {`Dia ${todayDay}`}
            </text>
          ) : null}
          <text
            x={xScale(lastDay)}
            y={height - 8}
            className={styles.axisLabel}
            textAnchor="end"
          >
            {showForecastLine && !isEmptyView ? forecastData[forecastData.length - 1].label : data[data.length - 1].label}
          </text>

          <text
            x={MARGIN.left}
            y={MARGIN.top + 2}
            className={styles.axisLabel}
            textAnchor="start"
          >
            {isEmptyView ? formatBRL(0) : formatBRL(yMax)}
          </text>
          <text
            x={MARGIN.left}
            y={height - MARGIN.bottom - 4}
            className={styles.axisLabel}
            textAnchor="start"
          >
            {formatBRL(0)}
          </text>

          {!isEmptyView ? (
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
          ) : null}
        </svg>

        {tooltipScreen && focusedDataPoint && !isEmptyView ? (
          <CognitiveChartTooltip
            x={tooltipScreen.x}
            y={tooltipScreen.y}
            point={focusedDataPoint}
            seriesLabels={seriesLabels}
            containerWidth={containerWidth}
            containerHeight={tooltipScreen.containerHeight}
          />
        ) : null}

        {isEmptyView ? (
          <div className={styles.emptyOverlay} data-testid="cognitive-chart-empty">
            <p className={styles.emptyOverlayMessage}>{emptyState.message}</p>
            {emptyState.support ? (
              <p className={styles.emptyOverlaySupport}>{emptyState.support}</p>
            ) : null}
            {emptyState.ctaLabel && emptyState.onCtaAction ? (
              <button
                type="button"
                className={styles.emptyOverlayCta}
                onClick={emptyState.onCtaAction}
              >
                {emptyState.ctaLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {uniMessage && !isEmptyView ? (
        <div className={styles.uniInsightEnter} key={mode}>
          <UniChartInsight
            message={uniMessage}
            detail={uniDetail}
            variant={variant}
            onListenAnalysis={onListenAnalysis}
            onViewDetails={onViewDetails}
          />
        </div>
      ) : null}

      {mode === 'comparison' && !isEmptyView ? (
        <div className={`${styles.deltaBadge} ${styles.modeFadeIn}`} aria-hidden="true">
          {formatPercent(comparisonMeta.deltaPercent)}
        </div>
      ) : null}
    </div>
  );
}
