import { useCallback } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import { MODE_OPTIONS } from '../onboardingConstants';
import { cx } from '../../../utils/cx';
import styles from '../OnboardingPage.module.css';

function StepMode({ value, onChange, onNext, onPrev }) {
  const handleSelect = useCallback((modeId) => {
    onChange({ mode: modeId });
  }, [onChange]);

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Como você quer usar a UniFlow AI?</h2>
        <p className={styles.stepDescription}>
          Escolha o modo que faz sentido para o seu momento.
          Você pode mudar depois nas configurações.
        </p>
      </div>

      <div className={styles.modeGrid}>
        {MODE_OPTIONS.map((option) => (
          <Card
            key={option.id}
            variant={value === option.id ? 'elevated' : 'default'}
            padding="lg"
            interactive
            className={cx(
              styles.modeCard,
              value === option.id && styles.modeSelected,
            )}
            onClick={() => handleSelect(option.id)}
            aria-pressed={value === option.id}
          >
            <div className={styles.modeCardTop}>
              <Badge variant={value === option.id ? 'primary' : 'outline'} size="sm">
                {option.badge}
              </Badge>
            </div>
            <h3 className={styles.modeCardTitle}>{option.title}</h3>
            <p className={styles.modeCardDesc}>{option.description}</p>
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

export default StepMode;
