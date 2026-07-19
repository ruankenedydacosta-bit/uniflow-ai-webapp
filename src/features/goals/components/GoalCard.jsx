import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import GoalProjectionBadge from '../../future/components/GoalProjectionBadge/GoalProjectionBadge';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { calcProgress, calcRemaining, calcRhythmStatus, getRhythmLabel, getRhythmVariant, calcRequiredMonthlyAmount, calcMonthsUntilTarget } from '../goalCalc';
import styles from './GoalCard.module.css';

const CATEGORY_LABELS = {
  emergency_reserve: 'Reserva de emergência',
  pay_debt: 'Quitar dívida',
  travel: 'Viagem',
  property: 'Imóvel',
  vehicle: 'Veículo',
  investment: 'Investimento',
  education: 'Educação',
  business: 'Empresa',
  other: 'Outra',
};

const STATUS_LABELS = {
  active: 'Ativa',
  paused: 'Pausada',
  completed: 'Concluída',
  canceled: 'Cancelada',
};

const STATUS_VARIANTS = {
  active: 'primary',
  paused: 'warning',
  completed: 'success',
  canceled: 'default',
};

export default function GoalCard({ goal, onEdit, onDelete, onContribute, onPauseResume, onComplete, projection }) {
  const progress = calcProgress(goal.current_amount, goal.target_amount);
  const remaining = calcRemaining(goal.current_amount, goal.target_amount);
  const rhythm = calcRhythmStatus(goal);
  const monthly = calcRequiredMonthlyAmount(goal);
  const monthsLeft = calcMonthsUntilTarget(goal);

  return (
    <Card variant="outline" padding="md" className={styles.card}>
      <div className={styles.top}>
        <div className={styles.topLeft}>
          <span className={styles.category}>{CATEGORY_LABELS[goal.category] || goal.category || 'Sem categoria'}</span>
          <h4 className={styles.name}>{goal.name}</h4>
        </div>
        <Badge variant={STATUS_VARIANTS[goal.status]} size="sm">
          {STATUS_LABELS[goal.status]}
        </Badge>
      </div>

      {goal.description && (
        <p className={styles.description}>{goal.description}</p>
      )}

      <div className={styles.progressSection}>
        <div className={styles.progressHeader}>
          <strong className={styles.amount}>{formatCurrency(goal.current_amount)}</strong>
          <span className={styles.ofTarget}>de {formatCurrency(goal.target_amount)}</span>
          <span className={styles.percent}>{progress}%</span>
        </div>
        <div className={styles.progressTrack} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} className={styles.progressFill} />
        </div>
      </div>

      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Falta</span>
          <strong className={styles.metaValue}>{formatCurrency(remaining)}</strong>
        </div>
        {goal.target_date && (
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Data limite</span>
            <strong className={styles.metaValue}>{formatDate(goal.target_date)}</strong>
          </div>
        )}
        {monthsLeft !== null && monthsLeft > 0 && (
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Previsão</span>
            <strong className={styles.metaValue}>{monthsLeft} {monthsLeft === 1 ? 'mês' : 'meses'}</strong>
          </div>
        )}
        {monthly !== null && monthly > 0 && (
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Mensal necessário</span>
            <strong className={styles.metaValue}>{formatCurrency(Math.ceil(monthly))}</strong>
          </div>
        )}
      </div>

      {rhythm && (
        <Badge variant={getRhythmVariant(rhythm)} size="sm" dot>
          {getRhythmLabel(rhythm)}
        </Badge>
      )}

      {goal.status !== 'canceled' && (
        <GoalProjectionBadge projection={projection} />
      )}

      {goal.status === 'active' && (
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" onClick={() => onContribute(goal)}>Adicionar</Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(goal)}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={() => onPauseResume(goal)}>Pausar</Button>
          <Button size="sm" variant="ghost" onClick={() => onComplete(goal)}>Concluir</Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(goal)}>Excluir</Button>
        </div>
      )}
      {goal.status === 'paused' && (
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" onClick={() => onPauseResume(goal)}>Retomar</Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(goal)}>Editar</Button>
        </div>
      )}
      {goal.status === 'completed' && (
        <div className={styles.actions}>
          {goal.completed_at && (
            <span className={styles.completedDate}>Concluída em {formatDate(goal.completed_at)}</span>
          )}
        </div>
      )}
    </Card>
  );
}
