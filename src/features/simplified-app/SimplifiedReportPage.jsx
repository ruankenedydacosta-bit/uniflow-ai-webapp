import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useAgenda } from '../../hooks/useAgenda.js';
import { useCategories, useTransactions } from '../../hooks';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { useAgendaReminderStates } from '../agenda-push/useAgendaReminderStates.js';
import { buildMonthlyReportData } from './monthlyReportData.js';
import { buildMonthRange, shiftMonth } from './simplifiedAgendaCalendar.js';
import { getMonthRange } from './simplifiedRecordsData.js';
import { ChevronRightIcon } from './SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedReport.module.css';

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

/**
 * RELATORIO1: Relatório da Uni -- visão VIVA dos dados reais, nunca um
 * snapshot persistido. Reaproveita EXATAMENTE as mesmas fontes/regras já
 * estabilizadas em Registros e na Agenda (useTransactions/useCategories/
 * useAgenda + getMonthRange/summarizeMonth via monthlyReportData.js) --
 * ver esse arquivo para a regra de "por que os totais nunca divergem de
 * Registros".
 *
 * Atualização em tempo real: mesmo padrão de três gatilhos já usado pelo
 * gráfico financeiro da Home (SimplifiedHomeFinancialGraph.jsx) --
 * (1) refetch de mount do próprio useTransactions/useAgenda, que cobre o
 * caso real e alcançável nesta arquitetura de rotas (o relatório está
 * SEMPRE desmontado enquanto o usuário confirma algo na Uni, já que são
 * rotas mutuamente exclusivas -- navegar de volta para cá já busca dados
 * atuais, sem precisar de um evento cross-rota);
 * (2) FINANCIAL_DATA_CHANGED_EVENT, para o caso do relatório continuar
 * montado quando a alteração acontece (defensivo, cobre qualquer futuro
 * fluxo que não navegue);
 * (3) visibilitychange, para quando o app volta do background.
 *
 * Agenda NÃO tem um evento cross-componente equivalente hoje (auditado:
 * não existe) -- decisão desta fase foi NÃO criar um novo (tocaria
 * agendaConversationFlow.js, arquivo complexo e crítico, fora do que é
 * alcançável na prática já que as rotas são mutuamente exclusivas).
 * Mount-refetch + visibilitychange cobrem os cenários reais.
 */
function SimplifiedReportPage() {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const selectedDate = useMemo(
    () => new Date(selectedMonth.year, selectedMonth.month, 1, 12),
    [selectedMonth.year, selectedMonth.month],
  );
  const period = useMemo(() => getMonthRange(selectedDate), [selectedDate]);
  const agendaRange = useMemo(
    () => buildMonthRange(selectedMonth.year, selectedMonth.month),
    [selectedMonth.year, selectedMonth.month],
  );

  const transactionState = useTransactions({
    workspaceId,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    status: 'completed',
  });
  const categoryState = useCategories({ workspaceId, context: 'personal' });
  const agendaState = useAgenda({
    workspaceId,
    startsFrom: agendaRange.startsFrom,
    startsTo: agendaRange.startsTo,
  });
  const agendaItemIds = useMemo(() => agendaState.items.map((item) => item.id), [agendaState.items]);
  const { statesByItemId: reminderStatesByItemId } = useAgendaReminderStates(agendaItemIds);

  const refreshRef = useRef(null);
  useEffect(() => {
    refreshRef.current = () => {
      void Promise.all([
        transactionState.refresh(),
        categoryState.refresh(),
        agendaState.refresh(),
      ]);
    };
  });

  useEffect(() => {
    const handleDataChanged = () => refreshRef.current?.();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshRef.current?.();
    };
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const report = useMemo(
    () => buildMonthlyReportData({
      transactions: transactionState.transactions,
      categories: categoryState.categories,
      agendaItems: agendaState.items,
      reminderStatesByItemId,
      now: selectedDate,
    }),
    [
      transactionState.transactions,
      categoryState.categories,
      agendaState.items,
      reminderStatesByItemId,
      selectedDate,
    ],
  );

  const isEmpty = !report.hasTransactions && !report.hasAgenda;
  const moveMonth = (delta) => setSelectedMonth((current) => shiftMonth(current.year, current.month, delta));

  return (
    <div className={styles.page} data-simplified-report>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(SIMPLIFIED_ROUTES.HOME)}
          aria-label="Voltar para a Home"
        >
          <BackIcon />
        </button>
        <h1>Relatório da Uni</h1>
      </header>

      <nav className={styles.monthNav} aria-label="Navegação entre meses">
        <button type="button" className={styles.monthArrow} onClick={() => moveMonth(-1)} aria-label="Mês anterior">
          <span className={styles.rotatedRight} aria-hidden="true"><ChevronRightIcon /></span>
        </button>
        <span className={styles.monthLabel}>{report.period.label}</span>
        <button type="button" className={styles.monthArrow} onClick={() => moveMonth(1)} aria-label="Próximo mês">
          <ChevronRightIcon />
        </button>
      </nav>

      <section className={styles.summaryGrid} aria-label="Resumo do mês">
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Entradas</span>
          <strong className={styles.summaryValueIncome}>{report.summary.incomeLabel}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Saídas</span>
          <strong className={styles.summaryValueExpense}>{report.summary.expenseLabel}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Movimentações</span>
          <strong className={styles.summaryValue}>{report.summary.transactionCount}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Compromissos</span>
          <strong className={styles.summaryValue}>{report.summary.agendaCount}</strong>
        </div>
      </section>

      {isEmpty ? (
        <p className={styles.emptyState}>
          Seu relatório começa a ser montado automaticamente conforme você usa a Uni.
        </p>
      ) : (
        <>
          <section className={styles.block} aria-label="Movimentações do mês">
            <h2 className={styles.blockTitle}>Movimentações</h2>
            {report.hasTransactions ? (
              report.transactionsByDay.map((group) => (
                <div key={group.dateKey} className={styles.dayGroup}>
                  <span className={styles.dayGroupLabel}>{group.label}</span>
                  <ul className={styles.transactionList}>
                    {group.items.map((row) => (
                      <li key={row.id} className={styles.transactionRow}>
                        <span className={styles.transactionMain}>
                          <span className={styles.transactionDescription}>{row.description}</span>
                          <span className={styles.transactionMeta}>
                            {`${row.categoryName} • ${row.timeLabel}`}
                          </span>
                        </span>
                        <span className={styles.transactionType}>{row.typeLabel}</span>
                        <strong
                          className={row.isPositive ? styles.transactionValueIncome : styles.transactionValueExpense}
                        >
                          {row.formattedAmount}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className={styles.blockEmpty}>Nenhuma movimentação neste mês.</p>
            )}
          </section>

          <section className={styles.block} aria-label="Agenda do mês">
            <h2 className={styles.blockTitle}>Agenda do mês</h2>
            {report.hasAgenda ? (
              <ul className={styles.agendaList}>
                {report.agenda.map((item) => (
                  <li key={item.id} className={styles.agendaRow}>
                    <span className={styles.agendaDateChip}>{item.dateLabel}</span>
                    <span className={styles.agendaMain}>
                      <span className={styles.agendaTime}>{item.timeLabel}</span>
                      <strong className={styles.agendaTitle}>{item.title}</strong>
                      {item.reminderLabel ? (
                        <span className={styles.agendaReminder}>{`Lembrete: ${item.reminderLabel}`}</span>
                      ) : null}
                    </span>
                    <span className={styles.agendaStatus} data-status={item.status}>{item.statusLabel}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.blockEmpty}>Nenhum compromisso neste mês.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default SimplifiedReportPage;
