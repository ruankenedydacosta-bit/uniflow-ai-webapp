import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import { AGENDA_IDEMPOTENCY_ENABLED } from './agendaIdempotencyConfig.js';

const LEGACY_AGENDA_ITEM_FIELDS =
  'id, workspace_id, item_type, title, description, location, starts_at, ends_at, is_all_day, has_explicit_time, status, client_id, assigned_user_id, created_by, created_at, updated_at';
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
  'has_explicit_time',
  'client_id',
  'assigned_user_id',
];

const IDEMPOTENT_AGENDA_CREATE_FIELDS = [...MUTABLE_AGENDA_ITEM_FIELDS];

export function getAgendaItemFields(idempotencyEnabled = AGENDA_IDEMPOTENCY_ENABLED) {
  return idempotencyEnabled
    ? LEGACY_AGENDA_ITEM_FIELDS.replace('created_by', 'client_operation_id, created_by')
    : LEGACY_AGENDA_ITEM_FIELDS;
}

export function buildAgendaCreationPayload(
  workspaceId,
  item,
  idempotencyEnabled = AGENDA_IDEMPOTENCY_ENABLED,
) {
  const timeSemantics = normalizeAgendaTimeSemantics(item);
  return {
    workspace_id: workspaceId,
    ...pickDefined(item, idempotencyEnabled
      ? [...MUTABLE_AGENDA_ITEM_FIELDS, 'client_operation_id']
      : MUTABLE_AGENDA_ITEM_FIELDS),
    ...timeSemantics,
    title: item.title.trim(),
  };
}

/**
 * Fonte unica do contrato persistente de horario. Chamadores legados que nao
 * conhecem a coluna continuam sendo tratados como horario explicito, enquanto
 * dia inteiro e ausencia declarada de horario nunca deixam um ends_at ativo.
 */
export function normalizeAgendaTimeSemantics(item = {}, { defaultExplicit = true } = {}) {
  const isAllDay = item.is_all_day === true;
  const hasDeclaredSemantics = item.is_all_day !== undefined || item.has_explicit_time !== undefined;
  if (!hasDeclaredSemantics && !defaultExplicit) return {};

  const hasExplicitTime = !isAllDay && (
    item.has_explicit_time !== undefined
      ? item.has_explicit_time !== false
      : defaultExplicit
  );
  return {
    ...(item.is_all_day !== undefined ? { is_all_day: isAllDay } : {}),
    has_explicit_time: hasExplicitTime,
    ...(!hasExplicitTime ? { ends_at: null } : {}),
  };
}

function createIdempotencyConflict() {
  return {
    data: null,
    error: {
      code: 'AGENDA_ITEM_IDEMPOTENCY_CONFLICT',
      message: 'Esta operação já foi usada para criar um compromisso diferente.',
    },
  };
}

function normalizeCreationField(field, value) {
  if (field === 'title' && typeof value === 'string') return value.trim();
  if (field === 'starts_at' || field === 'ends_at') {
    if (value == null) return null;
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? String(value) : timestamp.toISOString();
  }
  if (field === 'is_all_day') return Boolean(value);
  if (field === 'has_explicit_time') return value !== false;
  return value ?? null;
}

function isCompatibleAgendaCreation(existing, payload) {
  return IDEMPOTENT_AGENDA_CREATE_FIELDS.every((field) => (
    normalizeCreationField(field, existing[field])
      === normalizeCreationField(field, payload[field])
  ));
}

export function createAgendaClientOperationId() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('UUID seguro indisponivel para a operacao da Agenda.');
  }
  return globalThis.crypto.randomUUID();
}

export async function resolveIdempotentAgendaCreation({
  payload,
  findExisting,
  insertItem,
}) {
  if (!payload.client_operation_id) {
    const inserted = await insertItem(payload);
    return { ...inserted, idempotentReplay: false };
  }

  const existing = await findExisting();
  if (existing.error) return existing;
  if (existing.data) {
    return isCompatibleAgendaCreation(existing.data, payload)
      ? { ...existing, idempotentReplay: true }
      : createIdempotencyConflict();
  }

  const inserted = await insertItem(payload);
  if (!inserted.error || inserted.error.code !== '23505') {
    return { ...inserted, idempotentReplay: false };
  }

  const concurrent = await findExisting();
  if (concurrent.error) return concurrent;
  if (!concurrent.data) return inserted;
  return isCompatibleAgendaCreation(concurrent.data, payload)
    ? { ...concurrent, idempotentReplay: true }
    : createIdempotencyConflict();
}

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
    .select(getAgendaItemFields())
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

