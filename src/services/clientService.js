import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const CLIENT_FIELDS =
  'id, workspace_id, entity_type, lifecycle_stage, relationship_status, name, primary_contact_name, email, phone, document_number, estimated_value, last_contact_at, next_action, assigned_user_id, is_archived, created_by, created_at, updated_at';
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
    code: 'INVALID_CLIENT_REQUEST',
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
      code: 'CLIENT_NOT_FOUND',
      message,
    });
  }

  return createResult(data, error);
}

const MUTABLE_CLIENT_FIELDS = [
  'entity_type',
  'lifecycle_stage',
  'relationship_status',
  'name',
  'primary_contact_name',
  'email',
  'phone',
  'document_number',
  'estimated_value',
  'last_contact_at',
  'next_action',
  'assigned_user_id',
  'is_archived',
];

export async function listClients(workspaceId, { includeArchived = true } = {}) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar clientes.');
  }

  let query = supabase
    .from('clients')
    .select(CLIENT_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('created_at');

  if (!includeArchived) {
    query = query.eq('is_archived', false);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getClient(workspaceId, clientId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(clientId)) {
    return createValidationResult('Workspace ou cliente invalido.');
  }

  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', clientId)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Cliente nao encontrado neste workspace.');
}

export async function createClient(workspaceId, client = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para criar o cliente.');
  }

  if (typeof client.name !== 'string' || !client.name.trim()) {
    return createValidationResult('Nome do cliente e obrigatorio.');
  }

  const payload = {
    workspace_id: workspaceId,
    ...pickDefined(client, MUTABLE_CLIENT_FIELDS),
    name: client.name.trim(),
  };

  const { data, error } = await supabase
    .from('clients')
    .insert(payload)
    .select(CLIENT_FIELDS)
    .single();

  return createResult(data, error);
}

export async function updateClient(workspaceId, clientId, changes = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(clientId)) {
    return createValidationResult('Workspace ou cliente invalido para atualizacao.');
  }

  const payload = pickDefined(changes, MUTABLE_CLIENT_FIELDS);

  if (typeof payload.name === 'string') {
    payload.name = payload.name.trim();
  } else if (payload.name !== undefined) {
    return createValidationResult('O nome do cliente deve ser um texto valido.');
  }

  if (Object.keys(payload).length === 0 || payload.name === '') {
    return createValidationResult('Nenhuma alteracao valida foi informada.');
  }

  const { data, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('id', clientId)
    .select(CLIENT_FIELDS)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Cliente nao encontrado para atualizacao.');
}

export function archiveClient(workspaceId, clientId) {
  return updateClient(workspaceId, clientId, { is_archived: true });
}

export function unarchiveClient(workspaceId, clientId) {
  return updateClient(workspaceId, clientId, { is_archived: false });
}

export async function deleteClient(workspaceId, clientId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(clientId)) {
    return createValidationResult('Workspace ou cliente invalido para exclusao.');
  }

  const { data, error } = await supabase
    .from('clients')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', clientId)
    .select('id')
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Cliente nao encontrado para exclusao.');
}
