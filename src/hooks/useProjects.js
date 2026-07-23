import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from '../services/projectsService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';

/**
 * Centraliza carregamento e mutacoes dos projetos. Mesmo mecanismo de
 * concorrencia de useAgenda.js (requestIdRef + isMountedRef + mutationRef):
 * os filtros (status/priority/clientId/assignedUserId) podem mudar com
 * frequencia, entao uma resposta obsoleta poderia sobrescrever um filtro
 * mais recente sem essa protecao.
 */
export function useProjects({
  workspaceId,
  status,
  priority,
  clientId,
  assignedUserId,
} = {}) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);

  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  // Trava sincrona: isMutating (estado do React) so reflete no proximo
  // render, entao duas chamadas no mesmo ciclo veriam isMutating === false
  // e disparariam duas mutacoes. mutationRef fecha essa janela.
  const mutationRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);

    if (!isSupabaseConfigured) {
      setProjects([]);
      setIsLoading(false);
      setError({
        code: 'SUPABASE_NOT_CONFIGURED',
        message: 'Supabase ainda nao esta configurado. O modo demo continua disponivel.',
      });
      return null;
    }

    if (!workspaceId) {
      setProjects([]);
      setIsLoading(false);
      setError({
        code: 'WORKSPACE_REQUIRED',
        message: 'Selecione um espaço de trabalho para carregar os projetos.',
      });
      return null;
    }

    setIsLoading(true);

    const result = await listProjects(workspaceId, {
      status,
      priority,
      clientId,
      assignedUserId,
    });

    if (requestId !== requestIdRef.current || !isMountedRef.current) {
      return null;
    }

    setProjects(result.data ?? []);
    setError(result.error);
    setIsLoading(false);

    return result;
  }, [workspaceId, status, priority, clientId, assignedUserId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  // Diferente de useAgenda.js (que faz upsert local no array), aqui o
  // sucesso de uma mutacao recarrega a lista do servidor via refresh() --
  // decisao explicita desta subfase. A trava (mutationRef/isMutating) so e
  // liberada depois que esse refresh termina, entao a UI nunca ve um estado
  // "salvo mas ainda desatualizado".
  const performMutation = useCallback(
    async (serviceCallFn) => {
      if (mutationRef.current) {
        return {
          data: null,
          error: {
            code: 'PROJECT_MUTATION_IN_PROGRESS',
            message: 'Aguarde a operação atual terminar.',
          },
          isConfigured: isSupabaseConfigured,
        };
      }

      if (!workspaceId) {
        const workspaceError = {
          code: 'WORKSPACE_REQUIRED',
          message: 'Selecione um espaço de trabalho antes de alterar os projetos.',
        };
        if (isMountedRef.current) setError(workspaceError);
        return { data: null, error: workspaceError, isConfigured: isSupabaseConfigured };
      }

      mutationRef.current = true;
      if (isMountedRef.current) {
        setError(null);
        setIsMutating(true);
      }

      try {
        const result = await serviceCallFn();

        if (result && !result.error && result.data) {
          await refresh();
        } else if (result?.error && isMountedRef.current) {
          setError(result.error);
        }

        return result;
      } finally {
        mutationRef.current = false;
        if (isMountedRef.current) setIsMutating(false);
      }
    },
    [workspaceId, refresh],
  );

  const saveProject = useCallback(
    (values, projectId = null) =>
      performMutation(() =>
        projectId
          ? updateProject(workspaceId, projectId, values)
          : createProject(workspaceId, values),
      ),
    [performMutation, workspaceId],
  );

  const removeProject = useCallback(
    (projectId) => performMutation(() => deleteProject(workspaceId, projectId)),
    [performMutation, workspaceId],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    projects,
    isLoading,
    isMutating,
    error,
    isConfigured: isSupabaseConfigured,
    refresh,
    saveProject,
    removeProject,
    clearError,
  };
}
