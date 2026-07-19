import { cx } from '../../../../utils/cx';
import Badge from '../../../../components/ui/Badge';
import { HORIZONS } from '../../futureConstants';
import styles from './FutureHeader.module.css';

function getWorkspaceLabel(currentWorkspace) {
  return currentWorkspace === 'personal' ? 'Pessoal' : 'Empresarial';
}

export default function FutureHeader({
  currentWorkspace,
  selectedHorizon,
  onHorizonChange,
  className,
}) {
  return (
    <header className={cx(styles.header, className)}>
      <div className={styles.copy}>
        <Badge variant="secondary" dot>
          {getWorkspaceLabel(currentWorkspace)}
        </Badge>
        <h2>Visão de Futuro</h2>
        <p className={styles.subtitle}>
          Projeções financeiras baseadas no seu histórico real de receitas e despesas
        </p>
      </div>

      <div className={styles.horizonSelector} role="tablist" aria-label="Selecionar horizonte">
        {HORIZONS.map((months) => (
          <button
            key={months}
            type="button"
            role="tab"
            aria-selected={selectedHorizon === months}
            tabIndex={selectedHorizon === months ? 0 : -1}
            className={cx(
              styles.horizonTab,
              selectedHorizon === months && styles.horizonTabActive,
            )}
            onClick={() => onHorizonChange(months)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const idx = HORIZONS.indexOf(months);
                const next = e.key === 'ArrowRight'
                  ? (idx + 1) % HORIZONS.length
                  : (idx - 1 + HORIZONS.length) % HORIZONS.length;
                onHorizonChange(HORIZONS[next]);
              }
            }}
          >
            {months === 3 ? '3 meses' : months === 6 ? '6 meses' : '12 meses'}
          </button>
        ))}
      </div>
    </header>
  );
}
