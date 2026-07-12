import { FORBIDDEN_MEMORY_KEYS, isValidMemoryType } from '../features/uni-memory/index.js';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMORY_FIELDS = 'id, workspace_id, user_id, memory_type, memory_key, memory_value, confidence, status, source, user_confirmed, requires_confirmation, first_observed_at, last_observed_at, expires_at, created_at, updated_at';
const USER_WRITABLE_SOURCES = new Set(['explicit_user', 'user_correction']);

function createResult(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function unavailable(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'A memória financeira ainda não está conectada. O modo seguro continua disponível.',
  });
}

function invalid(message) {
  return createResult(null, { code: 'INVALID_MEMORY_REQUEST', message });
}

function isForbiddenKey(key) {
  const normalized = String(key).toLowerCase();
  return FORBIDDEN_MEMORY_KEYS.some((forbidden) => normalized.includes(forbidden));
}

export function sanitizeMemoryValue(value, depth = 0) {
  if (depth > 6 || value === undefined || typeof value === 'function') return null;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeMemoryValue(item, depth + 1));
  }
  if (typeof value !== 'object') return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isForbiddenKey(key))
      .map(([key, item]) => [key, sanitizeMemoryValue(item, depth + 1)]),
  );
}

function validateIds(workspaceId, entityId = null) {
  return UUID_PATTERN.test(workspaceId ?? '') && (!entityId || UUID_PATTERN.test(entityId));
}

export async function listFinancialMemories(workspaceId, {
  status,
  memoryType,
  limit = 100,
} = {}) {
  if (!supabase) return unavailable([]);
  if (!validateIds(workspaceId)) return invalid('Workspace inválido para consultar memórias.');

  let query = supabase
    .from('uni_financial_memories')
    .select(MEMORY_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('last_observed_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 200));
  if (status) query = query.eq('status', status);
  if (memoryType) query = query.eq('memory_type', memoryType);
  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function getFinancialMemory(workspaceId, memoryId) {
  if (!supabase) return unavailable(null);
  if (!validateIds(workspaceId, memoryId)) return invalid('Workspace ou memória inválida.');
  const { data, error } = await supabase
    .from('uni_financial_memories')
    .select(MEMORY_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', memoryId)
    .maybeSingle();
  return createResult(data, error);
}

export async function createExplicitMemoryCandidate(
  workspaceId,
  userId,
  candidate,
  { userInitiated = false } = {},
) {
  if (!userInitiated) {
    return invalid('A memória só pode ser registrada após uma ação explícita do usuário.');
  }
  if (!supabase) return unavailable(null);
  if (!validateIds(workspaceId, userId)) return invalid('Workspace ou usuário inválido.');
  if (!isValidMemoryType(candidate?.type) || !candidate?.key) {
    return invalid('Tipo ou chave de memória inválida.');
  }
  if (!USER_WRITABLE_SOURCES.has(candidate.source)) {
    return invalid('Candidatos inferidos exigem backend seguro para persistência.');
  }

  const payload = {
    workspace_id: workspaceId,
    user_id: userId,
    memory_type: candidate.type,
    memory_key: String(candidate.key).trim().slice(0, 160),
    memory_value: sanitizeMemoryValue(candidate.value),
    confidence: Math.min(1, Math.max(0, Number(candidate.confidence) || 0)),
    status: 'candidate',
    source: candidate.source,
    user_confirmed: false,
    requires_confirmation: candidate.requiresConfirmation !== false,
    first_observed_at: candidate.firstObservedAt,
    last_observed_at: candidate.lastObservedAt,
    expires_at: candidate.expiresAt ?? null,
  };
  const { data, error } = await supabase
    .from('uni_financial_memories')
    .insert(payload)
    .select(MEMORY_FIELDS)
    .single();
  return createResult(data, error);
}

export async function decideFinancialMemory(workspaceId, memoryId, decision) {
  if (!supabase) return unavailable(null);
  if (!validateIds(workspaceId, memoryId)) return invalid('Workspace ou memória inválida.');
  if (!['confirmed', 'rejected'].includes(decision)) {
    return invalid('A decisão deve confirmar ou rejeitar a memória.');
  }
  const { data, error } = await supabase
    .from('uni_financial_memories')
    .update({ status: decision, user_confirmed: decision === 'confirmed' })
    .eq('workspace_id', workspaceId)
    .eq('id', memoryId)
    .select(MEMORY_FIELDS)
    .single();
  return createResult(data, error);
}

export async function deleteFinancialMemory(workspaceId, memoryId) {
  if (!supabase) return unavailable(null);
  if (!validateIds(workspaceId, memoryId)) return invalid('Workspace ou memória inválida.');
  const { error } = await supabase
    .from('uni_financial_memories')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', memoryId);
  return createResult(error ? null : { id: memoryId }, error);
}
