import { useState } from 'react';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import {
  buildAgendaItemCreationPayload,
  createAgendaItemEditForm,
  getAgendaItemErrorMessage,
  shiftEndsAtOnEdit,
  validateAgendaItemForm,
} from '../../pages/agenda/agendaFormUtils.js';
import {
  clearAgendaOperation,
  getCurrentAgendaOperation,
  getOrCreateAgendaOperation,
} from '../../services/agendaOperationStore.js';
import { AGENDA_IDEMPOTENCY_ENABLED } from '../../services/agendaIdempotencyConfig.js';
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
    const editForm = createAgendaItemEditForm(item);
    return {
      ...editForm,
      dateValue: editForm.starts_at ? editForm.starts_at.slice(0, 10) : formatDateInputValue(defaultDay),
      timeValue: editForm.is_all_day ? '' : (editForm.starts_at?.slice(11, 16) || ''),
    };
  }
  return {
    item_type: 'appointment',
    title: '',
    description: '',
    location: '',
    client_id: null,
    ends_at: '',
    is_all_day: false,
    dateValue: formatDateInputValue(defaultDay ?? new Date()),
    timeValue: '09:00',
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

  async function clearCreationOperation(operation) {
    if (!operation) return true;
    try {
      await clearAgendaOperation({
        userId,
        workspaceId,
        origin: CREATE_OPERATION_ORIGIN,
        clientOperationId: operation.clientOperationId,
      });
      return true;
    } catch (error) {
      setLocalError(getAgendaItemErrorMessage(error));
      return false;
    }
  }

  async function handleClose() {
    if (isMutating) return;
    if (AGENDA_IDEMPOTENCY_ENABLED && !isEditing && userId && workspaceId) {
      try {
        const operation = await getCurrentAgendaOperation({
          userId,
          workspaceId,
          origin: CREATE_OPERATION_ORIGIN,
        });
        if (!(await clearCreationOperation(operation))) return;
      } catch (error) {
        setLocalError(getAgendaItemErrorMessage(error));
        return;
      }
    }
    onClose();
  }

  function update(changes) {
    setForm((current) => ({ ...current, ...changes }));
  }

  async function handleSave() {
    if (isMutating) return;
    setLocalError(null);

    const { dateValue, timeValue, ...rest } = form;
    const startsAtValue = `${dateValue}T${form.is_all_day ? '00:00' : (timeValue || '09:00')}`;
    const payloadForm = {
      ...rest,
      starts_at: startsAtValue,
      ends_at: isEditing
        ? shiftEndsAtOnEdit(item.starts_at, item.ends_at, rest.ends_at, startsAtValue)
        : (form.is_all_day ? '' : rest.ends_at),
      is_all_day: form.is_all_day,
    };

    const validationError = validateAgendaItemForm(payloadForm);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    const payload = buildAgendaItemCreationPayload(payloadForm);
    let creationOperation = null;
    if (AGENDA_IDEMPOTENCY_ENABLED && !isEditing) {
      try {
        creationOperation = await getOrCreateAgendaOperation({
          userId,
          workspaceId,
          origin: CREATE_OPERATION_ORIGIN,
          intent: payload,
        });
      } catch (error) {
        setLocalError(getAgendaItemErrorMessage(error));
        return;
      }
    }
    const result = isEditing
      ? await agenda.updateItem(item.id, payload, { expectedUpdatedAt: item.updated_at })
      : await agenda.createItem({
        ...payload,
        ...(creationOperation
          ? { client_operation_id: creationOperation.clientOperationId }
          : {}),
      });

    if (result?.error) {
      if (result.error.code === 'AGENDA_ITEM_IDEMPOTENCY_CONFLICT' && creationOperation) {
        if (!(await clearCreationOperation(creationOperation))) return;
      }
      setLocalError(getAgendaItemErrorMessage(result.error, 'Não foi possível salvar o compromisso. Tente novamente.'));
      return;
    }

    if (!(await clearCreationOperation(creationOperation))) return;
    onClose();
  }

  const selectedDayHeading = form.dateValue
    ? formatDayHeading(new Date(`${form.dateValue}T12:00:00`))
    : '';

  return (
    <Modal
      open
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
            value={form.dateValue}
            onChange={(event) => update({ dateValue: event.target.value })}
            aria-required="true"
            aria-label="Data do compromisso"
          />
        </label>

        <label className={`${styles.field} ${form.is_all_day ? styles.fieldDisabled : ''}`}>
          <span>Horário</span>
          <input
            type="time"
            value={form.timeValue}
            onChange={(event) => update({ timeValue: event.target.value })}
            aria-label="Horário do compromisso"
            disabled={form.is_all_day}
          />
        </label>

        <label className={styles.allDayRow}>
          <input
            type="checkbox"
            checked={Boolean(form.is_all_day)}
            onChange={(event) => update({ is_all_day: event.target.checked })}
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
