import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { FormMessage } from './AgendaFormPrimitives.jsx';
import { getAgendaItemErrorMessage } from './agendaFormUtils.js';

/**
 * Confirmacao de exclusao de um item de agenda (Subfase 8.7). Exclusao
 * real (delete), nao ha lixeira/is_archived na tabela agenda_items --
 * diferente de AgendaStatusConfirmModal, aqui a acao e permanente. Mesmo
 * padrao estrutural de ClientDeleteConfirmModal.jsx (unico outro fluxo de
 * hard-delete do projeto): acao unica, sem parametrizacao de modo.
 */
function AgendaDeleteConfirmModal({ item, agenda, onClose }) {
  const [localError, setLocalError] = useState(null);
  const isMutating = agenda.isMutating;

  // Bloqueia fechamento (X, overlay, ESC ou botao Cancelar) enquanto uma
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
      title="Excluir compromisso"
      description={`Excluir "${item.title}"? Esta ação é permanente e não pode ser desfeita.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </Button>
          <Button variant="danger" loading={isMutating} disabled={isMutating} onClick={handleConfirm}>
            Excluir definitivamente
          </Button>
        </>
      }
    >
      <FormMessage>{localError}</FormMessage>
    </Modal>
  );
}

export default AgendaDeleteConfirmModal;
