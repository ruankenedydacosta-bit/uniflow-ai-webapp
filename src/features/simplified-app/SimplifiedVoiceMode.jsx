import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UNI_RING_ORB_STATES, UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import { ChatBubbleIcon, CloseIcon, KeyboardIcon, MicIcon, StopIcon } from './SimplifiedIcons.jsx';
import {
  resolveVoiceModeView,
  VOICE_MODE_ACTION_LABELS,
  VOICE_MODE_ACTIONS,
} from './voiceModeState.js';
import styles from './simplifiedVoiceMode.module.css';

const WAVE_BAR_COUNT = 28;

// Ondas decorativas enquanto a Uni ouve. A altura de cada barra segue uma
// envoltória (mais alta no centro); o ritmo varia por barra para não pulsar
// em bloco.
const WAVE_BARS = Array.from({ length: WAVE_BAR_COUNT }, (_, index) => {
  const envelope = Math.sin((index / (WAVE_BAR_COUNT - 1)) * Math.PI);
  const jitter = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1;
  return Object.freeze({
    height: Math.round(10 + envelope * 38),
    duration: (0.55 + jitter * 0.6).toFixed(2),
    delay: (-jitter).toFixed(2),
    tone: index < WAVE_BAR_COUNT / 3 ? 'blue' : index < (WAVE_BAR_COUNT * 2) / 3 ? 'purple' : 'green',
  });
});

function VoiceWave() {
  return (
    <div className={styles.wave} aria-hidden="true">
      {WAVE_BARS.map((bar, index) => (
        <span
          // A lista é fixa e nunca reordena.
          key={index}
          className={styles.waveBar}
          data-tone={bar.tone}
          style={{
            height: `${bar.height}px`,
            animationDuration: `${bar.duration}s`,
            animationDelay: `${bar.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

const PRIMARY_ICONS = Object.freeze({
  [VOICE_MODE_ACTIONS.START]: MicIcon,
  [VOICE_MODE_ACTIONS.STOP_LISTENING]: StopIcon,
  [VOICE_MODE_ACTIONS.STOP_SPEAKING]: StopIcon,
  [VOICE_MODE_ACTIONS.NONE]: StopIcon,
});

function SimplifiedVoiceMode({
  open,
  interactionState,
  hint,
  response,
  getVoiceStream,
  getVoiceSessionId,
  onAction,
  onClose,
  onWrite,
  onOpenConversation,
}) {
  const titleId = useId();
  const primaryButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const view = resolveVoiceModeView(interactionState);
  const actionCopy = VOICE_MODE_ACTION_LABELS[view.action];
  const PrimaryIcon = PRIMARY_ICONS[view.action];
  const isActionDisabled = view.action === VOICE_MODE_ACTIONS.NONE;
  const isListening = view.action === VOICE_MODE_ACTIONS.STOP_LISTENING;
  const isCompact = Boolean(response) && !isListening && view.orb !== UNI_RING_ORB_STATES.THINKING;

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current?.();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => primaryButtonRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  if (!open) return null;

  function handleAction() {
    if (!isActionDisabled) onAction(view.action);
  }

  return createPortal(
    <div
      className={styles.screen}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-voice-mode
    >
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>Falar com a Uni</h2>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
          <CloseIcon />
        </button>
      </header>

      <div className={styles.stage}>
        <p className={styles.status} data-tone={view.tone} role="status">
          <span className={styles.statusDot} aria-hidden="true" />
          {view.status}
        </p>

        <button
          type="button"
          className={styles.orbButton}
          data-compact={isCompact}
          onClick={handleAction}
          disabled={isActionDisabled}
          aria-label={actionCopy.aria}
          data-uni-voice-control
        >
          <UniRingOrb
            size={isCompact ? 120 : 180}
            state={view.orb}
            getVoiceStream={getVoiceStream}
            getVoiceSessionId={getVoiceSessionId}
          />
        </button>

        {hint ? <p className={styles.hint} data-tone={view.tone}>{hint}</p> : null}
      </div>

      <div className={styles.content}>
        {isListening ? <VoiceWave /> : response}
      </div>

      <footer className={styles.controls}>
        <div className={styles.control}>
          <button type="button" className={styles.secondaryButton} onClick={onWrite} aria-label="Escrever para a Uni">
            <KeyboardIcon />
          </button>
          <span aria-hidden="true">Escrever</span>
        </div>
        <div className={styles.control}>
          <button
            ref={primaryButtonRef}
            type="button"
            className={styles.primaryButton}
            data-action={view.action}
            onClick={handleAction}
            disabled={isActionDisabled}
            aria-label={actionCopy.aria}
            data-uni-voice-control
          >
            <PrimaryIcon />
          </button>
          <span aria-hidden="true">{actionCopy.label}</span>
        </div>
        <div className={styles.control}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onOpenConversation}
            aria-label="Ver a conversa completa"
          >
            <ChatBubbleIcon />
          </button>
          <span aria-hidden="true">Conversa</span>
        </div>
      </footer>
    </div>,
    document.body,
  );
}

export default SimplifiedVoiceMode;
