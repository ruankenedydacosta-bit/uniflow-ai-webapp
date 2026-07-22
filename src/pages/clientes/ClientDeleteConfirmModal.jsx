import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { FormMessage } from './ClientFormPrimitives';
import { getClientErrorMessage } from './clientFormUtils.js';

// Montado pelo pai (ClientesPage) somente enquanto ha um cliente pendente de
// exclusao -- fechar sempre desmonta este componente por inteiro, nunca
// reaproveita `client` de uma sessao anterior (mesma tecnica de
// ClientFormModal.jsx).
function ClientDeleteConfirmModal({ client, clientState, onClose }) {
  const [localError, setLocalError] = useState(null);
  const isMutating = clientState.isMutating;

  function handleClose() {
    if (isMutating) return;
    onClose();
  }

  async function handleConfirm() {
    if (isMutating) return;
    setLocalError(null);

    // Contrato real (useClients.js): sempre resolve para
    // { data, error, isConfigured }, nunca lanca excecao. Falha segura: um
    // resultado ausente/mal-formado NUNCA e tratado como sucesso.
    const result = await clientState.removeClient(client.id);

    if (result && !result.error) {
      onClose();
      return;
    }

    if (!result?.error) {
      setLocalError({
        code: 'UNKNOWN_DELETE_FAILURE',
        message: 'Não foi possível excluir o cliente. Tente novamente.',
      });
    }
  }

  const displayError = clientState.error ?? localError;

  return (
    <Modal
      open
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title="Excluir cliente"
      description={`Excluir "${client.name}"? Esta ação é permanente e não pode ser desfeita.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </Button>
          <Button variant="danger" loading={isMutating} onClick={handleConfirm}>
            Excluir definitivamente
          </Button>
        </>
      }
    >
      <FormMessage>
        {getClientErrorMessage(
          displayError,
          'Não foi possível excluir o cliente. Tente novamente.',
        )}
      </FormMessage>
    </Modal>
  );
}

export default ClientDeleteConfirmModal;
