import styles from './HomeMobile.module.css';
import { CognitiveLiveChart } from '../../cognitive-live-chart';
// Fallback exclusivo de dev/teste (Storybook, testes de unidade) quando nenhum `data`
// real é injetado. Em produção, DashboardPage sempre injeta `data` completo a partir
// de dados reais (useHomeFinancialData/useDashboardClarity) — o mock nunca é mesclado
// com dados financeiros reais.
import { homeMobileMock } from './homeMobile.mock.js';
import FutureHomePreview from '../../future/components/FutureHomePreview/FutureHomePreview';
import FinancialSummaryStrip from './components/FinancialSummaryStrip.jsx';
import GoalsProgressList from './components/GoalsProgressList.jsx';
import HomeSectionSkeleton from './components/HomeSectionSkeleton.jsx';
import HomeEmptyState from './components/HomeEmptyState.jsx';
import InsightCarousel from './components/InsightCarousel.jsx';
import NextStepCard from './components/NextStepCard.jsx';
import QuickActionsGrid from './components/QuickActionsGrid.jsx';
import UniBriefingCard from './components/UniBriefingCard.jsx';
import PersonalizedWelcome from '../personalization/components/PersonalizedWelcome';
import NextBestAction from '../personalization/components/NextBestAction';
import ActivationSteps from '../personalization/components/ActivationSteps';
import Badge from '../../../components/ui/Badge';
import { OpenFinanceConnectionAnimation } from '../../open-finance-animation';
import { useTheme } from '../../theme';

const SKELETON_SECTIONS = Object.freeze([
  ['briefing', 'Carregando briefing da Uni'],
  ['next-step', 'Carregando próximo passo'],
  ['chart', 'Carregando entradas e saídas'],
  ['summary', 'Carregando resumo financeiro'],
  ['recent-transactions', 'Carregando transações recentes'],
  ['goals', 'Carregando objetivos'],
  ['insights', 'Carregando insights'],
  ['actions', 'Carregando atalhos rápidos'],
]);

