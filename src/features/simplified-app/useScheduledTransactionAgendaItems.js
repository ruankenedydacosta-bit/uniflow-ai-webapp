import { useEffect, useMemo, useState } from 'react';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { listScheduledTransactionCandidates } from '../../services/transactionService.js';
import { buildScheduledTransactionAgendaItems } from './agendaTransactionProjection.js';

const NO_ITEMS = Object.freeze([]);
const LOAD_ERROR = Object.freeze({
  code: 'SCHEDULED_TRANSACTIONS_UNAVAILABLE',
  message: 'Não foi possível carregar as contas do Financeiro.',
});

/**
 * Contas lançadas com antecedência no Financeiro, entre dateFrom e dateTo
 * (YYYY-MM-DD), prontas para entrar na Agenda e na Home ao lado dos
 * agenda_items. Hook próprio em vez de useTransactions: a consulta aqui é
 * enxuta (só despesa/receita válidas e os campos da projeção) e não há
 * escrita.
 *
 * O resultado fica guardado com a chave da consulta (workspace + período):
 * ao trocar de espaço ou de mês, a lista anterior deixa de valer na hora.
 * Enquanto a chave não tem resposta, isLoading é true. Lançamento salvo em
 * outra tela (Uni, Financeiro) dispara FINANCIAL_DATA_CHANGED_EVENT e a
 * lista é buscada de novo.
 */
export function useScheduledTransactionAgendaItems({ workspaceId, dateFrom, dateTo }) {
  const queryKey = workspaceId ? `${workspaceId}|${dateFrom}|${dateTo}` : null;
  const [loaded, setLoaded] = useState({ queryKey: null, items: NO_ITEMS, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    function handleDataChanged() {
      setReloadToken((token) => token + 1);
    }
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
  }, []);

  useEffect(() => {
    if (!queryKey) return undefined;

    let ignoreResult = false;
    (async () => {
      let next;
      try {
        const result = await listScheduledTransactionCandidates(workspaceId, { dateFrom, dateTo });
        next = result.error
          ? { queryKey, items: NO_ITEMS, error: result.error }
          : { queryKey, items: buildScheduledTransactionAgendaItems(result.data), error: null };
      } catch {
        next = { queryKey, items: NO_ITEMS, error: LOAD_ERROR };
      }
      if (!ignoreResult) setLoaded(next);
    })();

    return () => {
      ignoreResult = true;
    };
  }, [queryKey, workspaceId, dateFrom, dateTo, reloadToken]);

  return useMemo(() => {
    if (!queryKey) return { items: NO_ITEMS, isLoading: false, error: null };
    if (loaded.queryKey !== queryKey) return { items: NO_ITEMS, isLoading: true, error: null };
    return { items: loaded.items, isLoading: false, error: loaded.error };
  }, [loaded, queryKey]);
}
