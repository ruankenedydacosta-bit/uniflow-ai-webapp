import { useCallback, useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured } from '../../services/supabaseClient.js';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import {
  listGoals, createGoal, updateGoal, deleteGoal,
  addContribution, removeContribution,
} from './goalService.js';
import { upsertRecord, removeRecord, createDemoRecord, createDemoResult } from '../../hooks/financialHookUtils.js';

const EMPTY_ARRAY = [];

export function useGoals({ workspaceId, comUltimoAporte = false, aportesDesde = null } = {}) {
  const [goals, setGoals] = useState(EMPTY_ARRAY);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured) {
      setGoals(EMPTY_ARRAY);
      setError(null);
      setIsLoading(false);
      return createDemoResult(EMPTY_ARRAY);
    }

    if (!workspaceId) {
      setGoals(EMPTY_ARRAY);
      setError({ code: 'WORKSPACE_REQUIRED', message: 'Workspace ausente.' });
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    const result = await listGoals(workspaceId, { comUltimoAporte, aportesDesde });

    if (requestId !== requestIdRef.current) return null;

    setGoals(result.data ?? EMPTY_ARRAY);
    setError(result.error);
    setIsLoading(false);
    return result;
  }, [workspaceId, comUltimoAporte, aportesDesde]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => refresh(), 0);
    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  useEffect(() => {
    function handleDataChanged() { refresh(); }
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
  }, [refresh]);

  const addGoal = useCallback(async (values) => {
    setIsMutating(true);
    setError(null);

    const result = !isSupabaseConfigured
      ? createDemoResult(createDemoRecord('demo-goal', values))
      : await createGoal(workspaceId, values);

    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setGoals((current) => upsertRecord(current, result.data));
    }

    setIsMutating(false);
    return result;
  }, [workspaceId]);

  const editGoal = useCallback(async (goalId, changes) => {
    setIsMutating(true);
    setError(null);

    const result = !isSupabaseConfigured
      ? createDemoResult({ ...changes, id: goalId, updated_at: new Date().toISOString() })
      : await updateGoal(workspaceId, goalId, changes);

    // O update devolve só as colunas da meta; o merge mantém o que veio
    // embutido na listagem (last_contribution_date).
    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setGoals((current) => upsertRecord(current, {
        ...current.find((goal) => goal.id === goalId),
        ...result.data,
      }));
    }

    setIsMutating(false);
    return result;
  }, [workspaceId]);

  const removeGoal = useCallback(async (goalId) => {
    setIsMutating(true);
    setError(null);

    const result = !isSupabaseConfigured
      ? createDemoResult({ id: goalId })
      : await deleteGoal(workspaceId, goalId);

    if (result.error) {
      setError(result.error);
    } else {
      setGoals((current) => removeRecord(current, goalId));
    }

    setIsMutating(false);
    return result;
  }, [workspaceId]);

  // A função do banco devolve a meta já com o valor guardado novo; no modo
  // demo a conta é feita aqui.
  const addGoalContribution = useCallback(async (goalId, values) => {
    setIsMutating(true);
    setError(null);

    const result = !isSupabaseConfigured
      ? createDemoResult({ aporte: createDemoRecord('demo-contribution', { ...values, goal_id: goalId }) })
      : await addContribution(workspaceId, goalId, values);

    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      const { meta, aporte } = result.data;
      setGoals((current) => current.map((g) => {
        if (g.id !== goalId) return g;
        const dataDoAporte = aporte?.contribution_date;
        const ultimoAporte = Number(values.amount) > 0 && dataDoAporte
          && !(g.last_contribution_date && g.last_contribution_date > dataDoAporte)
          ? dataDoAporte
          : g.last_contribution_date;
        return {
          ...g,
          ...(meta ?? { current_amount: Number(g.current_amount) + Number(values.amount) }),
          last_contribution_date: ultimoAporte ?? null,
        };
      }));
    }

    setIsMutating(false);
    return result;
  }, [workspaceId]);

  const removeGoalContribution = useCallback(async (goalId, contributionId, amount) => {
    setIsMutating(true);
    setError(null);

    const result = !isSupabaseConfigured
      ? createDemoResult({ meta: null })
      : await removeContribution(workspaceId, contributionId);

    if (result.error) {
      setError(result.error);
    } else {
      const meta = result.data?.meta;
      setGoals((current) => current.map((g) => {
        if (g.id !== goalId) return g;
        if (meta) return { ...g, ...meta };
        return { ...g, current_amount: Math.max(0, Number(g.current_amount) - Number(amount)) };
      }));
    }

    setIsMutating(false);
    return result;
  }, [workspaceId]);

  return {
    goals,
    error,
    isLoading,
    isMutating,
    refresh,
    addGoal,
    editGoal,
    removeGoal,
    addGoalContribution,
    removeGoalContribution,
    clearError: () => setError(null),
  };
}
