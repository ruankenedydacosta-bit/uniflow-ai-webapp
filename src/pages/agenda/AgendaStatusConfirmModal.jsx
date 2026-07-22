import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { FormMessage } from './AgendaFormPrimitives.jsx';
import { getAgendaItemErrorMessage } from './agendaFormUtils.js';

/**
 * Confirmacao de conclusao/cancelamento de um item de agenda (Subfase 8.6).
 * Modal generico parametrizado por targetStatus -- diferente de
 * OpportunityOutcomeConfirmModal (multi-escolha num unico modal), aqui o
 * botao do card ja decide o alvo, entao o modal so confirma UMA acao ja
 * escolhida, estrutura mais proxima de ClientDeleteConfirmModal. Nunca
 * aceita 'scheduled' -- sem reabertura nesta fase.
 */
function AgendaStatusConfirmModal({ item, targetStatus, agenda, onClose }) {
  const isCompleting = targetStatus === 'completed';
  const [localError, setLocalError] = useState(null);
  const isMutating = agenda.isMutating;

  // Bloqueia fechamento (X, overlay, ESC ou botao Cancelar) enquanto uma
  // mutacao esta em andamento -- mesmo padrao de OpportunityOutcomeConfirmModal/ClientDeleteConfirmModal.
  function handleClose() {
    if (isMutating) return;
    onClose();
  }

  async function handleConfirm() {
    if (isMutating) return;
    setLocalError(null);

    // Contrato real (useAgenda.js): agenda.setItemStatus sempre resolve
    // para { data, error, isConfigured }, nunca lanca excecao. Falha
    // segura: um resultado ausente/mal-formado NUNCA e tratado como sucesso.
    const result = await agenda.setItemStatus(item.id, targetStatus);

    if (result && !result.error) {
      // Reconcilia a lista com os filtros ativos -- se o novo status sair
      // do filtro de status ativo, o item desaparece apos este refresh,
      // comportamento esperado (mesma estrategia de 8.4/8.5).
      await agenda.refresh();
      onClose();
      return;
    }

    setLocalError(
      getAgendaItemErrorMessage(
        result?.error,
        isCompleting
          ? 'Não foi possível concluir o compromisso. Tente novamente.'
          : 'Não foi possível cancelar o compromisso. Tente novamente.',
      ),
    );
  }

  return (
    <Modal
      open
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title={isCompleting ? 'Concluir compromisso' : 'Cancelar compromisso'}
      description={
        isCompleting
          ? `Marcar "${item.title}" como concluído? Esta ação não pode ser desfeita nesta versão.`
          : `Cancelar "${item.title}"? Esta ação não pode ser desfeita nesta versão.`
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </Button>
          <Button
            variant={isCompleting ? 'secondary' : 'ghost'}
            loading={isMutating}
            disabled={isMutating}
            onClick={handleConfirm}
          >
            {isCompleting ? 'Concluir compromisso' : 'Cancelar compromisso'}
          </Button>
        </>
      }
    >
      <FormMessage>{localError}</FormMessage>
    </Modal>
  );
}

export default AgendaStatusConfirmModal;
