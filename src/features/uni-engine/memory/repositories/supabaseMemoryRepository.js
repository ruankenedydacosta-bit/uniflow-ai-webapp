// Adapter Supabase do repositório de memória (Fase 3).
//
// Persiste itens e evidências nas tabelas aditivas da migration 028
// (uni_engine_memory_items e uni_engine_memory_evidence). O cliente Supabase
// é importado LAZY (somente dentro dos métodos) — carregar o módulo nunca
// toca rede nem depende do Supabase.
//
// A segurança vem da RLS (user_id = auth.uid() + is_workspace_member) e o
// adapter ainda valida escopo em memória (defesa em profundidade). Usuário e
// workspace vêm SEMPRE da sessão autenticada — nunca do texto do usuário.
import {
  createRepoError,
  createRepoResult,
  normalizeRepoError,
  validateMemoryScope,
} from './memoryRepository.js';

const ITEM_FIELDS =
  'id, user_id, workspace_id, conversation_id, memory_type, subject_key, value_json, '
  + 'normalized_value, status, confidence, evidence_count, source, first_seen_at, '
  + 'last_seen_at, confirmed_at, expires_at, superseded_by, metadata, created_at, updated_at';

const EVIDENCE_FIELDS =
  'id, memory_id, user_id, workspace_id, evidence_type, source_message_id, '
  + 'source_conversation_id, observed_value, normalized_value, weight, occurred_at, '
  + 'evidence_key, metadata, created_at';

