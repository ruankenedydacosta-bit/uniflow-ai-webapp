import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const CONSENT_FIELDS =
  'id, workspace_id, user_id, provider, institution_id, institution_name, provider_consent_id, status, purpose, legal_basis, scopes, terms_version, privacy_policy_version, requested_at, authorized_at, expires_at, revoked_at, data_retention_until, last_error_code, last_error_at, metadata, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createResult(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Open Finance ainda nao esta configurado. Nenhum banco foi conectado.',
  });
}

function createValidationResult(message) {
  return createResult(null, {
    code: 'INVALID_OPEN_FINANCE_REQUEST',
    message,
  });
}

function createBackendRequiredResult(message) {
  return createResult(null, {
    code: 'OPEN_FINANCE_BACKEND_REQUIRED',
    message,
  });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export async function listOpenFinanceConsents(
  workspaceId,
  { provider, status } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }
  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar consentimentos.');
  }

  let query = supabase
    .from('open_finance_consents')
    .select(CONSENT_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('requested_at', { ascending: false });

  if (provider) {
    query = query.eq('provider', provider);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getOpenFinanceConsent(workspaceId, consentId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }
  if (!isValidUuid(workspaceId) || !isValidUuid(consentId)) {
    return createValidationResult('Workspace ou consentimento invalido.');
  }

  const { data, error } = await supabase
    .from('open_finance_consents')
    .select(CONSENT_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', consentId)
    .maybeSingle();

  return createResult(data, error);
}

export async function startOpenFinanceConsent() {
  return createBackendRequiredResult(
    'A conexao bancaria sera iniciada por uma Edge Function segura em uma fase futura.',
  );
}

export async function revokeOpenFinanceConsent() {
  return createBackendRequiredResult(
    'A revogacao sera processada pelo backend seguro e pelo provedor em uma fase futura.',
  );
}
