import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const STAGE_FIELDS =
  'id, workspace_id, name, position, is_default, is_archived, created_by, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createResult(data, error = null) {
  return {
    data,
    error,
    isConfigured: isSupabaseConfigured,
  };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Supabase ainda nao esta configurado. O modo demo continua disponivel.',
  });
}

function createValidationResult(message) {
  return createResult(null, {
    code: 'INVALID_STAGE_REQUEST',
    message,
  });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function normalizeSingleResult(data, error, message) {
  if (!error && !data) {
    return createResult(null, {
      code: 'STAGE_NOT_FOUND',
      message,
    });
  }

  return createResult(data, error);
}

/**
 * Somente leitura nesta subfase (7.5.2). Criacao/edicao/arquivamento de
 * etapas pertencem a uma futura tela de configuracao de pipeline.
 */
export async function listStages(workspaceId, { includeArchived = false } = {}) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar etapas.');
  }

  let query = supabase
    .from('crm_pipeline_stages')
    .select(STAGE_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (!includeArchived) {
    query = query.eq('is_archived', false);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getStage(workspaceId, stageId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(stageId)) {
    return createValidationResult('Workspace ou etapa invalida.');
  }

  const { data, error } = await supabase
    .from('crm_pipeline_stages')
    .select(STAGE_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', stageId)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Etapa nao encontrada neste workspace.');
}
