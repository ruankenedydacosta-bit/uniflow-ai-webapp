// Policy epistemológica para o Motor Epistêmico
// Regras puras e determinísticas para classificação e validação

import { CONFIDENCE_LEVELS } from './epistemicTypes.js';

// Regras financeiras confirmadas
export const FINANCIAL_CONFIRMED_FACT_RULES = {
  minEvidenceCount: 1,
  minConfidenceLevel: 'HIGH',
  sourceTypes: ['FINANCIAL_ENGINE', 'SUPABASE', 'APPLICATION'],
  excludeSources: ['OPENAI', 'USER'],
};

// Regras de sistema confirmado
export const SYSTEM_CONFIRMED_FACT_RULES = {
  minEvidenceCount: 1,
  minConfidenceLevel: 'HIGH',
  sourceTypes: ['APPLICATION', 'SUPABASE'],
  excludeSources: [],
};

// Regras de relato do usuário
export const USER_REPORTED_FACT_RULES = {
  maxConfidenceLevel: 'MEDIUM',
  minEvidenceCount: 0,
  excludeSources: [],
};

// Regras de fato
export const FACT_RULES = {
  minEvidenceCount: 1,
  minConfidenceLevel: 'MEDIUM',
  minSources: 2,
};

// Regras de inferência
export const INFERENCE_RULES = {
  requiresEvidence: true,
  maxConfidenceLevel: 'MEDIUM',
  minEvidenceCount: 1,
};

// Regras de hipótese
export const HYPOTHESIS_RULES = {
  maxConfidenceLevel: 'MEDIUM',
  minEvidenceCount: 1,
  statusTransition: {
    'UNVERIFIED': 'INFERRED',
    'INFERRED': 'HYPOTHESIS_VERIFIED',
    'HYPOTHESIS_VERIFIED': 'HYPOTHESIS_TESTABLE',
    'HYPOTHESIS_TESTABLE': 'HYPOTHESIS_TESTED',
    'HYPOTHESIS_TESTED': 'HYPOTHESIS_APPROVED',
  },
};

// Regras de interpretação
export const INTERPRETATION_RULES = {
  maxConfidenceLevel: 'MEDIUM',
  minEvidenceCount: 1,
};

// Regras de opinião
export const OPINION_RULES = {
  maxConfidenceLevel: 'LOW',
  minEvidenceCount: 0,
};

// Regras de desconhecido
export const UNKNOWN_RULES = {
  maxConfidenceLevel: 'NONE',
  minEvidenceCount: 0,
};

