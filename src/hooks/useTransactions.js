import { useCallback, useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from '../services/transactionService.js';
import {
  cloneRecords,
  createDemoRecord,
  createDemoResult,
  removeRecord,
  upsertRecord,
} from './financialHookUtils.js';

export function useTransactions({
  workspaceId,
  fallbackTransactions = [],
  limit = 50,
} = {}) {
  const [transactions, setTransactions] = useState(() =>
    cloneRecords(fallbackTransactions),
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

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
    const result = await listTransactions(workspaceId, { limit });

    if (requestId !== requestIdRef.current) {
      return null;
    }

    setTransactions(result.data ?? []);
    setError(result.error);
    setIsLoading(false);
    return result;
  }, [fallbackTransactions, limit, workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  const saveTransaction = useCallback(
    async (values, transactionId = null) => {
      setIsMutating(true);
      setError(null);

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
          ? await updateTransaction(workspaceId, transactionId, values)
          : await createTransaction(workspaceId, values);

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setTransactions((current) => upsertRecord(current, result.data));
      }

      setIsMutating(false);
      return result;
    },
    [transactions, workspaceId],
  );

  const removeTransaction = useCallback(
    async (transactionId) => {
      setIsMutating(true);
      setError(null);
      const result = !isSupabaseConfigured
        ? createDemoResult({ id: transactionId })
        : await deleteTransaction(workspaceId, transactionId);

      if (result.error) {
        setError(result.error);
      } else {
        setTransactions((current) => removeRecord(current, transactionId));
      }

      setIsMutating(false);
      return result;
    },
    [workspaceId],
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