function MobileHomeView({ data, personalization = null, loading = false, error = null, onNavigate }) {
  const { effectiveTheme } = useTheme();
  const viewData = data ?? homeMobileMock;
  const handleNavigate = (destination) => {
    if (typeof destination === 'string') onNavigate?.(destination);
  };

  if (loading) {
    return (
      <div className={styles.home} data-mobile-home data-loading="true">
        {SKELETON_SECTIONS.map(([variant, label]) => (
          <HomeSectionSkeleton key={variant} variant={variant} label={label} />
        ))}
      </div>
    );
  }

  if (error && !loading) {
    return (
      <div className={styles.home} data-mobile-home data-error="true">
        <UniBriefingCard briefing={viewData.briefing} onAction={() => handleNavigate(viewData.briefing?.href ?? '/financeiro')} />
        <NextStepCard step={viewData.nextStep} onAction={() => handleNavigate(viewData.nextStep?.href ?? '/financeiro')} />
        <section className={styles.cognitiveChartSection} aria-labelledby="home-cognitive-chart-title">
          <header className={styles.cognitiveChartHeader}>
            <h2 id="home-cognitive-chart-title">Entradas e Saídas</h2>
            <p>Acompanhe como seu dinheiro está evoluindo.</p>
          </header>
          <CognitiveLiveChart
            variant="compact"
            defaultMode="uni-insight"
            data={viewData.chart?.data}
            comparisonData={viewData.chart?.comparisonData}
            forecastData={viewData.chart?.forecastData}
            todayDay={viewData.chart?.todayDay}
            insightHighlight={viewData.chart?.insightHighlight}
            comparisonMeta={viewData.chart?.comparisonMeta}
            forecastMeta={viewData.chart?.forecastMeta}
          />
        </section>
        <section className="homeMobileCard" aria-labelledby="home-mobile-error-title">
          <div className="homeMobileSectionHeader">
            <h2 id="home-mobile-error-title">Resumo financeiro</h2>
          </div>
          <p>Não foi possível carregar os dados financeiros. Tente novamente mais tarde.</p>
        </section>
        <section className="homeMobileCard" aria-labelledby="home-recent-transactions-title">
          <header className="homeMobileSectionHeader">
            <h2 id="home-recent-transactions-title">Transações Recentes</h2>
          </header>
          {viewData.recentTransactions?.length > 0 ? (
            <ul className="homeMobileTransactionList">
              {viewData.recentTransactions.map((tx) => (
                <li
                  key={tx.id}
                  className="homeMobileTransactionItem"
                  onClick={() => handleNavigate('/financeiro')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavigate('/financeiro'); }}
                >
                  <div className="homeMobileTransactionInfo">
                    <strong>{tx.description}</strong>
                    <span>{tx.category} · {tx.date}</span>
                  </div>
                  <strong
                    className="homeMobileTransactionValue"
                    data-tone={tx.tone}
                  >
                    {tx.amount}
                  </strong>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <GoalsProgressList
          goals={viewData.goals ?? []}
          onViewAll={() => handleNavigate('/objetivos')}
          onCreate={() => handleNavigate('/objetivos')}
        />
        <InsightCarousel insights={viewData.insights ?? []} onSelect={(insight) => handleNavigate(insight.href)} />
        <QuickActionsGrid
          actions={viewData.quickActions ?? homeMobileMock.quickActions}
          onSelect={(action) => handleNavigate(action.path)}
        />
      </div>
    );
  }

  return (
    <div className={styles.home} data-mobile-home>
      {personalization && (
        <section className="homeMobileCard" aria-label="Saudação">
          <PersonalizedWelcome
            greeting={personalization.greeting}
            workspaceLabel={personalization.workspaceLabel}
            variant="mobile"
          />
        </section>
      )}
      <UniBriefingCard briefing={viewData.briefing} onAction={() => handleNavigate(viewData.briefing?.href ?? '/financeiro')} />
      {personalization ? (
        <section className="homeMobileCard homeMobileNextStep" aria-label="Próximo passo">
          <span className="homeMobileSectionLabel">Próximo passo</span>
          <NextBestAction action={personalization.nextAction} onNavigate={handleNavigate} variant="mobile" />
        </section>
      ) : (
        <NextStepCard step={viewData.nextStep} onAction={() => handleNavigate('/financeiro')} />
      )}
      {personalization?.showActivation && (
        <ActivationSteps
          steps={personalization.activation.steps}
          completed={personalization.activation.completed}
          total={personalization.activation.total}
          percent={personalization.activation.percent}
          onNavigate={handleNavigate}
          variant="mobile"
        />
      )}
      <section className={styles.cognitiveChartSection} aria-labelledby="home-cognitive-chart-title">
        <header className={styles.cognitiveChartHeader}>
          <h2 id="home-cognitive-chart-title">Entradas e Saídas</h2>
          <p>Acompanhe como seu dinheiro está evoluindo.</p>
        </header>
        <CognitiveLiveChart
          variant="compact"
          defaultMode="uni-insight"
          data={viewData.chart?.data}
          comparisonData={viewData.chart?.comparisonData}
          forecastData={viewData.chart?.forecastData}
          todayDay={viewData.chart?.todayDay}
          insightHighlight={viewData.chart?.insightHighlight}
          comparisonMeta={viewData.chart?.comparisonMeta}
          forecastMeta={viewData.chart?.forecastMeta}
        />
      </section>
      <FinancialSummaryStrip
        metrics={viewData.summary ?? []}
        onViewAll={() => handleNavigate('/financeiro')}
      />
      <section className="homeMobileCard" aria-labelledby="home-recent-transactions-title">
        <header className="homeMobileSectionHeader">
          <h2 id="home-recent-transactions-title">Transações Recentes</h2>
        </header>
        {viewData.recentTransactions?.length > 0 ? (
          <ul className="homeMobileTransactionList">
            {viewData.recentTransactions.map((tx) => (
              <li
                key={tx.id}
                className="homeMobileTransactionItem"
                onClick={() => handleNavigate('/financeiro')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavigate('/financeiro'); }}
              >
                <div className="homeMobileTransactionInfo">
                  <strong>{tx.description}</strong>
                  <span>{tx.category} · {tx.date}</span>
                </div>
                <strong
                  className="homeMobileTransactionValue"
                  data-tone={tx.tone}
                >
                  {tx.amount}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <HomeEmptyState
            title="Nenhuma transação recente"
            description="Registre sua primeira entrada ou saída para acompanhar seus movimentos."
            actionLabel="Ir para Financeiro"
            onAction={() => handleNavigate('/financeiro')}
            icon="D"
          />
        )}
      </section>
      <section className="homeMobileCard" aria-labelledby="home-open-finance-title" data-open-finance-demo="true">
        <header className="homeMobileSectionHeader">
          <h2 id="home-open-finance-title">Open Finance</h2>
          <Badge variant="secondary" dot>
            Em breve
          </Badge>
        </header>
        <OpenFinanceConnectionAnimation
          variant="compact"
          theme={effectiveTheme}
          autoPlay
          onLearnMore={() => handleNavigate('/open-finance')}
        />
        <p>
          Demonstração ilustrativa da futura integração Open Finance. Ainda não há
          conexão bancária real, coleta de credenciais ou dados da sua conta.
        </p>
      </section>
      <GoalsProgressList
        goals={viewData.goals ?? []}
        onViewAll={() => handleNavigate('/objetivos')}
        onCreate={() => handleNavigate('/objetivos')}
      />
      <FutureHomePreview financialData={viewData.futureData ?? null} />
      <InsightCarousel insights={viewData.insights ?? []} onSelect={(insight) => handleNavigate(insight.href)} />
      <QuickActionsGrid
        actions={viewData.quickActions ?? homeMobileMock.quickActions}
        onSelect={(action) => handleNavigate(action.path)}
      />
    </div>
  );
}

export default MobileHomeView;
