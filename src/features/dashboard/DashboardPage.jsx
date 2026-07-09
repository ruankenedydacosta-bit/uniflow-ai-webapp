import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import DashboardGreeting from './components/DashboardGreeting';
import FinancialSummaryCard from './components/FinancialSummaryCard';
import GoalsSummaryCard from './components/GoalsSummaryCard';
import RecentActivityList from './components/RecentActivityList';
import UniInsightsCard from './components/UniInsightsCard';
import { dashboardMock } from './dashboard.mock';
import styles from './DashboardPage.module.css';

function DashboardPage() {
  const { user, financial, goals, insights, activities, nextSteps } = dashboardMock;

  return (
    <div className={styles.dashboard}>
      <DashboardGreeting userName={user.name} status={financial.status} />

      <section className={styles.grid} aria-label="Resumo financeiro">
        <FinancialSummaryCard financial={financial} />
        <GoalsSummaryCard goals={goals} />
        <UniInsightsCard insights={insights} />
        <RecentActivityList activities={activities} />
      </section>

      <Card variant="outline" padding="lg" className={styles.nextStepsCard}>
        <div className="dashboardCardHeader">
          <span>Próximos passos</span>
          <Badge variant="warning">Atenção</Badge>
        </div>

        <div className={styles.nextSteps}>
          {nextSteps.map((step) => (
            <div key={step} className={styles.nextStep}>
              <Badge variant="primary" dot>
                Próximo
              </Badge>
              <span>{step}</span>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <Button>Registrar agora</Button>
          <Button variant="outline">Pedir análise da Uni</Button>
        </div>
      </Card>
    </div>
  );
}

export default DashboardPage;
