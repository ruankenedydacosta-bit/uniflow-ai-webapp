import { useNavigate } from 'react-router-dom';
import { useAccess } from '../../app/AccessContext';
import { WORKSPACE_TYPES } from '../../app/access.js';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import FutureHomePreview from '../../features/future/components/FutureHomePreview/FutureHomePreview';
import { dashboardMock } from './dashboard.mock';
import { MobileHomeView } from './mobile/index.js';
import { useHomeFinancialData } from './mobile/useHomeFinancialData.js';
import { useMobileViewport } from '../../layouts/mobile-app-shell/useMobileViewport.js';
import { useDashboardPersonalization } from './personalization/useDashboardPersonalization';
import PersonalizedWelcome from './personalization/components/PersonalizedWelcome';
import NextBestAction from './personalization/components/NextBestAction';
import ActivationSteps from './personalization/components/ActivationSteps';
import styles from './DashboardPage.module.css';

function getDashboardContext(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL ? dashboardMock.personal : dashboardMock.business;
}

function DashboardPage() {
  const navigate = useNavigate();
  const { access } = useAccess();
  const isMobile = useMobileViewport();
  const dashboard = getDashboardContext(access.currentWorkspace);
  const { summary, recentTransactions, goals, isLoading, error, hasData } = useHomeFinancialData();
  const personalization = useDashboardPersonalization({ summary, recentTransactions, goals, hasData });

  if (isMobile) {
    return (
      <MobileHomeView
        data={{ summary, recentTransactions, goals }}
        personalization={personalization}
        loading={isLoading}
        error={error}
        onNavigate={navigate}
      />
    );
  }

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
              <h3>{dashboard.direction.title}</h3>
            </div>
            <Badge variant={dashboard.direction.variant} size="sm" dot>
              {dashboard.direction.status}
            </Badge>
          </div>

          <strong>{dashboard.direction.message}</strong>

          <div className={styles.directionDetails}>
            <div>
              <span>Previsão</span>
              <strong>{dashboard.direction.forecast}</strong>
            </div>
            <div>
              <span>Principal sinal</span>
              <strong>{dashboard.direction.signal}</strong>
            </div>
            <div>
              <span>Próximo passo</span>
              <strong>{dashboard.direction.nextStep}</strong>
            </div>
          </div>
        </Card>

        <Card variant="outline" padding="lg" className={styles.nextStepCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Seu pr\u00F3ximo passo</h3>
              <p>Uma a\u00E7\u00E3o suficiente para avan\u00E7ar sem aumentar a carga mental.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <NextBestAction action={personalization.nextAction} onNavigate={navigate} />
        </Card>
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

      <section className={styles.attentionSection} aria-labelledby="attention-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="attention-title">O que merece atenção</h3>
            <p>Até três sinais para decidir com clareza, sem transformar a tela em relatório.</p>
          </div>
        </div>

        <div className={styles.signalGrid}>
          {dashboard.attentionSignals.map((signal) => (
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
      </section>

      <section className={styles.clarityGrid} aria-label="Resumo inteligente e leitura da Uni">
        <Card variant="glass" padding="lg" className={styles.summaryCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Resumo inteligente</h3>
              <p>Poucos indicadores para entender a rota sem comparar dezenas de números.</p>
            </div>
          </div>

          <div className={styles.summaryList}>
            {dashboard.smartSummary.map((item) => (
              <div key={item.label} className={styles.summaryItem}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="outline" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>O que os sinais indicam agora.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <p>{dashboard.uniReading}</p>
        </Card>
      </section>

      <FutureHomePreview />

      <section className={styles.shortcutsSection} aria-labelledby="shortcuts-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="shortcuts-title">Atalhos inteligentes</h3>
            <p>Ir direto para o próximo contexto sem encher a tela de comandos.</p>
          </div>
        </div>

        <div className={styles.shortcuts}>
          {dashboard.shortcuts.map((shortcut) => (
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
