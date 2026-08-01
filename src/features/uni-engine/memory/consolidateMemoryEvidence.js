// Consolidação determinística de evidências (Fase 3).
//
// consolidateMemoryEvidence({ memory, evidence, evidenceHistory, policy, now }):
//   - aumenta evidenceCount;
//   - recalcula confiança pela fórmula da política;
//   - atualiza lastSeenAt (e renova expiração em tipos renováveis);
//   - promove status quando os critérios forem alcançados;
//   - reduz confiança após rejeição;
//   - preserva idempotência por evidenceKey;
//   - NUNCA executa ação, NUNCA altera dado financeiro.
//
// Função pura — sem LLM, sem rede, sem Supabase.
import {
  MEMORY_POLICY,
  clamp01,
  computeConfidence,
  getEvidenceWeight,
} from './memoryPolicy.js';
import {
  buildEvidenceKey,
  createEvidence,
} from './memoryContracts.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function consolidateMemoryEvidence({
  memory = null,
  evidence = null,
  evidenceHistory = null,
  policy = MEMORY_POLICY,
  now = Date.now(),
} = {}) {
  const safePolicy = isPlainObject(policy) ? policy : MEMORY_POLICY;
  const base = isPlainObject(memory) ? memory : null;
  const newEvidence = isPlainObject(evidence) ? evidence : null;

  if (!base || !newEvidence) {
    return {
      memory: base,
      changed: false,
      statusChange: null,
      confidenceChange: null,
      reason: 'missing_memory_or_evidence',
      diagnostics: { reason: 'missing_memory_or_evidence' },
    };
  }

  if (base.status === 'deleted' || base.status === 'rejected') {
    return {
      memory: base,
      changed: false,
      statusChange: null,
      confidenceChange: null,
      reason: 'inactive_memory',
      diagnostics: { reason: 'inactive_memory' },
    };
  }

  const history = safeArray(evidenceHistory);
  const evidenceKey = newEvidence.evidenceKey
    ?? buildEvidenceKey({
      evidenceType: newEvidence.evidenceType,
      sourceMessageId: newEvidence.sourceMessageId,
      occurredAt: newEvidence.occurredAt,
      memoryId: base.id,
    });

  const knownKeys = new Set(safeArray(base.metadata?.evidenceKeys));
  if (knownKeys.has(evidenceKey)) {
    return {
      memory: base,
      changed: false,
      statusChange: null,
      confidenceChange: null,
      reason: 'duplicate_evidence',
      diagnostics: { reason: 'duplicate_evidence', evidenceKey },
    };
  }

  const nextHistory = history.slice(0, safePolicy.maxEvidencePerMemory - 1);
  nextHistory.push({
    ...createEvidence(newEvidence),
    evidenceKey,
  });

  const weights = nextHistory.map((entry) => entry.weight ?? getEvidenceWeight(entry.evidenceType));
  const confidence = computeConfidence(weights, safePolicy);
  const evidenceCount = nextHistory.length;

  const nowIso = new Date(now).toISOString();
  const metadata = isPlainObject(base.metadata) ? { ...base.metadata } : {};
  metadata.evidenceKeys = Array.from(new Set([...knownKeys, evidenceKey])).slice(
    -safePolicy.maxEvidencePerMemory,
  );

  // Rejeição explícita: reduz confiança e bloqueia uso temporariamente.
  if (newEvidence.evidenceType === 'rejected_suggestion') {
    metadata.blockedUntil = new Date(now + safePolicy.rejection.blockedSuggestionMs).toISOString();
  }

  const updated = {
    ...base,
    confidence: Number(clamp01(confidence).toFixed(4)),
    evidenceCount,
    lastSeenAt: nowIso,
    updatedAt: nowIso,
    metadata,
  };

  // Renovação de expiração para tipos renováveis (uso recente prolonga).
  if (
    base.expiresAt != null
    && safePolicy.renewableTypes.includes(base.memoryType)
  ) {
    const retention = safePolicy.retention[base.memoryType];
    if (typeof retention === 'number') {
      updated.expiresAt = new Date(now + retention).toISOString();
    }
  }

  // Promoção determinística de status.
  let statusChange = null;
  const canBeConfirmed =
    updated.status === 'candidate'
    && evidenceCount >= safePolicy.promotion.confirmedMinEvidence
    && confidence >= safePolicy.promotion.confirmedMinConfidence;
  const canBeActive =
    (updated.status === 'candidate' || updated.status === 'confirmed')
    && evidenceCount >= safePolicy.promotion.activeMinEvidence
    && confidence >= safePolicy.promotion.activeMinConfidence;

  if (canBeActive) {
    updated.status = 'active';
    statusChange = 'candidate_or_confirmed_to_active';
  } else if (canBeConfirmed) {
    updated.status = 'confirmed';
    updated.confirmedAt = updated.confirmedAt ?? nowIso;
    statusChange = 'candidate_to_confirmed';
  }

  return {
    memory: updated,
    changed: true,
    statusChange,
    confidenceChange: {
      from: Number(base.confidence.toFixed(4)),
      to: Number(updated.confidence.toFixed(4)),
    },
    reason: 'consolidated',
    diagnostics: {
      reason: 'consolidated',
      evidenceCount,
      confidence: Number(updated.confidence.toFixed(4)),
      status: updated.status,
      statusChange,
      duplicate: false,
    },
  };
}

export function appendEvidenceToMemory({
  memory = null,
  evidence = null,
  evidenceHistory = null,
  policy = MEMORY_POLICY,
  now = Date.now(),
} = {}) {
  const result = consolidateMemoryEvidence({ memory, evidence, evidenceHistory, policy, now });
  return {
    memory: result.memory,
    evidence: isPlainObject(evidence)
      ? {
          ...createEvidence(evidence),
          evidenceKey: result.reason === 'duplicate_evidence'
            ? evidence.evidenceKey
            : (result.memory?.metadata?.evidenceKeys?.at(-1) ?? evidence.evidenceKey),
        }
      : null,
    ...result,
  };
}
