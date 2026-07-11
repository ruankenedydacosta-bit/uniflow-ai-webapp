import { useCallback, useEffect, useRef, useState } from 'react';
import {
  archiveAccount,
  createAccount,
  listAccounts,
  listAccountTypes,
  updateAccount,
} from '../services/accountService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import {
  cloneRecords,
  createDemoRecord,
  createDemoResult,
  upsertRecord,
} from './financialHookUtils.js';

export function useAccounts({
  workspaceId,
  fallbackAccounts = [],
  fallbackAccountTypes = [],
} = {}) {
  const [accounts, setAccounts] = useState(() => cloneRecords(fallbackAccounts));
  const [accountTypes, setAccountTypes] = useState(() =>
    cloneRecords(fallbackAccountTypes),
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured) {
      setAccounts(cloneRecords(fallbackAccounts));
      setAccountTypes(cloneRecords(fallbackAccountTypes));
      setError(null);
      setIsLoading(false);
      return createDemoResult(fallbackAccounts);
    }

    if (!workspaceId) {
      setAccounts([]);
      setAccountTypes([]);
      setError({ code: 'WORKSPACE_REQUIRED', message: 'Workspace financeiro ausente.' });
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    const [accountsResult, typesResult] = await Promise.all([
      listAccounts(workspaceId, { activeOnly: false }),
      listAccountTypes(),
    ]);

    if (requestId !== requestIdRef.current) {
      return null;
    }

    const nextError = accountsResult.error ?? typesResult.error;
    setAccounts(accountsResult.data ?? []);
    setAccountTypes(typesResult.data ?? []);
    setError(nextError);
    setIsLoading(false);
    return { accountsResult, typesResult };
  }, [fallbackAccounts, fallbackAccountTypes, workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  const saveAccount = useCallback(
    async (values, accountId = null) => {
      setIsMutating(true);
      setError(null);

      const result = !isSupabaseConfigured
        ? createDemoResult(
            accountId
              ? { ...accounts.find((account) => account.id === accountId), ...values, id: accountId }
              : createDemoRecord('demo-account', values),
          )
        : accountId
          ? await updateAccount(workspaceId, accountId, values)
          : await createAccount(workspaceId, values);

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setAccounts((current) => upsertRecord(current, result.data));
      }

      setIsMutating(false);
      return result;
    },
    [accounts, workspaceId],
  );

  const archiveAccountRecord = useCallback(
    async (accountId) => {
      setIsMutating(true);
      setError(null);
      const result = !isSupabaseConfigured
        ? createDemoResult({
            ...accounts.find((account) => account.id === accountId),
            id: accountId,
            is_active: false,
            updated_at: new Date().toISOString(),
          })
        : await archiveAccount(workspaceId, accountId);

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setAccounts((current) => upsertRecord(current, result.data));
      }

      setIsMutating(false);
      return result;
    },
    [accounts, workspaceId],
  );

  return {
    accounts,
    activeAccounts: accounts.filter((account) => account.is_active !== false),
    accountTypes,
    error,
    isDemoMode: !isSupabaseConfigured,
    isLoading,
    isMutating,
    refresh,
    archiveAccount: archiveAccountRecord,
    saveAccount,
    clearError: () => setError(null),
  };
}
