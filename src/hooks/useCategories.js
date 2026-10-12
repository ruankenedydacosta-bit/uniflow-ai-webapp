import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCategory,
  contarLancamentosDaCategoria,
  deleteCategory,
  excluirCategoriaMovendoLancamentos,
  listCategories,
  updateCategory,
} from '../services/categoryService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import { filterCategoriesForContext } from '../features/categories/categoryUtils.js';
import {
  cloneRecords,
  createDemoRecord,
  createDemoResult,
  removeRecord,
  upsertRecord,
} from './financialHookUtils.js';

const EMPTY_ARRAY = [];

export function useCategories({
  workspaceId,
  fallbackCategories = EMPTY_ARRAY,
  context = null,
} = {}) {
  const [categories, setCategories] = useState(() =>
    cloneRecords(fallbackCategories),
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured) {
      setCategories(cloneRecords(fallbackCategories));
      setError(null);
      setIsLoading(false);
      return createDemoResult(fallbackCategories);
    }

    if (!workspaceId) {
      setCategories([]);
      setError({ code: 'WORKSPACE_REQUIRED', message: 'Workspace financeiro ausente.' });
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    const result = await listCategories(workspaceId, { context });

    if (requestId !== requestIdRef.current) {
      return null;
    }

    setCategories(result.data ?? []);
    setError(result.error);
    setIsLoading(false);
    return result;
  }, [context, fallbackCategories, workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  const saveCategory = useCallback(
    async (values, categoryId = null) => {
      setIsMutating(true);
      setError(null);

      const scopedValues = !categoryId && context
        ? { ...values, applies_to: context }
        : values;
      const result = !isSupabaseConfigured
        ? createDemoResult(
            categoryId
              ? {
                  ...categories.find((category) => category.id === categoryId),
                  ...scopedValues,
                  id: categoryId,
                }
              : createDemoRecord('demo-category', {
                  ...scopedValues,
                  workspace_id: 'demo-workspace',
                  is_system: false,
                  is_active: true,
                }),
          )
        : categoryId
          ? await updateCategory(workspaceId, categoryId, scopedValues)
          : await createCategory(workspaceId, scopedValues);

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setCategories((current) => upsertRecord(current, result.data));
      }

      setIsMutating(false);
      return result;
    },
    [categories, context, workspaceId],
  );

  const removeCategory = useCallback(
    async (categoryId) => {
      setIsMutating(true);
      setError(null);
      const result = !isSupabaseConfigured
        ? createDemoResult({ id: categoryId })
        : await deleteCategory(workspaceId, categoryId);

      if (result.error) {
        setError(result.error);
      } else {
        setCategories((current) => removeRecord(current, categoryId));
      }

      setIsMutating(false);
      return result;
    },
    [workspaceId],
  );

  // Quantos lançamentos a categoria tem. Decide, antes de confirmar a
  // exclusão, se a pessoa precisa escolher um destino. Sem resposta
  // (demo, erro) devolve null e o fluxo segue pela confirmação comum.
  const contarLancamentos = useCallback(
    async (categoryId) => {
      if (!isSupabaseConfigured || !workspaceId) return null;
      const result = await contarLancamentosDaCategoria(workspaceId, categoryId);
      return result.error ? null : result.data;
    },
    [workspaceId],
  );

  // Move os lançamentos para outra categoria e exclui esta, numa transação só
  // (migration 064). É a saída quando a categoria tem lançamentos.
  const removerCategoriaMovendoLancamentos = useCallback(
    async (categoryId, destinoId) => {
      setIsMutating(true);
      setError(null);
      const result = !isSupabaseConfigured
        ? createDemoResult({ id: categoryId, movedCount: 0 })
        : await excluirCategoriaMovendoLancamentos(workspaceId, categoryId, destinoId);

      if (result.error) {
        setError(result.error);
      } else {
        setCategories((current) => removeRecord(current, categoryId));
      }

      setIsMutating(false);
      return result;
    },
    [workspaceId],
  );

  const visibleCategories = useMemo(
    () => (context ? filterCategoriesForContext(categories, context) : categories),
    [categories, context],
  );

  return {
    categories: visibleCategories,
    error,
    isDemoMode: !isSupabaseConfigured,
    isLoading,
    isMutating,
    refresh,
    contarLancamentos,
    removeCategory,
    removerCategoriaMovendoLancamentos,
    saveCategory,
    clearError: () => setError(null),
  };
}
