import {
  FORBIDDEN_MEMORY_KEYS,
  MEMORY_STATUSES,
  isValidMemoryType,
} from '../features/uni-memory/index.js';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMORY_FIELDS = 'id, workspace_id, user_id, memory_type, memory_key, memory_value, confidence, status, source, user_confirmed, requires_confirmation, first_observed_at, last_observed_at, expires_at, superseded_by_id, created_at, updated_at';
const USER_WRITABLE_SOURCES = new Set(['explicit_user', 'user_correction']);
const USER_WRITABLE_TYPES = new Set([
  'category_preference',
  'account_preference',
  'merchant_category_mapping',
  'financial_goal_context',
  'conversation_preference',
]);

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

function withSafeError(data, error, message) {
  return createResult(data, error ? { code: 'MEMORY_OPERATION_FAILED', message } : null);
}

function isForbiddenKey(key) {
  const normalized = String(key).toLowerCase();
  return FORBIDDEN_MEMORY_KEYS.some((forbidden) => normalized.includes(forbidden));
}

export function isSafeMemoryKey(key) {
  return typeof key === 'string' && key.trim().length > 0 &&
    key.trim().length <= 160 && !isForbiddenKey(key);
}

export function sanitizeMemoryValue(value, depth = 0) {
  if (depth > 8 || value === undefined || typeof value === 'function') return null;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeMemoryValue(item, depth + 1));
  }
  if (typeof value !== 'object') return null;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 64)
      .filter(([key]) => !isForbiddenKey(key))
      .map(([key, item]) => [key, sanitizeMemoryValue(item, depth + 1)]),
  );
}

function prepareMemoryValue(value) {
  const sanitized = sanitizeMemoryValue(value);
  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== 'object') {
    return invalid('O conteúdo da memória precisa ser um objeto financeiro válido.');
  }
  if (new TextEncoder().encode(JSON.stringify(sanitized)).length > 16384) {
    return invalid('O conteúdo da memória ultrapassa o limite seguro.');
  }
  return createResult(sanitized);
}

export function isFrontendWritableMemoryType(memoryType) {
  return USER_WRITABLE_TYPES.has(memoryType);
}

async function getAuthenticatedUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) {
    return withSafeError(null, error ?? new Error('missing user'), 'Sua sessão precisa estar ativa para alterar memórias.');
  }
  return createResult(data.user.id);
}

function validateIds(workspaceId, entityId = null) {
  return UUID_PATTERN.test(workspaceId ?? '') && (!entityId || UUID_PATTERN.test(entityId));
}

function readWorkspaceId(sessionContext) {
  return sessionContext?.workspace?.id ?? null;
}

