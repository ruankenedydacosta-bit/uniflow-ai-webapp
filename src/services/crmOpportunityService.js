import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const OPPORTUNITY_FIELDS =
  'id, workspace_id, client_id, stage_id, title, estimated_value, outcome, stage_entered_at, assigned_user_id, position, created_by, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OUTCOMES = Object.freeze(['open', 'won', 'lost', 'cancelled']);

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
    code: 'INVALID_OPPORTUNITY_REQUEST',
    message,
  });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function pickDefined(source, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => source[field] !== undefined)
      .map((field) => [field, source[field]]),
  );
}

function normalizeSingleResult(data, error, message) {
  if (!error && !data) {
    return createResult(null, {
      code: 'OPPORTUNITY_NOT_FOUND',
      message,
    });
  }

  return createResult(data, error);
}

function validateEstimatedValue(value) {
  if (value === undefined) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 'Valor estimado deve ser um numero maior ou igual a zero.';
  }
  return null;
}

function validatePosition(value) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    return 'Posicao deve ser um numero inteiro maior ou igual a zero.';
  }
  return null;
}

function validateAssignedUserId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!isValidUuid(value)) {
    return 'Responsavel invalido.';
  }
  return null;
}

const MUTABLE_OPPORTUNITY_FIELDS = ['title', 'estimated_value', 'assigned_user_id', 'position'];
const CREATABLE_OPPORTUNITY_FIELDS = [
  'client_id',
  'stage_id',
  'title',
  'estimated_value',
  'assigned_user_id',
  'position',
];

/**
 * Ordenacao: position crescente (ordem visual do Kanban), com created_at
 * crescente como desempate estavel (oportunidades mais antigas primeiro
 * dentro da mesma posicao/etapa).
 */
export async function listOpportunities(workspaceId, { includeClosed = false } = {}) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar oportunidades.');
  }

  let query = supabase
    .from('crm_opportunities')
    .select(OPPORTUNITY_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (!includeClosed) {
    query = query.eq('outcome', 'open');
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getOpportunity(workspaceId, opportunityId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(opportunityId)) {
    return createValidationResult('Workspace ou oportunidade invalida.');
  }

  const { data, error } = await supabase
    .from('crm_opportunities')
    .select(OPPORTUNITY_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', opportunityId)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Oportunidade nao encontrada neste workspace.');
}

export async function createOpportunity(workspaceId, opportunity = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para criar a oportunidade.');
  }

  if (!isValidUuid(opportunity.client_id)) {
    return createValidationResult('Cliente invalido para a oportunidade.');
  }

  if (!isValidUuid(opportunity.stage_id)) {
    return createValidationResult('Etapa invalida para a oportunidade.');
  }

  if (typeof opportunity.title !== 'string' || !opportunity.title.trim()) {
    return createValidationResult('Titulo da oportunidade e obrigatorio.');
  }

  const estimatedValueError = validateEstimatedValue(opportunity.estimated_value);
  if (estimatedValueError) return createValidationResult(estimatedValueError);

  const positionError = validatePosition(opportunity.position);
  if (positionError) return createValidationResult(positionError);

  const assignedUserIdError = validateAssignedUserId(opportunity.assigned_user_id);
  if (assignedUserIdError) return createValidationResult(assignedUserIdError);

  const payload = {
    workspace_id: workspaceId,
    ...pickDefined(opportunity, CREATABLE_OPPORTUNITY_FIELDS),
    title: opportunity.title.trim(),
  };

  const { data, error } = await supabase
    .from('crm_opportunities')
    .insert(payload)
    .select(OPPORTUNITY_FIELDS)
    .single();

  return createResult(data, error);
}

export async function updateOpportunity(workspaceId, opportunityId, changes = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(opportunityId)) {
    return createValidationResult('Workspace ou oportunidade invalida para atualizacao.');
  }

  const payload = pickDefined(changes, MUTABLE_OPPORTUNITY_FIELDS);

  if (typeof payload.title === 'string') {
    payload.title = payload.title.trim();
  } else if (payload.title !== undefined) {
    return createValidationResult('O titulo da oportunidade deve ser um texto valido.');
  }

  const estimatedValueError = validateEstimatedValue(payload.estimated_value);
  if (estimatedValueError) return createValidationResult(estimatedValueError);

  const positionError = validatePosition(payload.position);
  if (positionError) return createValidationResult(positionError);

  const assignedUserIdError = validateAssignedUserId(payload.assigned_user_id);
  if (assignedUserIdError) return createValidationResult(assignedUserIdError);

  if (Object.keys(payload).length === 0 || payload.title === '') {
    return createValidationResult('Nenhuma alteracao valida foi informada.');
  }

  const { data, error } = await supabase
    .from('crm_opportunities')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('id', opportunityId)
    .select(OPPORTUNITY_FIELDS)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Oportunidade nao encontrada para atualizacao.');
}

/**
 * Atualizacao fechada de stage_id. stage_entered_at NUNCA e enviado pelo
 * client -- e responsabilidade exclusiva do trigger
 * crm_opportunities_set_stage_entered_at no banco. Pertencimento ao mesmo
 * workspace e arquivamento da etapa sao validados pelo trigger
 * validate_crm_opportunity_relationships, nao duplicados aqui.
 */
export async function moveOpportunityStage(workspaceId, opportunityId, stageId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(opportunityId)) {
    return createValidationResult('Workspace ou oportunidade invalida para mover de etapa.');
  }

  if (!isValidUuid(stageId)) {
    return createValidationResult('Etapa invalida para mover a oportunidade.');
  }

  const { data, error } = await supabase
    .from('crm_opportunities')
    .update({ stage_id: stageId })
    .eq('workspace_id', workspaceId)
    .eq('id', opportunityId)
    .select(OPPORTUNITY_FIELDS)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Oportunidade nao encontrada para mudanca de etapa.');
}

/**
 * Atualizacao fechada de outcome. Sem UI nesta subfase (7.5.2) -- exposta
 * como operacao de dominio ja suportada pelo schema (constraint
 * crm_opportunities_outcome_check).
 */
export async function setOpportunityOutcome(workspaceId, opportunityId, outcome) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(opportunityId)) {
    return createValidationResult('Workspace ou oportunidade invalida para definir o resultado.');
  }

  if (!OUTCOMES.includes(outcome)) {
    return createValidationResult('Resultado da oportunidade invalido.');
  }

  const { data, error } = await supabase
    .from('crm_opportunities')
    .update({ outcome })
    .eq('workspace_id', workspaceId)
    .eq('id', opportunityId)
    .select(OPPORTUNITY_FIELDS)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Oportunidade nao encontrada para definir o resultado.');
}
