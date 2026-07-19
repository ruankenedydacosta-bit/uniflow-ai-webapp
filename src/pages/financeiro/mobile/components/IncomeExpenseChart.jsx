import { CognitiveLiveChart } from '../../../../features/cognitive-live-chart';

function IncomeExpenseChart({ chart }) {
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
