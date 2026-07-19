import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDerivedWorkspaceBalance,
  listDerivedAccountBalances,
} from '../services/financialBalanceService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';

export function useFinancialBalances({ workspaceId } = {}) {
  const [accountBalances, setAccountBalances] = useState([]);
  const [workspaceBalance, setWorkspaceBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
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

    setIsLoading(true);
    const [accountsResult, workspaceResult] = await Promise.all([
      listDerivedAccountBalances(),
      getDerivedWorkspaceBalance(),
    ]);

    if (requestId !== requestIdRef.current) return null;

    setAccountBalances(accountsResult.data ?? []);
    setWorkspaceBalance(workspaceResult.data);
    setError(accountsResult.error ?? workspaceResult.error);
    setIsLoading(false);
    return { accountsResult, workspaceResult };
  }, [workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(refresh, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  return {
    accountBalances,
    workspaceBalance,
    error,
    isLoading,
    refresh,
    clearError: () => setError(null),
  };
}
