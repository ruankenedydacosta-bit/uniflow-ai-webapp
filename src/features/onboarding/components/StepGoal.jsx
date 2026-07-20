import { useCallback } from 'react';
import Button from '../../../components/ui/Button';
import { GOAL_OPTIONS } from '../onboardingConstants';
import { cx } from '../../../utils/cx';
import styles from '../OnboardingPage.module.css';

function StepGoal({ value, goalText, onChange, onNext, onPrev }) {
  const handleSelect = useCallback((goalId) => {
    onChange({ goal: goalId, goalText: goalId !== 'outro' ? '' : goalText });
  }, [onChange, goalText]);

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>O que você mais quer conquistar agora?</h2>
        <p className={styles.stepDescription}>
          Escolha o que faz mais sentido para seu momento atual.
        </p>
      </div>

      <div className={styles.goalGrid}>
        {GOAL_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={cx(
              styles.goalOption,
              value === option.id && styles.goalSelected,
            )}
            onClick={() => handleSelect(option.id)}
            aria-pressed={value === option.id}
          >
            <span className={styles.goalLabel}>{option.label}</span>
            {value === option.id && (
              <span className={styles.goalCheck} aria-hidden="true">✓</span>
            )}
          </button>
        ))}
      </div>

      {value === 'outro' && (
        <div className={styles.goalOtherField}>
          <label htmlFor="goal-text" className={styles.fieldLabel}>
            Descreva seu objetivo
          </label>
          <input
            id="goal-text"
            type="text"
            className={styles.textInput}
            placeholder="Ex: Quero juntar para viajar no fim do ano"
            value={goalText}
            onChange={(e) => onChange({ goalText: e.target.value })}
            autoFocus
            maxLength={200}
          />
        </div>
      )}

      <div className={styles.stepActions}>
        <Button variant="ghost" onClick={onPrev}>Voltar</Button>
        <Button variant="primary" onClick={onNext} disabled={!value}>Continuar</Button>
      </div>
    </div>
  );
}

export default StepGoal;
