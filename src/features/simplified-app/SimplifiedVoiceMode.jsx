import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import {
  PhChatCircleTextIcon,
  PhCrownIcon,
  PhKeyboardIcon,
  PhMicrophoneIcon,
  PhMicrophoneSlashIcon,
  PhStopFillIcon,
  PhXIcon,
} from './SimplifiedIcons.jsx';
import {
  resolveVoiceModeStage,
  VOICE_MODE_ACTION_LABELS,
  VOICE_MODE_ACTIONS,
  VOICE_MODE_MUTE_LABELS,
} from './voiceModeState.js';
import { describeVoiceMinutesChip, describeVoiceMinutesOut } from './voiceMinutesPresentation.js';
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
  [VOICE_MODE_ACTIONS.END_CONVERSATION]: PhStopFillIcon,
});

function SimplifiedVoiceMode({
  open,
  // Visão pronta da conversa em tempo real (resolveRealtimeVoiceModeView).
  view,
  hint,
  response,
  // Redesign (épico #91, tela 03): o que a pessoa disse aparece grande sob o
  // orb, com o cursor piscando enquanto ela fala.
  transcript = '',
  isUserSpeaking = false,
  hasReply = false,
  workspaceLabel = 'Pessoal',
  // Tela 19: saldo do mês (resolveVoiceMinutes). Nulo quando não se sabe:
  // a tela fica como antes e o servidor decide. A Home só liga
  // isVoiceMinutesOut sem conversa aberta.
  voiceMinutes = null,
  isVoiceMinutesOut = false,
  // Conversa em tempo real conectada: { isMuted, onToggle }. O botão de
  // mutar ocupa o lugar de Escrever, que leva ao mesmo chat que Conversa.
  microphone = null,
  getVoiceStream,
  onAction,
  onClose,
  onWrite,
  onOpenConversation,
  onOpenPlan,
}) {
  const titleId = useId();
  const primaryButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const actionCopy = VOICE_MODE_ACTION_LABELS[view.action];
  const PrimaryIcon = PRIMARY_ICONS[view.action];
  const stage = resolveVoiceModeStage({ view, isUserSpeaking, hasReply });
  const cleanTranscript = String(transcript ?? '').trim();
  const minutesChip = describeVoiceMinutesChip(voiceMinutes);
  const minutesOut = isVoiceMinutesOut ? describeVoiceMinutesOut(voiceMinutes) : null;
  const isMinutesOut = Boolean(minutesOut);
  const muteCopy = microphone?.isMuted ? VOICE_MODE_MUTE_LABELS.muted : VOICE_MODE_MUTE_LABELS.unmuted;

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

  // Saldo zerado troca o botão central: o foco vai para o botão novo, senão
  // cai no body dentro do diálogo.
  const previousMinutesOutRef = useRef(isMinutesOut);
  useEffect(() => {
    if (previousMinutesOutRef.current === isMinutesOut) return;
    previousMinutesOutRef.current = isMinutesOut;
    if (open) primaryButtonRef.current?.focus();
  }, [isMinutesOut, open]);

  if (!open) return null;

  function handleAction() {
    onAction(view.action);
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
        <div className={styles.headerActions}>
          {minutesChip ? (
            <span className={styles.minutesChip} data-low={minutesChip.isLow} title={minutesChip.title}>
              <PhMicrophoneIcon />
              <span aria-hidden="true">{minutesChip.label}</span>
              <span className={styles.srOnly}>{minutesChip.title}</span>
            </span>
          ) : null}
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
            <PhXIcon />
          </button>
        </div>
      </header>

      {minutesOut ? (
        <div className={styles.stage}>
          <p className={styles.status} data-tone="muted" role="status">
            <span className={styles.statusDot} data-muted="true" aria-hidden="true" />
            {minutesOut.status}
          </p>
          <div className={styles.orbStill} aria-hidden="true">
            <UniRingOrb size={120} state="idle" />
          </div>
          <div className={styles.outCopy}>
            <p className={styles.outTitle}>{minutesOut.title}</p>
            <p className={styles.outBody}>{minutesOut.body}</p>
          </div>
        </div>
      ) : (
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
          aria-label={actionCopy.aria}
          data-uni-voice-control
        >
          <UniRingOrb
            size={stage.compact ? 120 : 180}
            state={view.orb}
            getVoiceStream={getVoiceStream}
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
      )}

      <div className={styles.content}>
        {stage.showWaves && !minutesOut ? <VoiceWave /> : response}
      </div>

      <footer className={styles.controls}>
        {minutesOut ? (
          <div className={styles.control}>
            <button type="button" className={styles.secondaryButton} onClick={onOpenPlan} aria-label="Ver plano">
              <PhCrownIcon />
            </button>
            <span aria-hidden="true">Ver plano</span>
          </div>
        ) : microphone ? (
          <div className={styles.control}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={microphone.onToggle}
              aria-label={muteCopy.aria}
              aria-pressed={microphone.isMuted}
              data-uni-voice-control
            >
              {microphone.isMuted ? <PhMicrophoneSlashIcon /> : <PhMicrophoneIcon />}
            </button>
            <span aria-hidden="true">{muteCopy.label}</span>
          </div>
        ) : (
          <div className={styles.control}>
            <button type="button" className={styles.secondaryButton} onClick={onWrite} aria-label="Escrever para a Uni">
              <PhKeyboardIcon />
            </button>
            <span aria-hidden="true">Escrever</span>
          </div>
        )}
        {/* Sem minutos, Escrever vira a ação principal. */}
        <div className={styles.control}>
          {minutesOut ? (
            <button
              ref={primaryButtonRef}
              type="button"
              className={styles.primaryButton}
              onClick={onWrite}
              aria-label="Escrever para a Uni"
            >
              <PhKeyboardIcon />
            </button>
          ) : (
            <button
              ref={primaryButtonRef}
              type="button"
              className={styles.primaryButton}
              data-action={view.action}
              onClick={handleAction}
              aria-label={actionCopy.aria}
              data-uni-voice-control
            >
              <PrimaryIcon />
            </button>
          )}
          <span className={styles.primaryLabel} aria-hidden="true">{minutesOut ? 'Escrever' : actionCopy.label}</span>
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
