// Adapter em memória do repositório de memória (Fase 3).
//
// Usado em testes, demo e quando o Supabase não está configurado. Implementa
// a interface MEMORY_REPOSITORY_METHODS com Map internos — sem rede, sem
// persistência entre sessões.
//
// Concorrência básica: operações síncronas atômicas por chamada; o adapter
// nunca lança — devolve { data, error }.
import {
  createRepoError,
  createRepoResult,
  normalizeRepoError,
  validateMemoryScope,
} from './memoryRepository.js';
import {
  buildEvidenceKey,
  createMemoryItem,
} from '../memoryContracts.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameScope(scope, item) {
  return item.userId === scope.userId && item.workspaceId === scope.workspaceId;
}

function mapItem(row) {
  return createMemoryItem({
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    memoryType: row.memoryType,
    subjectKey: row.subjectKey,
    value: row.value,
    normalizedValue: row.normalizedValue,
    status: row.status,
    confidence: row.confidence,
    evidenceCount: row.evidenceCount,
    source: row.source,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    confirmedAt: row.confirmedAt,
    expiresAt: row.expiresAt,
    supersededBy: row.supersededBy,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function createInMemoryMemoryRepository() {
  const items = new Map();
  const evidenceByMemory = new Map();
  let idSequence = 0;

  function nextId() {
    idSequence += 1;
    return `mem-${Date.now().toString(36)}-${idSequence}`;
  }

  function listForScope(scope) {
    const result = [];
    for (const row of items.values()) {
      if (sameScope(scope, row)) result.push(mapItem(row));
    }
    return result;
  }

  return {
    createCandidate(candidate) {
      const scope = { userId: candidate?.userId, workspaceId: candidate?.workspaceId };
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      if (!isPlainObject(candidate)) {
        return createRepoResult(null, createRepoError('MEMORY_CANDIDATE_INVALID', 'Candidato inválido.'));
      }
      try {
        const now = new Date().toISOString();
        const row = {
          id: nextId(),
          userId: candidate.userId,
          workspaceId: candidate.workspaceId,
          conversationId: candidate.conversationId ?? null,
          memoryType: candidate.memoryType,
          subjectKey: candidate.subjectKey,
          value: isPlainObject(candidate.value) ? candidate.value : {},
          normalizedValue: candidate.normalizedValue ?? null,
          status: candidate.status ?? 'candidate',
          confidence: Number(candidate.confidence) || 0,
          evidenceCount: candidate.evidenceCount ?? 0,
          source: candidate.source ?? 'engine',
          firstSeenAt: now,
          lastSeenAt: now,
          confirmedAt: candidate.confirmedAt ?? null,
          expiresAt: candidate.expiresAt ?? null,
          supersededBy: candidate.supersededBy ?? null,
          metadata: isPlainObject(candidate.metadata) ? candidate.metadata : {},
          createdAt: now,
          updatedAt: now,
        };
        items.set(row.id, row);
        return createRepoResult(mapItem(row));
      } catch (error) {
        return createRepoResult(null, normalizeRepoError(error));
      }
    },

    appendEvidence(evidence) {
      if (!isPlainObject(evidence) || !evidence.memoryId) {
        return createRepoResult(null, createRepoError('MEMORY_EVIDENCE_INVALID', 'Evidência inválida.'));
      }
      const row = items.get(evidence.memoryId);
      if (!row) {
        return createRepoResult(null, createRepoError('MEMORY_NOT_FOUND', 'Memória não encontrada.'));
      }
      try {
        const entry = {
          id: evidence.id ?? `${row.id}-ev-${(evidenceByMemory.get(row.id)?.length ?? 0) + 1}`,
          memoryId: row.id,
          userId: row.userId,
          workspaceId: row.workspaceId,
          evidenceType: evidence.evidenceType,
          sourceMessageId: evidence.sourceMessageId ?? null,
          sourceConversationId: evidence.sourceConversationId ?? null,
          observedValue: evidence.observedValue ?? null,
          normalizedValue: evidence.normalizedValue ?? null,
          weight: Number(evidence.weight) || 0,
          occurredAt: evidence.occurredAt ?? new Date().toISOString(),
          evidenceKey: evidence.evidenceKey
            ?? buildEvidenceKey({
              evidenceType: evidence.evidenceType,
              sourceMessageId: evidence.sourceMessageId,
              occurredAt: evidence.occurredAt,
              memoryId: row.id,
            }),
          metadata: isPlainObject(evidence.metadata) ? evidence.metadata : {},
          createdAt: new Date().toISOString(),
        };
        const list = evidenceByMemory.get(row.id) ?? [];
        if (list.some((existing) => existing.evidenceKey === entry.evidenceKey)) {
          return createRepoResult(null, createRepoError('MEMORY_EVIDENCE_DUPLICATE', 'Evidência duplicada.'));
        }
        list.push(entry);
        evidenceByMemory.set(row.id, list);
        return createRepoResult({ ...entry });
      } catch (error) {
        return createRepoResult(null, normalizeRepoError(error));
      }
    },

    getById(scope, id) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      const row = items.get(id);
      if (!row) return createRepoResult(null, createRepoError('MEMORY_NOT_FOUND', 'Memória não encontrada.'));
      if (!sameScope(scope, row)) {
        return createRepoResult(null, createRepoError('MEMORY_SCOPE_MISMATCH', 'Memória fora do escopo.'));
      }
      return createRepoResult(mapItem(row));
    },

    findBySubject(scope, subjectKey, statuses = null) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      if (typeof subjectKey !== 'string' || !subjectKey) {
        return createRepoResult(null, createRepoError('MEMORY_SUBJECT_INVALID', 'subjectKey inválida.'));
      }
      const matches = listForScope(scope).filter((item) => item.subjectKey === subjectKey);
      const filtered = statuses ? matches.filter((item) => statuses.includes(item.status)) : matches;
      return createRepoResult(filtered);
    },

    findRelevant(scope) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      const now = Date.now();
      const matches = listForScope(scope).filter((item) => {
        if (['deleted', 'rejected', 'superseded', 'contested'].includes(item.status)) return false;
        if (item.expiresAt != null && new Date(item.expiresAt).getTime() <= now) return false;
        return true;
      });
      return createRepoResult(matches);
    },

    listEvidence(scope, memoryId) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      const row = items.get(memoryId);
      if (!row || !sameScope(scope, row)) {
        return createRepoResult(null, createRepoError('MEMORY_NOT_FOUND', 'Memória não encontrada.'));
      }
      return createRepoResult([...(evidenceByMemory.get(memoryId) ?? [])]);
    },

    updateMemory(scope, id, changes = {}) {
      const scopeValidation = validateMemoryScope(scope);
      if (!scopeValidation.valid) return createRepoResult(null, scopeValidation.error);
      const row = items.get(id);
      if (!row) return createRepoResult(null, createRepoError('MEMORY_NOT_FOUND', 'Memória não encontrada.'));
      if (!sameScope(scope, row)) {
        return createRepoResult(null, createRepoError('MEMORY_SCOPE_MISMATCH', 'Memória fora do escopo.'));
      }
      try {
        const allowed = [
          'status', 'confidence', 'evidenceCount', 'lastSeenAt', 'confirmedAt',
          'expiresAt', 'supersededBy', 'metadata', 'value', 'normalizedValue',
        ];
        for (const key of allowed) {
          if (Object.hasOwn(changes, key)) {
            row[key] = changes[key] ?? (key === 'metadata' ? {} : row[key]);
          }
        }
        row.updatedAt = new Date().toISOString();
        items.set(id, row);
        return createRepoResult(mapItem(row));
      } catch (error) {
        return createRepoResult(null, normalizeRepoError(error));
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

    deleteAllForUser(userId, workspaceId = null) {
      if (typeof userId !== 'string' || !userId) {
        return createRepoResult(null, createRepoError('MEMORY_USER_ID_REQUIRED', 'Usuário ausente.'));
      }
      let removed = 0;
      for (const [id, row] of items) {
        if (row.userId === userId && (!workspaceId || row.workspaceId === workspaceId)) {
          items.delete(id);
          evidenceByMemory.delete(id);
          removed += 1;
        }
      }
      return createRepoResult({ removed });
    },

    deleteAllForWorkspace(workspaceId) {
      if (typeof workspaceId !== 'string' || !workspaceId) {
        return createRepoResult(null, createRepoError('MEMORY_WORKSPACE_ID_REQUIRED', 'Workspace ausente.'));
      }
      let removed = 0;
      for (const [id, row] of items) {
        if (row.workspaceId === workspaceId) {
          items.delete(id);
          evidenceByMemory.delete(id);
          removed += 1;
        }
      }
      return createRepoResult({ removed });
    },
  };
}
