import styles from './HomeMobile.module.css';
import { CognitiveLiveChart } from '../../cognitive-live-chart';
import { homeMobileMock } from './homeMobile.mock.js';
import FinancialSummaryStrip from './components/FinancialSummaryStrip.jsx';
import GoalsProgressList from './components/GoalsProgressList.jsx';
import HomeSectionSkeleton from './components/HomeSectionSkeleton.jsx';
import HomeEmptyState from './components/HomeEmptyState.jsx';
import InsightCarousel from './components/InsightCarousel.jsx';
import NextStepCard from './components/NextStepCard.jsx';
import QuickActionsGrid from './components/QuickActionsGrid.jsx';
import UniBriefingCard from './components/UniBriefingCard.jsx';

const SKELETON_SECTIONS = Object.freeze([
  ['briefing', 'Carregando briefing da Uni'],
  ['next-step', 'Carregando próximo passo'],
  ['chart', 'Carregando receitas e despesas'],
  ['summary', 'Carregando resumo financeiro'],
  ['recent-transactions', 'Carregando transações recentes'],
  ['goals', 'Carregando objetivos'],
  ['insights', 'Carregando insights'],
  ['actions', 'Carregando atalhos rápidos'],
]);

function MobileHomeView({ data = homeMobileMock, loading = false, error = null, onNavigate }) {
  const viewData = { ...homeMobileMock, ...data };
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
        <UniBriefingCard briefing={viewData.briefing} onAction={() => handleNavigate('/uni-ai')} />
        <NextStepCard step={viewData.nextStep} onAction={() => handleNavigate('/financeiro')} />
        <section className={styles.cognitiveChartSection} aria-labelledby="home-cognitive-chart-title">
          <header className={styles.cognitiveChartHeader}>
            <h2 id="home-cognitive-chart-title">Receitas e Despesas</h2>
            <p>Acompanhe como seu dinheiro está evoluindo.</p>
          </header>
          <CognitiveLiveChart variant="compact" defaultMode="uni-insight" />
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
        <InsightCarousel insights={viewData.insights ?? []} />
        <QuickActionsGrid
          actions={viewData.quickActions ?? homeMobileMock.quickActions}
          onSelect={(action) => handleNavigate(action.path)}
        />
      </div>
    );
  }

  return (
    <div className={styles.home} data-mobile-home>
      <UniBriefingCard briefing={viewData.briefing} onAction={() => handleNavigate('/uni-ai')} />
      <NextStepCard step={viewData.nextStep} onAction={() => handleNavigate('/financeiro')} />
      <section className={styles.cognitiveChartSection} aria-labelledby="home-cognitive-chart-title">
        <header className={styles.cognitiveChartHeader}>
          <h2 id="home-cognitive-chart-title">Receitas e Despesas</h2>
          <p>Acompanhe como seu dinheiro está evoluindo.</p>
        </header>
        <CognitiveLiveChart variant="compact" defaultMode="uni-insight" />
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
            description="Registre sua primeira receita ou despesa para acompanhar seus movimentos."
            actionLabel="Ir para Financeiro"
            onAction={() => handleNavigate('/financeiro')}
            icon="D"
          />
        )}
      </section>
      <GoalsProgressList
        goals={viewData.goals ?? []}
        onViewAll={() => handleNavigate('/objetivos')}
        onCreate={() => handleNavigate('/objetivos')}
      />
      <InsightCarousel insights={viewData.insights ?? []} />
      <QuickActionsGrid
        actions={viewData.quickActions ?? homeMobileMock.quickActions}
        onSelect={(action) => handleNavigate(action.path)}
      />
    </div>
  );
}

export default MobileHomeView;
