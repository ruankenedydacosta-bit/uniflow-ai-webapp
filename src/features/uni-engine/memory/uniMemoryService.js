// Serviço de Memória Inteligente Persistente (Fase 3).
//
// Camada única entre o Uni Engine e o repositório:
//   - valida candidatos (função pura);
//   - normaliza subjectKey;
//   - aplica política;
//   - consulta memória existente;
//   - anexa evidência;
//   - consolida determinísticamente;
//   - persiste de forma fire-and-forget (nunca bloqueia o envio);
//   - recupera com ranking e limite;
//   - filtra expiradas;
//   - isola por usuário/workspace;
//   - trata erro SEMPRE — nunca quebra o chat.
//
// Arquitetura (seção 10 da especificação):
//   Uni Engine → uniMemoryService → repository interface → adapter Supabase
//
// Todos os métodos públicos retornam { data, error, diagnostics }.
import {
  buildEvidenceKey,
  buildItemFromCandidate,
  isSerializableValue,
} from './memoryContracts.js';
import { MEMORY_POLICY } from './memoryPolicy.js';
import { evaluateMemoryCandidate } from './evaluateMemoryCandidate.js';
import { consolidateMemoryEvidence } from './consolidateMemoryEvidence.js';
import { resolveMemoryConflict } from './resolveMemoryConflict.js';
import { retrieveRelevantMemories } from './retrieveRelevantMemories.js';
import { createMemoryCache } from './memoryCache.js';
import {
  createRepoError,
  validateMemoryScope,
} from './repositories/memoryRepository.js';
import { createInMemoryMemoryRepository } from './repositories/inMemoryMemoryRepository.js';
import { buildMemoryTelemetry, emitMemoryTelemetry } from './telemetry/memoryTelemetry.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createDiagnostics(extra = {}) {
  return { errorCode: null, ...extra };
}

