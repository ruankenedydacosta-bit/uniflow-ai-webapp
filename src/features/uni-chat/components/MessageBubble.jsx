import UniAvatar from './UniAvatar';
import ActionConfirmation from './ActionConfirmation';
import { VOICE_TTS_STATUS } from '../../uni-voice-tts';
import SafeMarkdown from '../../../components/content/SafeMarkdown.jsx';
import styles from './MessageBubble.module.css';

const VOICE_STATUS_LABELS = Object.freeze({
  [VOICE_TTS_STATUS.LOADING]: 'Gerando voz…',
  [VOICE_TTS_STATUS.PLAYING]: 'Reproduzindo',
  [VOICE_TTS_STATUS.PAUSED]: 'Pausado',
});

// FASE ESTADOS DE PROCESSAMENTO: `displayText` (opcional, default
// message.text) e `processingLabel` (repassado a ActionConfirmation) --
// alimentados por useTextAudioSync/useUniProcessingMessage em
// UniChatPage.jsx. Nenhum dos dois altera message.text em si (o histórico
// persistido continua com o texto completo original).
export default function MessageBubble({
  message,
  onConfirmAction,
  onEditAction,
  onCancelAction,
  isExecuting = false,
  executionError = null,
  voiceEnabled = false,
  voiceStatus = VOICE_TTS_STATUS.IDLE,
  voiceError = null,
  isActiveVoiceMessage = false,
  onSpeakMessage,
  onPauseResumeVoice,
  onStopVoice,
  displayText,
  processingLabel,
}) {
  const isUser = message.from === 'user';
  // HOTFIX continuidade texto/voz: `||` (não `??`) -- em 'pending' (áudio
  // ainda não começou de verdade), o hook devolve displayText='' deliberadamente
  // (nunca revela o texto antes da hora); o chat completo preserva o
  // comportamento anterior de sempre mostrar o texto completo assim que a
  // mensagem é publicada, então uma string vazia também cai no fallback.
  // HOTFIX (abandono da revelação progressiva): não existe mais estado
  // intermediário -- ou o texto está oculto (pending, fallback abaixo) ou
  // está 100% visível de uma vez, nunca parcial.
  const resolvedText = displayText || message.text;

  if (message.type === 'confirmation') {
    return (
      <div className={styles.row}>
        {!isUser && <UniAvatar size="sm" />}
        <div className={styles.stack}>
          {message.text && (
            <div className={`${styles.bubble} ${styles.uni}`}>
              <SafeMarkdown className={styles.text}>{message.text}</SafeMarkdown>
            </div>
          )}
          <ActionConfirmation
            data={message.confirmation}
            onConfirm={() => onConfirmAction?.(message.id)}
            onEdit={() => onEditAction?.(message.id)}
            onCancel={() => onCancelAction?.(message.id)}
            isExecuting={isExecuting}
            executionError={executionError}
            {...(processingLabel ? { processingLabel } : {})}
          />
        </div>
      </div>
    );
  }

  const bubbleClass = [
    styles.bubble,
    isUser ? styles.user : styles.uni,
    message.type === 'alert' ? styles.alert : '',
    message.type === 'suggestion' ? styles.suggestion : '',
  ].join(' ');

  const showSpeak = !isUser && voiceEnabled && typeof onSpeakMessage === 'function' && message.text;
  const activeStatus = isActiveVoiceMessage ? voiceStatus : VOICE_TTS_STATUS.IDLE;
  const isLoadingVoice = activeStatus === VOICE_TTS_STATUS.LOADING;
  const isPlayingVoice = activeStatus === VOICE_TTS_STATUS.PLAYING;
  const isPausedVoice = activeStatus === VOICE_TTS_STATUS.PAUSED;
  const isErrorVoice = activeStatus === VOICE_TTS_STATUS.ERROR;
  const showStopVoice = isPlayingVoice || isPausedVoice;

  function handlePrimaryVoiceClick() {
    if (isLoadingVoice) return;
    if (isPlayingVoice || isPausedVoice) {
      onPauseResumeVoice?.();
      return;
    }
    onSpeakMessage?.(message);
  }

  const primaryVoiceLabel = isLoadingVoice
    ? 'Gerando voz…'
    : isPlayingVoice
      ? 'Pausar leitura da resposta'
      : isPausedVoice
        ? 'Retomar leitura da resposta'
        : isErrorVoice
          ? 'Tentar novamente'
          : 'Ouvir resposta da Uni';

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : ''}`}>
      {!isUser && <UniAvatar size="sm" />}
      <div className={styles.stack}>
        <div className={bubbleClass}>
          {message.type === 'alert' && <span className={styles.badge}>Atenção</span>}
          {message.type === 'suggestion' && <span className={styles.badgeSoft}>Sugestão</span>}
          {isUser ? (
            <p className={styles.text}>
              {renderWithHighlight(message.text, message.highlight)}
            </p>
          ) : (
            <SafeMarkdown className={styles.text}>{resolvedText}</SafeMarkdown>
          )}
        </div>
        <div className={styles.metaRow}>
          {message.time && <span className={styles.time}>{message.time}</span>}
          {showSpeak && (
            <div className={styles.voiceControls}>
              <button
                type="button"
                className={`${styles.speakBtn} ${isPlayingVoice || isPausedVoice ? styles.speakBtnActive : ''}`}
                onClick={handlePrimaryVoiceClick}
                disabled={isLoadingVoice}
                aria-pressed={isPlayingVoice}
                aria-busy={isLoadingVoice}
                aria-label={primaryVoiceLabel}
                title={primaryVoiceLabel}
              >
                {isPlayingVoice ? <PauseIcon /> : isPausedVoice ? <SpeakerIcon /> : <SpeakerIcon />}
                <span>
                  {isLoadingVoice ? 'Gerando…' : isPlayingVoice ? 'Pausar' : isPausedVoice ? 'Retomar' : isErrorVoice ? 'Tentar novamente' : 'Ouvir'}
                </span>
              </button>
              {showStopVoice && (
                <button
                  type="button"
                  className={styles.stopVoiceBtn}
                  onClick={() => onStopVoice?.()}
                  aria-label="Parar leitura da resposta"
                  title="Parar"
                >
                  <StopIcon />
                </button>
              )}
              {(isLoadingVoice || isPlayingVoice || isPausedVoice || isErrorVoice) && (
                <span className={styles.voiceStatus} role="status" aria-live="polite">
                  {isErrorVoice
                    ? (voiceError?.message ?? 'Não foi possível reproduzir esta resposta.')
                    : VOICE_STATUS_LABELS[activeStatus]}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function renderWithHighlight(text, highlight) {
  if (!highlight) return text;
  const parts = text.split(highlight);
  if (parts.length === 1) return text;
  return parts.reduce((acc, part, i) => {
    acc.push(part);
    if (i < parts.length - 1) {
      acc.push(
        <strong key={i} style={{ color: 'var(--uf-color-text-brand)' }}>
          {highlight}
        </strong>
      );
    }
    return acc;
  }, []);
}
