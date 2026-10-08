import { useEffect, useMemo, useState } from 'react';
import { listTransactionsForPeriod } from '../../services/transactionService.js';
import { buildScheduledTransactionAgendaItems } from './agendaTransactionProjection.js';

const NO_ITEMS = Object.freeze([]);

/**
 * Contas lançadas com antecedência no Financeiro, entre dateFrom e dateTo
 * (YYYY-MM-DD), prontas para entrar na Agenda e na Home ao lado dos
 * agenda_items.
 *
 * O resultado fica guardado com a chave da consulta (workspace + período):
 * ao trocar de espaço ou de mês, a lista anterior deixa de valer na hora,
 * sem esperar a resposta nova. Falha na busca devolve lista vazia, e a tela
 * segue só com os compromissos.
 */
export function useScheduledTransactionAgendaItems({ workspaceId, dateFrom, dateTo }) {
  const queryKey = workspaceId ? `${workspaceId}|${dateFrom}|${dateTo}` : null;
  const [loaded, setLoaded] = useState({ queryKey: null, items: NO_ITEMS });

  useEffect(() => {
    if (!queryKey) return undefined;

    let ignoreResult = false;
    (async () => {
      const result = await listTransactionsForPeriod(workspaceId, { dateFrom, dateTo });
      if (ignoreResult) return;
      setLoaded({
        queryKey,
        items: result.error ? NO_ITEMS : buildScheduledTransactionAgendaItems(result.data),
      });
    })();

    return () => {
      ignoreResult = true;
    };
  }, [queryKey, workspaceId, dateFrom, dateTo]);

  return useMemo(
    () => (loaded.queryKey === queryKey ? loaded.items : NO_ITEMS),
    [loaded, queryKey],
  );
}
