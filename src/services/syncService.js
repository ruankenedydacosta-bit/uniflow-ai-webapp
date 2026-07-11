import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const SYNC_JOB_FIELDS =
  'id, workspace_id, consent_id, external_account_id, provider, job_type, trigger_type, status, idempotency_key, webhook_event_id, attempt_count, max_attempts, requested_by, requested_at, started_at, finished_at, records_received, records_created, records_updated, records_skipped, error_code, error_message, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createResult(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Sincronizacao automatica ainda nao esta configurada.',
  });
}

function createValidationResult(message) {
  return createResult(null, {
    code: 'INVALID_SYNC_REQUEST',
    message,
  });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export async function listSyncJobs(
  workspaceId,
  { provider, status, limit = 20 } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }
  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar sincronizacoes.');
  }

  const normalizedLimit = Math.floor(
    Math.min(Math.max(Number(limit) || 20, 1), 100),
  );
  let query = supabase
    .from('sync_jobs')
    .select(SYNC_JOB_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('requested_at', { ascending: false })
    .limit(normalizedLimit);

  if (provider) {
    query = query.eq('provider', provider);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getSyncJob(workspaceId, syncJobId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }
  if (!isValidUuid(workspaceId) || !isValidUuid(syncJobId)) {
    return createValidationResult('Workspace ou sincronizacao invalida.');
  }

  const { data, error } = await supabase
    .from('sync_jobs')
    .select(SYNC_JOB_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', syncJobId)
    .maybeSingle();

  return createResult(data, error);
}

export async function requestOpenFinanceSync() {
  return createResult(null, {
    code: 'OPEN_FINANCE_BACKEND_REQUIRED',
    message: 'A sincronizacao sera enfileirada por uma Edge Function em uma fase futura.',
  });
}
