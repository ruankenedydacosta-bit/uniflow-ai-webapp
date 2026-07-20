import Card from '../../../../../components/ui/Card/Card.jsx';
import Button from '../../../../../components/ui/Button/Button.jsx';
import styles from './ActivationSteps.module.css';

function ActivationSteps({ steps, completed, total, percent, onNavigate, variant = 'desktop' }) {
  if (!steps || steps.length === 0) return null;

  if (variant === 'mobile') {
    return (
      <section className="homeMobileCard" aria-label="Passos de ativação">
        <div className={styles.mobileHeader}>
          <span className="homeMobileSectionLabel">Complete seu espaço</span>
          <span className={styles.mobileProgressText}>{completed} de {total}</span>
        </div>
        <div className={styles.mobileProgressBarContainer}>
          <div
            className={styles.mobileProgressBar}
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin="0"
            aria-valuemax="100"
          />
        </div>
        <ul className={styles.mobileStepList}>
          {steps.map((step) => (
            <li key={step.key} className={styles.mobileStepItem} data-completed={step.completed}>
              <div className={styles.mobileStepIndicator}>
                {step.completed ? (
                  <span className={styles.mobileCheck} aria-hidden="true">✓</span>
                ) : (
                  <span className={styles.mobileBullet} aria-hidden="true" />
                )}
              </div>
              <div className={styles.mobileStepContent}>
                <strong className={styles.mobileStepTitle}>{step.title}</strong>
                <p className={styles.mobileStepDesc}>{step.description}</p>
                {!step.completed && step.href && (
                  <button
                    type="button"
                    className={styles.mobileStepCta}
                    onClick={() => onNavigate?.(step.href)}
                  >
                    {step.cta}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <Card variant="outline" padding="lg" className={styles.desktopCard}>
      <div className={styles.desktopHeader}>
        <div>
          <h3 className={styles.desktopTitle}>Primeiros passos</h3>
          <p className={styles.desktopSubtitle}>Complete as ações básicas para ativar o poder total da UniFlow.</p>
        </div>
        <div className={styles.desktopProgressInfo}>
          <span className={styles.desktopProgressLabel}>{completed} de {total} concluídos</span>
          <div className={styles.desktopProgressBarContainer}>
            <div
              className={styles.desktopProgressBar}
              style={{ width: `${percent}%` }}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin="0"
              aria-valuemax="100"
            />
          </div>
        </div>
      </div>

      <div className={styles.desktopStepGrid}>
        {steps.map((step) => (
          <div key={step.key} className={styles.desktopStepCard} data-completed={step.completed}>
            <div className={styles.desktopStepTop}>
              <span className={step.completed ? styles.desktopCheckActive : styles.desktopCheckInactive}>
                {step.completed ? '✓' : '○'}
              </span>
              <strong className={styles.desktopStepTitle}>{step.title}</strong>
            </div>
            <p className={styles.desktopStepDesc}>{step.description}</p>
            <div className={styles.desktopStepActions}>
              {!step.completed && step.href ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onNavigate?.(step.href)}
                >
                  {step.cta}
                </Button>
              ) : (
                <span className={styles.desktopCompletedBadge}>Concluído</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default ActivationSteps;
