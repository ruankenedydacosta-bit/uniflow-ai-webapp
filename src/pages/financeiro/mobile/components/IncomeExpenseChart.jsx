import { CognitiveLiveChart } from '../../../../features/cognitive-live-chart';

function hasNoData(data) {
  return data.length < 3 && data.every((point) => point.receita === 0 && point.despesa === 0);
}

function IncomeExpenseChart({ chart }) {
  if (hasNoData(chart.data)) {
    return (
      <section className="financeMobileCognitiveSection" aria-labelledby="mobile-chart-title">
        <header className="financeMobileSectionHeader">
          <div>
            <span>Fluxo do período</span>
            <h2 id="mobile-chart-title">Receitas e despesas</h2>
          </div>
        </header>
        <p className="financeMobileEmptyMessage">
          Nenhum lançamento confirmado neste período para exibir no gráfico.
        </p>
      </section>
    );
  }

  return (
    <section className="financeMobileCognitiveSection" aria-labelledby="mobile-chart-title">
      <header className="financeMobileSectionHeader">
        <div>
          <span>Fluxo do período</span>
          <h2 id="mobile-chart-title">Receitas e despesas</h2>
        </div>
      </header>
      <CognitiveLiveChart
        variant="detailed"
        defaultMode="overview"
        data={chart.data}
        comparisonData={chart.comparisonData}
        forecastData={chart.forecastData}
        todayDay={chart.todayDay}
        insightHighlight={chart.insightHighlight}
        comparisonMeta={chart.comparisonMeta}
        forecastMeta={chart.forecastMeta}
      />
    </section>
  );
}

export default IncomeExpenseChart;
