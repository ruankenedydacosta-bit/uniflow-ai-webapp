import { cx } from '../../../../utils/cx';
import { formatCurrency } from '../../../../utils/formatters';
import Badge from '../../../../components/ui/Badge';
import { SCENARIOS, SCENARIO_CONFIG } from '../../futureConstants';
import styles from './FutureScenarios.module.css';

const SCENARIO_ORDER = [SCENARIOS.CONSERVATIVE, SCENARIOS.LIKELY, SCENARIOS.ACCELERATED];

export default function FutureScenarios({
  scenarioProjections,
  selectedScenario,
  onScenarioChange,
  hasData,
  className,
}) {
  if (!hasData) return null;

  return (
    <section aria-labelledby="future-scenarios-title" className={cx(styles.section, className)}>
      <h3 id="future-scenarios-title" className={styles.sectionTitle}>Cenários</h3>
      <p className={styles.sectionDesc}>
        Três cenários para visualizar diferentes possibilidades. Selecione um para detalhar.
      </p>

      <div className={styles.grid}>
        {SCENARIO_ORDER.map((sid) => {
          const config = SCENARIO_CONFIG[sid];
          const projection = scenarioProjections?.[sid];
          if (!config || !projection) return null;

          const isActive = selectedScenario === sid;

          return (
            <button
              key={sid}
              type="button"
              className={cx(
                styles.scenarioBtn,
                isActive && styles.scenarioBtnActive,
                sid === SCENARIOS.LIKELY && styles.scenarioDefault,
              )}
              onClick={() => onScenarioChange(sid)}
              aria-pressed={isActive}
            >
              <div className={styles.scenarioHeader}>
                <Badge
                  variant={isActive ? 'primary' : 'default'}
                  size="sm"
                >
                  {isActive ? 'Selecionado' : 'Selecionar'}
                </Badge>
                <strong className={styles.scenarioName}>{config.label}</strong>
              </div>

              <p className={styles.scenarioDesc}>{config.description}</p>

              <div className={styles.scenarioAdjustments}>
                <div className={styles.adjustmentRow}>
                  <span>Entrada</span>
                  <span className={cx(
                    styles.adjustmentValue,
                    config.incomeAdjustment > 0 && styles.positive,
                    config.incomeAdjustment < 0 && styles.negative,
                  )}>
                    {config.incomeAdjustment > 0 ? '+' : ''}{(config.incomeAdjustment * 100).toFixed(0)}%
                  </span>
                </div>
                <div className={styles.adjustmentRow}>
                  <span>Saídas</span>
                  <span className={cx(
                    styles.adjustmentValue,
                    config.expenseAdjustment < 0 && styles.positive,
                    config.expenseAdjustment > 0 && styles.negative,
                  )}>
                    {config.expenseAdjustment > 0 ? '+' : ''}{(config.expenseAdjustment * 100).toFixed(0)}%
                  </span>
                </div>
                <div className={styles.adjustmentRow}>
                  <span>Contribuição</span>
                  <span className={cx(
                    styles.adjustmentValue,
                    config.contributionAdjustment > 0 && styles.positive,
                    config.contributionAdjustment < 0 && styles.negative,
                  )}>
                    {config.contributionAdjustment > 0 ? '+' : ''}{(config.contributionAdjustment * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className={styles.scenarioResult}>
                <span>Resultado projetado</span>
                <strong className={cx(
                  projection.monthlyResult >= 0 ? styles.positive : styles.negative,
                )}>
                  {formatCurrency(projection.monthlyResult)}/mês
                </strong>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
