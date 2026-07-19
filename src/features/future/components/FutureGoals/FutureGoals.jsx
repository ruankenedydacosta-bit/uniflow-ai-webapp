import { cx } from '../../../../utils/cx';
import { formatCurrency, formatDate } from '../../../../utils/formatters';
import Card from '../../../../components/ui/Card';
import Badge from '../../../../components/ui/Badge';
import {
  GOAL_FEASIBILITY_LABEL,
  GOAL_FEASIBILITY_VARIANT,
} from '../../futureConstants';
import styles from './FutureGoals.module.css';

function statusLabel(status) {
  const labels = { active: 'Ativa', paused: 'Pausada', completed: 'Concluída' };
  return labels[status] || status;
}

export default function FutureGoals({
  goalProjections = [],
  hasData,
  className,
}) {
  if (!goalProjections.length) {
    return (
      <section className={cx(styles.section, className)} aria-labelledby="future-goals-title">
        <h3 id="future-goals-title" className={styles.sectionTitle}>Projeção das metas</h3>
        {hasData ? (
          <Card padding="md" className={styles.emptyCard}>
            <p className={styles.emptyText}>Nenhuma meta ativa para projetar.</p>
            <p className={styles.emptyHint}>Crie metas em Objetivos para ver a projeção aqui.</p>
          </Card>
        ) : (
          <Card padding="md" className={styles.emptyCard}>
            <p className={styles.emptyText}>Adicione transações financeiras para projetar suas metas.</p>
          </Card>
        )}
      </section>
    );
  }

  return (
    <section className={cx(styles.section, className)} aria-labelledby="future-goals-title">
      <h3 id="future-goals-title" className={styles.sectionTitle}>Projeção das metas</h3>
      <p className={styles.sectionDesc}>
        Projeção baseada no cenário Provável e na capacidade mensal de contribuição.
      </p>

      <div className={styles.grid}>
        {goalProjections.map((gp) => (
          <Card key={gp.goalId} padding="md" className={styles.goalCard}>
            <div className={styles.goalTop}>
              <strong className={styles.goalName}>{gp.name}</strong>
              <Badge
                variant={GOAL_FEASIBILITY_VARIANT[gp.feasibility] || 'default'}
                size="sm"
                dot
              >
                {GOAL_FEASIBILITY_LABEL[gp.feasibility] || gp.feasibility}
              </Badge>
            </div>

            <div className={styles.goalMeta}>
              <div className={styles.metaRow}>
                <span>Status</span>
                <span>{statusLabel(gp.status)}</span>
              </div>
              <div className={styles.metaRow}>
                <span>Prazo original</span>
                <span>{gp.originalMonths !== null ? `${gp.originalMonths} meses` : 'Sem prazo'}</span>
              </div>
              <div className={styles.metaRow}>
                <span>Prazo estimado</span>
                <span>
                  {gp.estimatedMonths !== null
                    ? `${gp.estimatedMonths} meses${gp.estimatedDate ? ` (${formatDate(gp.estimatedDate)})` : ''}`
                    : '—'}
                </span>
              </div>
              {gp.differenceMonths !== null ? (
                <div className={cx(styles.metaRow, gp.differenceMonths > 0 && styles.metaRowWarning)}>
                  <span>Diferença</span>
                  <span>
                    {gp.differenceMonths > 0
                      ? `+${gp.differenceMonths} meses`
                      : `${gp.differenceMonths} meses`}
                  </span>
                </div>
              ) : null}
              <div className={styles.metaRow}>
                <span>Contribuição atual</span>
                <span>{gp.currentContribution > 0 ? formatCurrency(gp.currentContribution) : '—'}</span>
              </div>
              {gp.requiredContribution > 0 ? (
                <div className={styles.metaRow}>
                  <span>Contribuição necessária</span>
                  <span>{formatCurrency(gp.requiredContribution)}</span>
                </div>
              ) : null}
            </div>

            <div className={styles.suggestedAction}>
              <span className={styles.actionLabel}>Ação sugerida:</span>
              <span>{gp.suggestedAction}</span>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
