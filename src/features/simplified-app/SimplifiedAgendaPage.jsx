import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import FilterChips from '../../components/ui/FilterChips/index.js';
import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import { useAgenda } from '../../hooks/useAgenda.js';
import { getAgendaItem } from '../../services/agendaService.js';
import { obterConexao } from '../../services/googleCalendarService.js';
import IconBox from '../../components/ui/IconBox/index.js';
import AgendaDeleteConfirmModal from '../../pages/agenda/AgendaDeleteConfirmModal.jsx';
import { AGENDA_ITEM_TYPE_LABELS, getAgendaItemErrorMessage } from '../../pages/agenda/agendaFormUtils.js';
import AgendaReminderChoiceModal from './AgendaReminderChoiceModal.jsx';
import SimplifiedAgendaFormModal from './SimplifiedAgendaFormModal.jsx';
import {
  buildMonthTransactionRange,
  isProjectedTransactionItem,
} from './agendaTransactionProjection.js';
import { useScheduledTransactionAgendaItems } from './useScheduledTransactionAgendaItems.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  AGENDA_KIND_FILTERS,
  buildMonthGrid,
  buildMonthRange,
  buildTomorrowSummary,
  filterAgendaItemsByKind,
  formatAgendaItemTime,
  formatDayHeading,
  formatMonthTitle,
  formatWeekdayHeader,
  groupAgendaItemsByDay,
  resolveAgendaItemTone,
  resolveAgendaTimelineStatuses,
  shiftMonth,
  toDateKey,
  WEEKDAY_HEADER_LABELS,
} from './simplifiedAgendaCalendar.js';
import { buildAgendaItemDetail } from './simplifiedHomeAgenda.js';
import { resumoDaConexaoNaAgenda } from './googleAgendaPresentation.js';
import { BellIcon, ChevronRightIcon } from './SimplifiedIcons.jsx';
import { PhCaretLeftIcon, PhCaretRightIcon, PhGoogleLogoIcon, PhPlusIcon } from './SimplifiedIcons.jsx';
import {
  cancelReminderAppliedAnimation,
  playReminderAppliedAnimation,
} from '../agenda-push/agendaReminderAnimation.js';
import { getReminderMotionProfile } from '../agenda-push/agendaReminderMotionProfiles.js';
import { resolveReminderIndicator } from '../agenda-push/agendaReminderIndicator.js';
import { useAgendaReminderStates } from '../agenda-push/useAgendaReminderStates.js';
import animationStyles from '../agenda-push/agendaReminderAnimation.module.css';
import styles from './simplifiedAgenda.module.css';

// AGPUSH4: enfase de cor do contorno por variante -- "energetic" (30min)
// chega ao ciano cedo/largo, "calm" (1h) guarda o ciano so perto da
// absorcao. Combinada pelo motor com a classe base (espessura/mascara/
// glow, compartilhada -- ver agendaReminderAnimation.module.css).
const RING_VARIANT_CLASS_NAMES = {
  energetic: 'cardRingBrightEarly',
  calm: 'cardRingBrightLate',
};

// AGPUSH2: atributo estável usado SÓ pela microinteração para localizar o
// card de destino da partícula. Não é seletor de estilo e não participa da
// lógica da Agenda -- se o card não estiver montado, a animação
// simplesmente não acontece (fallback), nunca um erro.
export const AGENDA_REMINDER_TARGET_ATTRIBUTE = 'data-agenda-reminder-target';

// Etiquetas da timeline (handoff 06): só o vencimento muda de nome aqui;
// o formulário e a lista legada continuam com AGENDA_ITEM_TYPE_LABELS.
const TIMELINE_TAG_LABELS = Object.freeze({
  ...AGENDA_ITEM_TYPE_LABELS,
  payment_due: 'Conta a pagar',
});

// "Dia inteiro" e "Sem horário" não cabem na coluna da hora em 13px.
const LONG_TIME_LABELS = new Set(['Dia inteiro', 'Sem horário']);

