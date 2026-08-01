// Fábricas de evidência do Modelo Epistêmico (Fase 4).
//
// Toda evidência nasce de uma fonte conhecida e carrega um peso
// determinístico da política. Nenhuma confiança existe sem evidência; a
// mesma evidência idêntica nunca conta duas vezes (chave de idempotência).
import {
  createEpistemicEvidence,
  buildEvidenceKey,
} from './epistemicContracts.js';
import {
  EPISTEMIC_POLICY,
  getEvidenceWeight,
} from './epistemicPolicy.js';

// Sempre produz um evidenceId determinístico a partir da chave.
function withId(evidence, policy = EPISTEMIC_POLICY) {
  const key = buildEvidenceKey({
    type: evidence.type,
    source: evidence.source,
    subject: evidence.metadata?.subject ?? null,
    value: evidence.value,
    observedAt: evidence.observedAt,
  });
  return createEpistemicEvidence({
    ...evidence,
    evidenceId: key,
    weight: evidence.weight ?? getEvidenceWeight(evidence.type, policy),
    confidence: evidence.confidence ?? confidenceOfWeight(evidence.weight ?? getEvidenceWeight(evidence.type, policy)),
  });
}

// Contribuição normalizada da evidência: peso negativo nunca gera confiança.
function confidenceOfWeight(weight) {
  const value = Number(weight) || 0;
  if (value <= 0) return 0;
  return Math.min(1, value);
}

export function evidenceFromDatabaseRecord({ subject, value, observedAt, verifiedAt = observedAt, metadata = {} }) {
  return withId({
    type: 'direct_database',
    source: 'database_record',
    value,
    observedAt,
    verifiedAt,
    metadata: { ...metadata, subject },
  });
}

export function evidenceFromFinancialSnapshot({ subject, value, observedAt, metadata = {} }) {
  return withId({
    type: 'direct_database',
    source: 'financial_snapshot',
    value,
    observedAt,
    verifiedAt: observedAt,
    metadata: { ...metadata, subject },
  });
}

export function evidenceFromUserStatement({ subject, value, observedAt, metadata = {} }) {
  return withId({
    type: 'direct_user_statement',
    source: 'user_explicit_statement',
    value,
    observedAt,
    verifiedAt: observedAt,
    metadata: { ...metadata, subject },
  });
}

export function evidenceFromUserConfirmation({ subject, value, observedAt, metadata = {} }) {
  return withId({
    type: 'user_confirmation',
    source: 'user_confirmation',
    value,
    observedAt,
    verifiedAt: observedAt,
    metadata: { ...metadata, subject },
  });
}

export function evidenceFromUserCorrection({ subject, value, observedAt, metadata = {} }) {
  return withId({
    type: 'user_correction',
    source: 'user_correction',
    value,
    observedAt,
    verifiedAt: observedAt,
    metadata: { ...metadata, subject },
  });
}

export function evidenceFromMemoryRetrieval({ subject, value, observedAt, verifiedAt = observedAt, expiresAt = null, confidence = 0, metadata = {} }) {
  const candidatePenalty = Boolean(metadata.memoryStatus === 'candidate');
  const weight = (getEvidenceWeight('memory_retrieval') + (candidatePenalty ? -EPISTEMIC_POLICY.confidence.memoryCandidatePenalty : 0));
  return withId({
    type: 'memory_retrieval',
    source: 'persistent_memory',
    value,
    observedAt,
    verifiedAt,
    expiresAt,
    metadata: { ...metadata, subject, memoryConfidence: Number(confidence.toFixed(4)) },
    weight,
  });
}

export function evidenceFromContextReference({ subject, value, observedAt, metadata = {} }) {
  return withId({
    type: 'context_reference',
    source: 'conversation_context',
    value,
    observedAt,
    verifiedAt: observedAt,
    metadata: { ...metadata, subject },
  });
}

export function evidenceFromDeterministicRule({ subject, value, observedAt, metadata = {} }) {
  return withId({
    type: 'deterministic_rule',
    source: 'deterministic_inference',
    value,
    observedAt,
    verifiedAt: observedAt,
    metadata: { ...metadata, subject },
  });
}

export function evidenceFromContradiction({ subject, value, observedAt, metadata = {} }) {
  return withId({
    type: 'contradicting_evidence',
    source: metadata?.contradictionSource ?? 'unknown',
    value,
    observedAt,
    verifiedAt: observedAt,
    metadata: { ...metadata, subject, contradiction: true },
  });
}

// Deduplicação determinística: evidências idênticas (mesma chave) contam
// uma única vez — duplicação nunca infla confiança. Observações repetidas
// com instantes distintos continuam sendo evidências distintas.
export function dedupeEvidence(evidenceList) {
  if (!Array.isArray(evidenceList)) return [];
  const seen = new Set();
  const result = [];
  for (const evidence of evidenceList) {
    if (!evidence || typeof evidence !== 'object') continue;
    const key = buildEvidenceKey({
      type: evidence.type,
      source: evidence.source,
      subject: evidence.metadata?.subject ?? null,
      value: evidence.value,
      observedAt: evidence.observedAt,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(evidence);
  }
  return result;
}