export async function listFinancialMemories(sessionContext, {
  status,
  memoryType,
  limit = 100,
} = {}) {
  if (!supabase) return unavailable([]);
  const workspaceId = readWorkspaceId(sessionContext);
  if (!validateIds(workspaceId)) return invalid('Workspace inválido para consultar memórias.');
  if (status && !MEMORY_STATUSES.includes(status)) return invalid('Status de memória inválido.');
  if (memoryType && !isValidMemoryType(memoryType)) return invalid('Tipo de memória inválido.');

  let query = supabase
    .from('uni_financial_memories')
    .select(MEMORY_FIELDS)
    .eq('workspace_id', workspaceId)
    .order('last_observed_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 200));
  if (status) query = query.eq('status', status);
  if (memoryType) query = query.eq('memory_type', memoryType);
  const { data, error } = await query;
  return withSafeError(data ?? [], error, 'Não consegui carregar suas memórias agora.');
}

export async function getFinancialMemory(sessionContext, memoryId) {
  if (!supabase) return unavailable(null);
  const workspaceId = readWorkspaceId(sessionContext);
  if (!validateIds(workspaceId, memoryId)) return invalid('Workspace ou memória inválida.');
  const { data, error } = await supabase
    .from('uni_financial_memories')
    .select(MEMORY_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', memoryId)
    .maybeSingle();
  return withSafeError(data, error, 'Não consegui carregar essa memória agora.');
}

// A memória ativa (candidate ou confirmed) de uma chave. O índice único
// garante no máximo uma por pessoa, espaço, tipo e chave; a RLS só mostra as
// da própria pessoa.
export async function findActiveFinancialMemoryByKey(sessionContext, memoryType, memoryKey) {
  if (!supabase) return unavailable(null);
  const workspaceId = readWorkspaceId(sessionContext);
  if (!validateIds(workspaceId)) return invalid('Workspace inválido para consultar memórias.');
  if (!isValidMemoryType(memoryType) || !isSafeMemoryKey(memoryKey)) {
    return invalid('Tipo ou chave de memória inválida.');
  }
  const { data, error } = await supabase
    .from('uni_financial_memories')
    .select(MEMORY_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('memory_type', memoryType)
    .eq('memory_key', memoryKey.trim())
    .in('status', ['candidate', 'confirmed'])
    .maybeSingle();
  return withSafeError(data, error, 'Não consegui carregar essa memória agora.');
}

export async function createExplicitMemoryCandidate(
  sessionContext,
  candidate,
  { userInitiated = false } = {},
) {
  if (!userInitiated) {
    return invalid('A memória só pode ser registrada após uma ação explícita do usuário.');
  }
  if (!supabase) return unavailable(null);
  const workspaceId = readWorkspaceId(sessionContext);
  if (!validateIds(workspaceId)) return invalid('Workspace inválido para registrar memória.');
  if (!isValidMemoryType(candidate?.type) || !isFrontendWritableMemoryType(candidate.type) || !isSafeMemoryKey(candidate?.key)) {
    return invalid('Tipo ou chave de memória inválida.');
  }
  if (!USER_WRITABLE_SOURCES.has(candidate.source)) {
    return invalid('Candidatos inferidos exigem backend seguro para persistência.');
  }
  if (candidate.source === 'user_correction' && candidate.type !== 'merchant_category_mapping') {
    return invalid('Essa correção não corresponde a um mapeamento financeiro permitido.');
  }

  const userResult = await getAuthenticatedUserId();
  if (userResult.error) return userResult;
  const valueResult = prepareMemoryValue(candidate.value);
  if (valueResult.error) return valueResult;

  const payload = {
    workspace_id: workspaceId,
    memory_type: candidate.type,
    memory_key: String(candidate.key).trim().slice(0, 160),
    memory_value: valueResult.data,
    source: candidate.source,
  };
  const { data, error } = await supabase
    .from('uni_financial_memories')
    .insert(payload)
    .select(MEMORY_FIELDS)
    .single();
  return withSafeError(data, error, 'Não consegui registrar essa memória agora.');
}

export async function decideFinancialMemory(sessionContext, memoryId, decision) {
  if (!supabase) return unavailable(null);
  const workspaceId = readWorkspaceId(sessionContext);
  if (!validateIds(workspaceId, memoryId)) return invalid('Workspace ou memória inválida.');
  if (!['confirmed', 'rejected'].includes(decision)) {
    return invalid('A decisão deve confirmar ou rejeitar a memória.');
  }
  const { data, error } = await supabase
    .rpc('decide_uni_financial_memory', {
      target_workspace_id: workspaceId,
      target_memory_id: memoryId,
      target_decision: decision,
    });
  return withSafeError(data, error, 'Não consegui aplicar essa decisão agora.');
}

export async function correctExplicitFinancialMemory(sessionContext, memoryId, value) {
  if (!supabase) return unavailable(null);
  const workspaceId = readWorkspaceId(sessionContext);
  if (!validateIds(workspaceId, memoryId)) return invalid('Workspace ou memória inválida.');
  const valueResult = prepareMemoryValue(value);
  if (valueResult.error) return valueResult;
  const { data, error } = await supabase.rpc('correct_uni_explicit_memory', {
    target_workspace_id: workspaceId,
    target_memory_id: memoryId,
    corrected_value: valueResult.data,
  });
  return withSafeError(data, error, 'Não consegui corrigir essa memória agora.');
}

export async function deleteFinancialMemory(sessionContext, memoryId) {
  if (!supabase) return unavailable(null);
  const workspaceId = readWorkspaceId(sessionContext);
  if (!validateIds(workspaceId, memoryId)) return invalid('Workspace ou memória inválida.');
  const { error } = await supabase
    .from('uni_financial_memories')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', memoryId);
  return withSafeError(error ? null : { id: memoryId }, error, 'Não consegui remover essa memória agora.');
}
