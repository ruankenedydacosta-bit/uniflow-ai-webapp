import { CognitiveLiveChart } from '../../../../features/cognitive-live-chart';
import { WORKSPACE_TYPES } from '../../../../app/access.js';

/**
 * Textos por contexto de workspace (PF/PJ). Apenas linguagem, labels e
 * texto de apoio mudam — o gráfico é o mesmo componente para os dois
 * contextos (`CognitiveLiveChart`), conforme padrão "derive, don't
 * duplicate" já usado no restante do módulo Financeiro.
 */
const COPY_BY_WORKSPACE = {
  [WORKSPACE_TYPES.BUSINESS]: {
    eyebrow: 'Fluxo do período',
    title: 'Entradas e saídas',
    seriesLabels: { receita: 'Entradas', despesa: 'Saídas' },
    emptyMessage: 'Ainda não há movimentações neste período.',
    emptySupport: 'Registre uma entrada ou saída para acompanhar a evolução do caixa.',
    ctaLabel: 'Registrar movimentação',
  },
  [WORKSPACE_TYPES.PERSONAL]: {
    eyebrow: 'Movimentação do período',
    title: 'Entradas e gastos',
    seriesLabels: { receita: 'Entradas', despesa: 'Gastos' },
    emptyMessage: 'Ainda não há movimentações neste período.',
    emptySupport: 'Registre uma entrada ou gasto para acompanhar a evolução do seu saldo.',
    ctaLabel: 'Registrar movimentação',
  },
};

function getCopy(workspace) {
  return COPY_BY_WORKSPACE[workspace] ?? COPY_BY_WORKSPACE[WORKSPACE_TYPES.PERSONAL];
}

function IncomeExpenseChart({ chart, workspace = WORKSPACE_TYPES.PERSONAL, onRegisterMovement }) {
  const copy = getCopy(workspace);

  return (
    <section className="financeMobileCognitiveSection" aria-labelledby="mobile-chart-title">
      <header className="financeMobileSectionHeader">
        <div>
          <span>{copy.eyebrow}</span>
          <h2 id="mobile-chart-title">{copy.title}</h2>
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
        seriesLabels={copy.seriesLabels}
        emptyState={{
          message: copy.emptyMessage,
          support: copy.emptySupport,
          ctaLabel: copy.ctaLabel,
          onCtaAction: onRegisterMovement,
        }}
      />
    </section>
  );
}

export default IncomeExpenseChart;
