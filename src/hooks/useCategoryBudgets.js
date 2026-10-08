import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteCategoryBudget,
  listCategoryBudgets,
  saveCategoryBudget,
} from '../services/categoryBudgetService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';

const EMPTY_ARRAY = [];

// Tetos mensais por categoria do espaço (#121). Sem Supabase (modo demo), a
// lista fica vazia e salvar devolve o erro do serviço.
export function useCategoryBudgets({ workspaceId } = {}) {
  const [budgets, setBudgets] = useState(EMPTY_ARRAY);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  // Primeira resposta já chegou. Recarregar volta isLoading a true, e quem
  // monta tela com os tetos não deve piscar o estado "sem teto" nesse meio.
  const [hasLoaded, setHasLoaded] = useState(!isSupabaseConfigured);
  const requestIdRef = useRef(0);
  // Trava síncrona contra duplo toque em Salvar (mesmo padrão de useTransactions).
  const mutationRef = useRef(false);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!isSupabaseConfigured) {
      setBudgets(EMPTY_ARRAY);
      setIsLoading(false);
      return null;
    }
    if (!workspaceId) {
      setBudgets(EMPTY_ARRAY);
      setError({ code: 'WORKSPACE_REQUIRED', message: 'Workspace financeiro ausente.' });
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    const result = await listCategoryBudgets(workspaceId);
    if (requestId !== requestIdRef.current) return null;
    setBudgets(result.data ?? EMPTY_ARRAY);
    setError(result.error);
    setIsLoading(false);
    if (!result.error) setHasLoaded(true);
    return result;
  }, [workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, 0);
    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  const mutate = useCallback(async (run, apply) => {
    if (mutationRef.current) return null;
    mutationRef.current = true;
    setIsMutating(true);
    try {
      const result = await run();
      if (!result.error) setBudgets((current) => apply(current, result.data));
      return result;
    } finally {
      mutationRef.current = false;
      setIsMutating(false);
    }
  }, []);

  const saveBudget = useCallback((categoryId, monthlyLimit) => mutate(
    () => saveCategoryBudget(workspaceId, categoryId, monthlyLimit),
    (current, saved) => [...current.filter((budget) => budget.category_id !== categoryId), saved],
  ), [mutate, workspaceId]);

  const removeBudget = useCallback((categoryId) => mutate(
    () => deleteCategoryBudget(workspaceId, categoryId),
    (current) => current.filter((budget) => budget.category_id !== categoryId),
  ), [mutate, workspaceId]);

  return { budgets, error, hasLoaded, isLoading, isMutating, refresh, saveBudget, removeBudget };
}
