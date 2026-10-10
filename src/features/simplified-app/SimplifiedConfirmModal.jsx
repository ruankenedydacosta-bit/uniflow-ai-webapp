import { useId } from 'react';
import IconBox from '../../components/ui/IconBox/index.js';
import Modal from '../../components/ui/Modal/Modal.jsx';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import styles from './SimplifiedConfirmModal.module.css';

// Aviso curto da tela 22g (mesmo desenho de AgendaDeleteConfirmModal): folha
// sem cabeçalho nem X, ícone de 44px, título e texto, a ação principal
// contornada e a saída em ghost logo ao lado. O padrão não usa cor de perigo.
// `busy` trava toque fora, Esc e a saída enquanto a ação roda; `onClose`
// continua decidindo sozinho se pode fechar. `onCancel` existe para a saída
// que faz algo além de fechar (ex.: "Falar com a Uni"); nesse caso passe
// `closeButton` para a folha ganhar o X e ter uma saída neutra.
function SimplifiedConfirmModal({
  open,
  onClose,
  icon,
  title,
  description,
  confirmLabel,
  onConfirm,
  cancelLabel = 'Cancelar',
  onCancel,
  loading = false,
  busy = loading,
  error,
  closeButton = false,
  children,
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnOverlayClick={!busy}
      closeOnEsc={!busy}
      hideCloseButton={!closeButton}
      aria-labelledby={titleId}
      aria-describedby={description || children ? descriptionId : undefined}
      size="sm"
    >
      <div className={styles.content}>
        <div className={styles.message}>
          {icon ? <IconBox size={44}>{icon}</IconBox> : null}
          <div className={styles.text}>
            <h2 id={titleId}>{title}</h2>
            {description || children ? (
              <div id={descriptionId} className={styles.description}>
                {description ? <p>{description}</p> : null}
                {children}
              </div>
            ) : null}
          </div>
        </div>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.actions}>
          <OutlineButton variant="secondary" className={styles.confirm} loading={loading} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </OutlineButton>
          <OutlineButton variant="ghost" onClick={onCancel ?? onClose} disabled={busy}>
            {cancelLabel}
          </OutlineButton>
        </div>
      </div>
    </Modal>
  );
}

export default SimplifiedConfirmModal;
