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
  isFinancialCacheFresh,
  readFinancialCache,
  updateFinancialCacheData,
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
  const [accounts, setAccounts] = useState(() =>
    readFinancialCache(cacheKey)?.data.accounts ?? cloneRecords(fallbackAccounts),
  );
  const [accountTypes, setAccountTypes] = useState(() =>
    readFinancialCache(cacheKey)?.data.accountTypes ?? cloneRecords(fallbackAccountTypes),
  );
  const [isLoading, setIsLoading] = useState(() => isSupabaseConfigured && !readFinancialCache(cacheKey));
  // Chave do cache a que `accounts` pertence agora. Null enquanto a lista
  // vem do fallback ou de uma leitura com erro.
  const cachedKeyRef = useRef(readFinancialCache(cacheKey) ? cacheKey : null);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured) {
      cachedKeyRef.current = null;
      setAccounts(cloneRecords(fallbackAccounts));
      setAccountTypes(cloneRecords(fallbackAccountTypes));
      setError(null);
      setIsLoading(false);
      return createDemoResult(fallbackAccounts);
    }

    if (!workspaceId) {
      cachedKeyRef.current = null;
      setAccounts([]);
      setAccountTypes([]);
      setError({ code: 'WORKSPACE_REQUIRED', message: 'Workspace financeiro ausente.' });
      setIsLoading(false);
      return null;
    }

    // Com dado guardado, a leitura roda por trás, sem tela de carregando.
    const cached = readFinancialCache(cacheKey);
    if (cached) {
      cachedKeyRef.current = cacheKey;
      setAccounts(cached.data.accounts);
      setAccountTypes(cached.data.accountTypes);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    const [accountsResult, typesResult] = await Promise.all([
      listAccounts(workspaceId, { activeOnly: false }),
      listAccountTypes(),
    ]);

    if (requestId !== requestIdRef.current) {
      return null;
    }

    const nextError = accountsResult.error ?? typesResult.error;
    if (nextError) {
      cachedKeyRef.current = null;
    } else {
      writeFinancialCache(cacheKey, {
        accounts: accountsResult.data ?? [],
        accountTypes: typesResult.data ?? [],
      });
      cachedKeyRef.current = cacheKey;
    }
    setAccounts(accountsResult.data ?? []);
    setAccountTypes(typesResult.data ?? []);
    setError(nextError);
    setIsLoading(false);
    return { accountsResult, typesResult };
  }, [cacheKey, fallbackAccounts, fallbackAccountTypes, workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      // Leitura de menos de 1 minuto: mostra o guardado e não busca de novo.
      const cached = readFinancialCache(cacheKey);
      if (isFinancialCacheFresh(cached)) {
        cachedKeyRef.current = cacheKey;
        setAccounts(cached.data.accounts);
        setAccountTypes(cached.data.accountTypes);
        setError(null);
        setIsLoading(false);
        return;
      }
      refresh();
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [cacheKey, refresh]);

  // Gravação feita aqui (criar, editar, arquivar, excluir) também vale para
  // a próxima vez que a tela abrir.
  useEffect(() => {
    updateFinancialCacheData(cachedKeyRef.current, { accounts, accountTypes });
  }, [accounts, accountTypes]);

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