/**
 * Agenda visual da experiência simplificada (rota /app/agenda). No redesign
 * (#89, handoff 06) ela segue sendo um CALENDÁRIO simples:
 *
 * - grade do mês (Seg..Dom) com "Hoje" destacado e dias com compromissos
 *   marcados;
 * - navegação de meses (anterior/próximo) e "Hoje";
 * - chips de filtro por tipo (Tudo, Compromissos, Contas, Tarefas, Lembretes);
 * - timeline do dia selecionado, com a etiqueta do tipo em cada item;
 * - botão flutuante "Criar item na agenda" e edição via
 *   SimplifiedAgendaFormModal (mesmo contrato agendaFormUtils) e exclusão
 *   com confirmação via AgendaDeleteConfirmModal -- TODAS as escritas
 *   passam por useAgenda, nenhuma chamada direta ao Supabase aqui.
 *
 * A lista completa legada (AgendaPage com filtros CRM) segue disponível na
 * rota legada /agenda; esta rota simplificada /app/agenda assume o visual
 * de calendário.
 */
function SimplifiedAgendaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, workspace } = useSession();
  const workspaceId = workspace?.id;

  const now = useMemo(() => new Date(), []);
  const todayKey = toDateKey(now);
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const [kindFilter, setKindFilter] = useState('all');

  const { startsFrom, startsTo } = useMemo(
    () => buildMonthRange(view.year, view.month),
    [view.year, view.month],
  );

  const agenda = useAgenda({ workspaceId, startsFrom, startsTo });
  // Contas lançadas com antecedência no Financeiro entram no calendário ao
  // lado dos compromissos. Tocar numa delas abre o Financeiro, onde ela é
  // editada.
  const transactionRange = useMemo(
    () => buildMonthTransactionRange(view.year, view.month),
    [view.year, view.month],
  );
  const scheduledTransactions = useScheduledTransactionAgendaItems({
    workspaceId,
    dateFrom: transactionRange.dateFrom,
    dateTo: transactionRange.dateTo,
  });

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

  // Épico #98: estado da conexão com o Google Agenda, na linha do topo. A
  // resposta guarda o espaço: enquanto a do espaço aberto agora não chega,
  // a linha mostra "Carregando…".
  const [conexaoGoogle, setConexaoGoogle] = useState(null);
  useEffect(() => {
    if (!workspaceId) return undefined;
    let cancelled = false;
    obterConexao({ workspaceId }).then(({ data, error }) => {
      if (cancelled) return;
      setConexaoGoogle(error
        ? { workspaceId, estado: 'erro', conexao: null }
        : { workspaceId, estado: 'ok', conexao: data });
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);
  const resumoGoogle = resumoDaConexaoNaAgenda(
    conexaoGoogle?.workspaceId === workspaceId ? conexaoGoogle : { estado: 'carregando' },
  );

  const groupedItems = useMemo(
    () => groupAgendaItemsByDay([...agenda.items, ...scheduledTransactions.items]),
    [agenda.items, scheduledTransactions.items],
  );
  // Memoizado: `?? []` criaria um array novo a cada render, invalidando o
  // useMemo de visibleItemIds abaixo e refazendo a leitura dos lembretes
  // sem necessidade. A timeline é ordenada por horário e filtrada pelo chip.
  const selectedDayItems = useMemo(
    () => filterAgendaItemsByKind(groupedItems.get(selectedDayKey) ?? [], kindFilter)
      .slice()
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [groupedItems, selectedDayKey, kindFilter],
  );
  const timelineStatuses = useMemo(
    () => resolveAgendaTimelineStatuses(selectedDayItems, { now, dayKey: selectedDayKey }),
    [selectedDayItems, now, selectedDayKey],
  );
  const tomorrowSummary = useMemo(
    () => buildTomorrowSummary(groupedItems, { now, loadedMonth: view }),
    [groupedItems, now, view],
  );

  // AGPUSH2: indicador de lembrete dos cards visíveis -- sempre a partir do
  // estado REALMENTE persistido (agenda_push_reminders), nunca de "a
  // animação rodou". É isso que faz o indicador sobreviver a reload e
  // refletir uma decisão tomada em outro dispositivo.
  // Projeções de lançamento não têm linha em agenda_push_reminders: o id
  // com prefixo nunca pode ir para a consulta de lembretes.
  const visibleItemIds = useMemo(
    () => selectedDayItems.filter((item) => !isProjectedTransactionItem(item)).map((item) => item.id),
    [selectedDayItems],
  );
  const { statesByItemId, applyDecision } = useAgendaReminderStates(visibleItemIds);

  // Nenhuma partícula pode sobreviver à saída da tela.
  useEffect(() => cancelReminderAppliedAnimation, []);

  // AGPUSH2: só chega aqui DEPOIS de a decisão ter sido persistida com
  // sucesso (o modal nunca chama isto em caso de erro). A ordem importa: o
  // estado real entra primeiro (o indicador já é verdade), e a animação é
  // pura consequência visual.
  function handleReminderApplied({
    agendaItemId, variant, offsetMinutes, originRect,
  }) {
    setReminderPromptItem(null);

    // "Não precisa" não instala nada no compromisso -- nenhuma partícula
    // viaja até o card (a dissolução acontece no próprio modal). Sem
    // absorção para esperar, o estado é aplicado na hora.
    if (offsetMinutes == null || !originRect) {
      applyDecision(agendaItemId, offsetMinutes);
      return;
    }

    const targetElement = document.querySelector(
      `[${AGENDA_REMINDER_TARGET_ATTRIBUTE}="${agendaItemId}"]`,
    );
    const profile = getReminderMotionProfile(variant);

    // AGPUSH4: o estado persistido já está salvo (feito antes de chegar
    // aqui, ver AgendaReminderChoiceModal) -- só a REVELAÇÃO VISUAL do
    // indicador é adiada até a partícula terminar de ser absorvida
    // (onAbsorbed), para a narrativa ficar "partícula entra -> card reage
    // -> lembrete aparece" em vez de o chip já nascer junto com a
    // partícula. Quando não há animação de verdade (reduced motion, card
    // fora da viewport/desmontado), o motor chama onAbsorbed IMEDIATAMENTE
    // -- o indicador nunca fica preso esperando uma partícula que não vai
    // rodar.
    playReminderAppliedAnimation({
      originRect,
      targetElement,
      profile,
      onAbsorbed: () => applyDecision(agendaItemId, offsetMinutes),
      classNames: {
        overlay: animationStyles.overlay,
        particle: animationStyles.particle,
        cardGlow: animationStyles.cardGlow,
        cardRing: animationStyles.cardRing,
        cardRingVariant: animationStyles[RING_VARIANT_CLASS_NAMES[variant]],
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
          <h1>Agenda</h1>
        </div>
      </header>

      <button
        type="button"
        className={styles.googleRow}
        data-tom={resumoGoogle.tom}
        onClick={() => navigate(SIMPLIFIED_ROUTES.AGENDA_GOOGLE)}
        aria-label={`Google Agenda, ${resumoGoogle.detalhe}`}
      >
        <IconBox size={32}><PhGoogleLogoIcon /></IconBox>
        <span className={styles.googleRowText}>
          <span className={styles.googleRowTitle}>Google Agenda</span>
          <span className={styles.googleRowDetail}>{resumoGoogle.detalhe}</span>
        </span>
        <span className={styles.itemChevron} aria-hidden="true"><ChevronRightIcon /></span>
      </button>

      <section className={styles.calendarBlock} aria-label="Calendário">
        <nav className={styles.monthNav} aria-label="Navegação entre meses">
          <div className={styles.monthNavTitle}>
            <button
              type="button"
              className={styles.monthArrow}
              onClick={() => moveMonth(-1)}
              aria-label="Mês anterior"
            >
              <PhCaretLeftIcon />
            </button>
            <h2 className={styles.monthLabel}>{formatMonthTitle(view.year, view.month)}</h2>
            <button
              type="button"
              className={styles.monthArrow}
              onClick={() => moveMonth(1)}
              aria-label="Próximo mês"
            >
              <PhCaretRightIcon />
            </button>
          </div>
          <button type="button" className={styles.todayLink} onClick={selectToday} aria-label="Ir para hoje">
            Hoje
          </button>
        </nav>

        <div className={styles.weekdayRow} role="row" aria-label="Dias da semana">
          {WEEKDAY_HEADER_LABELS.map((weekday) => (
            <span key={weekday} className={styles.weekdayLabel}>{formatWeekdayHeader(weekday)}</span>
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
                <span className={`${styles.eventDot} ${dayItems.length > 0 ? styles.eventDotActive : ''}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      <FilterChips
        label="Filtrar por tipo"
        options={AGENDA_KIND_FILTERS}
        value={kindFilter}
        onChange={setKindFilter}
      />

      <section className={styles.dayPanel} aria-label={`Compromissos de ${formatDayHeading(new Date(`${selectedDayKey}T12:00:00`))}`}>
        <div className={styles.dayPanelHeader}>
          <h2>{formatDayHeading(new Date(`${selectedDayKey}T12:00:00`))}</h2>
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
          <ol className={styles.dayItems}>
            {selectedDayItems.map((item, index) => {
              const reminder = resolveReminderIndicator(statesByItemId.get(item.id));
              const detail = buildAgendaItemDetail(item);
              const timeLabel = formatAgendaItemTime(item);
              // Conta vinda do Financeiro não tem agenda_item por trás: não
              // abre a edição de compromisso nem recebe lembrete.
              const isProjected = isProjectedTransactionItem(item);
              return (
                <li
                  key={item.id}
                  className={styles.timelineItem}
                  data-tone={resolveAgendaItemTone(item)}
                  data-status={timelineStatuses[index]}
                >
                  <span className={styles.timelineMarker} aria-hidden="true" />
                  <span
                    className={styles.itemTime}
                    data-long={LONG_TIME_LABELS.has(timeLabel) ? 'true' : undefined}
                    aria-hidden="true"
                  >
                    {timeLabel}
                  </span>
                  <button
                    type="button"
                    className={styles.itemButton}
                    onClick={isProjected ? () => navigate(SIMPLIFIED_ROUTES.RECORDS) : () => openEdit(item)}
                    aria-label={`${item.title}, ${formatAgendaItemTime(item)}${reminder ? `, lembrete ${reminder.label}` : ''}${isProjected ? ', abrir no Financeiro' : ''}`}
                    {...{ [AGENDA_REMINDER_TARGET_ATTRIBUTE]: item.id }}
                  >
                    <span className={styles.itemMain}>
                      <span className={styles.itemTitleRow}>
                        <span className={styles.itemTitle}>{item.title}</span>
                        <span className={styles.itemTag} aria-hidden="true">
                          {TIMELINE_TAG_LABELS[item.item_type] ?? TIMELINE_TAG_LABELS.other}
                        </span>
                      </span>
                      {detail ? <span className={styles.itemDetail}>{detail}</span> : null}
                      {reminder ? (
                        // AGPUSH4: key pelo rotulo -- forca um remount (e
                        // portanto a animacao de entrada em CSS tocar de
                        // novo) sempre que o valor realmente muda (nasce
                        // pela 1a vez, ou 30min->1h via "Alterar"), nunca
                        // em re-renders que nao mudam o lembrete.
                        <span key={reminder.label} className={styles.reminderChip} aria-hidden="true">
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
          </ol>
        )}
      </section>

      {tomorrowSummary && !agenda.isLoading && !agenda.error
        && !scheduledTransactions.isLoading && !scheduledTransactions.error ? (
        <aside className={styles.uniNote}>
          <UniRingOrb size={22} />
          <p>{tomorrowSummary}</p>
        </aside>
      ) : null}

      <button
        type="button"
        className={styles.addButton}
        onClick={openCreate}
        aria-label="Criar item na agenda"
      >
        <PhPlusIcon />
      </button>

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
