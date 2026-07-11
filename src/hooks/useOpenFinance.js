import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listExternalAccounts,
  listExternalTransactions,
} from '../services/externalAccountService.js';
import {
  listOpenFinanceConsents,
  revokeOpenFinanceConsent,
  startOpenFinanceConsent,
} from '../services/openFinanceService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import {
  listSyncJobs,
  requestOpenFinanceSync,
} from '../services/syncService.js';

const EMPTY_DATA = {
  consents: [],
  externalAccounts: [],
  externalTransactions: [],
  syncJobs: [],
};

export function useOpenFinance({ workspaceId } = {}) {
  const [data, setData] = useState(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured) {
      setData(EMPTY_DATA);
      setError(null);
      setIsLoading(false);
      return { data: EMPTY_DATA, error: null, isConfigured: false };
    }

    if (!workspaceId) {
      const workspaceError = {
        code: 'WORKSPACE_REQUIRED',
        message: 'Selecione um workspace antes de consultar o Open Finance.',
      };
      setData(EMPTY_DATA);
      setError(workspaceError);
      setIsLoading(false);
      return { data: EMPTY_DATA, error: workspaceError, isConfigured: true };
    }

    setIsLoading(true);
    const [consents, accounts, transactions, jobs] = await Promise.all([
      listOpenFinanceConsents(workspaceId),
      listExternalAccounts(workspaceId),
      listExternalTransactions(workspaceId),
      listSyncJobs(workspaceId),
    ]);

    if (requestId !== requestIdRef.current) {
      return null;
    }

    const nextData = {
      consents: consents.data ?? [],
      externalAccounts: accounts.data ?? [],
      externalTransactions: transactions.data ?? [],
      syncJobs: jobs.data ?? [],
    };
    const nextError =
      consents.error ?? accounts.error ?? transactions.error ?? jobs.error;

    setData(nextData);
    setError(nextError);
    setIsLoading(false);
    return { data: nextData, error: nextError, isConfigured: true };
  }, [workspaceId]);

  useEffect(() => {
    const timeoutId = globalThis.setTimeout(refresh, 0);

    return () => {
      requestIdRef.current += 1;
      globalThis.clearTimeout(timeoutId);
    };
  }, [refresh]);

  const runPreparedAction = useCallback(async (action, payload) => {
    setIsMutating(true);
    setError(null);
    const result = await action(payload);
    setError(result.error);
    setIsMutating(false);
    return result;
  }, []);

  return {
    ...data,
    error,
    isConfigured: isSupabaseConfigured,
    isDemoMode: !isSupabaseConfigured,
    isLoading,
    isMutating,
    refresh,
    startConsent: (payload) =>
      runPreparedAction(startOpenFinanceConsent, payload),
    revokeConsent: (payload) =>
      runPreparedAction(revokeOpenFinanceConsent, payload),
    requestSync: (payload) =>
      runPreparedAction(requestOpenFinanceSync, payload),
    clearError: () => setError(null),
  };
}
