import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCategory,
  contarLancamentosDaCategoria,
  deleteCategory,
  excluirCategoriaMovendoLancamentos,
  listCategories,
  listarCategoriasOcultas,
  ocultarCategoria as ocultarCategoriaNoServico,
  reexibirCategoria as reexibirCategoriaNoServico,
  updateCategory,
} from '../services/categoryService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import {
  filterCategoriesForContext,
  separarCategoriasOcultas,
} from '../features/categories/categoryUtils.js';
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
  // Ids das categorias ocultas no espaço (#184). Saem de `categories` e
  // entram em `categoriasOcultas`; no modo demo ficam só em memória.
  const [idsOcultos, setIdsOcultos] = useState(EMPTY_ARRAY);
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
      setIdsOcultos(EMPTY_ARRAY);
      setError({ code: 'WORKSPACE_REQUIRED', message: 'Workspace financeiro ausente.' });
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    const [result, ocultas] = await Promise.all([
      listCategories(workspaceId, { context }),
      listarCategoriasOcultas(workspaceId),
    ]);

    if (requestId !== requestIdRef.current) {
      return null;
    }

    setCategories(result.data ?? []);
    // Falha ao ler as ocultas não esconde a lista inteira: a categoria
    // volta a aparecer até a próxima leitura.
    setIdsOcultos(ocultas.error ? EMPTY_ARRAY : ocultas.data ?? EMPTY_ARRAY);
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

  // Oculta a categoria no espaço (#184). Vale também para categoria padrão
  // do sistema, que a pessoa não edita nem exclui.
  const ocultarCategoria = useCallback(
    async (categoryId) => {
      setIsMutating(true);
      setError(null);
      const result = !isSupabaseConfigured
        ? createDemoResult({ id: categoryId })
        : await ocultarCategoriaNoServico(workspaceId, categoryId);

      if (result.error) {
        setError(result.error);
      } else {
        setIdsOcultos((current) => (current.includes(categoryId) ? current : [...current, categoryId]));
      }

      setIsMutating(false);
      return result;
    },
    [workspaceId],
  );

  const reexibirCategoria = useCallback(
    async (categoryId) => {
      setIsMutating(true);
      setError(null);
      const result = !isSupabaseConfigured
        ? createDemoResult({ id: categoryId })
        : await reexibirCategoriaNoServico(workspaceId, categoryId);

      if (result.error) {
        setError(result.error);
      } else {
        setIdsOcultos((current) => current.filter((id) => id !== categoryId));
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
  // `categories` continua completa: relatórios, leituras do mês e nomes de
  // lançamentos antigos precisam achar a categoria oculta. Seletor, lista de
  // Organizar e sugestões da Uni usam `categoriasVisiveis`.
  const { categoriasVisiveis, categoriasOcultas } = useMemo(() => {
    const { visiveis, ocultas } = separarCategoriasOcultas(visibleCategories, idsOcultos);
    return { categoriasVisiveis: visiveis, categoriasOcultas: ocultas };
  }, [visibleCategories, idsOcultos]);

  return {
    categories: visibleCategories,
    categoriasVisiveis,
    categoriasOcultas,
    error,
    isDemoMode: !isSupabaseConfigured,
    isLoading,
    isMutating,
    refresh,
    contarLancamentos,
    ocultarCategoria,
    reexibirCategoria,
    removeCategory,
    removerCategoriaMovendoLancamentos,
    saveCategory,
    clearError: () => setError(null),
  };
}
