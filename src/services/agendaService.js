import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const AGENDA_ITEM_FIELDS =
  'id, workspace_id, item_type, title, description, location, starts_at, ends_at, is_all_day, status, client_id, assigned_user_id, created_by, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AGENDA_ITEM_STATUSES = Object.freeze(['completed', 'cancelled']);

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
    code: 'INVALID_AGENDA_ITEM_REQUEST',
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
      code: 'AGENDA_ITEM_NOT_FOUND',
      message,
    });
  }

  return createResult(data, error);
}

const MUTABLE_AGENDA_ITEM_FIELDS = [
  'item_type',
  'title',
  'description',
  'location',
  'starts_at',
  'ends_at',
  'is_all_day',
  'client_id',
  'assigned_user_id',
];

const CREATABLE_AGENDA_ITEM_FIELDS = [...MUTABLE_AGENDA_ITEM_FIELDS];

export async function listAgendaItems(
  workspaceId,
  { startsFrom, startsTo, status, itemType, clientId } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar itens de agenda.');
  }

  let query = supabase
    .from('agenda_items')
    .select(AGENDA_ITEM_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('starts_at', { ascending: true });

  if (startsFrom) {
    query = query.gte('starts_at', startsFrom);
  }

  if (startsTo) {
    query = query.lte('starts_at', startsTo);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (itemType) {
    query = query.eq('item_type', itemType);
  }

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getAgendaItem(workspaceId, itemId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(itemId)) {
    return createValidationResult('Workspace ou item de agenda invalido.');
  }

  const { data, error } = await supabase
    .from('agenda_items')
    .select(AGENDA_ITEM_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', itemId)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Item de agenda nao encontrado neste workspace.');
}

export async function createAgendaItem(workspaceId, item = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para criar o item de agenda.');
  }

  if (typeof item.title !== 'string' || !item.title.trim()) {
    return createValidationResult('Titulo do item de agenda e obrigatorio.');
  }

  if (typeof item.item_type !== 'string' || !item.item_type.trim()) {
    return createValidationResult('Tipo do item de agenda e obrigatorio.');
  }

  if (!item.starts_at) {
    return createValidationResult('Data e hora de inicio sao obrigatorias.');
  }

  const payload = {
    workspace_id: workspaceId,
    ...pickDefined(item, CREATABLE_AGENDA_ITEM_FIELDS),
    title: item.title.trim(),
  };

  const { data, error } = await supabase
    .from('agenda_items')
    .insert(payload)
    .select(AGENDA_ITEM_FIELDS)
    .single();

  return createResult(data, error);
}

export async function updateAgendaItem(
  workspaceId,
  itemId,
  changes = {},
  { expectedUpdatedAt } = {},
) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(itemId)) {
    return createValidationResult('Workspace ou item de agenda invalido para atualizacao.');
  }

  const payload = pickDefined(changes, MUTABLE_AGENDA_ITEM_FIELDS);

  if (typeof payload.title === 'string') {
    payload.title = payload.title.trim();
  } else if (payload.title !== undefined) {
    return createValidationResult('O titulo do item de agenda deve ser um texto valido.');
  }

  if (Object.keys(payload).length === 0 || payload.title === '') {
    return createValidationResult('Nenhuma alteracao valida foi informada.');
  }

  if (expectedUpdatedAt && Number.isNaN(new Date(expectedUpdatedAt).getTime())) {
    return createValidationResult('Versao esperada do item de agenda invalida.');
  }

  let query = supabase
    .from('agenda_items')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('id', itemId);

  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt);
  }

  const { data, error } = await query.select(AGENDA_ITEM_FIELDS).maybeSingle();

  if (!error && !data && expectedUpdatedAt) {
    return createResult(null, {
      code: 'AGENDA_ITEM_CONFLICT',
      message: 'Este compromisso foi alterado em outro lugar. Atualize a Agenda e tente novamente.',
    });
  }

  return normalizeSingleResult(data, error, 'Item de agenda nao encontrado para atualizacao.');
}

/**
 * Atualizacao fechada de status. Aceita somente 'completed'/'cancelled' --
 * nunca 'scheduled' (sem reabertura nesta fase, mesma cautela ja aplicada a
 * crm_opportunities.outcome).
 */
export async function setAgendaItemStatus(
  workspaceId,
  itemId,
  status,
  { expectedUpdatedAt } = {},
) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(itemId)) {
    return createValidationResult('Workspace ou item de agenda invalido para definir o status.');
  }

  if (!AGENDA_ITEM_STATUSES.includes(status)) {
    return createValidationResult('Status do item de agenda invalido.');
  }

  if (!expectedUpdatedAt || Number.isNaN(new Date(expectedUpdatedAt).getTime())) {
    return createValidationResult('Versao esperada do item de agenda invalida.');
  }

  const { data, error } = await supabase
    .from('agenda_items')
    .update({ status })
    .eq('workspace_id', workspaceId)
    .eq('id', itemId)
    .eq('updated_at', expectedUpdatedAt)
    .select(AGENDA_ITEM_FIELDS)
    .maybeSingle();

  if (!error && !data) {
    return createResult(null, {
      code: 'AGENDA_ITEM_CONFLICT',
      message: 'Este compromisso foi alterado em outro lugar. Atualize a Agenda e tente novamente.',
    });
  }

  return normalizeSingleResult(data, error, 'Item de agenda nao encontrado para definir o status.');
}

export async function deleteAgendaItem(workspaceId, itemId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(itemId)) {
    return createValidationResult('Workspace ou item de agenda invalido para exclusao.');
  }

  const { data, error } = await supabase
    .from('agenda_items')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', itemId)
    .select('id')
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Item de agenda nao encontrado para exclusao.');
}
