import { cx } from '../../../utils/cx';
import { ONBOARDING_STEPS } from '../onboardingConstants';
import styles from '../OnboardingPage.module.css';

function StepProgress({ currentStep }) {
  return (
    <nav className={styles.progress} aria-label="Progresso do onboarding">
      {ONBOARDING_STEPS.map((s) => {
        const isCompleted = s.step < currentStep;
        const isCurrent = s.step === currentStep;

        return (
          <div
            key={s.step}
            className={cx(
              styles.progressStep,
              isCompleted && styles.progressCompleted,
              isCurrent && styles.progressCurrent,
            )}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className={styles.progressDot} aria-hidden="true" />
            <span className={styles.progressLabel}>{s.label}</span>
          </div>
        );
      })}
    </nav>
  );
}

export default StepProgress;
