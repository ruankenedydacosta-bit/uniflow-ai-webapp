import { useCallback } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { TONE_OPTIONS } from '../onboardingConstants';
import { cx } from '../../../utils/cx';
import styles from '../OnboardingPage.module.css';

function StepTone({ value, onChange, onNext, onPrev }) {
  const handleSelect = useCallback((toneId) => {
    onChange({ userTone: toneId });
  }, [onChange]);

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Qual tom você prefere para a Uni?</h2>
        <p className={styles.stepDescription}>
          A comunicação pode se adaptar ao longo do uso,
          mas escolha um estilo inicial.
        </p>
      </div>

      <div className={styles.toneGrid}>
        {TONE_OPTIONS.map((option) => (
          <Card
            key={option.id}
            variant={value === option.id ? 'elevated' : 'default'}
            padding="lg"
            interactive
            className={cx(
              styles.toneCard,
              value === option.id && styles.toneSelected,
            )}
            onClick={() => handleSelect(option.id)}
            aria-pressed={value === option.id}
          >
            <h3 className={styles.toneCardTitle}>{option.title}</h3>
            <p className={styles.toneCardDesc}>{option.description}</p>
          </Card>
        ))}
      </div>

      <div className={styles.stepActions}>
        <Button variant="ghost" onClick={onPrev}>Voltar</Button>
        <Button variant="primary" onClick={onNext} disabled={!value}>Continuar</Button>
      </div>
    </div>
  );
}

export default StepTone;
