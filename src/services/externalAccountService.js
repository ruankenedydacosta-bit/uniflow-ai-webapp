import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const EXTERNAL_ACCOUNT_FIELDS =
  'id, workspace_id, consent_id, normalized_account_id, provider, provider_account_id, institution_id, institution_name, display_name, account_type, account_subtype, currency_code, masked_number, status, sync_status, current_balance, available_balance, balance_captured_at, last_synced_at, created_at, updated_at';
const EXTERNAL_TRANSACTION_FIELDS =
  'id, workspace_id, external_account_id, normalized_transaction_id, provider, provider_transaction_id, transaction_direction, description, amount, currency_code, transaction_date, posted_at, status, merchant_name, category_hint, fingerprint, imported_at, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createResult(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Contas externas ainda nao estao configuradas.',
  });
}

function createValidationResult(message) {
  return createResult(null, {
    code: 'INVALID_EXTERNAL_ACCOUNT_REQUEST',
    message,
  });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export async function listExternalAccounts(
  workspaceId,
  { consentId, provider, status } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }
  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar contas externas.');
  }
  if (consentId && !isValidUuid(consentId)) {
    return createValidationResult('Consentimento invalido para filtrar contas.');
  }

  let query = supabase
    .from('external_accounts')
    .select(EXTERNAL_ACCOUNT_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('created_at');

  if (consentId) {
    query = query.eq('consent_id', consentId);
  }
  if (provider) {
    query = query.eq('provider', provider);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getExternalAccount(workspaceId, externalAccountId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }
  if (!isValidUuid(workspaceId) || !isValidUuid(externalAccountId)) {
    return createValidationResult('Workspace ou conta externa invalida.');
  }

  const { data, error } = await supabase
    .from('external_accounts')
    .select(EXTERNAL_ACCOUNT_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', externalAccountId)
    .maybeSingle();

  return createResult(data, error);
}

export async function listExternalTransactions(
  workspaceId,
  { externalAccountId, dateFrom, dateTo, limit = 100 } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }
  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar transacoes externas.');
  }
  if (externalAccountId && !isValidUuid(externalAccountId)) {
    return createValidationResult('Conta externa invalida para filtrar transacoes.');
  }

  const normalizedLimit = Math.floor(
    Math.min(Math.max(Number(limit) || 100, 1), 500),
  );
  let query = supabase
    .from('external_transactions')
    .select(EXTERNAL_TRANSACTION_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('transaction_date', { ascending: false })
    .limit(normalizedLimit);

  if (externalAccountId) {
    query = query.eq('external_account_id', externalAccountId);
  }
  if (dateFrom) {
    query = query.gte('transaction_date', dateFrom);
  }
  if (dateTo) {
    query = query.lte('transaction_date', dateTo);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}