export function createUniMemoryService({
  repository = null,
  cache = null,
  policy = MEMORY_POLICY,
  config = null,
  telemetryAdapter = null,
} = {}) {
  const safePolicy = isPlainObject(policy) ? policy : MEMORY_POLICY;
  const safeConfig = isPlainObject(config) ? config : {};
  const repo = repository ?? createInMemoryMemoryRepository();
  const localCache = cache ?? createMemoryCache({ ttlMs: safePolicy.cache.ttlMs });

  const readEnabled = Boolean(safeConfig.memoryReadEnabled);
  const writeEnabled = Boolean(safeConfig.memoryWriteEnabled);

  function serviceResult(data, error = null, diagnostics = createDiagnostics()) {
    return { data, error, diagnostics };
  }

  function safeError(code, message) {
    return createRepoError(code, message);
  }

  // -----------------------------------------------
  // Avaliação local (pura, sem rede) — < 10 ms.
  // -----------------------------------------------

  function evaluateCandidatesSync({
    message = null,
    session = null,
    classification = null,
    epistemicState = null,
    cognitiveContext = null,
    snapshot = null,
    operationalMemory = null,
    now = Date.now(),
  } = {}) {
    try {
      return evaluateMemoryCandidate({
        message,
        session,
        classification,
        epistemicState,
        cognitiveContext,
        snapshot,
        operationalMemory,
        now,
        policy: safePolicy,
      });
    } catch {
      return {
        candidates: [],
        rejected: [],
        diagnostics: {
          rulesUsed: [],
          rejected: [{ reason: 'evaluation_error' }],
          candidateCount: 0,
          errorCode: 'MEMORY_EVALUATION_ERROR',
        },
      };
    }
  }

  // -----------------------------------------------
  // Recuperação (ranking determinístico, limite fixo).
  // -----------------------------------------------

  function rankRetrieved(memories, message, cognitiveContext, limit) {
    return retrieveRelevantMemories({
      memories,
      message,
      cognitiveContext,
      limit,
      policy: safePolicy,
      now: Date.now(),
    });
  }

  async function refreshCache({ userId, workspaceId }) {
    const scope = { userId, workspaceId };
    const scopeValidation = validateMemoryScope(scope);
    if (!scopeValidation.valid) return serviceResult(null, scopeValidation.error);
    try {
      const result = await repo.findRelevant(scope);
      if (result.error) return serviceResult(null, result.error, createDiagnostics('READ_FAILED'));
      localCache.set(scope, result.data ?? []);
      return serviceResult(result.data ?? [], null, createDiagnostics());
    } catch {
      return serviceResult(null, safeError('MEMORY_CACHE_REFRESH_FAILED', 'Falha ao preparar memória.'), createDiagnostics('READ_FAILED'));
    }
  }

  // Síncrono para o motor (cache-first; falha → repository assíncrono depois).
  function retrieveRelevantSync({
    userId = null,
    workspaceId = null,
    message = null,
    cognitiveContext = null,
    limit = null,
  } = {}) {
    const scope = { userId, workspaceId };
    if (!validateMemoryScope(scope).valid) {
      return { data: { memories: [], diagnostics: {} }, error: null, diagnostics: createDiagnostics() };
    }
    const cached = localCache.get(scope);
    if (cached) {
      const ranked = rankRetrieved(cached, message, cognitiveContext, limit);
      return { data: ranked, error: null, diagnostics: createDiagnostics() };
    }
    return { data: null, error: null, diagnostics: createDiagnostics({ cacheMiss: true }) };
  }

  async function retrieve({
    userId = null,
    workspaceId = null,
    message = null,
    cognitiveContext = null,
    limit = null,
  } = {}) {
    const scope = { userId, workspaceId };
    const scopeValidation = validateMemoryScope(scope);
    if (!scopeValidation.valid) return serviceResult(null, scopeValidation.error);
    try {
      let memories = localCache.get(scope);
      if (!memories) {
        const fetched = await repo.findRelevant(scope);
        if (fetched.error) return serviceResult(null, fetched.error, createDiagnostics('READ_FAILED'));
        memories = fetched.data ?? [];
        localCache.set(scope, memories);
      }
      const ranked = rankRetrieved(memories, message, cognitiveContext, limit);
      return serviceResult(ranked, null, createDiagnostics());
    } catch {
      return serviceResult(null, safeError('MEMORY_RETRIEVE_FAILED', 'Falha ao recuperar memória.'), createDiagnostics('READ_FAILED'));
    }
  }

  // -----------------------------------------------
  // Persistência (fire-and-forget — nunca bloqueia o chat).
  // -----------------------------------------------

  async function persistOne({ candidate, scope, sourceMessageId }) {
    const scopeValidation = validateMemoryScope(scope);
    if (!scopeValidation.valid) return { ok: false, reason: scopeValidation.error.code };

    const existingResult = await repo.findBySubject(
      scope,
      candidate.subjectKey,
      ['candidate', 'confirmed', 'active'],
    );
    if (existingResult.error) return { ok: false, reason: 'find_failed' };

    const existing = safeArray(existingResult.data)[0] ?? null;
    const evidenceHistory = existing
      ? (await repo.listEvidence(scope, existing.id)).data ?? []
      : [];

    const evidence = {
      memoryId: existing?.id ?? null,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      evidenceType: candidate.evidenceType,
      sourceMessageId,
      sourceConversationId: candidate.conversationId ?? null,
      observedValue: candidate.value,
      normalizedValue: candidate.normalizedValue,
      weight: candidate.weight,
      occurredAt: candidate.evidence?.occurredAt ?? new Date().toISOString(),
    };
    if (!isSerializableValue(evidence)) return { ok: false, reason: 'not_serializable' };

    if (!existing) {
      const item = buildItemFromCandidate(candidate, safePolicy);
      const itemValidation = validateMemoryItemForPersistence(item);
      if (!itemValidation) return { ok: false, reason: 'invalid_item' };
      const created = await repo.createCandidate(item);
      if (created.error) return { ok: false, reason: 'create_failed' };
      evidence.memoryId = created.data.id;
      const evidenceResult = await repo.appendEvidence({
        ...evidence,
        evidenceKey: buildEvidenceKey({
          evidenceType: evidence.evidenceType,
          sourceMessageId: evidence.sourceMessageId,
          occurredAt: evidence.occurredAt,
          memoryId: created.data.id,
        }),
      });
      if (evidenceResult.error) return { ok: false, reason: 'evidence_failed' };
      return { ok: true, memory: created.data, created: true };
    }

    const conflict = resolveMemoryConflict(existing, candidate, safePolicy);

    if (conflict.outcome === 'supersede') {
      const item = buildItemFromCandidate(candidate, safePolicy);
      const created = await repo.createCandidate(item);
      if (created.error) return { ok: false, reason: 'create_failed' };
      evidence.memoryId = created.data.id;
      const evidenceResult = await repo.appendEvidence({
        ...evidence,
        evidenceKey: buildEvidenceKey({
          evidenceType: evidence.evidenceType,
          sourceMessageId: evidence.sourceMessageId,
          occurredAt: evidence.occurredAt,
          memoryId: created.data.id,
        }),
      });
      if (evidenceResult.error) return { ok: false, reason: 'evidence_failed' };
      const superseded = await repo.supersede(scope, existing.id, created.data.id);
      if (superseded.error) return { ok: false, reason: 'supersede_failed' };
      return { ok: true, memory: created.data, superseded: existing.id };
    }

    if (conflict.outcome === 'contest') {
      const contested = await repo.markContested(scope, existing.id);
      if (contested.error) return { ok: false, reason: 'contest_failed' };
      const item = buildItemFromCandidate(candidate, safePolicy);
      const created = await repo.createCandidate(item);
      if (created.error) return { ok: false, reason: 'create_failed' };
      evidence.memoryId = created.data.id;
      await repo.appendEvidence({
        ...evidence,
        evidenceKey: buildEvidenceKey({
          evidenceType: evidence.evidenceType,
          sourceMessageId: evidence.sourceMessageId,
          occurredAt: evidence.occurredAt,
          memoryId: created.data.id,
        }),
      });
      return { ok: true, memory: created.data, contested: existing.id };
    }

    if (conflict.outcome === 'same' || conflict.outcome === 'reinforce') {
      evidence.memoryId = existing.id;
      const evidenceKey = buildEvidenceKey({
        evidenceType: evidence.evidenceType,
        sourceMessageId: evidence.sourceMessageId,
        occurredAt: evidence.occurredAt,
        memoryId: existing.id,
      });
      const appended = await repo.appendEvidence({ ...evidence, evidenceKey });
      if (appended.error) {
        return { ok: false, reason: 'evidence_failed' };
      }
      const consolidated = consolidateMemoryEvidence({
        memory: existing,
        evidence: appended.data ?? { ...evidence, evidenceKey },
        evidenceHistory,
        policy: safePolicy,
        now: Date.now(),
      });
      if (consolidated.changed) {
        const updated = await repo.updateMemory(scope, existing.id, consolidated.memory);
        if (updated.error) return { ok: false, reason: 'update_failed' };
        return { ok: true, memory: updated.data, reinforced: true, statusChange: consolidated.statusChange };
      }
      return { ok: true, memory: existing, unchanged: true };
    }

    // requires_confirmation / ignore: não persiste nada (reduz ruído).
    return { ok: false, reason: conflict.outcome };
  }

  function validateMemoryItemForPersistence(item) {
    if (!isPlainObject(item) || !item.subjectKey || !item.memoryType) return false;
    if (!isPlainObject(item.value) || !isSerializableValue(item.value)) return false;
    return true;
  }

  async function captureCandidates({
    candidates = null,
    session = null,
    sourceMessageId = null,
  } = {}) {
    const list = safeArray(candidates).slice(0, safePolicy.maxCandidatesPerMessage);
    if (list.length === 0) {
      return serviceResult({ captured: 0 }, null, createDiagnostics());
    }
    const scope = {
      userId: session?.userId,
      workspaceId: session?.workspaceId,
    };
    const scopeValidation = validateMemoryScope(scope);
    if (!scopeValidation.valid) {
      return serviceResult(null, scopeValidation.error, createDiagnostics('WRITE_FAILED'));
    }
    const captured = [];
    const rejected = [];
    for (const candidate of list) {
      const result = await persistOne({ candidate, scope, sourceMessageId });
      if (result.ok) {
        captured.push({ id: result.memory?.id, memoryType: candidate.memoryType, subjectKey: candidate.subjectKey });
      } else {
        rejected.push({ reason: result.reason, subjectKey: candidate.subjectKey });
      }
    }
    localCache.invalidate(scope);
    return serviceResult(
      { captured: captured.length, memories: captured, rejected },
      null,
      createDiagnostics({ captured, rejected }),
    );
  }

  // -----------------------------------------------
  // Esquecimento (sempre explícito, nunca global acidental).
  // -----------------------------------------------

  async function forgetMemory({ userId, workspaceId, id }) {
    const scope = { userId, workspaceId };
    const scopeValidation = validateMemoryScope(scope);
    if (!scopeValidation.valid) return serviceResult(null, scopeValidation.error);
    if (typeof id !== 'string' || !id) {
      return serviceResult(null, safeError('MEMORY_ID_REQUIRED', 'Memória não informada.'));
    }
    const result = await repo.forget(scope, id);
    if (!result.error) localCache.invalidate(scope);
    return serviceResult(result.data, result.error, createDiagnostics());
  }

  async function deleteAllForUser({ userId, workspaceId = null }) {
    if (typeof userId !== 'string' || !userId) {
      return serviceResult(null, safeError('MEMORY_USER_ID_REQUIRED', 'Usuário ausente.'));
    }
    const result = await repo.deleteAllForUser(userId, workspaceId);
    if (!result.error) {
      if (workspaceId) localCache.invalidate({ userId, workspaceId });
      else localCache.invalidateAllForUser(userId);
    }
    return serviceResult(result.data, result.error, createDiagnostics());
  }

  async function deleteAllForWorkspace({ workspaceId }) {
    if (typeof workspaceId !== 'string' || !workspaceId) {
      return serviceResult(null, safeError('MEMORY_WORKSPACE_ID_REQUIRED', 'Workspace ausente.'));
    }
    const result = await repo.deleteAllForWorkspace(workspaceId);
    if (!result.error) localCache.invalidateAllForWorkspace(workspaceId);
    return serviceResult(result.data, result.error, createDiagnostics());
  }

  // -----------------------------------------------
  // Adapter para o Uni Engine (Shadow Mode).
  // -----------------------------------------------

  function createEngineAdapter(session) {
    const safeSession = isPlainObject(session) ? session : {};
    return {
      evaluateCandidatesSync(options = {}) {
        return evaluateCandidatesSync({
          ...options,
          session: safeSession,
        });
      },
      retrieveRelevantSync(options = {}) {
        return retrieveRelevantSync({
          ...options,
          userId: safeSession.userId,
          workspaceId: safeSession.workspaceId,
        });
      },
      captureCandidates({ candidates = null, sourceMessageId = null } = {}) {
        const promise = captureCandidates({
          candidates,
          session: safeSession,
          sourceMessageId,
        });
        promise.catch(() => {});
        return promise;
      },
    };
  }

  // -----------------------------------------------
  // Público
  // -----------------------------------------------

  return {
    isReadEnabled: () => readEnabled,
    isWriteEnabled: () => writeEnabled,
    evaluateCandidatesSync,
    retrieveRelevantSync,
    retrieve,
    refreshCache,
    warm: refreshCache,
    captureCandidates,
    forgetMemory,
    deleteAllForUser,
    deleteAllForWorkspace,
    clearCache: () => localCache.clear(),
    cacheSize: () => localCache.size(),
    createEngineAdapter,
    buildTelemetry: ({ correlationId, persistentMemory, latencyMs, writeError }) =>
      buildMemoryTelemetry({ correlationId, persistentMemory, latencyMs, writeError }),
    emitTelemetry: ({ correlationId, persistentMemory, latencyMs, writeError }) =>
      emitMemoryTelemetry(
        buildMemoryTelemetry({ correlationId, persistentMemory, latencyMs, writeError }),
        telemetryAdapter ?? null,
      ),
    _diagnostics() {
      return {
        repositoryMethods: Object.keys(repo).sort(),
        cacheEntries: localCache.size(),
      };
    },
  };
}
