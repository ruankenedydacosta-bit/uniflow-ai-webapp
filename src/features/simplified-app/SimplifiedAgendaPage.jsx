import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useAgenda } from '../../hooks/useAgenda.js';
import { getAgendaItem } from '../../services/agendaService.js';
import AgendaDeleteConfirmModal from '../../pages/agenda/AgendaDeleteConfirmModal.jsx';
import { getAgendaItemErrorMessage } from '../../pages/agenda/agendaFormUtils.js';
import AgendaReminderChoiceModal from './AgendaReminderChoiceModal.jsx';
import SimplifiedAgendaFormModal from './SimplifiedAgendaFormModal.jsx';
import {
  buildMonthGrid,
  buildMonthRange,
  formatAgendaItemTime,
  formatDayHeading,
  formatMonthLabel,
  groupAgendaItemsByDay,
  shiftMonth,
  toDateKey,
  WEEKDAY_HEADER_LABELS,
} from './simplifiedAgendaCalendar.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { BellIcon, ChevronRightIcon } from './SimplifiedIcons.jsx';
import {
  cancelReminderAppliedAnimation,
  playReminderAppliedAnimation,
} from '../agenda-push/agendaReminderAnimation.js';
import { resolveReminderIndicator } from '../agenda-push/agendaReminderIndicator.js';
import { useAgendaReminderStates } from '../agenda-push/useAgendaReminderStates.js';
import animationStyles from '../agenda-push/agendaReminderAnimation.module.css';
import styles from './simplifiedAgenda.module.css';

// AGPUSH2: atributo estável usado SÓ pela microinteração para localizar o
// card de destino da partícula. Não é seletor de estilo e não participa da
// lógica da Agenda -- se o card não estiver montado, a animação
// simplesmente não acontece (fallback), nunca um erro.
export const AGENDA_REMINDER_TARGET_ATTRIBUTE = 'data-agenda-reminder-target';

/**
 * Agenda visual da experiência simplificada (rota /app/agenda, acessada via
 * Conta > Agenda). É um CALENDÁRIO simples de verdade:
 *
 * - grade do mês (SEG..DOM) com "Hoje" destacado e dias com compromissos
 *   marcados;
 * - navegação de meses (anterior/próximo) e botão "Hoje";
 * - painel do dia selecionado com os compromissos do dia (+ o próprio item,
 *   com "Dia inteiro" ou horário local);
 * - "Novo compromisso" e edição via SimplifiedAgendaFormModal (mesmo
 *   contrato agendaFormUtils) e exclusão com confirmação via
 *   AgendaDeleteConfirmModal -- TODAS as escritas passam por useAgenda,
 *   nenhuma chamada direta ao Supabase aqui.
 *
 * A lista completa legada (AgendaPage com filtros CRM) segue disponível na
 * rota legada /agenda; esta rota simplificada /app/agenda assume o visual
 * de calendário.
 */
function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function ChevronRightButtonIcon() {
  return <ChevronRightIcon />;
}

function ChevronLeftButtonIcon() {
  return (
    <span className={styles.rotatedRight} aria-hidden="true">
      <ChevronRightIcon />
    </span>
  );
}

function SimplifiedAgendaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, workspace } = useSession();
  const workspaceId = workspace?.id;

  const now = useMemo(() => new Date(), []);
  const todayKey = toDateKey(now);
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);

  const { startsFrom, startsTo } = useMemo(
    () => buildMonthRange(view.year, view.month),
    [view.year, view.month],
  );

  const agenda = useAgenda({ workspaceId, startsFrom, startsTo });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [reminderPromptItem, setReminderPromptItem] = useState(null);

  // AGPUSH1: deep link vindo de um push de Agenda (?item=<id>, com
  // reminderPrompt=1 quando a origem e a PERGUNTA "quer que eu te
  // lembre?") -- localiza o compromisso, leva o calendario ate o dia dele
  // e, no caso da pergunta, abre a escolha pequena (fallback iPhone/sem
  // actions). RLS de getAgendaItem ja garante ownership; um item
  // inexistente ou de outro workspace simplesmente nao abre nada.
  useEffect(() => {
    const itemId = searchParams.get('item');
    if (!itemId || !workspaceId) return undefined;

    let cancelled = false;
    (async () => {
      const result = await getAgendaItem(workspaceId, itemId);
      if (cancelled || !result?.data) return;

      const item = result.data;
      const startsAt = new Date(item.starts_at);
      if (!Number.isNaN(startsAt.getTime())) {
        setView({ year: startsAt.getFullYear(), month: startsAt.getMonth() });
        setSelectedDayKey(toDateKey(startsAt));
      }

      if (searchParams.get('reminderPrompt') === '1') {
        setReminderPromptItem(item);
      }
    })();

    setSearchParams((params) => {
      params.delete('item');
      params.delete('reminderPrompt');
      return params;
    }, { replace: true });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const groupedItems = useMemo(() => groupAgendaItemsByDay(agenda.items), [agenda.items]);
  // Memoizado: `?? []` criaria um array novo a cada render, invalidando o
  // useMemo de visibleItemIds abaixo e refazendo a leitura dos lembretes
  // sem necessidade.
  const selectedDayItems = useMemo(
    () => groupedItems.get(selectedDayKey) ?? [],
    [groupedItems, selectedDayKey],
  );

  // AGPUSH2: indicador de lembrete dos cards visíveis -- sempre a partir do
  // estado REALMENTE persistido (agenda_push_reminders), nunca de "a
  // animação rodou". É isso que faz o indicador sobreviver a reload e
  // refletir uma decisão tomada em outro dispositivo.
  const visibleItemIds = useMemo(
    () => selectedDayItems.map((item) => item.id),
    [selectedDayItems],
  );
  const { statesByItemId, applyDecision } = useAgendaReminderStates(visibleItemIds);

  // Nenhuma partícula pode sobreviver à saída da tela.
  useEffect(() => cancelReminderAppliedAnimation, []);

  // AGPUSH2: só chega aqui DEPOIS de a decisão ter sido persistida com
  // sucesso (o modal nunca chama isto em caso de erro). A ordem importa: o
  // estado real entra primeiro (o indicador já é verdade), e a animação é
  // pura consequência visual.
  function handleReminderApplied({ agendaItemId, offsetMinutes, originRect }) {
    applyDecision(agendaItemId, offsetMinutes);
    setReminderPromptItem(null);

    // "Não precisa" não instala nada no compromisso -- nenhuma partícula
    // viaja até o card (a dissolução acontece no próprio modal).
    if (offsetMinutes == null || !originRect) return;

    const targetElement = document.querySelector(
      `[${AGENDA_REMINDER_TARGET_ATTRIBUTE}="${agendaItemId}"]`,
    );
    // Card fora da viewport/desmontado: sem partícula e, principalmente,
    // sem scroll automático e sem navegar a tela sozinho. O indicador já
    // aparece normalmente quando o card voltar a ser visível.
    playReminderAppliedAnimation({
      originRect,
      targetElement,
      classNames: {
        overlay: animationStyles.overlay,
        particle: animationStyles.particle,
        cardGlow: animationStyles.cardGlow,
        cardRing: animationStyles.cardRing,
      },
    });
  }

  function selectToday() {
    const today = new Date();
    setView({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedDayKey(toDateKey(today));
  }

  function moveMonth(delta) {
    const next = shiftMonth(view.year, view.month, delta);
    setView(next);
    // Preserva o dia (com clamp no último dia do mês alvo) para o dia
    // selecionado nunca ficar "pendurado" num mês invisível.
    const lastDayOfTargetMonth = new Date(next.year, next.month + 1, 0).getDate();
    const currentDay = Number(selectedDayKey.slice(-2));
    setSelectedDayKey(
      `${next.year}-${String(next.month + 1).padStart(2, '0')}-${String(Math.min(currentDay, lastDayOfTargetMonth)).padStart(2, '0')}`,
    );
  }

  function handleDaySelect(dayKey) {
    setSelectedDayKey(dayKey);
  }

  function openCreate() {
    setEditingItem(null);
    setShowCreateModal(true);
  }

  function openEdit(item) {
    setShowCreateModal(true);
    setEditingItem(item);
  }

  const monthGrid = buildMonthGrid(view.year, view.month, now);

  return (
    <div className={styles.page} data-simplified-agenda>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
            aria-label="Voltar para Conta"
          >
            <BackIcon />
          </button>
          <h1>Agenda</h1>
        </div>
      </header>

      <nav className={styles.monthNav} aria-label="Navegação entre meses">
        <button
          type="button"
          className={styles.monthArrow}
          onClick={() => moveMonth(-1)}
          aria-label="Mês anterior"
        >
          <ChevronLeftButtonIcon />
        </button>
        <button type="button" className={styles.monthLabel} onClick={selectToday} aria-label="Ir para hoje">
          {formatMonthLabel(view.year, view.month)}
        </button>
        <button
          type="button"
          className={styles.monthArrow}
          onClick={() => moveMonth(1)}
          aria-label="Próximo mês"
        >
          <ChevronRightButtonIcon />
        </button>
      </nav>

      <section className={styles.calendarCard} aria-label="Calendário">
        <div className={styles.weekdayRow} role="row" aria-label="Dias da semana">
          {WEEKDAY_HEADER_LABELS.map((weekday) => (
            <span key={weekday} className={styles.weekdayLabel}>{weekday}</span>
          ))}
        </div>
        <div className={styles.monthGrid} role="grid">
          {monthGrid.map((cell) => {
            const dayKey = toDateKey(cell.date);
            const dayItems = groupedItems.get(dayKey) ?? [];
            const isSelected = dayKey === selectedDayKey;
            return (
              <button
                key={dayKey}
                type="button"
                className={[
                  styles.dayCell,
                  !cell.inMonth ? styles.outsideMonth : '',
                  cell.isToday ? styles.today : '',
                  isSelected ? styles.selected : '',
                  dayItems.length > 0 ? styles.hasEvents : '',
                ].join(' ')}
                onClick={() => handleDaySelect(dayKey)}
                aria-label={`${formatDayHeading(cell.date)}${
                  cell.isToday ? ', hoje' : ''
                }${dayItems.length > 0 ? `, ${dayItems.length} compromisso${dayItems.length > 1 ? 's' : ''}` : ''}`}
                aria-pressed={isSelected}
              >
                <span className={styles.dayNumber}>{cell.day}</span>
                {dayItems.length > 0 ? <span className={styles.eventDot} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.dayPanel} aria-label={`Compromissos de ${formatDayHeading(new Date(`${selectedDayKey}T12:00:00`))}`}>
        <div className={styles.dayPanelHeader}>
          <h2>{formatDayHeading(new Date(`${selectedDayKey}T12:00:00`))}</h2>
          <button type="button" className={styles.addButton} onClick={openCreate} aria-label="Novo compromisso">
            + Novo compromisso
          </button>
        </div>

        {agenda.isLoading ? (
          <p className={styles.stateMessage}>Carregando compromissos…</p>
        ) : agenda.error ? (
          <div className={styles.errorBlock}>
            <p className={styles.stateMessage} role="alert">
              {getAgendaItemErrorMessage(agenda.error, 'Não foi possível carregar a agenda. Tente novamente.')}
            </p>
            <button type="button" className={styles.retryButton} onClick={() => agenda.refresh()}>
              Tentar novamente
            </button>
          </div>
        ) : selectedDayItems.length === 0 ? (
          <p className={styles.stateMessage}>Nenhum compromisso neste dia.</p>
        ) : (
          <ul className={styles.dayItems}>
            {selectedDayItems.map((item) => {
              const reminder = resolveReminderIndicator(statesByItemId.get(item.id));
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.itemButton}
                    onClick={() => openEdit(item)}
                    aria-label={`${item.title}, ${formatAgendaItemTime(item)}${reminder ? `, lembrete ${reminder.label}` : ''}`}
                    {...{ [AGENDA_REMINDER_TARGET_ATTRIBUTE]: item.id }}
                  >
                    <span className={styles.itemTime} aria-hidden="true">{formatAgendaItemTime(item)}</span>
                    <span className={styles.itemMain}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      {reminder ? (
                        <span className={styles.reminderChip} aria-hidden="true">
                          <span className={styles.reminderChipIcon}><BellIcon /></span>
                          {reminder.label}
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.itemChevron} aria-hidden="true"><ChevronRightIcon /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showCreateModal ? (
        <SimplifiedAgendaFormModal
          item={editingItem}
          defaultDay={new Date(`${selectedDayKey}T12:00:00`)}
          agenda={agenda}
          userId={user?.id}
          workspaceId={workspaceId}
          onClose={() => { setShowCreateModal(false); setEditingItem(null); }}
          onRequestDelete={(item) => { setShowCreateModal(false); setDeletingItem(item); }}
          onReminderApplied={handleReminderApplied}
        />
      ) : null}

      {deletingItem ? (
        <AgendaDeleteConfirmModal
          item={deletingItem}
          agenda={agenda}
          onClose={() => setDeletingItem(null)}
        />
      ) : null}

      {reminderPromptItem ? (
        <AgendaReminderChoiceModal
          item={reminderPromptItem}
          onClose={() => setReminderPromptItem(null)}
          onReminderApplied={handleReminderApplied}
        />
      ) : null}
    </div>
  );
}

export default SimplifiedAgendaPage;
