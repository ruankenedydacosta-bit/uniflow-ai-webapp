import { useCallback, useEffect, useRef, useState } from 'react';
import {
  archiveClient,
  createClient,
  deleteClient,
  listClients,
  unarchiveClient,
  updateClient,
} from '../services/clientService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import {
  cloneRecords,
  createDemoRecord,
  createDemoResult,
  removeRecord,
  upsertRecord,
} from './financialHookUtils.js';

const EMPTY_ARRAY = [];

export function useClients({ workspaceId, fallbackClients = EMPTY_ARRAY } = {}) {
  const [clients, setClients] = useState(() => cloneRecords(fallbackClients));
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  // Trava sincrona: isMutating (estado do React) so reflete no proximo
  // render, entao duas chamadas no mesmo ciclo veriam isMutating === false
  // e disparariam duas mutacoes. mutationRef fecha essa janela -- mesmo
  // padrao ja usado em useCrmPipeline.js/useAgenda.js.
  const mutationRef = useRef(false);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured) {
      setClients(cloneRecords(fallbackClients));
      setError(null);
      setIsLoading(false);
      return createDemoResult(fallbackClients);
    }

    if (!workspaceId) {
      setClients([]);
      setError({ code: 'WORKSPACE_REQUIRED', message: 'Workspace ausente para carregar clientes.' });
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    // includeArchived: true -- clients mantem todos os registros, e
    // activeClients (abaixo) filtra localmente. Isso permite arquivar/
    // desarquivar sem perder o registro do estado local (nao precisa de um
    // segundo fetch so para reexibir um cliente recem-arquivado).
    const result = await listClients(workspaceId, { includeArchived: true });

    if (requestId !== requestIdRef.current) {
      return null;
    }

    setClients(result.data ?? []);
    setError(result.error);
    setIsLoading(false);
    return result;
  }, [fallbackClients, workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, 0);

    return () => {
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  /**
   * Centraliza as quatro mutacoes (saveClient/archiveClient/unarchiveClient/
   * removeClient): trava sincrona via mutationRef, isMutating/error de
   * estado, upsert/remocao local via applyLocalUpdate, liberacao da trava
   * em finally. mutationFn decide sozinha entre o branch demo (Supabase nao
   * configurado) e o service real -- preserva exatamente o comportamento
   * anterior de cada mutacao, so remove a duplicacao do envelope em volta
   * delas.
   */
  const performMutation = useCallback(async (mutationFn, applyLocalUpdate) => {
    if (mutationRef.current) {
      return {
        data: null,
        error: {
          code: 'CLIENT_MUTATION_IN_PROGRESS',
          message: 'Aguarde a operação atual terminar.',
        },
        isConfigured: isSupabaseConfigured,
      };
    }

    mutationRef.current = true;
    setIsMutating(true);
    setError(null);

    try {
      const result = await mutationFn();

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        applyLocalUpdate(result.data);
      }

      return result;
    } finally {
      mutationRef.current = false;
      setIsMutating(false);
    }
  }, []);

  const saveClient = useCallback(
    (values, clientId = null) =>
      performMutation(
        () =>
          !isSupabaseConfigured
            ? createDemoResult(
                clientId
                  ? { ...clients.find((client) => client.id === clientId), ...values, id: clientId }
                  : createDemoRecord('demo-client', values),
              )
            : clientId
              ? updateClient(workspaceId, clientId, values)
              : createClient(workspaceId, values),
        (data) => setClients((current) => upsertRecord(current, data)),
      ),
    [performMutation, clients, workspaceId],
  );

  const archiveClientRecord = useCallback(
    (clientId) =>
      performMutation(
        () =>
          !isSupabaseConfigured
            ? createDemoResult({
                ...clients.find((client) => client.id === clientId),
                id: clientId,
                is_archived: true,
                updated_at: new Date().toISOString(),
              })
            : archiveClient(workspaceId, clientId),
        (data) => setClients((current) => upsertRecord(current, data)),
      ),
    [performMutation, clients, workspaceId],
  );

  const unarchiveClientRecord = useCallback(
    (clientId) =>
      performMutation(
        () =>
          !isSupabaseConfigured
            ? createDemoResult({
                ...clients.find((client) => client.id === clientId),
                id: clientId,
                is_archived: false,
                updated_at: new Date().toISOString(),
              })
            : unarchiveClient(workspaceId, clientId),
        (data) => setClients((current) => upsertRecord(current, data)),
      ),
    [performMutation, clients, workspaceId],
  );

  const removeClient = useCallback(
    (clientId) =>
      performMutation(
        () =>
          !isSupabaseConfigured
            ? createDemoResult({ id: clientId })
            : deleteClient(workspaceId, clientId),
        (data) => setClients((current) => removeRecord(current, data.id)),
      ),
    [performMutation, workspaceId],
  );

  return {
    clients,
    activeClients: clients.filter((client) => client.is_archived === false),
    error,
    isDemoMode: !isSupabaseConfigured,
    isLoading,
    isMutating,
    refresh,
    archiveClient: archiveClientRecord,
    unarchiveClient: unarchiveClientRecord,
    removeClient,
    saveClient,
    clearError: () => setError(null),
  };
}
