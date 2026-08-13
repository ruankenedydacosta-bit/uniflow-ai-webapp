const EMPTY_VALUE = 'sem dados ainda';
const EMPTY_METRICS = Object.freeze([
  { id: 'income', label: 'Entrada', hasData: false },
  { id: 'expense', label: 'Saída', hasData: false },
  { id: 'reserve', label: 'Reserva', hasData: false },
]);

function FinancialSummaryStrip({ metrics = [], onViewAll }) {
  const visibleMetrics = metrics.length ? metrics : EMPTY_METRICS;

  return (
    <section className="homeMobileCard" aria-labelledby="home-mobile-summary-title">
      <div className="homeMobileSectionHeader">
        <h2 id="home-mobile-summary-title">Resumo financeiro</h2>
        <button type="button" className="homeMobileTextAction" onClick={onViewAll}>
          Ver tudo <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="homeMobileSummaryGrid">
        {visibleMetrics.map((metric) => (
          <div className="homeMobileMetric" key={metric.id ?? metric.label}>
            <span>{metric.label}</span>
            <strong className={metric.hasData ? undefined : 'homeMobileEmptyValue'}>
              {metric.hasData ? metric.value : EMPTY_VALUE}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export default FinancialSummaryStrip;
