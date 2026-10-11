import { useState } from 'react';
import IconBox from '../../../components/ui/IconBox';
import Modal from '../../../components/ui/Modal';
import OutlineButton from '../../../components/ui/OutlineButton';
import { cx } from '../../../utils/cx.js';
import { PhChatCircleTextIcon, PhPlusIcon, PhTrashIcon } from '../../simplified-app/SimplifiedIcons.jsx';
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

// Histórico de conversas da Uni. Usa o Modal compartilhado: no celular sobe
// como a folha padrão (handoff 22), com Esc, toque fora e foco no diálogo.
// Excluir continua em dois toques: a lixeira vira "Excluir" e só o segundo
// toque apaga.
export default function HistoryPanel({ open, onClose, onNewChat, onSelect, onDelete, conversations, activeId }) {
  const [deletingId, setDeletingId] = useState(null);

  function handleClose() {
    setDeletingId(null);
    onClose();
  }

  function handleDelete(id) {
    if (deletingId === id) {
      onDelete(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
    }
  }

  function handleSelect(id) {
    onSelect(id);
    handleClose();
  }

  function handleNewChat() {
    onNewChat();
    handleClose();
  }

  return (
    <Modal
      open={Boolean(open)}
      onClose={handleClose}
      title="Histórico"
      size="sm"
      className={styles.dialog}
      bodyClassName={styles.body}
    >
      <OutlineButton className={styles.newChat} onClick={handleNewChat}>
        <PhPlusIcon />
        Nova conversa
      </OutlineButton>

      {conversations.length === 0 ? (
        <div className={styles.emptyState}>
          <IconBox size={44}><PhChatCircleTextIcon /></IconBox>
          <p className={styles.emptyText}>Você ainda não tem conversas salvas.</p>
          <p className={styles.emptyHint}>Converse com a Uni e a conversa aparece aqui.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {conversations.map((conv) => {
            const isActive = conv.id === activeId;
            const isDeleting = deletingId === conv.id;
            return (
              <li key={conv.id} className={styles.item} data-active={isActive}>
                <button
                  type="button"
                  className={styles.itemBtn}
                  onClick={() => handleSelect(conv.id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className={styles.itemTitle}>{conv.title || 'Nova conversa'}</span>
                  <span className={styles.itemDate}>{formatDate(conv.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  className={cx(styles.itemDelete, isDeleting && styles.itemDeleteConfirm)}
                  onClick={() => handleDelete(conv.id)}
                  aria-label={isDeleting ? 'Confirmar exclusão' : 'Excluir conversa'}
                >
                  {isDeleting ? 'Excluir' : <PhTrashIcon />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
