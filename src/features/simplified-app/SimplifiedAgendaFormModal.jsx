import { useEffect, useRef, useState } from 'react';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import {
  buildAgendaItemCreationPayload,
  createAgendaItemEditForm,
  getFormStartLocalValue,
  getAgendaItemErrorMessage,
  shiftEndsAtOnEdit,
  validateAgendaItemForm,
} from '../../pages/agenda/agendaFormUtils.js';
import {
  clearAgendaOperation,
  getOrCreateAgendaOperation,
} from '../../services/agendaOperationStore.js';
import { AGENDA_IDEMPOTENCY_ENABLED } from '../../services/agendaIdempotencyConfig.js';
import {
  createAgendaFormSubmissionLifecycle,
  runOwnedAgendaPreOperation,
} from '../../pages/agenda/agendaFormSubmissionLifecycle.js';
import { formatDayHeading } from './simplifiedAgendaCalendar.js';
import styles from './simplifiedAgenda.module.css';

/**
 * Formulario SIMPLES da Agenda visual (Conta > Agenda > Novo compromisso /
 * editar compromisso). Reaproveita o MESMO contrato da Agenda completa:
 * createAgendaItemEditForm + validateAgendaItemForm +
 * buildAgendaItemCreationPayload de agendaFormUtils, e as mutacoes do
 * useAgenda (createItem/updateItem) -- nenhuma escrita direta em
 * agenda_items, nenhum novo endpoint.
 *
 * Lembrete/notificacao (Sem/Na hora/10min/30min/1h/1 dia) NAO e implementado
 * porque agenda_items NAO tem coluna de lembrete nem agendador de
 * notificacao nessa fase -- lacuna documentada para o Codex/Supabase
 * (censura honesta: preferimos a ausencia do campo a gravar fachada que
 * nunca dispara nada).
 */
function formatDateInputValue(date) {
  if (!date) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function createInitialForm(item, defaultDay) {
  if (item) {
    return createAgendaItemEditForm(item);
  }
  return {
    item_type: 'appointment',
    title: '',
    description: '',
    location: '',
    client_id: null,
    ends_at: '',
    allDay: false,
    hasExplicitTime: false,
    date: formatDateInputValue(defaultDay ?? new Date()),
    time: '',
  };
}

const CREATE_OPERATION_ORIGIN = 'simplified-agenda-form';

function SimplifiedAgendaFormModal({
  item,
  defaultDay,
  agenda,
  userId,
  workspaceId,
  onClose,
  onRequestDelete,
}) {
  const isEditing = Boolean(item);
  const [form, setForm] = useState(() => createInitialForm(item, defaultDay));
  const [localError, setLocalError] = useState(null);
  const isMutating = agenda.isMutating;
  const submissionLifecycleRef = useRef(null);
  const creationOperationRef = useRef(null);
  if (submissionLifecycleRef.current == null) {
    submissionLifecycleRef.current = createAgendaFormSubmissionLifecycle();
  }

  useEffect(() => () => {
    submissionLifecycleRef.current.invalidate('unmount');
  }, []);

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
        setLocalError(getAgendaItemErrorMessage(error));
      }
      return false;
    }
  }

  async function handleClose() {
    if (isMutating) return;
    submissionLifecycleRef.current.invalidate('close');
    if (!(await clearCreationOperation(creationOperationRef.current))) return;
    onClose();
  }

  function update(changes) {
    setForm((current) => ({ ...current, ...changes }));
  }

  async function handleSave() {
    if (isMutating || submissionLifecycleRef.current.hasActive()) return;
    setLocalError(null);

    const startsAtValue = getFormStartLocalValue(form);
    const payloadForm = {
      ...form,
      ends_at: isEditing
        ? shiftEndsAtOnEdit(item.starts_at, item.ends_at, form.ends_at, startsAtValue)
        : (form.allDay || !form.hasExplicitTime ? '' : form.ends_at),
    };

    const validationError = validateAgendaItemForm(payloadForm);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    const payload = buildAgendaItemCreationPayload(payloadForm);
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
      if (result?.error) {
        if (result.error.code === 'AGENDA_ITEM_IDEMPOTENCY_CONFLICT' && creationOperation) {
          if (!(await clearCreationOperation(creationOperation))) return;
          if (!submissionLifecycleRef.current.isCurrent(submissionOwner)) return;
        }
        setLocalError(getAgendaItemErrorMessage(result.error, 'Não foi possível salvar o compromisso. Tente novamente.'));
        return;
      }

      if (!(await clearCreationOperation(creationOperation))) return;
      if (!submissionLifecycleRef.current.isCurrent(submissionOwner)) return;
      onClose();
    } catch (error) {
      if (submissionLifecycleRef.current.isCurrent(submissionOwner)) {
        setLocalError(getAgendaItemErrorMessage(error));
      }
    } finally {
      submissionLifecycleRef.current.complete(submissionOwner);
    }
  }

  const selectedDayHeading = form.date
    ? formatDayHeading(new Date(`${form.date}T12:00:00`))
    : '';

  return (
    <Modal
      open
      data-theme="uniflow"
      className={styles.formDialog}
      overlayClassName={styles.formOverlay}
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title={isEditing ? 'Editar compromisso' : 'Novo compromisso'}
      description={selectedDayHeading}
      size="md"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </Button>
          {isEditing ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => { if (onRequestDelete) onRequestDelete(item); }}
              disabled={isMutating}
            >
              Excluir
            </Button>
          ) : null}
          <Button
            type="button"
            loading={isMutating}
            disabled={isMutating}
            onClick={handleSave}
          >
            {isEditing ? 'Salvar alterações' : 'Salvar'}
          </Button>
        </>
      )}
    >
      <div className={styles.formFields}>
        <label className={`${styles.field} ${styles.fieldRequired}`}>
          <span>Título</span>
          <input
            type="text"
            autoFocus
            value={form.title}
            onChange={(event) => update({ title: event.target.value })}
            aria-required="true"
            aria-label="Título do compromisso"
          />
        </label>

        <label className={styles.field}>
          <span>Data</span>
          <input
            type="date"
            value={form.date}
            onChange={(event) => update({ date: event.target.value })}
            aria-required="true"
            aria-label="Data do compromisso"
          />
        </label>

        <label className={`${styles.field} ${form.allDay ? styles.fieldDisabled : ''}`}>
          <span>Horário</span>
          <input
            type="time"
            value={form.time}
            onChange={(event) => update({
              time: event.target.value,
              hasExplicitTime: Boolean(event.target.value),
              allDay: event.target.value ? false : form.allDay,
              ends_at: event.target.value ? form.ends_at : '',
            })}
            aria-label="Horário do compromisso"
            disabled={form.allDay}
          />
        </label>

        <label className={styles.allDayRow}>
          <input
            type="checkbox"
            checked={Boolean(form.allDay)}
            onChange={(event) => update({
              allDay: event.target.checked,
              hasExplicitTime: false,
              time: '',
              ends_at: event.target.checked ? '' : form.ends_at,
            })}
            aria-label="Dia inteiro"
          />
          <span>Dia inteiro</span>
        </label>

        <label className={styles.field}>
          <span>Observações</span>
          <textarea
            rows={3}
            value={form.description}
            onChange={(event) => update({ description: event.target.value })}
            aria-label="Observações do compromisso"
          />
        </label>

        <p className={styles.reminderNote} role="note">
          Lembrete por notificação ainda não está disponível nesta versão.
        </p>
      </div>

      {localError ? (
        <p className={styles.formError} role="alert">{localError}</p>
      ) : null}
    </Modal>
  );
}

export default SimplifiedAgendaFormModal;
