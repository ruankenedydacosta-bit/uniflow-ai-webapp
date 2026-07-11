import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const ACCOUNT_FIELDS =
  'id, workspace_id, name, account_type, institution_name, currency_code, initial_balance, current_balance, credit_limit, closing_day, due_day, is_active, source_type, external_provider, external_account_id, last_synced_at, sync_status, metadata, created_by, created_at, updated_at';
const ACCOUNT_TYPE_FIELDS =
  'code, name, description, display_order, is_active, created_at, updated_at';
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
    code: 'INVALID_ACCOUNT_REQUEST',
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
      code: 'ACCOUNT_NOT_FOUND',
      message,
    });
  }

  return createResult(data, error);
}

export async function listAccountTypes() {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  const { data, error } = await supabase
    .from('account_types')
    .select(ACCOUNT_TYPE_FIELDS)
    .eq('is_active', true)
    .order('display_order');

  return createResult(data ?? [], error);
}

export async function listAccounts(workspaceId, { activeOnly = true } = {}) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar contas.');
  }

  let query = supabase
    .from('accounts')
    .select(ACCOUNT_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('created_at');

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getAccount(workspaceId, accountId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(accountId)) {
    return createValidationResult('Workspace ou conta invalida.');
  }

  const { data, error } = await supabase
    .from('accounts')
    .select(ACCOUNT_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', accountId)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Conta nao encontrada neste workspace.');
}

export async function createAccount(workspaceId, account = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para criar a conta.');
  }

  if (
    typeof account.name !== 'string' ||
    !account.name.trim() ||
    typeof account.account_type !== 'string' ||
    !account.account_type
  ) {
    return createValidationResult('Nome e tipo da conta sao obrigatorios.');
  }

  const payload = {
    workspace_id: workspaceId,
    ...pickDefined(account, [
      'name',
      'account_type',
      'institution_name',
      'currency_code',
      'initial_balance',
      'current_balance',
      'credit_limit',
      'closing_day',
      'due_day',
      'is_active',
      'metadata',
    ]),
    name: account.name.trim(),
  };

  const { data, error } = await supabase
    .from('accounts')
    .insert(payload)
    .select(ACCOUNT_FIELDS)
    .single();

  return createResult(data, error);
}

export async function updateAccount(workspaceId, accountId, changes = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(accountId)) {
    return createValidationResult('Workspace ou conta invalida para atualizacao.');
  }

  const payload = pickDefined(changes, [
    'name',
    'account_type',
    'institution_name',
    'currency_code',
    'initial_balance',
    'current_balance',
    'credit_limit',
    'closing_day',
    'due_day',
    'is_active',
    'metadata',
  ]);

  if (typeof payload.name === 'string') {
    payload.name = payload.name.trim();
  } else if (payload.name !== undefined) {
    return createValidationResult('O nome da conta deve ser um texto valido.');
  }

  if (Object.keys(payload).length === 0 || payload.name === '') {
    return createValidationResult('Nenhuma alteracao valida foi informada.');
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('id', accountId)
    .select(ACCOUNT_FIELDS)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Conta nao encontrada para atualizacao.');
}

export function archiveAccount(workspaceId, accountId) {
  return updateAccount(workspaceId, accountId, { is_active: false });
}

export async function deleteAccount(workspaceId, accountId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(accountId)) {
    return createValidationResult('Workspace ou conta invalida para exclusao.');
  }

  const { data, error } = await supabase
    .from('accounts')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', accountId)
    .select('id')
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Conta nao encontrada para exclusao.');
}
