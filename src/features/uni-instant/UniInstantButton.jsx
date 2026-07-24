import { useCallback, useEffect, useState } from 'react';
import UniVoiceWaves from './UniVoiceWaves.jsx';
import usePressAndHold from './usePressAndHold.js';
import { readUniVoiceHintSeen, writeUniVoiceHintSeen } from './uniVoiceHintStorage.js';
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

// Fases em que a dica textual (permanente ou "Ouvindo…") deve aparecer --
// escondida durante transcribing/processing/response/confirmation porque o
// card central (UniInstantResultCard) ja assume a comunicacao nesses estados,
// e durante completed/canceled/error porque sao transicoes rapidas de volta a idle.
const HINT_VISIBLE_PHASES = new Set(['idle', 'pressing', 'listening']);

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
  // Dica de primeiro uso e afforfance permanente sao o MESMO elemento (UX4):
  // enquanto nao descoberta, ganha destaque (pulso) e pode ser dispensada
  // com um toque; uma vez descoberta (long press) ou dispensada, vira o
  // texto discreto permanente "Segure para falar" em repouso. Evita duplicar
  // a mesma informacao em dois lugares da tela.
  const [hintSeen, setHintSeen] = useState(() => readUniVoiceHintSeen());

  const markHintSeen = useCallback(() => {
    setHintSeen((current) => {
      if (current) return current;
      writeUniVoiceHintSeen();
      return true;
    });
  }, []);

  const handleHoldStart = useCallback(() => {
    markHintSeen();
    onHoldStart?.();
  }, [markHintSeen, onHoldStart]);

  const { gestureState, bind } = usePressAndHold({
    onTap,
    onHoldStart: handleHoldStart,
    onHoldEnd,
    onHoldCancel,
    externalRef: buttonRef,
  });
  const phase = gestureState === 'pressing'
    ? 'pressing'
    : gestureState === 'holding' && voiceState === 'idle'
      ? 'listening'
      : voiceState;
  const hintVisible = HINT_VISIBLE_PHASES.has(phase);
  const isListening = phase === 'listening';
  const hintText = isListening ? 'Ouvindo…' : 'Segure para falar';
  const showFirstUseHint = !hintSeen && !isListening;

  return (
    <span className={styles.uniSlot} data-active={active}>
      {showFirstUseHint ? (
        <button
          type="button"
          className={styles.holdHint}
          data-visible={hintVisible}
          data-first-use="true"
          aria-label={`${hintText} Dispensar dica.`}
          onClick={markHintSeen}
        >
          {hintText}
        </button>
      ) : (
        <span
          className={styles.holdHint}
          data-visible={hintVisible}
          aria-hidden={isListening ? undefined : 'true'}
          role={isListening ? 'status' : undefined}
          aria-live={isListening ? 'polite' : undefined}
        >
          {hintText}
        </span>
      )}
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
