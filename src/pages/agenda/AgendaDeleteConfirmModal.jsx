import { useId, useState } from 'react';
import IconBox from '../../components/ui/IconBox';
import Modal from '../../components/ui/Modal';
import OutlineButton from '../../components/ui/OutlineButton';
import { PhTrashIcon } from '../../features/simplified-app/SimplifiedIcons.jsx';
import { getAgendaItemErrorMessage } from './agendaFormUtils.js';
import styles from './AgendaDeleteConfirmModal.module.css';

/**
 * Confirmacao de exclusao de um item de agenda (Subfase 8.7). Exclusao
 * real (delete), nao ha lixeira/is_archived na tabela agenda_items --
 * diferente de AgendaStatusConfirmModal, aqui a acao e permanente. Mesmo
 * padrao estrutural de ClientDeleteConfirmModal.jsx (unico outro fluxo de
 * hard-delete do projeto): acao unica, sem parametrizacao de modo.
 *
 * Tela 22g: folha sem cabeçalho, com a lixeira, a pergunta com o título do
 * compromisso e "Excluir definitivamente" contornado (o padrão não tem cor
 * de perigo; a pergunta e o botão deixam a exclusão clara).
 */
function AgendaDeleteConfirmModal({ item, agenda, onClose }) {
  const [localError, setLocalError] = useState(null);
  const isMutating = agenda.isMutating;
  const titleId = useId();
  const descriptionId = useId();

  // Bloqueia fechamento (overlay, ESC ou botao Cancelar) enquanto uma
  // mutacao esta em andamento -- mesmo padrao de ClientDeleteConfirmModal/AgendaStatusConfirmModal.
  function handleClose() {
    if (isMutating) return;
    onClose();
  }

  async function handleConfirm() {
    if (isMutating) return;
    setLocalError(null);

    // Contrato real (useAgenda.js): agenda.removeItem sempre resolve para
    // { data, error, isConfigured }, nunca lanca excecao. Falha segura: um
    // resultado ausente/mal-formado NUNCA e tratado como sucesso.
    const result = await agenda.removeItem(item.id, { expectedUpdatedAt: item.updated_at });

    if (result && !result.error) {
      await agenda.refresh();
      onClose();
      return;
    }

    setLocalError(
      getAgendaItemErrorMessage(result?.error, 'Não foi possível excluir o compromisso. Tente novamente.'),
    );
  }

  return (
    <Modal
      open
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      hideCloseButton
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      size="sm"
    >
      <div className={styles.content}>
        <div className={styles.message}>
          <IconBox size={44}><PhTrashIcon /></IconBox>
          <div className={styles.text}>
            <h2 id={titleId}>Excluir “{item.title}”?</h2>
            <p id={descriptionId}>O compromisso sai da sua agenda. Não é possível desfazer.</p>
          </div>
        </div>

        {localError ? <p className={styles.error} role="alert">{localError}</p> : null}

        <div className={styles.actions}>
          <OutlineButton variant="secondary" className={styles.confirm} loading={isMutating} disabled={isMutating} onClick={handleConfirm}>
            Excluir definitivamente
          </OutlineButton>
          <OutlineButton variant="ghost" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </OutlineButton>
        </div>
      </div>
    </Modal>
  );
}

export default AgendaDeleteConfirmModal;
