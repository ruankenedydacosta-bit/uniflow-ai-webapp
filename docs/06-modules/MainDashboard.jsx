import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDashboardData } from './useDashboardData';
import DashboardGreeting from './DashboardGreeting';
import FinancialSummaryCard from './FinancialSummaryCard';
import GoalsSummaryCard from './GoalsSummaryCard';
import RecentActivityList from './RecentActivityList';
import UniInsightsCard from './UniInsightsCard';
import styles from './DashboardGrid.module.css';

/**
 * MainDashboard — Módulo 05 (Painel de Clareza). "Este substitui o
 * Dashboard tradicional" (docx) — por isso a saudação + CTA para a Uni
 * vêm antes de qualquer número, e "Resumo CRM" não aparece aqui: CRM é
 * um módulo próprio (item 4 do roadmap) sem especificação ainda; incluir
 * um card falso seria inventar produto, não Design System.
 */
export default function MainDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { loading, error, financialSummary, goals, recentActivity, uniInsights } = useDashboardData(user?.id);

  if (error) {
    return (
      <div className="uf-p-xl">
        <p className="uf-text-danger">Não consegui carregar seu painel agora: {error}</p>
      </div>
    );
  }

  return (
    <div className="uf-flex uf-flex-column uf-gap-xl uf-p-xl">
      <DashboardGreeting
        userName={profile?.nome ?? 'você'}
        statusMessage={loading ? null : 'Aqui está o resumo do seu mês.'}
        onTalkToUni={() => navigate('/uni')}
      />

      <div className={styles.grid}>
        <div className={styles.spanFinancial}>
          <FinancialSummaryCard summary={financialSummary} loading={loading} />
        </div>
        <div className={styles.spanGoals}>
          <GoalsSummaryCard goals={goals} loading={loading} />
        </div>
        <div className={styles.spanActivity}>
          <RecentActivityList items={recentActivity} loading={loading} />
        </div>
        <div className={styles.spanInsights}>
          <UniInsightsCard insights={uniInsights} loading={loading} />
        </div>
      </div>
    </div>
  );
}
