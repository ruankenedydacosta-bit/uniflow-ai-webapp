import UniAvatar from './UniAvatar';
import ActionConfirmation from './ActionConfirmation';
import styles from './MessageBubble.module.css';

export default function MessageBubble({
  message,
  onConfirmAction,
  onEditAction,
  onCancelAction,
  isExecuting = false,
  executionError = null,
  onSpeak,
  isSpeaking = false,
  canSpeak = false,
}) {
  const isUser = message.from === 'user';

  if (message.type === 'confirmation') {
    return (
      <div className={styles.row}>
        {!isUser && <UniAvatar size="sm" />}
        <div className={styles.stack}>
          {message.text && (
            <div className={`${styles.bubble} ${styles.uni}`}>
              <p className={styles.text}>{message.text}</p>
            </div>
          )}
          <ActionConfirmation
            data={message.confirmation}
            onConfirm={() => onConfirmAction?.(message.id)}
            onEdit={() => onEditAction?.(message.id)}
            onCancel={() => onCancelAction?.(message.id)}
            isExecuting={isExecuting}
            executionError={executionError}
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

  const showSpeak = !isUser && canSpeak && typeof onSpeak === 'function' && message.text;

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : ''}`}>
      {!isUser && <UniAvatar size="sm" />}
      <div className={styles.stack}>
        <div className={bubbleClass}>
          {message.type === 'alert' && <span className={styles.badge}>Atenção</span>}
          {message.type === 'suggestion' && <span className={styles.badgeSoft}>Sugestão</span>}
          <p className={styles.text}>
            {renderWithHighlight(message.text, message.highlight)}
          </p>
        </div>
        <div className={styles.metaRow}>
          {message.time && <span className={styles.time}>{message.time}</span>}
          {showSpeak && (
            <button
              type="button"
              className={`${styles.speakBtn} ${isSpeaking ? styles.speakBtnActive : ''}`}
              onClick={() => onSpeak(message)}
              aria-pressed={isSpeaking}
              aria-label={isSpeaking ? 'Parar leitura da resposta' : 'Ouvir resposta da Uni'}
              title={isSpeaking ? 'Parar' : 'Ouvir resposta'}
            >
              {isSpeaking ? <StopIcon /> : <SpeakerIcon />}
              <span>{isSpeaking ? 'Parar' : 'Ouvir'}</span>
            </button>
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
