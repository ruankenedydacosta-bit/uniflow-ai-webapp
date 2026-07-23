import Card from '../../../../components/ui/Card';
import { SCENARIO_CONFIG } from '../../futureConstants';
import { formatCurrency } from '../../../../utils/formatters';
import { formatSignedCurrency, formatSignedPercent, directionLabel } from './futureComparisonFormatters.js';
import styles from './FutureComparisonCard.module.css';

// Renderiza somente o objeto de comparação já pronto (montado pela camada de
// domínio de futureComparison.js e passado via props). Não calcula nada,
// não acessa dados reais/simulados diretamente — apenas formata o que já
// chegou pronto.
export default function FutureComparisonCard({ comparison }) {
  if (!comparison || !comparison.isComparable) return null;

  const monthText = comparison.selectedHorizon === 1 ? 'mês' : 'meses';

  return (
    <Card variant="glass" padding="lg" className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Real × Simulado</h3>
        <span className={styles.horizon}>Horizonte de {comparison.selectedHorizon} {monthText}</span>
      </div>

      <div className={styles.scenarioList}>
        {comparison.scenarios.map((scenario) => {
          const label = SCENARIO_CONFIG[scenario.id]?.label ?? scenario.id;
          return (
            <div key={scenario.id} className={styles.scenarioRow}>
              <strong className={styles.scenarioName}>{label}</strong>

              <div className={styles.valuesGrid}>
                <div className={styles.valueItem}>
                  <span className={styles.valueLabel}>Real</span>
                  <span className={styles.valueAmount}>{formatCurrency(scenario.finalBalance.real)}</span>
                </div>
                <div className={styles.valueItem}>
                  <span className={styles.valueLabel}>Simulado</span>
                  <span className={styles.valueAmount}>{formatCurrency(scenario.finalBalance.simulated)}</span>
                </div>
                <div className={styles.valueItem}>
                  <span className={styles.valueLabel}>Diferença</span>
                  <span className={styles.valueAmount}>
                    {formatSignedCurrency(scenario.finalBalance.delta)}
                    {scenario.finalBalance.percentDelta !== null
                      ? ` (${formatSignedPercent(scenario.finalBalance.percentDelta)})`
                      : ''}
                  </span>
                </div>
              </div>

              <p className={styles.directionText}>{directionLabel(scenario.finalBalance.direction)}</p>
            </div>
          );
        })}
      </div>

      {comparison.goals.length > 0 && (
        <div className={styles.goalsSection}>
          <h4 className={styles.goalsTitle}>Impacto nas metas</h4>
          <ul className={styles.goalsList}>
            {comparison.goals.map((goal) => (
              <li key={goal.goalId} className={styles.goalItem}>
                <span>{goal.name}</span>
                {goal.estimatedMonths ? (
                  <span>
                    {goal.estimatedMonths.delta === 0
                      ? 'Sem alteração no prazo estimado'
                      : `${goal.estimatedMonths.delta > 0 ? '+' : ''}${goal.estimatedMonths.delta} ${Math.abs(goal.estimatedMonths.delta) === 1 ? 'mês' : 'meses'} no prazo estimado`}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className={styles.disclaimer}>
        Esta comparação usa uma simulação hipotética e não altera seus dados reais.
      </p>
    </Card>
  );
}
