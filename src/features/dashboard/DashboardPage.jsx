import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { CognitiveLiveChart } from '../cognitive-live-chart';
import AccountsCarousel from '../../pages/financeiro/mobile/components/AccountsCarousel';
import CategoriesBreakdown from '../../pages/financeiro/mobile/components/CategoriesBreakdown';
import FutureHomePreview from '../../features/future/components/FutureHomePreview/FutureHomePreview';
import { MobileHomeView } from './mobile/index.js';
import { useHomeFinancialData } from './mobile/useHomeFinancialData.js';
import { useMobileViewport } from '../../layouts/mobile-app-shell/useMobileViewport.js';
import { useDashboardPersonalization } from './personalization/useDashboardPersonalization';
import PersonalizedWelcome from './personalization/components/PersonalizedWelcome';
import NextBestAction from './personalization/components/NextBestAction';
import ActivationSteps from './personalization/components/ActivationSteps';
import { useDashboardClarity } from './clarity/useDashboardClarity.js';
import styles from './DashboardPage.module.css';

const DASHBOARD_SHORTCUTS = Object.freeze([
  { label: 'Falar com a Uni', path: '/uni-ai', variant: 'primary' },
  { label: 'Ver Financeiro', path: '/financeiro', variant: 'outline' },
  { label: 'Ver Objetivos', path: '/objetivos', variant: 'outline' },
  { label: 'Ver Visão de Futuro', path: '/futuro', variant: 'outline' },
]);