// Função para classificar um registro epistêmico com base no seu tipo e fonte
export function classifyKnowledge(record) {
  if (!record || typeof record !== 'object') {
    return {
      type: 'UNKNOWN',
      confidenceLevel: 'NONE',
      status: 'UNKNOWN',
      reason: 'INVALID_INPUT',
    };
  }

  const { type, sourceType, evidence, confidence, status } = record;

  // Regras financeiras confirmadas têm a confiança mais alta
  if (
    type === 'FINANCIAL_CONFIRMED_FACT' &&
    FINANCIAL_CONFIRMED_FACT_RULES.sourceTypes.includes(sourceType) &&
    (!FINANCIAL_CONFIRMED_FACT_RULES.minEvidenceCount || (evidence?.length || 0) >= FINANCIAL_CONFIRMED_FACT_RULES.minEvidenceCount)
  ) {
    return {
      type: 'FINANCIAL_CONFIRMED_FACT',
      confidenceLevel: 'VERIFIED',
      status: 'VERIFIED',
      reason: 'FINANCIAL_SOURCE',
    };
  }

  // Regra de sistema confirmado
  if (
    type === 'SYSTEM_CONFIRMED_FACT' &&
    (!SYSTEM_CONFIRMED_FACT_RULES.minEvidenceCount || (evidence?.length || 0) >= SYSTEM_CONFIRMED_FACT_RULES.minEvidenceCount)
  ) {
    return {
      type: 'SYSTEM_CONFIRMED_FACT',
      confidenceLevel: 'VERIFIED',
      status: 'VERIFIED',
      reason: 'SYSTEM_SOURCE',
    };
  }

  // Regra de relato do usuário
  if (
    type === 'USER_REPORTED_FACT' &&
    (!USER_REPORTED_FACT_RULES.maxConfidenceLevel || CONFIDENCE_LEVELS.indexOf(confidence?.level || 'NONE') <= CONFIDENCE_LEVELS.indexOf(USER_REPORTED_FACT_RULES.maxConfidenceLevel))
  ) {
    return {
      type: 'USER_REPORTED_FACT',
      confidenceLevel: 'MEDIUM',
      status: 'UNVERIFIED',
      reason: 'USER_REPORTED',
    };
  }

  // Regra de fato
  if (
    type === 'FACT' &&
    (!FACT_RULES.minEvidenceCount || (evidence?.length || 0) >= FACT_RULES.minEvidenceCount) &&
    (!FACT_RULES.minSources || evidence?.length >= FACT_RULES.minSources)
  ) {
    return {
      type: 'FACT',
      confidenceLevel: 'HIGH',
      status: 'ACTIVE',
      reason: 'VALID_EVIDENCE',
    };
  }

  // Regra de inferência
  if (
    type === 'INFERENCE' &&
    INFERENCE_RULES.requiresEvidence &&
    (!INFERENCE_RULES.minEvidenceCount || (evidence?.length || 0) >= INFERENCE_RULES.minEvidenceCount) &&
    (!INFERENCE_RULES.maxConfidenceLevel || CONFIDENCE_LEVELS.indexOf(confidence?.level || 'NONE') <= CONFIDENCE_LEVELS.indexOf(INFERENCE_RULES.maxConfidenceLevel))
  ) {
    return {
      type: 'INFERENCE',
      confidenceLevel: 'MEDIUM',
      status: 'UNVERIFIED',
      reason: 'INFERRED',
    };
  }

  // Regra de hipótese
  if (
    type === 'HYPOTHESIS' &&
    (!HYPOTHESIS_RULES.maxConfidenceLevel || CONFIDENCE_LEVELS.indexOf(confidence?.level || 'NONE') <= CONFIDENCE_LEVELS.indexOf(HYPOTHESIS_RULES.maxConfidenceLevel)) &&
    (!HYPOTHESIS_RULES.minEvidenceCount || (evidence?.length || 0) >= HYPOTHESIS_RULES.minEvidenceCount)
  ) {
    return {
      type: 'HYPOTHESIS',
      confidenceLevel: 'MEDIUM',
      status: 'UNVERIFIED',
      reason: 'HYPOTHESIS',
    };
  }

  // Regra de interpretação
  if (
    type === 'INTERPRETATION' &&
    (!INTERPRETATION_RULES.maxConfidenceLevel || CONFIDENCE_LEVELS.indexOf(confidence?.level || 'NONE') <= CONFIDENCE_LEVELS.indexOf(INTERPRETATION_RULES.maxConfidenceLevel))
  ) {
    return {
      type: 'INTERPRETATION',
      confidenceLevel: 'MEDIUM',
      status: 'UNVERIFIED',
      reason: 'INTERPRETATION',
    };
  }

  // Regra de opinião
  if (
    type === 'OPINION' &&
    (!OPINION_RULES.maxConfidenceLevel || CONFIDENCE_LEVELS.indexOf(confidence?.level || 'NONE') <= CONFIDENCE_LEVELS.indexOf(OPINION_RULES.maxConfidenceLevel))
  ) {
    return {
      type: 'OPINION',
      confidenceLevel: 'LOW',
      status: 'UNVERIFIED',
      reason: 'OPINION',
    };
  }

  // Padrão para desconhecido
  return {
    type: 'UNKNOWN',
    confidenceLevel: 'NONE',
    status: 'UNKNOWN',
    reason: 'NO_EVIDENCE',
  };
}

