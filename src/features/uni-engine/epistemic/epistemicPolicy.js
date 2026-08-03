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
