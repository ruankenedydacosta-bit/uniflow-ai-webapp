import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const PROJECT_FIELDS =
  'id, workspace_id, name, description, status, priority, progress, starts_at, due_at, client_id, assigned_user_id, financial_impact, next_milestone, created_by, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_STATUSES = Object.freeze(['planned', 'active', 'on_hold', 'completed', 'cancelled']);
const PROJECT_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);

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
    code: 'INVALID_PROJECT_REQUEST',
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
      code: 'PROJECT_NOT_FOUND',
      message,
    });
  }

  return createResult(data, error);
}

const MUTABLE_PROJECT_FIELDS = [
  'name',
  'description',
  'status',
  'priority',
  'progress',
  'starts_at',
  'due_at',
  'client_id',
  'assigned_user_id',
  'financial_impact',
  'next_milestone',
];

/**
 * Valida os campos opcionais/enumerados de um payload de projeto (create ou
 * update). Retorna uma mensagem de erro (string) ou null quando valido.
 * Nunca usa Number() silenciosamente -- progress/financial_impact so sao
 * aceitos quando ja chegam como number valido no payload.
 */
function validateProjectPayloadFields(payload) {
  if (payload.status !== undefined && !PROJECT_STATUSES.includes(payload.status)) {
    return 'Status do projeto invalido.';
  }

  if (payload.priority !== undefined && !PROJECT_PRIORITIES.includes(payload.priority)) {
    return 'Prioridade do projeto invalida.';
  }

  if (payload.progress !== undefined) {
    if (typeof payload.progress !== 'number' || !Number.isFinite(payload.progress)) {
      return 'Progresso do projeto deve ser um numero.';
    }
    if (payload.progress < 0 || payload.progress > 100) {
      return 'Progresso do projeto deve estar entre 0 e 100.';
    }
  }

  if (
    payload.financial_impact !== undefined &&
    payload.financial_impact !== null
  ) {
    if (typeof payload.financial_impact !== 'number' || !Number.isFinite(payload.financial_impact)) {
      return 'Impacto financeiro deve ser um numero.';
    }
    if (payload.financial_impact < 0) {
      return 'Impacto financeiro nao pode ser negativo.';
    }
  }

  if (
    payload.starts_at &&
    payload.due_at &&
    payload.due_at < payload.starts_at
  ) {
    return 'O prazo nao pode ser anterior a data de inicio.';
  }

  if (payload.client_id !== undefined && payload.client_id !== null && !isValidUuid(payload.client_id)) {
    return 'Cliente invalido.';
  }

  if (
    payload.assigned_user_id !== undefined &&
    payload.assigned_user_id !== null &&
    !isValidUuid(payload.assigned_user_id)
  ) {
    return 'Responsavel invalido.';
  }

  return null;
}

export async function listProjects(
  workspaceId,
  { status, priority, clientId, assignedUserId } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar projetos.');
  }

  let query = supabase
    .from('projects')
    .select(PROJECT_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (priority) {
    query = query.eq('priority', priority);
  }

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  if (assignedUserId) {
    query = query.eq('assigned_user_id', assignedUserId);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getProject(workspaceId, projectId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(projectId)) {
    return createValidationResult('Workspace ou projeto invalido.');
  }

  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', projectId)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Projeto nao encontrado neste workspace.');
}

export async function createProject(workspaceId, project = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para criar o projeto.');
  }

  if (typeof project.name !== 'string' || !project.name.trim()) {
    return createValidationResult('Nome do projeto e obrigatorio.');
  }

  const payload = {
    workspace_id: workspaceId,
    ...pickDefined(project, MUTABLE_PROJECT_FIELDS),
    name: project.name.trim(),
  };

  const validationError = validateProjectPayloadFields(payload);
  if (validationError) {
    return createValidationResult(validationError);
  }

  const { data, error } = await supabase
    .from('projects')
    .insert(payload)
    .select(PROJECT_FIELDS)
    .single();

  return createResult(data, error);
}

export async function updateProject(workspaceId, projectId, changes = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(projectId)) {
    return createValidationResult('Workspace ou projeto invalido para atualizacao.');
  }

  const payload = pickDefined(changes, MUTABLE_PROJECT_FIELDS);

  if (typeof payload.name === 'string') {
    payload.name = payload.name.trim();
  } else if (payload.name !== undefined) {
    return createValidationResult('O nome do projeto deve ser um texto valido.');
  }

  if (Object.keys(payload).length === 0 || payload.name === '') {
    return createValidationResult('Nenhuma alteracao valida foi informada.');
  }

  const validationError = validateProjectPayloadFields(payload);
  if (validationError) {
    return createValidationResult(validationError);
  }

  const { data, error } = await supabase
    .from('projects')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('id', projectId)
    .select(PROJECT_FIELDS)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Projeto nao encontrado para atualizacao.');
}

export async function deleteProject(workspaceId, projectId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(projectId)) {
    return createValidationResult('Workspace ou projeto invalido para exclusao.');
  }

  const { data, error } = await supabase
    .from('projects')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', projectId)
    .select('id')
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Projeto nao encontrado para exclusao.');
}
