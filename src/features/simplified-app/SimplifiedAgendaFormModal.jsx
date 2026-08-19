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
import { BellIcon } from './SimplifiedIcons.jsx';
import AgendaReminderChoiceModal from './AgendaReminderChoiceModal.jsx';
import { getAgendaPushReminderState } from '../agenda-push/agendaPushReminderService.js';
import { prefersReducedMotion } from '../agenda-push/agendaReminderAnimation.js';
import { getReminderMotionProfile } from '../agenda-push/agendaReminderMotionProfiles.js';
import { resolveReminderIndicator } from '../agenda-push/agendaReminderIndicator.js';
import styles from './simplifiedAgenda.module.css';

/**
 * Formulario SIMPLES da Agenda visual (Conta > Agenda > Novo compromisso /
 * editar compromisso). Reaproveita o MESMO contrato da Agenda completa:
 * createAgendaItemEditForm + validateAgendaItemForm +
 * buildAgendaItemCreationPayload de agendaFormUtils, e as mutacoes do
 * useAgenda (createItem/updateItem) -- nenhuma escrita direta em
 * agenda_items, nenhum novo endpoint.
 *
 * AGPUSH3: lembrete por push (30min/1h/Não precisa) agora tem entry point
 * real, mas SOMENTE ao editar (item.id já existe de verdade). Criar
 * compromisso continua mostrando o placeholder antigo -- ligar a decisão
 * de lembrete ao fluxo de criação (idempotência via client_operation_id,
 * agendaFormSubmissionLifecycle) é lógica sensível que esta tarefa foi
 * instruída a não tocar; a limitação é intencional, não um esquecimento.
 */
function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}
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
  onReminderApplied,
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

  // AGPUSH3: estado REAL do lembrete deste compromisso -- nunca de estado
  // temporário da animação. Buscado uma vez ao abrir o Editar compromisso
  // (mesma leitura RLS-scoped já usada pelo fallback iPhone).
  const [reminderIndicator, setReminderIndicator] = useState(null);
  const [showReminderChoice, setShowReminderChoice] = useState(false);
  const [isClosingForReminder, setIsClosingForReminder] = useState(false);
  // AGPUSH4: guarda QUAL perfil está fechando o modal, para o CSS usar o
  // formCollapseMs certo (energetic/calm têm ritmos diferentes).
  const [closingProfile, setClosingProfile] = useState(null);

  useEffect(() => {
    if (!isEditing) return undefined;

    let cancelled = false;
    (async () => {
      const result = await getAgendaPushReminderState(item.id);
      if (cancelled) return;
      setReminderIndicator(resolveReminderIndicator(result?.data));
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditing, item?.id]);

  // AGPUSH3: chamado pelo AgendaReminderChoiceModal SÓ depois da decisão
  // real já ter sido persistida (mesmo contrato do fluxo de deep link) --
  // a animação aqui é sempre consequência, nunca condição da gravação.
  async function handleReminderApplied({
    agendaItemId, variant, offsetMinutes, originRect,
  }) {
    setReminderIndicator(resolveReminderIndicator({ reminder_offset_minutes: offsetMinutes }));
    setShowReminderChoice(false);

    // "Não precisa": nada foi instalado no compromisso -- mantém o Editar
    // compromisso aberto, sem partícula, sem fechar nada. Mesma regra para
    // a origem ausente (defesa: nunca anima sem geometria real).
    if (offsetMinutes == null || !originRect) return;

    // AGPUSH4: recolhe no MESMO ritmo (formCollapseMs) do perfil desta
    // opção -- energetic (30min) sai mais rápido, calm (1h) mais devagar,
    // nunca um valor fixo desalinhado da escolha real.
    const profile = getReminderMotionProfile(variant);

    // O Editar compromisso precisa sair da tela ANTES da partícula nascer
    // (senão ela nasceria atrás de um modal ainda visível).
    if (!prefersReducedMotion()) {
      setClosingProfile(profile);
      setIsClosingForReminder(true);
      await wait(profile.formCollapseMs);
    }

    await handleClose();

    // Só localiza/anima o card REAL depois que o fechamento comitou --
    // requestAnimationFrame, nunca um delay mágico.
    requestAnimationFrame(() => {
      onReminderApplied?.({
        agendaItemId, variant, offsetMinutes, originRect,
      });
    });
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

  const isBusy = isMutating || isClosingForReminder;

  return (
    <Modal
      open
      style={{ '--uf-agenda-form-collapse-ms': `${(closingProfile ?? getReminderMotionProfile()).formCollapseMs}ms` }}
      className={[styles.formDialog, isClosingForReminder ? styles.formDialogCollapsing : ''].filter(Boolean).join(' ')}
      overlayClassName={styles.formOverlay}
      onClose={handleClose}
      closeOnOverlayClick={!isBusy}
      closeOnEsc={!isBusy}
      title={isEditing ? 'Editar compromisso' : 'Novo compromisso'}
      description={selectedDayHeading}
      size="md"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isBusy}>
            Cancelar
          </Button>
          {isEditing ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => { if (onRequestDelete) onRequestDelete(item); }}
              disabled={isBusy}
            >
              Excluir
            </Button>
          ) : null}
          <Button
            type="button"
            loading={isMutating}
            disabled={isBusy}
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

        {isEditing ? (
          <div className={styles.reminderSection}>
            <span className={styles.reminderSectionLabel}>Lembrete</span>
            <div className={styles.reminderSectionRow}>
              <span className={styles.reminderSectionValue}>
                {reminderIndicator ? (
                  <>
                    <span className={styles.reminderSectionIcon}><BellIcon /></span>
                    {reminderIndicator.label}
                  </>
                ) : 'Nenhum lembrete configurado'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => setShowReminderChoice(true)}
              >
                {reminderIndicator ? 'Alterar' : 'Escolher lembrete'}
              </Button>
            </div>
          </div>
        ) : (
          // AGPUSH3: criar um compromisso ainda não gera um agenda_item_id
          // real -- ligar a escolha de lembrete a essa criação exigiria
          // tocar a lógica de idempotência do fluxo de criação, fora do
          // escopo desta integração (ver comentário do componente).
          <p className={styles.reminderNote} role="note">
            Lembrete por notificação ainda não está disponível nesta versão.
          </p>
        )}
      </div>

      {localError ? (
        <p className={styles.formError} role="alert">{localError}</p>
      ) : null}

      {showReminderChoice ? (
        <AgendaReminderChoiceModal
          item={item}
          onClose={() => setShowReminderChoice(false)}
          onReminderApplied={handleReminderApplied}
        />
      ) : null}
    </Modal>
  );
}

export default SimplifiedAgendaFormModal;
