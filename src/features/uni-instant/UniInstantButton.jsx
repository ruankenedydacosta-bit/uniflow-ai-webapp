import { useEffect, useState } from 'react';
import UniVoiceWaves from './UniVoiceWaves.jsx';
import usePressAndHold from './usePressAndHold.js';
import styles from './UniInstantButton.module.css';

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setReducedMotion(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
}

export default function UniInstantButton({
  label = 'Uni',
  'aria-label': ariaLabel = 'Uni. Toque para abrir. Toque e segure para falar.',
  active = false,
  voiceState = 'idle',
  buttonRef,
  onTap,
  onHoldStart,
  onHoldEnd,
  onHoldCancel,
}) {
  const reducedMotion = useReducedMotion();
  const { gestureState, bind } = usePressAndHold({
    onTap,
    onHoldStart,
    onHoldEnd,
    onHoldCancel,
    externalRef: buttonRef,
  });
  const phase = gestureState === 'pressing'
    ? 'pressing'
    : gestureState === 'holding' && voiceState === 'idle'
      ? 'listening'
      : voiceState;

  return (
    <span className={styles.uniSlot} data-active={active}>
      <span className={styles.holdHint} data-visible={gestureState === 'pressing'}>
        Segure para falar
      </span>
      <UniVoiceWaves
        active={gestureState === 'holding' || voiceState !== 'idle'}
        reducedMotion={reducedMotion}
        phase={phase}
      />
      <button
        {...bind}
        type="button"
        className={styles.uniButton}
        data-gesture={gestureState}
        aria-label={ariaLabel}
      >
        Uni
      </button>
      <span className={styles.uniLabel}>{label}</span>
    </span>
  );
}
