// Contratos do Modelo Epistêmico (Fase 4 — Shadow Mode).
//
// Item epistêmico serializável (seção 5):
//   {
//     subject, value, claimType, epistemicStatus, confidence,
//     source, sourcePriority, evidence, contradictions,
//     lastVerifiedAt, expiresAt, staleAfter, requiresVerification,
//     usableFor, restrictions, diagnostics
//   }
//
// Evidência (seção 6):
//   {
//     evidenceId, source, type, value, weight, confidence,
//     observedAt, verifiedAt, expiresAt, metadata
//   }
//
// Nenhuma função, instância, cliente ou dado não serializável entra nestes
// contratos. `usableFor.execution` permanece SEMPRE falso nesta fase.
import {
  isSerializableValue,
  findFunctionsInValue,
} from '../uniEngineContracts.js';
import {
  EPISTEMIC_CONFIDENCE_BANDS,
  EPISTEMIC_USABLE_FOR_CAPABILITIES,
  isValidEpistemicClaimType,
  isValidEpistemicEvidenceType,
  isValidEpistemicSource,
  isValidEpistemicStatus,
} from './epistemicTypes.js';

export const EPISTEMIC_MODEL_VERSION = '1.0';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// -----------------------------------------------
// Evidência
// -----------------------------------------------

// Chave de idempotência determinística: a MESMA combinação
// (tipo + fonte + sujeito + valor + instante) nunca conta duas vezes.
export function buildEvidenceKey({ type, source, subject, value, observedAt }) {
  const valueKey =
    typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value ?? 'null');
  return [
    type ?? 'unknown',
    source ?? 'unknown',
    subject ?? 'unknown',
    valueKey,
    observedAt ?? 'no-time',
  ].join('::');
}

export function createEpistemicEvidence(seed = {}) {
  const safe = seed && typeof seed === 'object' ? seed : {};
  return {
    evidenceId: safe.evidenceId ?? null,
    source: safe.source ?? 'unknown',
    type: safe.type ?? null,
    value: safe.value ?? null,
    weight: typeof safe.weight === 'number' ? safe.weight : 0,
    confidence:
      typeof safe.confidence === 'number' ? Number(safe.confidence.toFixed(4)) : 0,
    observedAt: safe.observedAt ?? null,
    verifiedAt: safe.verifiedAt ?? null,
    expiresAt: safe.expiresAt ?? null,
    metadata: isPlainObject(safe.metadata) ? safe.metadata : {},
  };
}

export function validateEpistemicEvidence(evidence) {
  const errors = [];
  if (!isPlainObject(evidence)) {
    return { valid: false, errors: ['EVIDENCE_NOT_OBJECT'] };
  }
  if (!isValidEpistemicEvidenceType(evidence.type)) {
    errors.push('EVIDENCE_TYPE_INVALID');
  }
  if (!isValidEpistemicSource(evidence.source)) {
    errors.push('EVIDENCE_SOURCE_INVALID');
  }
  if (
    typeof evidence.weight !== 'number'
    || !Number.isFinite(evidence.weight)
    || evidence.weight < -1
    || evidence.weight > 1
  ) {
    errors.push('EVIDENCE_WEIGHT_INVALID');
  }
  if (
    typeof evidence.confidence !== 'number'
    || evidence.confidence < 0
    || evidence.confidence > 1
  ) {
    errors.push('EVIDENCE_CONFIDENCE_INVALID');
  }
  if (evidence.value != null && !isSerializableValue(evidence.value)) {
    errors.push('EVIDENCE_VALUE_NOT_SERIALIZABLE');
  }
  if (evidence.metadata != null && !isPlainObject(evidence.metadata)) {
    errors.push('EVIDENCE_METADATA_INVALID');
  }
  return { valid: errors.length === 0, errors };
}

// -----------------------------------------------
// Item epistêmico
// -----------------------------------------------

// Capacidades `usableFor` padrão: nenhuma. `execution` é calculada por
// `computeUsableFor` e permanece SEMPRE false em Shadow Mode.
function createUsableFor(overrides = {}) {
  const safe = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    display: Boolean(safe.display),
    suggestion: Boolean(safe.suggestion),
    question: Boolean(safe.question),
    confirmation: Boolean(safe.confirmation),
    execution: false,
    memory_candidate: Boolean(safe.memory_candidate),
    none: true,
  };
}

export function createEpistemicItem(seed = {}) {
  const safe = seed && typeof seed === 'object' ? seed : {};
  return {
    subject: safe.subject ?? null,
    value: safe.value ?? null,
    claimType: safe.claimType ?? null,
    epistemicStatus: safe.epistemicStatus ?? 'unknown',
    confidence: typeof safe.confidence === 'number' ? safe.confidence : 0,
    source: safe.source ?? 'unknown',
    sourcePriority: typeof safe.sourcePriority === 'number' ? safe.sourcePriority : null,
    evidence: Array.isArray(safe.evidence) ? safe.evidence : [],
    contradictions: Array.isArray(safe.contradictions) ? safe.contradictions : [],
    lastVerifiedAt: safe.lastVerifiedAt ?? null,
    expiresAt: safe.expiresAt ?? null,
    staleAfter: safe.staleAfter ?? null,
    requiresVerification: Boolean(safe.requiresVerification),
    usableFor: createUsableFor(safe.usableFor),
    restrictions: Array.isArray(safe.restrictions) ? safe.restrictions : [],
    diagnostics: isPlainObject(safe.diagnostics) ? safe.diagnostics : {},
  };
}

