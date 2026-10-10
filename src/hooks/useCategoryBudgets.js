import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteCategoryBudget,
  listCategoryBudgets,
  saveCategoryBudget,
} from '../services/categoryBudgetService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';

const EMPTY_ARRAY = [];
const NOT_LOADED = Object.freeze({ workspaceId: null, budgets: EMPTY_ARRAY, error: null, ok: false });

// Tetos mensais por categoria do espaço (#121). Sem Supabase (modo demo), a
// lista fica vazia e salvar devolve o erro do serviço.
//
// O resultado fica guardado com o espaço que o pediu: ao trocar de espaço, os
// tetos e o erro anteriores deixam de valer na hora, e hasLoaded volta a
// false até a resposta do espaço novo. Recarregar o mesmo espaço mantém a
// lista na tela.
export function useCategoryBudgets({ workspaceId } = {}) {
  const [loaded, setLoaded] = useState(NOT_LOADED);
  const [isMutating, setIsMutating] = useState(false);
  const requestIdRef = useRef(0);
  // Trava síncrona contra duplo toque em Salvar (mesmo padrão de useTransactions).
  const mutationRef = useRef(false);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!isSupabaseConfigured || !workspaceId) return null;

    const result = await listCategoryBudgets(workspaceId);
    if (requestId !== requestIdRef.current) return null;
    setLoaded((current) => {
      // Falha ao recarregar o mesmo espaço não apaga os tetos já na tela.
      const keepCurrent = Boolean(result.error) && current.workspaceId === workspaceId && current.ok;
      return {
        workspaceId,
        budgets: keepCurrent ? current.budgets : (result.data ?? EMPTY_ARRAY),
        error: result.error,
        ok: !result.error || keepCurrent,
      };
    });
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
      if (!result.error && result.data !== null) {
        setLoaded((current) => (
          current.workspaceId === workspaceId
            ? { ...current, budgets: apply(current.budgets, result.data) }
            : current
        ));
      }
      return result;
    } finally {
      mutationRef.current = false;
      setIsMutating(false);
    }
  }, [workspaceId]);

  const saveBudget = useCallback((categoryId, monthlyLimit) => mutate(
    () => saveCategoryBudget(workspaceId, categoryId, monthlyLimit),
    (current, saved) => [...current.filter((budget) => budget.category_id !== categoryId), saved],
  ), [mutate, workspaceId]);

  const removeBudget = useCallback((categoryId) => mutate(
    () => deleteCategoryBudget(workspaceId, categoryId),
    (current) => current.filter((budget) => budget.category_id !== categoryId),
  ), [mutate, workspaceId]);

  const isCurrent = Boolean(workspaceId) && loaded.workspaceId === workspaceId;
  const hasLoaded = !isSupabaseConfigured || (isCurrent && loaded.ok);

  return {
    budgets: isCurrent ? loaded.budgets : EMPTY_ARRAY,
    error: isCurrent ? loaded.error : null,
    hasLoaded,
    isLoading: isSupabaseConfigured && Boolean(workspaceId) && !isCurrent,
    isMutating,
    refresh,
    saveBudget,
    removeBudget,
  };
}
