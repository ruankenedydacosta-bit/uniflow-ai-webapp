import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../app/SessionContext.jsx';
import { useAgenda } from '../../hooks/useAgenda.js';
import { useCategories, useTransactions } from '../../hooks';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { useAgendaReminderStates } from '../agenda-push/useAgendaReminderStates.js';
import { buildMonthlyReportData } from './monthlyReportData.js';
import { buildMonthRange, shiftMonth } from './simplifiedAgendaCalendar.js';
import { getMonthRange } from './simplifiedRecordsData.js';

/**
 * RELATORIO1/RELATORIO-SPREADSHEET1: fonte única de dados do Relatório da
 * Uni -- extraída para cá porque a Tela 1 (resumo, SimplifiedReportPage)
 * e a Tela 2 (planilha, SimplifiedReportSpreadsheetPage) precisam
 * exatamente da mesma coisa: mês selecionado, dados reais e atualização
 * em tempo real. Ter as duas com a MESMA implementação (em vez de duas
 * cópias) é o que garante Tela 1 === Tela 2 === XLSX sempre, por
 * construção -- nunca por disciplina de manter cópias sincronizadas.
 *
 * Reaproveita EXATAMENTE as mesmas fontes/regras já estabilizadas em
 * Registros e na Agenda (useTransactions/useCategories/useAgenda +
 * getMonthRange/summarizeMonth via monthlyReportData.js).
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
export function useMonthlyReport() {
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

  const moveMonth = (delta) => setSelectedMonth((current) => shiftMonth(current.year, current.month, delta));

  return { report, moveMonth };
}
