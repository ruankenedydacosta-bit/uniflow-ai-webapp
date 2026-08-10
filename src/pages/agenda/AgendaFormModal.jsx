import { useEffect, useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import {
  clearAgendaOperation,
  getOrCreateAgendaOperation,
} from '../../services/agendaOperationStore.js';
import { AGENDA_IDEMPOTENCY_ENABLED } from '../../services/agendaIdempotencyConfig.js';
import { FormMessage, SelectField, TextareaField } from './AgendaFormPrimitives.jsx';
import {
  AGENDA_ITEM_TYPE_LABELS,
  AGENDA_ITEM_TYPES,
  buildAgendaItemCreationPayload,
  createAgendaItemEditForm,
  createEmptyAgendaItemForm,
  getAgendaItemErrorMessage,
  validateAgendaItemForm,
} from './agendaFormUtils.js';
import {
  createAgendaFormSubmissionLifecycle,
  runOwnedAgendaPreOperation,
} from './agendaFormSubmissionLifecycle.js';

// Derivado de AGENDA_ITEM_TYPES/AGENDA_ITEM_TYPE_LABELS (agendaFormUtils.js)
// -- fonte unica compartilhada com AgendaPage.jsx, nunca uma segunda copia
// hardcoded do mesmo mapa de rotulos.
const ITEM_TYPE_OPTIONS = AGENDA_ITEM_TYPES.map((value) => ({
  value,
  label: AGENDA_ITEM_TYPE_LABELS[value],
}));

/**
 * Criacao e edicao de itens de agenda (Subfases 8.4/8.5). Sem acoes de
 * status, sem exclusao (fora de escopo). Mesmo contrato de
 * agenda.createItem/agenda.updateItem (useAgenda.js): sempre resolve para
 * { data, error, isConfigured } -- nunca lanca excecao em falha de
 * negocio/RLS/validacao. Sucesso = error falsy.
 *
 * mode/item seguem o mesmo contrato explicito de OpportunityFormModal --
 * isEditing nunca e inferido pela mera presenca de `item`. Diferente do
 * CRM, os 8 campos do formulario tem a mesma editabilidade nos dois modos
 * (nenhum campo vira somente-leitura na edicao), entao o mesmo builder de
 * payload (buildAgendaItemCreationPayload) e a mesma validacao
 * (validateAgendaItemForm) sao reutilizados sem parametro de modo.
 */
const CREATE_OPERATION_ORIGIN = 'agenda-form';

function AgendaFormModal({
  open,
  mode = 'create',
  item = null,
  agenda,
  clientsState,
  userId,
  workspaceId,
  onClose,
}) {
  const isEditing = mode === 'edit';
  const activeClients = clientsState.activeClients;

  const [form, setForm] = useState(() =>
    isEditing ? createAgendaItemEditForm(item) : createEmptyAgendaItemForm(),
  );
  const [validationError, setValidationError] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const isMutating = agenda.isMutating;
  const submissionLifecycleRef = useRef(null);
  const creationOperationRef = useRef(null);
  if (submissionLifecycleRef.current == null) {
    submissionLifecycleRef.current = createAgendaFormSubmissionLifecycle();
  }

  useEffect(() => () => {
    submissionLifecycleRef.current.invalidate('unmount');
  }, []);

  // Bloqueia fechamento (X, overlay, ESC ou botao Cancelar) enquanto uma
  // mutacao esta em andamento -- todos os gatilhos de fechamento do Modal
  // passam por este handler. Mesmo padrao de OpportunityFormModal/ClientFormModal.
  async function handleClose() {
    if (isMutating) return;
    submissionLifecycleRef.current.invalidate('close');
    if (!(await clearCreationOperation(creationOperationRef.current))) return;
    onClose();
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleAllDayChange(checked) {
    setForm((current) => ({
      ...current,
      allDay: checked,
      hasExplicitTime: false,
      time: '',
      ends_at: checked ? '' : current.ends_at,
    }));
  }

  function handleTimeChange(value) {
    setForm((current) => ({
      ...current,
      time: value,
      hasExplicitTime: Boolean(value),
      allDay: value ? false : current.allDay,
      ends_at: value ? current.ends_at : '',
    }));
  }

  async function clearCreationOperation(operation) {
    if (!operation) return true;
    try {
      await clearAgendaOperation({
        userId,
        workspaceId,
        origin: CREATE_OPERATION_ORIGIN,
        clientOperationId: operation.clientOperationId,
      });
      if (creationOperationRef.current?.clientOperationId === operation.clientOperationId) {
        creationOperationRef.current = null;
      }
      return true;
    } catch (error) {
      if (submissionLifecycleRef.current.isMounted()) {
        setMutationError(getAgendaItemErrorMessage(error));
      }
      return false;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isMutating || submissionLifecycleRef.current.hasActive()) return;

    setValidationError(null);
    setMutationError(null);

    const validationMessage = validateAgendaItemForm(form);
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }

    const payload = buildAgendaItemCreationPayload(form);
    const submissionOwner = submissionLifecycleRef.current.begin();
    try {
      const outcome = await runOwnedAgendaPreOperation({
        lifecycle: submissionLifecycleRef.current,
        owner: submissionOwner,
        prepare: async () => {
          if (!AGENDA_IDEMPOTENCY_ENABLED || isEditing) return null;
          const operation = await getOrCreateAgendaOperation({
            userId,
            workspaceId,
            origin: CREATE_OPERATION_ORIGIN,
            intent: payload,
          });
          creationOperationRef.current = operation;
          return operation;
        },
        mutate: (creationOperation) => (isEditing
          ? agenda.updateItem(item.id, payload, { expectedUpdatedAt: item.updated_at })
          : agenda.createItem({
            ...payload,
            ...(creationOperation
              ? { client_operation_id: creationOperation.clientOperationId }
              : {}),
          })),
        onCancelledPrepared: clearCreationOperation,
      });
      if (outcome.status !== 'settled') return;

      const { prepared: creationOperation, result } = outcome;
      if (result && !result.error) {
        if (!(await clearCreationOperation(creationOperation))) return;
        if (!submissionLifecycleRef.current.isCurrent(submissionOwner)) return;
        await agenda.refresh();
        if (!submissionLifecycleRef.current.isCurrent(submissionOwner)) return;
        onClose();
        return;
      }

      if (result?.error?.code === 'AGENDA_ITEM_IDEMPOTENCY_CONFLICT' && creationOperation) {
        if (!(await clearCreationOperation(creationOperation))) return;
        if (!submissionLifecycleRef.current.isCurrent(submissionOwner)) return;
      }

      setMutationError(
        getAgendaItemErrorMessage(
          result?.error,
          isEditing
            ? 'Não foi possível atualizar o compromisso. Tente novamente.'
            : 'Não foi possível criar o compromisso. Tente novamente.',
        ),
      );
    } catch (error) {
      if (submissionLifecycleRef.current.isCurrent(submissionOwner)) {
        setMutationError(getAgendaItemErrorMessage(error));
      }
    } finally {
      submissionLifecycleRef.current.complete(submissionOwner);
    }
  }

  const hasActiveClients = activeClients.length > 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title={isEditing ? 'Editar compromisso' : 'Novo compromisso'}
      description={
        isEditing
          ? 'Atualize os dados deste compromisso.'
          : 'Cadastre um novo item na agenda deste espaço.'
      }
      size="md"
      footer={
        <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
          Cancelar
        </Button>
      }
    >
      <form className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
        <SelectField
          id="agenda-form-item-type"
          label="Tipo"
          value={form.item_type}
          onChange={(event) => updateField('item_type', event.target.value)}
          required
          disabled={isMutating}
        >
          <option value="" disabled>
            Selecione o tipo
          </option>
          {ITEM_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <Input
          id="agenda-form-title"
          label="Título"
          value={form.title}
          onChange={(event) => updateField('title', event.target.value)}
          required
          disabled={isMutating}
          fullWidth
        />

        <TextareaField
          id="agenda-form-description"
          label="Observações / descrição (opcional)"
          value={form.description}
          onChange={(event) => updateField('description', event.target.value)}
          disabled={isMutating}
        />

        <Input
          id="agenda-form-location"
          label="Localização (opcional)"
          value={form.location}
          onChange={(event) => updateField('location', event.target.value)}
          disabled={isMutating}
          fullWidth
        />

        <label className="uf-flex uf-items-center uf-gap-sm uf-text-caption" htmlFor="agenda-form-all-day">
          <input
            id="agenda-form-all-day"
            type="checkbox"
            checked={form.allDay}
            onChange={(event) => handleAllDayChange(event.target.checked)}
            disabled={isMutating}
          />
          <span className="uf-text-primary">Dia inteiro</span>
        </label>

        <Input
          id="agenda-form-date"
          label="Data"
          type="date"
          value={form.date}
          onChange={(event) => updateField('date', event.target.value)}
          required
          disabled={isMutating}
          fullWidth
        />

        <Input
          id="agenda-form-time"
          label="Horário (opcional)"
          type="time"
          value={form.time}
          onChange={(event) => handleTimeChange(event.target.value)}
          disabled={isMutating || form.allDay}
          fullWidth
        />

        <Input
          id="agenda-form-ends-at"
          label="Término (opcional)"
          type="datetime-local"
          value={form.ends_at}
          onChange={(event) => updateField('ends_at', event.target.value)}
          disabled={isMutating || form.allDay || !form.hasExplicitTime}
          fullWidth
        />

        <SelectField
          id="agenda-form-client"
          label="Cliente (opcional)"
          value={form.client_id}
          onChange={(event) => updateField('client_id', event.target.value)}
          disabled={isMutating}
        >
          <option value="">Nenhum cliente</option>
          {activeClients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </SelectField>
        {!hasActiveClients ? (
          <FormMessage tone="warning">
            Nenhum cliente ativo disponível para vincular. Você ainda pode criar o compromisso.
          </FormMessage>
        ) : null}

        <FormMessage>{validationError || mutationError}</FormMessage>

        <div className="uf-flex uf-items-center uf-justify-end uf-gap-sm uf-flex-wrap">
          <Button type="submit" loading={isMutating} disabled={isMutating}>
            {isEditing ? 'Salvar alterações' : 'Criar compromisso'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default AgendaFormModal;