/**
 * Lista itens agendados que ja chegaram ao horario para o usuario atual.
 * Quando existe responsavel, somente ele recebe o lembrete; caso contrario,
 * o lembrete pertence ao criador. O workspace permanece no filtro alem da
 * protecao fornecida pela RLS.
 */
export async function listDueAgendaItemsForUser(workspaceId, userId, { dueAt } = {}) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(userId) || !dueAt) {
    return createValidationResult('Workspace, usuario ou vencimento invalido para lembretes.');
  }

  const dueAtDate = new Date(dueAt);
  if (Number.isNaN(dueAtDate.getTime())) {
    return createValidationResult('Vencimento invalido para lembretes.');
  }

  const { data, error } = await supabase
    .from('agenda_items')
    .select(getAgendaItemFields())
    .eq('workspace_id', workspaceId)
    .eq('status', 'scheduled')
    .lte('starts_at', dueAtDate.toISOString())
    .or(`assigned_user_id.eq.${userId},and(assigned_user_id.is.null,created_by.eq.${userId})`)
    .order('starts_at', { ascending: true });

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
    .select(getAgendaItemFields())
    .eq('workspace_id', workspaceId)
    .eq('id', itemId)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Item de agenda nao encontrado neste workspace.');
}

export async function createAgendaItem(
  workspaceId,
  item = {},
  { idempotencyEnabled = AGENDA_IDEMPOTENCY_ENABLED } = {},
) {
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

  if (
    idempotencyEnabled
    && !isValidUuid(item.client_operation_id)
  ) {
    return createValidationResult('Chave da operacao de Agenda invalida.');
  }

  const payload = buildAgendaCreationPayload(workspaceId, item, idempotencyEnabled);

  if (!idempotencyEnabled) {
    const { data, error } = await supabase
      .from('agenda_items')
      .insert(payload)
      .select(getAgendaItemFields(false))
      .single();
    return { ...createResult(data, error), idempotentReplay: false };
  }

  const result = await resolveIdempotentAgendaCreation({
    payload,
    findExisting: async () => {
      const { data, error } = await supabase
        .from('agenda_items')
        .select(getAgendaItemFields(true))
        .eq('workspace_id', workspaceId)
        .eq('client_operation_id', payload.client_operation_id)
        .maybeSingle();
      return { data, error };
    },
    insertItem: async (insertPayload) => {
      const { data, error } = await supabase
        .from('agenda_items')
        .insert(insertPayload)
        .select(getAgendaItemFields(true))
        .single();
      return { data, error };
    },
  });

  return {
    ...createResult(result.data, result.error),
    idempotentReplay: result.idempotentReplay === true,
  };
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

  Object.assign(payload, normalizeAgendaTimeSemantics(payload, { defaultExplicit: false }));

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

  const { data, error } = await query.select(getAgendaItemFields()).maybeSingle();

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
    .select(getAgendaItemFields())
    .maybeSingle();

  if (!error && !data) {
    return createResult(null, {
      code: 'AGENDA_ITEM_CONFLICT',
      message: 'Este compromisso foi alterado em outro lugar. Atualize a Agenda e tente novamente.',
    });
  }

  return normalizeSingleResult(data, error, 'Item de agenda nao encontrado para definir o status.');
}

export async function deleteAgendaItem(
  workspaceId,
  itemId,
  { expectedUpdatedAt } = {},
) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(itemId)) {
    return createValidationResult('Workspace ou item de agenda invalido para exclusao.');
  }

  if (!expectedUpdatedAt || Number.isNaN(new Date(expectedUpdatedAt).getTime())) {
    return createValidationResult('Versao esperada do item de agenda invalida.');
  }

  const { data, error } = await supabase
    .from('agenda_items')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', itemId)
    .eq('updated_at', expectedUpdatedAt)
    .select('id')
    .maybeSingle();

  if (!error && !data) {
    return createResult(null, {
      code: 'AGENDA_ITEM_CONFLICT',
      message: 'Este compromisso foi alterado ou removido em outro lugar. Atualize a Agenda e tente novamente.',
    });
  }

  return normalizeSingleResult(data, error, 'Item de agenda nao encontrado para exclusao.');
}
