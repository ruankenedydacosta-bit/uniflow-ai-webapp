import { UniRingOrb } from '../../../components/ui/UniRingOrb/index.js';
import OutlineButton from '../../../components/ui/OutlineButton/OutlineButton.jsx';
import ActionConfirmation from './ActionConfirmation';
import SafeMarkdown from '../../../components/content/SafeMarkdown.jsx';
import styles from './MessageBubble.module.css';

// `processingLabel` (repassado a ActionConfirmation) vem de
// useUniProcessingMessage em UniChatPage.jsx.
export default function MessageBubble({
  message,
  onConfirmAction,
  onEditAction,
  onCancelAction,
  onUndoAction,
  editForm = null,
  onSaveEditAction,
  isExecuting = false,
  executionError = null,
  processingLabel,
}) {
  const isUser = message.from === 'user';
  // Redesign (épico #91, tela 02): o pedido da pessoa é um balão à direita;
  // a Uni fala sem balão, com o orb de 22px ao lado.
  if (message.type === 'confirmation') {
    return (
      <div className={`${styles.row} ${styles.rowUni}`}>
        <UniMessageOrb />
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
            editForm={editForm}
            onSaveEdit={onSaveEditAction ? (overrides) => onSaveEditAction(message.id, overrides) : undefined}
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

  // Exclusão recente (#189): o botão fica enquanto o chat ainda consegue
  // trazer o lançamento de volta.
  const showUndo = !isUser && message.undo?.status === 'available' && typeof onUndoAction === 'function';

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : styles.rowUni}`}>
      {!isUser && <UniMessageOrb />}
      <div className={styles.stack}>
        <div className={bubbleClass}>
          {message.type === 'alert' && <span className={styles.badge}>Atenção</span>}
          {message.type === 'suggestion' && <span className={styles.badgeSoft}>Sugestão</span>}
          {isUser ? (
            <p className={styles.text}>
              {renderWithHighlight(message.text, message.highlight)}
            </p>
          ) : (
            <SafeMarkdown className={styles.text}>{message.text}</SafeMarkdown>
          )}
        </div>
        {showUndo && (
          <div className={styles.metaRow}>
            <OutlineButton
              variant="secondary"
              onClick={() => onUndoAction(message.id)}
              disabled={isExecuting}
            >
              Desfazer
            </OutlineButton>
          </div>
        )}
      </div>
    </div>
  );
}

function UniMessageOrb() {
  return (
    <span className={styles.avatar}>
      <UniRingOrb size={22} />
    </span>
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
