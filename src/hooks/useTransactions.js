import { useCallback, useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  listTransactionsForPeriod,
  updateTransaction,
} from '../services/transactionService.js';
import {
  cloneRecords,
  createDemoRecord,
  createDemoResult,
  removeRecord,
  upsertRecord,
} from './financialHookUtils.js';
import {
  trackGa4ConfirmedTransactionCreation,
} from '../features/analytics/ga4ProductEvents.js';
import {
  GA4_PRODUCT_ORIGINS,
} from '../features/analytics/ga4ProductContracts.js';

const EMPTY_ARRAY = [];

export function useTransactions({
  workspaceId,
  fallbackTransactions = EMPTY_ARRAY,
  limit = 50,
  status,
  dateFrom,
  dateTo,
} = {}) {
  const [transactions, setTransactions] = useState(() =>
    cloneRecords(fallbackTransactions),
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  // Trava sincrona: isMutating (estado do React) so reflete no proximo
  // render, entao duas chamadas no mesmo ciclo veriam isMutating === false
  // e disparariam duas mutacoes. mutationRef fecha essa janela -- mesmo
  // padrao ja usado em useClients.js/useCrmPipeline.js/useAgenda.js.
  //
  // Chamadas sequenciais aguardadas (ex.: o loop de criacao de parcelas em
  // FinanceTransactionModal.jsx, que faz `await saveTransaction(...)` uma
  // vez por parcela dentro de um for) continuam funcionando sem alteracao:
  // a trava e liberada no `finally` de cada chamada ANTES da proxima
  // iteracao do loop comecar, porque o loop so avanca depois que a Promise
  // anterior resolve. A trava so bloqueia uma SEGUNDA chamada disparada
  // enquanto a primeira ainda esta em andamento (ex.: duplo clique do
  // usuario), nunca uma sequencia de chamadas ja serializadas por await.
  const mutationRef = useRef(false);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured) {
      setTransactions(cloneRecords(fallbackTransactions));
      setError(null);
      setIsLoading(false);
      return createDemoResult(fallbackTransactions);
    }

    if (!workspaceId) {
      setTransactions([]);
      setError({ code: 'WORKSPACE_REQUIRED', message: 'Workspace financeiro ausente.' });
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    // dateFrom/dateTo pedem o periodo COMPLETO (paginado por
    // listTransactionsForPeriod), nao "as N mais recentes" -- usado por
    // Relatorios, que precisa agregar um intervalo de datas inteiro sem
    // truncar por volume. Sem essas datas, mantem o comportamento
    // historico (lista recente limitada por `limit`, usada por
    // Financeiro/Uni/Dashboard).
    const result = dateFrom || dateTo
      ? await listTransactionsForPeriod(workspaceId, { dateFrom, dateTo, status })
      : await listTransactions(workspaceId, { limit, status });

    if (requestId !== requestIdRef.current) {
      return null;
    }

    setTransactions(result.data ?? []);
    setError(result.error);
    setIsLoading(false);
    return result;
  }, [fallbackTransactions, limit, status, dateFrom, dateTo, workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  /**
   * Centraliza saveTransaction/removeTransaction: trava sincrona via
   * mutationRef, isMutating/error de estado, upsert/remocao local via
   * applyLocalUpdate, liberacao da trava em finally. mutationFn decide
   * sozinha entre o branch demo (Supabase nao configurado) e o service
   * real -- preserva exatamente o comportamento anterior de cada mutacao,
   * so remove a duplicacao do envelope em volta delas.
   */
  const performMutation = useCallback(async (mutationFn, applyLocalUpdate) => {
    if (mutationRef.current) {
      return {
        data: null,
        error: {
          code: 'TRANSACTION_MUTATION_IN_PROGRESS',
          message: 'Aguarde a operação atual terminar.',
        },
        isConfigured: isSupabaseConfigured,
      };
    }

    mutationRef.current = true;
    setIsMutating(true);
    setError(null);

    try {
      const result = await mutationFn();

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        applyLocalUpdate(result.data);
      }

      return result;
    } finally {
      mutationRef.current = false;
      setIsMutating(false);
    }
  }, []);

  const saveTransaction = useCallback(
    (values, transactionId = null, { origin = GA4_PRODUCT_ORIGINS.MANUAL } = {}) =>
      performMutation(
        async () => {
          const result = !isSupabaseConfigured
            ? createDemoResult(
                transactionId
                  ? {
                      ...transactions.find((item) => item.id === transactionId),
                      ...values,
                      id: transactionId,
                      updated_at: new Date().toISOString(),
                    }
                  : createDemoRecord('demo-transaction', values),
              )
            : transactionId
              ? updateTransaction(workspaceId, transactionId, values)
              : createTransaction(workspaceId, values);

          trackGa4ConfirmedTransactionCreation({
            confirmed: !transactionId
              && isSupabaseConfigured
              && !result?.error
              && Boolean(result?.data),
            transactionType: values?.transaction_type,
            origin,
          });
          return result;
        },
        // Lista filtrada por status: o registro que mudou de status sai dela,
        // em vez de ficar até o próximo refresh.
        (data) => setTransactions((current) => (
          status && data.status !== status
            ? removeRecord(current, data.id)
            : upsertRecord(current, data)
        )),
      ),
    [performMutation, status, transactions, workspaceId],
  );

  const removeTransaction = useCallback(
    (transactionId) =>
      performMutation(
        () =>
          !isSupabaseConfigured
            ? createDemoResult({ id: transactionId })
            : deleteTransaction(workspaceId, transactionId),
        (data) => setTransactions((current) => removeRecord(current, data.id)),
      ),
    [performMutation, workspaceId],
  );

  return {
    transactions,
    error,
    isDemoMode: !isSupabaseConfigured,
    isLoading,
    isMutating,
    refresh,
    removeTransaction,
    saveTransaction,
    clearError: () => setError(null),
  };
}
