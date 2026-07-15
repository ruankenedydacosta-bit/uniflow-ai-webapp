import styles from './HomeMobile.module.css';
import { CognitiveLiveChart } from '../../cognitive-live-chart';
import { homeMobileMock } from './homeMobile.mock.js';
import FinancialSummaryStrip from './components/FinancialSummaryStrip.jsx';
import GoalsProgressList from './components/GoalsProgressList.jsx';
import HomeSectionSkeleton from './components/HomeSectionSkeleton.jsx';
import InsightCarousel from './components/InsightCarousel.jsx';
import NextStepCard from './components/NextStepCard.jsx';
import QuickActionsGrid from './components/QuickActionsGrid.jsx';
import UniBriefingCard from './components/UniBriefingCard.jsx';

const SKELETON_SECTIONS = Object.freeze([
  ['briefing', 'Carregando briefing da Uni'],
  ['next-step', 'Carregando próximo passo'],
  ['chart', 'Carregando receitas e despesas'],
  ['summary', 'Carregando resumo financeiro'],
  ['goals', 'Carregando objetivos'],
  ['insights', 'Carregando insights'],
  ['actions', 'Carregando atalhos rápidos'],
]);

function MobileHomeView({ data = homeMobileMock, loading = false, onNavigate }) {
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
