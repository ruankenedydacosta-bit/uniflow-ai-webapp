import { useNavigate } from 'react-router-dom';
import Badge from '../../../../components/ui/Badge';
import { formatCurrency, formatDate } from '../../../../utils/formatters';
import { GOAL_FEASIBILITY_LABEL, GOAL_FEASIBILITY_VARIANT } from '../../futureConstants';
import styles from './GoalProjectionBadge.module.css';

export default function GoalProjectionBadge({ projection }) {
  const navigate = useNavigate();

  if (!projection) return null;

  if (projection.status === 'completed') {
    return (
      <div className={styles.banner}>
        <Badge variant="success" size="sm" dot>Concluída</Badge>
      </div>
    );
  }

  const feasibilityLabel = GOAL_FEASIBILITY_LABEL[projection.feasibility] || projection.feasibility;
  const feasibilityVariant = GOAL_FEASIBILITY_VARIANT[projection.feasibility] || 'default';
  const estimatedDate = projection.estimatedDate ? formatDate(projection.estimatedDate) : '—';

  return (
    <div className={styles.banner}>
      <div className={styles.row}>
        <Badge variant={feasibilityVariant} size="sm" dot>
          {feasibilityLabel}
        </Badge>
        {projection.estimatedMonths != null && (
          <span className={styles.estMonth}>
            ~{projection.estimatedMonths} {projection.estimatedMonths === 1 ? 'mês' : 'meses'}
          </span>
        )}
      </div>

      <div className={styles.details}>
        {projection.estimatedDate && (
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Previsão de conclusão</span>
            <strong className={styles.detailValue}>{estimatedDate}</strong>
          </div>
        )}
        {projection.requiredContribution > 0 && (
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Contribuição/mês necessária</span>
            <strong className={styles.detailValue}>{formatCurrency(Math.ceil(projection.requiredContribution))}</strong>
          </div>
        )}
        {projection.currentContribution > 0 && !projection.requiredContribution && (
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Contribuição atual/mês</span>
            <strong className={styles.detailValue}>{formatCurrency(projection.currentContribution)}</strong>
          </div>
        )}
        {projection.differenceMonths != null && (
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Diferença de prazo</span>
            <strong className={styles.detailValue} data-negative={projection.differenceMonths > 0}>
              {projection.differenceMonths > 0 ? `+${projection.differenceMonths}` : projection.differenceMonths} {Math.abs(projection.differenceMonths) === 1 ? 'mês' : 'meses'}
            </strong>
          </div>
        )}
      </div>

      <button
        type="button"
        className={styles.link}
        onClick={() => navigate('/futuro')}
      >
        Ver na Visão de Futuro →
      </button>
    </div>
  );
}