// Compatibilidade com a API anterior (Fase 4) — mantida para buildEpistemicEvidence.js
// e outros consumidores legados que esperam EPISTEMIC_POLICY e getEvidenceWeight.
export const EPISTEMIC_POLICY = Object.freeze({
  limits: Object.freeze({
    maxItemsPerVerification: 40,
    maxEvidencePerItem: 16,
    maxContradictionsPerItem: 8,
    maxConflicts: 16,
    maxRecommendations: 12,
    maxEvidencePerTypeSummary: 24,
  }),
  sourcePriority: Object.freeze({
    database_record: 1,
    financial_snapshot: 1,
    user_confirmation: 2,
    user_correction: 3,
    user_explicit_statement: 4,
    persistent_memory: 5,
    operational_memory: 6,
    conversation_context: 6,
    deterministic_inference: 7,
    system_rule: 7,
    external_source: 8,
    unknown: 9,
  }),
  evidenceWeights: Object.freeze({
    direct_database: 0.5,
    direct_user_statement: 0.35,
    user_confirmation: 0.4,
    user_correction: 0.55,
    repeated_observation: 0.2,
    memory_retrieval: 0.15,
    context_reference: 0.1,
    deterministic_rule: 0.25,
    contradicting_evidence: -0.45,
  }),
  confidence: Object.freeze({
    base: 0.2,
    scale: 0.85,
    sourcePriorityFactorStep: 0.02,
    confirmationBonus: 0.12,
    correctionBonus: 0.14,
    conflictPenaltyPerContradiction: 0.25,
    stalePenalty: 0.2,
    memoryCandidatePenalty: 0.15,
  }),
  bands: Object.freeze({
    insufficientMax: 0.24,
    lowMax: 0.49,
    moderateMax: 0.69,
    highMax: 0.89,
    veryHighMin: 0.9,
  }),
  sufficiency: Object.freeze({
    displayMinConfidence: 0.7,
    suggestMinConfidence: 0.5,
    askMaxConfidence: 0.5,
    confirmMinConfidence: 0.8,
    storeMemoryMinConfidence: 0.6,
  }),
  stalenessWindowsMs: Object.freeze({
    balance: 7 * 24 * 60 * 60 * 1000,
    transaction: null,
    preference: 365 * 24 * 60 * 60 * 1000,
    episodic: 24 * 60 * 60 * 1000,
    recurring: 180 * 24 * 60 * 60 * 1000,
    fact: 365 * 24 * 60 * 60 * 1000,
    default: 90 * 24 * 60 * 60 * 1000,
  }),
  expirationMultiplier: 3,
  evidence: Object.freeze({
    minEvidenceForValidity: 1,
  }),
});

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function clampMinusOneOne(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function getSourcePriority(source, policy = EPISTEMIC_POLICY) {
  return policy.sourcePriority[source] ?? policy.sourcePriority.unknown;
}

export function getEvidenceWeight(evidenceType, policy = EPISTEMIC_POLICY) {
  return policy.evidenceWeights[evidenceType] ?? 0;
}

export function stalenessDomainForSubject(subject) {
  if (typeof subject !== 'string') return 'default';
  const normalized = subject.toLowerCase();
  if (normalized.includes('balance') || normalized.includes('saldo')) return 'balance';
  if (normalized.includes('transaction') || normalized.includes('transacao')
    || normalized.includes('expense') || normalized.includes('income')
    || normalized.includes('transfer')) return 'transaction';
  if (normalized.includes('preference') || normalized.includes('preferencia')) return 'preference';
  if (normalized.includes('episodic') || normalized.includes('episodico')) return 'episodic';
  if (normalized.includes('recurring') || normalized.includes('recorrencia')) return 'recurring';
  if (normalized.includes('fact') || normalized.includes('fato')) return 'fact';
  return 'default';
}

export function stalenessWindowMs(domain, policy = EPISTEMIC_POLICY) {
  const value = policy.stalenessWindowsMs[domain];
  return value === undefined ? policy.stalenessWindowsMs.default : value;
}

export function describeConfidence(confidence, policy = EPISTEMIC_POLICY) {
  const value = Number(confidence) || 0;
  if (value >= policy.bands.veryHighMin) return 'very_high';
  if (value > policy.bands.moderateMax) return 'high';
  if (value > policy.bands.lowMax) return 'moderate';
  if (value > policy.bands.insufficientMax) return 'low';
  return 'insufficient';
}

export function resolveEpistemicPriority(itemA, itemB, policy = EPISTEMIC_POLICY) {
  const a = itemA && typeof itemA === 'object' ? itemA : null;
  const b = itemB && typeof itemB === 'object' ? itemB : null;
  if (!a) return b;
  if (!b) return a;

  const priorityA = getSourcePriority(a.source ?? 'unknown', policy);
  const priorityB = getSourcePriority(b.source ?? 'unknown', policy);
  if (priorityA !== priorityB) {
    return priorityA < priorityB ? a : b;
  }

  const recencyRank = { user_correction: 3, user_confirmation: 2 };
  const rankA = recencyRank[a.source] ?? 0;
  const rankB = recencyRank[b.source] ?? 0;
  if (rankA !== rankB) return rankA > rankB ? a : b;

  const timeA = Date.parse(a.lastVerifiedAt ?? '') || 0;
  const timeB = Date.parse(b.lastVerifiedAt ?? '') || 0;
  if (timeA !== timeB) return timeA > timeB ? a : b;

  return (a.confidence ?? 0) >= (b.confidence ?? 0) ? a : b;
}
