import { useState } from 'react';
import styles from './HistoryPanel.module.css';

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Hoje ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

export default function HistoryPanel({ open, onClose, onNewChat, onSelect, onDelete, conversations, activeId }) {
  const [deletingId, setDeletingId] = useState(null);

  if (!open) return null;

  function handleDelete(e, id) {
    e.stopPropagation();
    if (deletingId === id) {
      onDelete(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
    }
  }

  function handleSelect(id) {
    onSelect(id);
    onClose();
  }

  function handleNewChat() {
    onNewChat();
    onClose();
    setDeletingId(null);
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Histórico de conversas">
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Histórico</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar histórico">
            ✕
          </button>
        </div>

        <button type="button" className={styles.newChatBtn} onClick={handleNewChat}>
          + Nova conversa
        </button>

        {conversations.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📋</span>
            <span className={styles.emptyText}>Nenhuma conversa ainda</span>
            <span className={styles.emptyHint}>Suas conversas aparecerão aqui</span>
          </div>
        ) : (
          <ul className={styles.list}>
            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const isDeleting = deletingId === conv.id;
              return (
                <li key={conv.id} className={`${styles.item} ${isActive ? styles.itemActive : ''}`}>
                  <button type="button" className={styles.itemBtn} onClick={() => handleSelect(conv.id)}>
                    <span className={styles.itemTitle}>{conv.title || 'Nova conversa'}</span>
                    <span className={styles.itemDate}>{formatDate(conv.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.itemDelete} ${isDeleting ? styles.itemDeleteConfirm : ''}`}
                    onClick={(e) => handleDelete(e, conv.id)}
                    aria-label={isDeleting ? 'Confirmar exclusão' : 'Excluir conversa'}
                  >
                    {isDeleting ? 'Excluir?' : '✕'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