const ACTIVE_STATUSES = ['candidate', 'confirmed', 'active'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toItemRow(item) {
  return {
    user_id: item.userId,
    workspace_id: item.workspaceId,
    conversation_id: item.conversationId ?? null,
    memory_type: item.memoryType,
    subject_key: item.subjectKey,
    value_json: isPlainObject(item.value) ? item.value : {},
    normalized_value: item.normalizedValue ?? null,
    status: item.status ?? 'candidate',
    confidence: Number(item.confidence) || 0,
    evidence_count: item.evidenceCount ?? 0,
    source: item.source ?? 'engine',
    first_seen_at: item.firstSeenAt ?? new Date().toISOString(),
    last_seen_at: item.lastSeenAt ?? new Date().toISOString(),
    confirmed_at: item.confirmedAt ?? null,
    expires_at: item.expiresAt ?? null,
    superseded_by: item.supersededBy ?? null,
    metadata: isPlainObject(item.metadata) ? item.metadata : {},
  };
}

function fromItemRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    conversationId: row.conversation_id,
    memoryType: row.memory_type,
    subjectKey: row.subject_key,
    value: isPlainObject(row.value_json) ? row.value_json : {},
    normalizedValue: row.normalized_value,
    status: row.status,
    confidence: Number(row.confidence) || 0,
    evidenceCount: Number(row.evidence_count) || 0,
    source: row.source,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    confirmedAt: row.confirmed_at,
    expiresAt: row.expires_at,
    supersededBy: row.superseded_by,
    metadata: isPlainObject(row.metadata) ? row.metadata : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromEvidenceRow(row) {
  return {
    id: row.id,
    memoryId: row.memory_id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    evidenceType: row.evidence_type,
    sourceMessageId: row.source_message_id,
    sourceConversationId: row.source_conversation_id,
    observedValue: row.observed_value,
    normalizedValue: row.normalized_value,
    weight: Number(row.weight) || 0,
    occurredAt: row.occurred_at,
    evidenceKey: row.evidence_key,
    metadata: isPlainObject(row.metadata) ? row.metadata : {},
    createdAt: row.created_at,
  };
}

export function createSupabaseMemoryRepository() {
  function client() {
    // Importação lazy: nenhuma dependência de Supabase no carregamento.
    return import('../../../../services/supabaseClient.js');
  }

  async function unavailable() {
    return createRepoResult(null, createRepoError(
      'SUPABASE_NOT_CONFIGURED',
      'Memória persistente indisponível — pipeline continua normal.',
    ));
  }

  async function guardError(error, fallback = 'MEMORY_REPOSITORY_FAILED') {
    return createRepoResult(null, normalizeRepoError(error, fallback));
  }

  return {
    async createCandidate(candidate) {
      const scope = { userId: candidate?.userId, workspaceId: candidate?.workspaceId };
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      if (!isPlainObject(candidate)) {
        return createRepoResult(null, createRepoError('MEMORY_CANDIDATE_INVALID', 'Candidato inválido.'));
      }
      try {
        const { isSupabaseConfigured, supabase } = await client();
        if (!supabase || !isSupabaseConfigured) return unavailable();
        const { data, error } = await supabase
          .from('uni_engine_memory_items')
          .insert(toItemRow(candidate))
          .select(ITEM_FIELDS)
          .single();
        if (error) return guardError(error, 'MEMORY_CREATE_FAILED');
        return createRepoResult(fromItemRow(data));
      } catch (error) {
        return guardError(error, 'MEMORY_CREATE_FAILED');
      }
    },

    async appendEvidence(evidence) {
      if (!isPlainObject(evidence) || !evidence.memoryId) {
        return createRepoResult(null, createRepoError('MEMORY_EVIDENCE_INVALID', 'Evidência inválida.'));
      }
      try {
        const { isSupabaseConfigured, supabase } = await client();
        if (!supabase || !isSupabaseConfigured) return unavailable();
        const row = {
          memory_id: evidence.memoryId,
          user_id: evidence.userId,
          workspace_id: evidence.workspaceId,
          evidence_type: evidence.evidenceType,
          source_message_id: evidence.sourceMessageId ?? null,
          source_conversation_id: evidence.sourceConversationId ?? null,
          observed_value: evidence.observedValue ?? null,
          normalized_value: evidence.normalizedValue ?? null,
          weight: Number(evidence.weight) || 0,
          occurred_at: evidence.occurredAt ?? new Date().toISOString(),
          evidence_key: evidence.evidenceKey ?? null,
          metadata: isPlainObject(evidence.metadata) ? evidence.metadata : {},
        };
        const { data, error } = await supabase
          .from('uni_engine_memory_evidence')
          .insert(row)
          .select(EVIDENCE_FIELDS)
          .single();
        if (error) return guardError(error, 'MEMORY_EVIDENCE_APPEND_FAILED');
        return createRepoResult(fromEvidenceRow(data));
      } catch (error) {
        return guardError(error, 'MEMORY_EVIDENCE_APPEND_FAILED');
      }
    },

    async getById(scope, id) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      try {
        const { isSupabaseConfigured, supabase } = await client();
        if (!supabase || !isSupabaseConfigured) return unavailable();
        const { data, error } = await supabase
          .from('uni_engine_memory_items')
          .select(ITEM_FIELDS)
          .eq('user_id', scope.userId)
          .eq('workspace_id', scope.workspaceId)
          .eq('id', id)
          .maybeSingle();
        if (error) return guardError(error, 'MEMORY_GET_FAILED');
        if (!data) return createRepoResult(null, createRepoError('MEMORY_NOT_FOUND', 'Memória não encontrada.'));
        return createRepoResult(fromItemRow(data));
      } catch (error) {
        return guardError(error, 'MEMORY_GET_FAILED');
      }
    },

    async findBySubject(scope, subjectKey, statuses = null) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      if (typeof subjectKey !== 'string' || !subjectKey) {
        return createRepoResult(null, createRepoError('MEMORY_SUBJECT_INVALID', 'subjectKey inválida.'));
      }
      try {
        const { isSupabaseConfigured, supabase } = await client();
        if (!supabase || !isSupabaseConfigured) return unavailable();
        let query = supabase
          .from('uni_engine_memory_items')
          .select(ITEM_FIELDS)
          .eq('user_id', scope.userId)
          .eq('workspace_id', scope.workspaceId)
          .eq('subject_key', subjectKey);
        if (statuses) query = query.in('status', statuses);
        const { data, error } = await query.limit(20);
        if (error) return guardError(error, 'MEMORY_FIND_FAILED');
        return createRepoResult((data ?? []).map(fromItemRow));
      } catch (error) {
        return guardError(error, 'MEMORY_FIND_FAILED');
      }
    },

    async findRelevant(scope) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      try {
        const { isSupabaseConfigured, supabase } = await client();
        if (!supabase || !isSupabaseConfigured) return unavailable();
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('uni_engine_memory_items')
          .select(ITEM_FIELDS)
          .eq('user_id', scope.userId)
          .eq('workspace_id', scope.workspaceId)
          .in('status', ACTIVE_STATUSES)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order('last_seen_at', { ascending: false })
          .limit(100);
        if (error) return guardError(error, 'MEMORY_FIND_FAILED');
        return createRepoResult((data ?? []).map(fromItemRow));
      } catch (error) {
        return guardError(error, 'MEMORY_FIND_FAILED');
      }
    },

    async listEvidence(scope, memoryId) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      try {
        const { isSupabaseConfigured, supabase } = await client();
        if (!supabase || !isSupabaseConfigured) return unavailable();
        const { data, error } = await supabase
          .from('uni_engine_memory_evidence')
          .select(EVIDENCE_FIELDS)
          .eq('user_id', scope.userId)
          .eq('workspace_id', scope.workspaceId)
          .eq('memory_id', memoryId)
          .order('occurred_at', { ascending: true })
          .limit(200);
        if (error) return guardError(error, 'MEMORY_EVIDENCE_LIST_FAILED');
        return createRepoResult((data ?? []).map(fromEvidenceRow));
      } catch (error) {
        return guardError(error, 'MEMORY_EVIDENCE_LIST_FAILED');
      }
    },

    async updateMemory(scope, id, changes = {}) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      try {
        const { isSupabaseConfigured, supabase } = await client();
        if (!supabase || !isSupabaseConfigured) return unavailable();
        const mapping = {
          status: 'status',
          confidence: 'confidence',
          evidenceCount: 'evidence_count',
          lastSeenAt: 'last_seen_at',
          confirmedAt: 'confirmed_at',
          expiresAt: 'expires_at',
          supersededBy: 'superseded_by',
          metadata: 'metadata',
          value: 'value_json',
          normalizedValue: 'normalized_value',
        };
        const payload = {};
        for (const [key, column] of Object.entries(mapping)) {
          if (Object.hasOwn(changes, key)) payload[column] = changes[key];
        }
        if (Object.keys(payload).length === 0) {
          return this.getById(scope, id);
        }
        const { data, error } = await supabase
          .from('uni_engine_memory_items')
          .update(payload)
          .eq('user_id', scope.userId)
          .eq('workspace_id', scope.workspaceId)
          .eq('id', id)
          .select(ITEM_FIELDS)
          .maybeSingle();
        if (error) return guardError(error, 'MEMORY_UPDATE_FAILED');
        if (!data) return createRepoResult(null, createRepoError('MEMORY_NOT_FOUND', 'Memória não encontrada.'));
        return createRepoResult(fromItemRow(data));
      } catch (error) {
        return guardError(error, 'MEMORY_UPDATE_FAILED');
      }
    },

    markConfirmed(scope, id) {
      return this.updateMemory(scope, id, {
        status: 'confirmed',
        confirmedAt: new Date().toISOString(),
      });
    },

    markContested(scope, id) {
      return this.updateMemory(scope, id, { status: 'contested', confirmedAt: null });
    },

    supersede(scope, id, supersededBy) {
      return this.updateMemory(scope, id, { status: 'superseded', supersededBy, confirmedAt: null });
    },

    expire(scope, id) {
      return this.updateMemory(scope, id, {
        status: 'expired',
        confirmedAt: null,
        expiresAt: new Date().toISOString(),
      });
    },

    forget(scope, id) {
      return this.updateMemory(scope, id, { status: 'deleted', confirmedAt: null });
    },

    async deleteAllForUser(userId, workspaceId = null) {
      if (typeof userId !== 'string' || !userId) {
        return createRepoResult(null, createRepoError('MEMORY_USER_ID_REQUIRED', 'Usuário ausente.'));
      }
      try {
        const { isSupabaseConfigured, supabase } = await client();
        if (!supabase || !isSupabaseConfigured) return unavailable();
        let query = supabase.from('uni_engine_memory_items').delete().eq('user_id', userId);
        if (workspaceId) query = query.eq('workspace_id', workspaceId);
        const { error } = await query;
        if (error) return guardError(error, 'MEMORY_DELETE_ALL_FAILED');
        return createRepoResult({ removed: true });
      } catch (error) {
        return guardError(error, 'MEMORY_DELETE_ALL_FAILED');
      }
    },

    async deleteAllForWorkspace(workspaceId) {
      if (typeof workspaceId !== 'string' || !workspaceId) {
        return createRepoResult(null, createRepoError('MEMORY_WORKSPACE_ID_REQUIRED', 'Workspace ausente.'));
      }
      try {
        const { isSupabaseConfigured, supabase } = await client();
        if (!supabase || !isSupabaseConfigured) return unavailable();
        const { error } = await supabase
          .from('uni_engine_memory_items')
          .delete()
          .eq('workspace_id', workspaceId);
        if (error) return guardError(error, 'MEMORY_DELETE_ALL_FAILED');
        return createRepoResult({ removed: true });
      } catch (error) {
        return guardError(error, 'MEMORY_DELETE_ALL_FAILED');
      }
    },
  };
}