function DashboardPage() {
  const navigate = useNavigate();
  const isMobile = useMobileViewport();
  const financialData = useHomeFinancialData();
  const { summary, recentTransactions, goals, isLoading, error, hasData, chart, financialPeriod } = financialData;
  const personalization = useDashboardPersonalization({ summary, recentTransactions, goals, hasData });
  const clarity = useDashboardClarity(financialData);
  const personalizedClarity = {
    ...personalization,
    nextAction: clarity.nextAction,
  };

  if (isMobile) {
    return (
      <MobileHomeView
        data={{
          summary,
          recentTransactions,
          goals,
          chart,
          briefing: clarity.mobile.briefing,
          nextStep: clarity.mobile.nextStep,
          insights: clarity.mobile.insights,
          futureData: {
            projections: financialData.projections,
            hasData: financialData.projections.hasHistory,
          },
        }}
        personalization={personalizedClarity}
        loading={isLoading}
        error={error}
        onNavigate={navigate}
      />
    );
  }

  if (isLoading) {
    return <div className={styles.dashboard} aria-busy="true"><Card padding="lg">Carregando sua clareza financeira...</Card></div>;
  }

  if (error) {
    return <div className={styles.dashboard} role="alert"><Card padding="lg">Não foi possível carregar sua clareza financeira agora.</Card></div>;
  }

  const dashboard = clarity;

  return (
    <>
      <div className={styles.dashboard}>
      <section className={styles.hero} aria-labelledby="dashboard-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {personalization.workspaceLabel}
          </Badge>
          <PersonalizedWelcome
            greeting={personalization.greeting}
            workspaceLabel={personalization.workspaceLabel}
          />
        </div>

        <div className={styles.heroActions}>
          <Button onClick={() => navigate('/uni-ai')}>Falar com a Uni</Button>
          <Button variant="outline" onClick={() => navigate('/financeiro')}>
            Ver Financeiro
          </Button>
        </div>
      </section>

      <section className={styles.directionGrid} aria-label="Direção financeira">
        <Card variant="glass" padding="lg" className={styles.directionCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Onde você está indo</span>
              <h3>{dashboard.primarySummary.title}</h3>
            </div>
            <Badge variant={dashboard.primarySummary.variant} size="sm" dot>
              {dashboard.primarySummary.status}
            </Badge>
          </div>

          <strong>{dashboard.primarySummary.message}</strong>

          <div className={styles.directionDetails}>
            <div>
              <span>Previsão</span>
              <strong>{dashboard.primarySummary.forecast}</strong>
            </div>
            <div>
              <span>Principal sinal</span>
              <strong>{dashboard.primarySummary.signal}</strong>
            </div>
          </div>
        </Card>

        <Card variant="outline" padding="lg" className={styles.nextStepCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Seu próximo passo</h3>
              <p>Uma ação suficiente para avançar sem aumentar a carga mental.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <NextBestAction action={clarity.nextAction} onNavigate={navigate} />
        </Card>
      </section>

      {dashboard.signals.length ? <section className={styles.attentionSection} aria-labelledby="attention-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="attention-title">O que merece atenção</h3>
            <p>Até três sinais para decidir com clareza, sem transformar a tela em relatório.</p>
          </div>
        </div>

        <div className={styles.signalGrid}>
          {dashboard.signals.map((signal) => (
            <Card key={signal.title} variant="default" padding="md" className={styles.signalCard}>
              <div className={styles.signalTop}>
                <span className={styles.signalDot} aria-hidden="true" />
                <Badge variant={signal.variant} size="sm">
                  {signal.status}
                </Badge>
              </div>
              <div>
                <h4>{signal.title}</h4>
                <p>{signal.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </section> : null}

      <section className={styles.attentionSection} aria-labelledby="dashboard-summary-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="dashboard-summary-title">Resumo financeiro</h3>
            <p>Os números que já sustentam a leitura de clareza acima, sem recalcular nada.</p>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          {dashboard.primarySummary.metrics.map((metric) => (
            <div key={metric.id} className={styles.summaryMetric}>
              <span>{metric.label}</span>
              <strong>{metric.hasData ? metric.value : 'sem dados ainda'}</strong>
            </div>
          ))}
        </div>
      </section>

      {personalization.showActivation && (
        <ActivationSteps
          steps={personalization.activation.steps}
          completed={personalization.activation.completed}
          total={personalization.activation.total}
          percent={personalization.activation.percent}
          onNavigate={navigate}
        />
      )}

      <section className={styles.attentionSection} aria-labelledby="dashboard-chart-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="dashboard-chart-title">Entradas e Saídas</h3>
            <p>Acompanhe como seu dinheiro está evoluindo.</p>
          </div>
        </div>
        <CognitiveLiveChart
          variant="detailed"
          defaultMode="uni-insight"
          data={chart?.data}
          comparisonData={chart?.comparisonData}
          forecastData={chart?.forecastData}
          todayDay={chart?.todayDay}
          insightHighlight={chart?.insightHighlight}
          comparisonMeta={chart?.comparisonMeta}
          forecastMeta={chart?.forecastMeta}
        />
      </section>

      <div className={styles.accountsBreakdown}>
        <AccountsCarousel
          accounts={financialPeriod.accounts}
          onManage={() => navigate('/financeiro')}
        />
      </div>

      <div className={styles.categoryBreakdown}>
        <CategoriesBreakdown
          categories={financialPeriod.categories}
          onManage={() => navigate('/categorias')}
        />
      </div>

      <FutureHomePreview
        financialData={{
          projections: financialData.projections,
          hasData: financialData.projections.hasHistory,
        }}
      />

      <section className={styles.shortcutsSection} aria-labelledby="shortcuts-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="shortcuts-title">Atalhos inteligentes</h3>
            <p>Ir direto para o próximo contexto sem encher a tela de comandos.</p>
          </div>
        </div>

        <div className={styles.shortcuts}>
          {DASHBOARD_SHORTCUTS.map((shortcut) => (
            <Button
              key={shortcut.path}
              variant={shortcut.variant}
              size="sm"
              onClick={() => navigate(shortcut.path)}
            >
              {shortcut.label}
            </Button>
          ))}
        </div>
      </section>
      </div>
    </>
  );
}

export default DashboardPage;
