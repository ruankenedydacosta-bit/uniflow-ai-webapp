import { useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { FormMessage, SelectField } from './OpportunityFormPrimitives.jsx';
import {
  buildOpportunityCreationPayload,
  buildOpportunityUpdatePayload,
  createEmptyOpportunityForm,
  createOpportunityEditForm,
  getOpportunityCreationErrorMessage,
  getOpportunityErrorMessage,
  validateOpportunityForm,
} from './opportunityFormUtils.js';

function createInitialForm(stages) {
  return {
    ...createEmptyOpportunityForm(),
    stage_id: stages[0]?.id ?? '',
  };
}

/**
 * mode 'create': cliente/etapa sao selects obrigatorios (novo registro).
 * mode 'edit': cliente/etapa aparecem so como contexto somente leitura --
 * client_id e imutavel por trigger de banco
 * (prevent_crm_opportunities_immutable_field_change) e stage_id so muda
 * pelo select dedicado no card (moveOpportunityStage, Subfase 7.5.6). O
 * modal de edicao altera exclusivamente titulo e valor estimado.
 */
function OpportunityFormModal({ open, mode = 'create', opportunity = null, pipeline, clientsState, onClose }) {
  const isEditing = mode === 'edit';
  const activeClients = clientsState.activeClients;
  const stages = pipeline.stages;

  const [form, setForm] = useState(() =>
    isEditing ? createOpportunityEditForm(opportunity) : createInitialForm(stages),
  );
  const [validationError, setValidationError] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const isMutating = pipeline.isMutating;

  // Bloqueia fechamento (X, overlay, ESC ou botao Cancelar) enquanto uma
  // mutacao esta em andamento -- todos os gatilhos de fechamento do Modal
  // passam por este handler.
  function handleClose() {
    if (isMutating) return;
    onClose();
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isMutating) return;

    setValidationError(null);
    setMutationError(null);

    if (!isEditing) {
      // Defesa contra o cliente/etapa ter deixado de existir/ficado inativo
      // enquanto o modal estava aberto -- so se aplica quando algo ja foi
      // selecionado; campo vazio cai na validacao "obrigatorio" abaixo.
      // Nao se aplica em modo edit: cliente/etapa nao sao mais editaveis.
      if (form.client_id && !activeClients.some((client) => client.id === form.client_id)) {
        setValidationError('O cliente selecionado não está mais ativo. Escolha outro cliente.');
        return;
      }

      if (form.stage_id && !stages.some((stage) => stage.id === form.stage_id)) {
        setValidationError('A etapa selecionada não está mais disponível. Escolha outra etapa.');
        return;
      }
    }

    const validationMessage = validateOpportunityForm(form, { mode: isEditing ? 'edit' : 'create' });
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }

    // Contrato real de pipeline.createOpportunity/updateOpportunity
    // (useCrmPipeline.js): sempre resolvem para { data, error, isConfigured }
    // -- nunca lancam excecao em falha de negocio/RLS/validacao. Sucesso =
    // error falsy.
    const result = isEditing
      ? await pipeline.updateOpportunity(opportunity.id, buildOpportunityUpdatePayload(form))
      : await pipeline.createOpportunity(buildOpportunityCreationPayload(form));

    if (result && !result.error) {
      onClose();
      return;
    }

    setMutationError(
      isEditing
        ? getOpportunityErrorMessage(
            result?.error,
            'Não foi possível atualizar a oportunidade. Tente novamente.',
          )
        : getOpportunityCreationErrorMessage(
            result?.error,
            'Não foi possível criar a oportunidade. Tente novamente.',
          ),
    );
  }

  const hasActiveClients = activeClients.length > 0;
  const hasStages = stages.length > 0;
  const isSubmitDisabled = isEditing ? isMutating : isMutating || !hasActiveClients || !hasStages;

  const clientDisplayName = isEditing
    ? (clientsState.clients.find((client) => client.id === opportunity.client_id)?.name ??
      'Cliente indisponível')
    : null;
  const stageDisplayName = isEditing
    ? (stages.find((stage) => stage.id === opportunity.stage_id)?.name ?? 'Etapa indisponível')
    : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title={isEditing ? 'Editar oportunidade' : 'Nova oportunidade'}
      description={
        isEditing
          ? 'Atualize o título ou o valor estimado desta oportunidade.'
          : 'Cadastre uma nova oportunidade neste espaço.'
      }
      size="md"
      footer={
        <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
          Cancelar
        </Button>
      }
    >
      <form className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
        <Input
          id="opportunity-form-title"
          label="Título"
          value={form.title}
          onChange={(event) => updateField('title', event.target.value)}
          required
          disabled={isMutating}
          fullWidth
        />

        {isEditing ? (
          <>
            <div className="uf-flex uf-flex-column uf-gap-sm uf-text-caption">
              <span className="uf-text-primary">Cliente</span>
              <strong>{clientDisplayName}</strong>
            </div>
            <div className="uf-flex uf-flex-column uf-gap-sm uf-text-caption">
              <span className="uf-text-primary">Etapa</span>
              <strong>{stageDisplayName}</strong>
            </div>
          </>
        ) : (
          <>
            <SelectField
              id="opportunity-form-client"
              label="Cliente"
              value={form.client_id}
              onChange={(event) => updateField('client_id', event.target.value)}
              required
              disabled={isMutating || !hasActiveClients}
            >
              <option value="">Selecione um cliente</option>
              {activeClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </SelectField>
            {!hasActiveClients ? (
              <FormMessage tone="warning">
                Cadastre um cliente ativo antes de criar uma oportunidade.
              </FormMessage>
            ) : null}

            <SelectField
              id="opportunity-form-stage"
              label="Etapa"
              value={form.stage_id}
              onChange={(event) => updateField('stage_id', event.target.value)}
              required
              disabled={isMutating || !hasStages}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </SelectField>
            {!hasStages ? (
              <FormMessage tone="warning">
                Configure ao menos uma etapa antes de criar uma oportunidade.
              </FormMessage>
            ) : null}
          </>
        )}

        <Input
          id="opportunity-form-estimated-value"
          label="Valor estimado (opcional)"
          type="number"
          min="0"
          step="0.01"
          value={form.estimated_value}
          onChange={(event) => updateField('estimated_value', event.target.value)}
          disabled={isMutating}
          fullWidth
        />

        <FormMessage>{validationError || mutationError}</FormMessage>

        <div className="uf-flex uf-items-center uf-justify-end uf-gap-sm uf-flex-wrap">
          <Button type="submit" loading={isMutating} disabled={isSubmitDisabled}>
            {isEditing ? 'Salvar alterações' : 'Criar oportunidade'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default OpportunityFormModal;
