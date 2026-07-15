import { useState } from 'react';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 156;
const CHART_PADDING = 16;

function buildPoints(values) {
  const usableWidth = CHART_WIDTH - (CHART_PADDING * 2);
  const usableHeight = CHART_HEIGHT - (CHART_PADDING * 2);
  const divisor = Math.max(values.length - 1, 1);

  return values.map((value, index) => {
    const x = CHART_PADDING + ((usableWidth * index) / divisor);
    const y = CHART_HEIGHT - CHART_PADDING - ((usableHeight * value) / 100);
    return `${x},${y}`;
  }).join(' ');
}

function IncomeExpenseChart({ chart }) {
  const lastIndex = Math.max(chart.labels.length - 1, 0);
  const [activeIndex, setActiveIndex] = useState(lastIndex);
  const usableWidth = CHART_WIDTH - (CHART_PADDING * 2);
  const cursorX = CHART_PADDING + ((usableWidth * activeIndex) / Math.max(lastIndex, 1));

  function selectPoint(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1);
    setActiveIndex(Math.round(ratio * lastIndex));
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActiveIndex((value) => Math.max(0, value - 1));
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActiveIndex((value) => Math.min(lastIndex, value + 1));
    }
  }

  return (
    <section className="financeMobileCard financeMobileChart" aria-labelledby="mobile-chart-title">
      <header>
        <div>
          <span>Fluxo do período</span>
          <h2 id="mobile-chart-title">Receitas e despesas</h2>
        </div>
        <small>{chart.labels[activeIndex]}</small>
      </header>
      <div className="financeMobileLegend" aria-hidden="true">
        <span className="income">Receitas</span>
        <span className="expense">Despesas</span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-labelledby="mobile-chart-svg-title mobile-chart-svg-description"
        tabIndex="0"
        onPointerDown={selectPoint}
        onPointerMove={selectPoint}
        onKeyDown={handleKeyDown}
      >
        <title id="mobile-chart-svg-title">Evolução de receitas e despesas</title>
        <desc id="mobile-chart-svg-description">Gráfico interativo com duas séries do período selecionado.</desc>
        <line x1={CHART_PADDING} y1="42" x2={CHART_WIDTH - CHART_PADDING} y2="42" />
        <line x1={CHART_PADDING} y1="92" x2={CHART_WIDTH - CHART_PADDING} y2="92" />
        <line className="cursorLine" x1={cursorX} y1={CHART_PADDING} x2={cursorX} y2={CHART_HEIGHT - CHART_PADDING} />
        <polyline className="incomeLine" points={buildPoints(chart.income)} />
        <polyline className="expenseLine" points={buildPoints(chart.expense)} />
      </svg>
    </section>
  );
}

export default IncomeExpenseChart;
