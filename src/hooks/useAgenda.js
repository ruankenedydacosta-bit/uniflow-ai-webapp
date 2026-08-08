import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAgendaItem,
  deleteAgendaItem,
  listAgendaItems,
  setAgendaItemStatus,
  updateAgendaItem,
} from '../services/agendaService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import { removeRecord, upsertRecord } from './financialHookUtils.js';

function toSafeTimestamp(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Ordena por starts_at crescente -- mesma ordenacao ja usada pelo service. */
function sortAgendaItems(items) {
  return [...items].sort((a, b) => toSafeTimestamp(a.starts_at) - toSafeTimestamp(b.starts_at));
}

/**
 * Centraliza carregamento e mutacoes dos itens de agenda. Um unico hook
 * (sem divisao leitura/escrita como useCrmPipeline, ja que Agenda nao tem
 * conceito de pipeline/etapas) -- mais proximo de useClients.js na forma,
 * mas reaproveita o mecanismo de concorrencia mais rigoroso de
 * useCrmPipeline.js (requestIdRef + isMountedRef + mutationRef) porque os
 * filtros (startsFrom/startsTo/status/itemType/clientId) mudam com mais
 * frequencia aqui do que em useClients, aumentando o risco de resposta
 * obsoleta sobrescrever um filtro mais recente.
 */
export function useAgenda({
  workspaceId,
  startsFrom,
  startsTo,
  status,
  itemType,
  clientId,
} = {}) {
  const [items, setItems] = useState([]);
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
      setItems([]);
      setIsLoading(false);
      setError({
        code: 'SUPABASE_NOT_CONFIGURED',
        message: 'Supabase ainda nao esta configurado. O modo demo continua disponivel.',
      });
      return null;
    }

    if (!workspaceId) {
      setItems([]);
      setIsLoading(false);
      setError({
        code: 'WORKSPACE_REQUIRED',
        message: 'Selecione um espaço de trabalho para carregar a agenda.',
      });
      return null;
    }

    setIsLoading(true);

    const result = await listAgendaItems(workspaceId, {
      startsFrom,
      startsTo,
      status,
      itemType,
      clientId,
    });

    if (requestId !== requestIdRef.current || !isMountedRef.current) {
      return null;
    }

    setItems(sortAgendaItems(result.data ?? []));
    setError(result.error);
    setIsLoading(false);

    return result;
  }, [workspaceId, startsFrom, startsTo, status, itemType, clientId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  const performMutation = useCallback(
    async (serviceCallFn, applyLocalUpdate) => {
      if (mutationRef.current) {
        return {
          data: null,
          error: {
            code: 'AGENDA_MUTATION_IN_PROGRESS',
            message: 'Aguarde a operação atual terminar.',
          },
          isConfigured: isSupabaseConfigured,
        };
      }

      if (!workspaceId) {
        const workspaceError = {
          code: 'WORKSPACE_REQUIRED',
          message: 'Selecione um espaço de trabalho antes de alterar a agenda.',
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

        if (isMountedRef.current) {
          if (result && !result.error) {
            // Sucesso sem registro valido: nao fabrica dado, nao altera o
            // array local -- so devolve o resultado original ao chamador.
            if (result.data) {
              applyLocalUpdate(result.data);
            }
          } else if (result?.error) {
            setError(result.error);
          }
        }

        return result;
      } finally {
        mutationRef.current = false;
        if (isMountedRef.current) setIsMutating(false);
      }
    },
    [workspaceId],
  );

  const createItem = useCallback(
    (item) =>
      performMutation(
        () => createAgendaItem(workspaceId, item),
        (data) => {
          if (!data?.id) return;
          setItems((current) => sortAgendaItems(upsertRecord(current, data)));
        },
      ),
    [performMutation, workspaceId],
  );

  const updateItem = useCallback(
    (itemId, changes, options) =>
      performMutation(
        () => updateAgendaItem(workspaceId, itemId, changes, options),
        (data) => {
          if (!data?.id) return;
          setItems((current) => sortAgendaItems(upsertRecord(current, data)));
        },
      ),
    [performMutation, workspaceId],
  );

  const setItemStatus = useCallback(
    (itemId, nextStatus, options) =>
      performMutation(
        () => setAgendaItemStatus(workspaceId, itemId, nextStatus, options),
        (data) => {
          if (!data?.id) return;
          setItems((current) => sortAgendaItems(upsertRecord(current, data)));
        },
      ),
    [performMutation, workspaceId],
  );

  const removeItem = useCallback(
    (itemId) =>
      performMutation(
        () => deleteAgendaItem(workspaceId, itemId),
        (data) => {
          if (!data?.id) return;
          setItems((current) => removeRecord(current, data.id));
        },
      ),
    [performMutation, workspaceId],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    items,
    isLoading,
    isMutating,
    error,
    isConfigured: isSupabaseConfigured,
    refresh,
    createItem,
    updateItem,
    setItemStatus,
    removeItem,
    clearError,
  };
}