export function validateEpistemicItem(item, policy = null) {
  const errors = [];
  if (!isPlainObject(item)) {
    return { valid: false, errors: ['ITEM_NOT_OBJECT'] };
  }
  if (typeof item.subject !== 'string' || !item.subject.trim()) {
    errors.push('ITEM_SUBJECT_REQUIRED');
  }
  if (!isValidEpistemicStatus(item.epistemicStatus)) {
    errors.push('ITEM_STATUS_INVALID');
  }
  if (!isValidEpistemicSource(item.source)) {
    errors.push('ITEM_SOURCE_INVALID');
  }
  if (!isValidEpistemicClaimType(item.claimType)) {
    errors.push('ITEM_CLAIM_TYPE_INVALID');
  }
  if (
    typeof item.confidence !== 'number'
    || !Number.isFinite(item.confidence)
    || item.confidence < 0
    || item.confidence > 1
  ) {
    errors.push('ITEM_CONFIDENCE_INVALID');
  }
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
    errors.push('ITEM_EVIDENCE_REQUIRED');
  }
  for (const evidence of item.evidence) {
    if (validateEpistemicEvidence(evidence).valid === false) {
      errors.push('ITEM_EVIDENCE_INVALID');
      break;
    }
  }
  if (item.value != null && !isSerializableValue(item.value)) {
    errors.push('ITEM_VALUE_NOT_SERIALIZABLE');
  }
  if (item.usableFor != null) {
    const capabilities = item.usableFor;
    if (!isPlainObject(capabilities)) {
      errors.push('ITEM_USABLE_FOR_INVALID');
    } else if (capabilities.execution === true) {
      // Regra absoluta da Fase 4: nada autoriza execução em Shadow Mode.
      errors.push('ITEM_EXECUTION_BLOCKED');
    }
  }
  const maxEvidence = policy?.maxEvidencePerItem ?? 32;
  if (item.evidence.length > maxEvidence) {
    errors.push('ITEM_TOO_MANY_EVIDENCE');
  }
  return { valid: errors.length === 0, errors };
}

// Cópia serializável e compacta do item (nunca expõe referências).
export function serializeEpistemicItem(item) {
  const safe = item && typeof item === 'object' ? item : {};
  const copy = createEpistemicItem({
    subject: safe.subject,
    value: isSerializableValue(safe.value) ? safe.value : null,
    claimType: safe.claimType,
    epistemicStatus: safe.epistemicStatus,
    confidence: Number(safe.confidence ?? 0),
    source: safe.source,
    sourcePriority: safe.sourcePriority,
    evidence: Array.isArray(safe.evidence)
      ? safe.evidence.map((evidence) => createEpistemicEvidence(evidence))
      : [],
    contradictions: Array.isArray(safe.contradictions)
      ? safe.contradictions.map((contradiction) => (
        isPlainObject(contradiction) ? { ...contradiction } : contradiction
      ))
      : [],
    lastVerifiedAt: safe.lastVerifiedAt,
    expiresAt: safe.expiresAt,
    staleAfter: safe.staleAfter,
    requiresVerification: Boolean(safe.requiresVerification),
    usableFor: safe.usableFor,
    restrictions: Array.isArray(safe.restrictions) ? [...safe.restrictions] : [],
    diagnostics: isPlainObject(safe.diagnostics) ? { ...safe.diagnostics } : {},
  });
  copy.confidence = Number(copy.confidence.toFixed(4));
  return copy;
}

// Confiança deve estar dentro da faixa [0,1] e ser finita.
export function isValidEpistemicConfidence(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

// Faixas conceituais documentadas (contrato): bandas fechadas de confiança.
export function confidenceBandOf(value) {
  const confidence = Number(value) || 0;
  for (const band of EPISTEMIC_CONFIDENCE_BANDS) {
    if (confidence >= band.min && confidence <= band.max) return band.label;
  }
  return 'insufficient';
}

// Seção do Shadow Mode (seção 16): `appliedToDecision` permanece SEMPRE falso.
export function createEpistemicModelSection(overrides = {}) {
  const safe = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    items: Array.isArray(safe.items) ? safe.items : [],
    conflicts: Array.isArray(safe.conflicts) ? safe.conflicts : [],
    staleItems: Array.isArray(safe.staleItems) ? safe.staleItems : [],
    sufficiency: isPlainObject(safe.sufficiency) ? safe.sufficiency : {},
    recommendations: Array.isArray(safe.recommendations) ? safe.recommendations : [],
    appliedToDecision: false,
  };
}

export {
  EPISTEMIC_USABLE_FOR_CAPABILITIES,
  findFunctionsInValue,
  isSerializableValue,
};
