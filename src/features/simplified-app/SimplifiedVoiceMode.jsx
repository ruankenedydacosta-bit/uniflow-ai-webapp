import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import {
  PhChatCircleTextIcon,
  PhKeyboardIcon,
  PhMicrophoneIcon,
  PhStopFillIcon,
  PhXIcon,
} from './SimplifiedIcons.jsx';
import {
  resolveVoiceModeStage,
  resolveVoiceModeView,
  VOICE_MODE_ACTION_LABELS,
  VOICE_MODE_ACTIONS,
} from './voiceModeState.js';
import styles from './simplifiedVoiceMode.module.css';

// Tela 03 do handoff: 34 barras de 3px com 4px de intervalo.
const WAVE_BAR_COUNT = 34;

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
    // Mesmos terços do design: 12 azuis, 11 roxas, 11 verdes.
    tone: index < 12 ? 'blue' : index < 23 ? 'purple' : 'green',
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
  [VOICE_MODE_ACTIONS.START]: PhMicrophoneIcon,
  [VOICE_MODE_ACTIONS.STOP_LISTENING]: PhStopFillIcon,
  [VOICE_MODE_ACTIONS.STOP_SPEAKING]: PhStopFillIcon,
  [VOICE_MODE_ACTIONS.END_CONVERSATION]: PhStopFillIcon,
  [VOICE_MODE_ACTIONS.NONE]: PhStopFillIcon,
});

function SimplifiedVoiceMode({
  open,
  interactionState,
  // Na conversa em tempo real, a Home manda a visão pronta
  // (resolveRealtimeVoiceModeView) no lugar do estado da captura antiga.
  view: viewOverride = null,
  hint,
  response,
  // Redesign (épico #91, tela 03): o que a pessoa disse aparece grande sob o
  // orb, com o cursor piscando enquanto ela fala.
  transcript = '',
  isUserSpeaking = false,
  hasReply = false,
  workspaceLabel = 'Pessoal',
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
  const view = viewOverride ?? resolveVoiceModeView(interactionState);
  const actionCopy = VOICE_MODE_ACTION_LABELS[view.action];
  const PrimaryIcon = PRIMARY_ICONS[view.action];
  const isActionDisabled = view.action === VOICE_MODE_ACTIONS.NONE;
  const stage = resolveVoiceModeStage({ view, isUserSpeaking, hasReply });
  const cleanTranscript = String(transcript ?? '').trim();

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
        <h2 id={titleId} className={styles.srOnly}>Falar com a Uni</h2>
        <span className={styles.workspace}>{workspaceLabel}</span>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
          <PhXIcon />
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
          data-compact={stage.compact}
          onClick={handleAction}
          disabled={isActionDisabled}
          aria-label={actionCopy.aria}
          data-uni-voice-control
        >
          <UniRingOrb
            size={stage.compact ? 120 : 180}
            state={view.orb}
            getVoiceStream={getVoiceStream}
            getVoiceSessionId={getVoiceSessionId}
          />
        </button>

        <p className={styles.transcript}>
          {cleanTranscript || isUserSpeaking ? (
            <>
              “{cleanTranscript}
              {isUserSpeaking ? <span className={styles.caret} aria-hidden="true">|</span> : null}
              ”
            </>
          ) : null}
        </p>

        {hint ? <p className={styles.hint} data-tone={view.tone}>{hint}</p> : null}
      </div>

      <div className={styles.content}>
        {stage.showWaves ? <VoiceWave /> : response}
      </div>

      <footer className={styles.controls}>
        <div className={styles.control}>
          <button type="button" className={styles.secondaryButton} onClick={onWrite} aria-label="Escrever para a Uni">
            <PhKeyboardIcon />
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
          <span className={styles.primaryLabel} aria-hidden="true">{actionCopy.label}</span>
        </div>
        <div className={styles.control}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onOpenConversation}
            aria-label="Ver a conversa completa"
          >
            <PhChatCircleTextIcon />
          </button>
          <span aria-hidden="true">Conversa</span>
        </div>
      </footer>
    </div>,
    document.body,
  );
}

export default SimplifiedVoiceMode;
