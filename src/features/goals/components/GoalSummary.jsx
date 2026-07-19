import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import { formatCurrency } from '../../../utils/formatters';
import { calcActiveGoals, calcCompletedGoals, calcTotalPlanned, calcTotalAccumulated, calcOverallProgress, calcLateGoals } from '../goalCalc';
import styles from './GoalSummary.module.css';

export default function GoalSummary({ goals }) {
  const active = calcActiveGoals(goals);
  const completed = calcCompletedGoals(goals);
  const late = calcLateGoals(goals);
  const totalPlanned = calcTotalPlanned(goals);
  const totalAccumulated = calcTotalAccumulated(goals);
  const overallProgress = calcOverallProgress(goals);

  return (
    <Card variant="glass" padding="lg" className={styles.summary}>
      <div className={styles.grid}>
        <div className={styles.item}>
          <span className={styles.label}>Metas ativas</span>
          <strong className={styles.value}>{active.length}</strong>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>Valor total planejado</span>
          <strong className={styles.value}>{formatCurrency(totalPlanned)}</strong>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>Total acumulado</span>
          <strong className={styles.value}>{formatCurrency(totalAccumulated)}</strong>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>Progresso geral</span>
          <div className={styles.progressRow}>
            <div className={styles.progressTrack}>
              <span style={{ width: `${overallProgress}%` }} className={styles.progressFill} />
            </div>
            <strong className={styles.percent}>{overallProgress}%</strong>
          </div>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>Concluídas</span>
          <strong className={styles.value}>{completed.length}</strong>
        </div>
        {late.length > 0 && (
          <div className={styles.item}>
            <span className={styles.label}>Atenção</span>
            <Badge variant="danger" size="sm">{late.length} atrasadas</Badge>
          </div>
        )}
      </div>
    </Card>
  );
}
