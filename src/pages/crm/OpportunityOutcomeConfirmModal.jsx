import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { FormMessage } from './OpportunityFormPrimitives.jsx';
import { getOpportunityErrorMessage } from './opportunityFormUtils.js';

// Montado pelo pai (CRMPage) somente enquanto ha uma oportunidade pendente
// de encerramento -- fechar sempre desmonta este componente por inteiro,
// nunca reaproveita `opportunity` de uma sessao anterior (mesma tecnica de
// ClientDeleteConfirmModal.jsx). A escolha de um dos tres botoes ja conta
// como a confirmacao final -- nao ha uma segunda camada de "tem certeza?".
function OpportunityOutcomeConfirmModal({ opportunity, pipeline, onClose }) {
  const [outcomeError, setOutcomeError] = useState(null);
  const isMutating = pipeline.isMutating;

  function handleClose() {
    if (isMutating) return;
    onClose();
  }

  async function handleChooseOutcome(outcome) {
    if (isMutating) return;
    setOutcomeError(null);

    // Contrato real (useCrmPipeline.js): pipeline.setOpportunityOutcome
    // sempre resolve para { data, error, isConfigured }, nunca lanca
    // excecao. Falha segura: um resultado ausente/mal-formado NUNCA e
    // tratado como sucesso.
    const result = await pipeline.setOpportunityOutcome(opportunity.id, outcome);

    if (result && !result.error) {
      onClose();
      return;
    }

    setOutcomeError(
      getOpportunityErrorMessage(
        result?.error,
        'Não foi possível encerrar a oportunidade. Tente novamente.',
      ),
    );
  }

  return (
    <Modal
      open
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title="Encerrar oportunidade"
      description={`Como deseja encerrar "${opportunity.title}"? Esta ação não pode ser desfeita nesta versão.`}
      size="sm"
      footer={
        <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
          Cancelar
        </Button>
      }
    >
      <div className="uf-flex uf-flex-column uf-gap-md">
        <FormMessage>{outcomeError}</FormMessage>

        <div className="uf-flex uf-items-center uf-gap-sm uf-flex-wrap">
          <Button
            variant="secondary"
            loading={isMutating}
            disabled={isMutating}
            onClick={() => handleChooseOutcome('won')}
          >
            Marcar como ganha
          </Button>
          <Button
            variant="secondary"
            loading={isMutating}
            disabled={isMutating}
            onClick={() => handleChooseOutcome('lost')}
          >
            Marcar como perdida
          </Button>
          <Button
            variant="ghost"
            loading={isMutating}
            disabled={isMutating}
            onClick={() => handleChooseOutcome('cancelled')}
          >
            Cancelar oportunidade
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default OpportunityOutcomeConfirmModal;
