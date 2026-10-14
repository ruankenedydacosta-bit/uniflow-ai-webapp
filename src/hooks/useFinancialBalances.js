import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDerivedWorkspaceBalance,
  listDerivedAccountBalances,
} from '../services/financialBalanceService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import {
  buildFinancialCacheKey,
  isFinancialCacheFresh,
  readFinancialCache,
  writeFinancialCache,
} from './financialQueryCache.js';

export function useFinancialBalances({ workspaceId } = {}) {
  const cacheKey = isSupabaseConfigured
    ? buildFinancialCacheKey('balances', { workspaceId })
    : null;
  const [accountBalances, setAccountBalances] = useState(() =>
    readFinancialCache(cacheKey)?.data.accountBalances ?? [],
  );
  const [workspaceBalance, setWorkspaceBalance] = useState(() =>
    readFinancialCache(cacheKey)?.data.workspaceBalance ?? null,
  );
  const [isLoading, setIsLoading] = useState(() => isSupabaseConfigured && !readFinancialCache(cacheKey));
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured) {
      setAccountBalances([]);
      setWorkspaceBalance(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    if (!workspaceId) {
      setAccountBalances([]);
      setWorkspaceBalance(null);
      setError({ code: 'WORKSPACE_REQUIRED', message: 'Workspace financeiro ausente.' });
      setIsLoading(false);
      return null;
    }

    // Com dado guardado, a leitura roda por trás, sem tela de carregando.
    const cached = readFinancialCache(cacheKey);
    if (cached) {
      setAccountBalances(cached.data.accountBalances);
      setWorkspaceBalance(cached.data.workspaceBalance);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    const [accountsResult, workspaceResult] = await Promise.all([
      listDerivedAccountBalances(),
      getDerivedWorkspaceBalance(),
    ]);

    if (requestId !== requestIdRef.current) return null;

    if (!accountsResult.error && !workspaceResult.error) {
      writeFinancialCache(cacheKey, {
        accountBalances: accountsResult.data ?? [],
        workspaceBalance: workspaceResult.data,
      });
    }
    setAccountBalances(accountsResult.data ?? []);
    setWorkspaceBalance(workspaceResult.data);
    setError(accountsResult.error ?? workspaceResult.error);
    setIsLoading(false);
    return { accountsResult, workspaceResult };
  }, [cacheKey, workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      // Leitura de menos de 1 minuto: mostra o guardado e não busca de novo.
      const cached = readFinancialCache(cacheKey);
      if (isFinancialCacheFresh(cached)) {
        setAccountBalances(cached.data.accountBalances);
        setWorkspaceBalance(cached.data.workspaceBalance);
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

  return {
    accountBalances,
    workspaceBalance,
    error,
    isLoading,
    refresh,
    clearError: () => setError(null),
  };
}
