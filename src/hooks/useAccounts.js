import { useCallback, useEffect, useRef, useState } from 'react';
import {
  archiveAccount,
  createAccount,
  deleteAccount,
  listAccounts,
  listAccountTypes,
  updateAccount,
} from '../services/accountService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import {
  cloneRecords,
  createDemoRecord,
  createDemoResult,
  removeRecord,
  upsertRecord,
} from './financialHookUtils.js';
import {
  buildFinancialCacheKey,
  clearFinancialQueryCache,
  isFinancialCacheFresh,
  readFinancialCache,
  writeFinancialCache,
} from './financialQueryCache.js';

// Padrão estável: um `[]` novo a cada render trocaria a identidade do
// refresh, e o efeito abaixo buscaria as contas em loop.
const SEM_REGISTROS = [];

export function useAccounts({
  workspaceId,
  fallbackAccounts = SEM_REGISTROS,
  fallbackAccountTypes = SEM_REGISTROS,
} = {}) {
  const cacheKey = isSupabaseConfigured
    ? buildFinancialCacheKey('accounts', { workspaceId })
    : null;
  const cached = readFinancialCache(cacheKey);
  const [accounts, setAccounts] = useState(() =>
    cached?.data.accounts ?? cloneRecords(fallbackAccounts),
  );
  const [accountTypes, setAccountTypes] = useState(() =>
    cached?.data.accountTypes ?? cloneRecords(fallbackAccountTypes),
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured && !cached);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  // Troca de espaço: no mesmo render, passa para o dado guardado do espaço
  // novo ou entra em carregando, sem mostrar as contas do anterior.
  const [renderedKey, setRenderedKey] = useState(cacheKey);
  if (renderedKey !== cacheKey) {
    setRenderedKey(cacheKey);
    if (cached) {
      setAccounts(cached.data.accounts);
      setAccountTypes(cached.data.accountTypes);
      setError(null);
      setIsLoading(false);
    } else if (cacheKey) {
      setIsLoading(true);
    }
  }
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

    // Com dado guardado na tela, a leitura roda por trás, sem carregando.
    if (!readFinancialCache(cacheKey)) setIsLoading(true);
    const [accountsResult, typesResult] = await Promise.all([
      listAccounts(workspaceId, { activeOnly: false }),
      listAccountTypes(),
    ]);

    if (requestId !== requestIdRef.current) {
      return null;
    }

    const nextError = accountsResult.error ?? typesResult.error;
    if (!nextError) {
      writeFinancialCache(cacheKey, {
        accounts: accountsResult.data ?? [],
        accountTypes: typesResult.data ?? [],
      });
    }
    setAccounts(accountsResult.data ?? []);
    setAccountTypes(typesResult.data ?? []);
    setError(nextError);
    setIsLoading(false);
    return { accountsResult, typesResult };
  }, [cacheKey, fallbackAccounts, fallbackAccountTypes, workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      // Leitura de menos de 1 minuto: fica o que já está na tela.
      if (isFinancialCacheFresh(readFinancialCache(cacheKey))) return;
      refresh();
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [cacheKey, refresh]);

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
        clearFinancialQueryCache();
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
        clearFinancialQueryCache();
        setAccounts((current) => upsertRecord(current, result.data));
      }

      setIsMutating(false);
      return result;
    },
    [accounts, workspaceId],
  );

  const removeAccount = useCallback(
    async (accountId) => {
      setIsMutating(true);
      setError(null);
      const result = !isSupabaseConfigured
        ? createDemoResult({ id: accountId })
        : await deleteAccount(workspaceId, accountId);

      if (result.error) {
        setError(result.error);
      } else {
        clearFinancialQueryCache();
        setAccounts((current) => removeRecord(current, accountId));
      }

      setIsMutating(false);
      return result;
    },
    [workspaceId],
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
    removeAccount,
    saveAccount,
    clearError: () => setError(null),
  };
}
