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
        {message.time && <span className={styles.time}>{message.time}</span>}
      </div>
    </div>
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
        <strong key={i} style={{ color: 'var(--uni-blue-deep)' }}>
          {highlight}
        </strong>
      );
    }
    return acc;
  }, []);
}
