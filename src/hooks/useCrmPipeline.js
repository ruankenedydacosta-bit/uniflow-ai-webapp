import { useCallback, useEffect, useRef, useState } from 'react';
import { listStages } from '../services/crmPipelineStageService.js';
import {
  createOpportunity as createOpportunityService,
  listOpportunities,
  moveOpportunityStage as moveOpportunityStageService,
  setOpportunityOutcome as setOpportunityOutcomeService,
  updateOpportunity as updateOpportunityService,
} from '../services/crmOpportunityService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import { removeRecord, upsertRecord } from './financialHookUtils.js';

function createHookError(code, message) {
  return { code, message };
}

function createHookResult(data, error) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function parseTimestamp(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

/** position ausente/invalido -> 0; created_at ausente/invalido -> epoch 0. */
function sortOpportunities(records) {
  return [...records].sort((a, b) => {
    const positionA = Number.isFinite(a.position) ? a.position : 0;
    const positionB = Number.isFinite(b.position) ? b.position : 0;
    if (positionA !== positionB) return positionA - positionB;

    return parseTimestamp(a.created_at) - parseTimestamp(b.created_at);
  });
}

function matchesOpportunityFilter(opportunity, includeClosedOpportunities) {
  return includeClosedOpportunities || opportunity?.outcome === 'open';
}

/**
 * Centraliza carregamento de etapas e oportunidades do pipeline comercial
 * (Fase 7.5) e as mutacoes de oportunidade. Sem UI/dados de demo nesta
 * subfase -- comportamento restritivo quando Supabase nao esta configurado
 * (ver comentario em createHookResult/refresh abaixo).
 */
export function useCrmPipeline({
  workspaceId,
  includeArchivedStages = false,
  includeClosedOpportunities = false,
} = {}) {
  const [stages, setStages] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);

  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  // Trava sincrona: isMutating (estado do React) so reflete no proximo
  // render, entao dois cliques no mesmo ciclo veriam isMutating === false
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
      setStages([]);
      setOpportunities([]);
      setIsLoading(false);
      const unavailableError = createHookError(
        'SUPABASE_NOT_CONFIGURED',
        'Supabase ainda nao esta configurado. O modo demo continua disponivel.',
      );
      setError(unavailableError);
      return null;
    }

    if (!workspaceId) {
      setStages([]);
      setOpportunities([]);
      setIsLoading(false);
      const workspaceError = createHookError(
        'WORKSPACE_REQUIRED',
        'Selecione um espaço de trabalho para carregar o pipeline.',
      );
      setError(workspaceError);
      return null;
    }

    // Zera os dois arrays antes de disparar as queries -- evita mostrar
    // stages/opportunities do workspace ou filtro anterior enquanto a nova
    // resposta nao chega ("flash" de dados obsoletos).
    setStages([]);
    setOpportunities([]);
    setIsLoading(true);

    try {
      const [stagesResult, opportunitiesResult] = await Promise.all([
        listStages(workspaceId, { includeArchived: includeArchivedStages }),
        listOpportunities(workspaceId, { includeClosed: includeClosedOpportunities }),
      ]);

      if (requestId !== requestIdRef.current || !isMountedRef.current) {
        return null;
      }

      setStages(stagesResult.error ? [] : (stagesResult.data ?? []));
      setOpportunities(
        opportunitiesResult.error ? [] : sortOpportunities(opportunitiesResult.data ?? []),
      );
      setError(stagesResult.error ?? opportunitiesResult.error ?? null);
      setIsLoading(false);

      return { stagesResult, opportunitiesResult };
    } catch {
      if (requestId !== requestIdRef.current || !isMountedRef.current) {
        return null;
      }

      // Defensivo: os services nunca lancam, mas uma falha de runtime
      // inesperada aqui nao pode deixar isLoading preso em true.
      setStages([]);
      setOpportunities([]);
      const loadError = createHookError(
        'CRM_PIPELINE_LOAD_FAILED',
        'Não foi possível carregar o pipeline.',
      );
      setError(loadError);
      setIsLoading(false);
      return null;
    }
  }, [workspaceId, includeArchivedStages, includeClosedOpportunities]);

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
        return createHookResult(
          null,
          createHookError(
            'CRM_PIPELINE_MUTATION_IN_PROGRESS',
            'Aguarde a operação atual terminar.',
          ),
        );
      }

      if (!workspaceId) {
        const workspaceError = createHookError(
          'WORKSPACE_REQUIRED',
          'Selecione um espaço de trabalho antes de alterar o pipeline.',
        );
        if (isMountedRef.current) setError(workspaceError);
        return createHookResult(null, workspaceError);
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

  const createOpportunity = useCallback(
    (opportunity) =>
      performMutation(
        () => createOpportunityService(workspaceId, opportunity),
        (data) => {
          if (!data?.id) return;
          if (!matchesOpportunityFilter(data, includeClosedOpportunities)) return;
          setOpportunities((current) => sortOpportunities(upsertRecord(current, data)));
        },
      ),
    [performMutation, workspaceId, includeClosedOpportunities],
  );

  const updateOpportunity = useCallback(
    (opportunityId, changes) =>
      performMutation(
        () => updateOpportunityService(workspaceId, opportunityId, changes),
        (data) => {
          if (!data?.id) return;
          if (matchesOpportunityFilter(data, includeClosedOpportunities)) {
            setOpportunities((current) => sortOpportunities(upsertRecord(current, data)));
          } else {
            setOpportunities((current) => removeRecord(current, data.id));
          }
        },
      ),
    [performMutation, workspaceId, includeClosedOpportunities],
  );

  const moveOpportunityStage = useCallback(
    (opportunityId, stageId) =>
      performMutation(
        () => moveOpportunityStageService(workspaceId, opportunityId, stageId),
        (data) => {
          if (!data?.id) return;
          // stage_id e stage_entered_at vem exclusivamente do registro
          // retornado pelo banco (trigger crm_opportunities_set_stage_entered_at)
          // -- nunca mesclados/fabricados aqui.
          if (matchesOpportunityFilter(data, includeClosedOpportunities)) {
            setOpportunities((current) => sortOpportunities(upsertRecord(current, data)));
          } else {
            setOpportunities((current) => removeRecord(current, data.id));
          }
        },
      ),
    [performMutation, workspaceId, includeClosedOpportunities],
  );

  const setOpportunityOutcome = useCallback(
    (opportunityId, outcome) =>
      performMutation(
        () => setOpportunityOutcomeService(workspaceId, opportunityId, outcome),
        (data) => {
          if (!data?.id) return;
          if (matchesOpportunityFilter(data, includeClosedOpportunities)) {
            setOpportunities((current) => sortOpportunities(upsertRecord(current, data)));
          } else {
            setOpportunities((current) => removeRecord(current, data.id));
          }
        },
      ),
    [performMutation, workspaceId, includeClosedOpportunities],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    stages,
    opportunities,
    isLoading,
    isMutating,
    error,
    isConfigured: isSupabaseConfigured,
    refresh,
    createOpportunity,
    updateOpportunity,
    moveOpportunityStage,
    setOpportunityOutcome,
    clearError,
  };
}
