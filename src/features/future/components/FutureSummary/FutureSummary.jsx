import { formatCurrency } from '../../../../utils/formatters';
import Card from '../../../../components/ui/Card';
import Badge from '../../../../components/ui/Badge';

import styles from './FutureSummary.module.css';

function SummaryCard({ label, value, variant = 'default', disclaimer }) {
  return (
    <Card variant={variant} padding="md" className={styles.summaryCard}>
      <span className={styles.summaryLabel}>{label}</span>
      <strong className={styles.summaryValue}>{value}</strong>
      {disclaimer ? (
        <span className={styles.disclaimer}>{disclaimer}</span>
      ) : null}
    </Card>
  );
}

export default function FutureSummary({
  scenarioProjection,
  goalSummary,
  hasData,
}) {
  if (!hasData || !scenarioProjection) return null;

  const { projectedBalance, monthlyResult, hasData: hasProjection } = scenarioProjection;

  if (!hasProjection) return null;

  const savingsCapacity = monthlyResult > 0 ? monthlyResult * 0.5 : 0;

  return (
    <section aria-labelledby="future-summary-title">
      <h3 id="future-summary-title" className={styles.sectionTitle}>
        Resumo projetado
      </h3>
      <div className={styles.grid}>
        <SummaryCard
          label="Saldo futuro"
          value={formatCurrency(projectedBalance)}
          variant={projectedBalance >= 0 ? 'default' : 'glass'}
          disclaimer="Saldo projetado ao final do período"
        />
        <SummaryCard
          label="Resultado mensal"
          value={formatCurrency(monthlyResult)}
          variant={monthlyResult >= 0 ? 'default' : 'glass'}
          disclaimer={monthlyResult < 0 ? 'Despesas superam receitas' : 'Margem mensal projetada'}
        />
        <SummaryCard
          label="Capacidade de poupança"
          value={formatCurrency(Math.max(0, savingsCapacity))}
          disclaimer="Até 50% do resultado mensal"
        />
        {goalSummary ? (
          <Card padding="md" className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Metas</span>
            <div className={styles.goalCounts}>
              <Badge variant="success" size="sm" dot>
                {goalSummary.viable} viáveis
              </Badge>
              {goalSummary.attention > 0 ? (
                <Badge variant="warning" size="sm" dot>
                  {goalSummary.attention} atenção
                </Badge>
              ) : null}
              {goalSummary.unviable > 0 ? (
                <Badge variant="danger" size="sm" dot>
                  {goalSummary.unviable} inviáveis
                </Badge>
              ) : null}
            </div>
            <span className={styles.disclaimer}>({goalSummary.total} meta{goalSummary.total !== 1 ? 's' : ''} ativa{goalSummary.total !== 1 ? 's' : ''})</span>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
