// Uni Engine — Fase 18: Cálculo de Confiança Determinístico.
// Cálculo determinístico de confiança para resposta visível.
import { RUNTIME_STATUS } from '../types/index.js';

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const WEIGHTS = Object.freeze({
  intentSupported: 0.15,
  temporalResolved: 0.10,
  queryValid: 0.10,
  executionSuccessful: 0.15,
  dataAvailable: 0.15,
  factsValidated: 0.15,
  narrativeValid: 0.10,
  safetyApproved: 0.10,
});

const CRITICAL_FAILURE_REASONS = Object.freeze([
  'WRITE_INTENT_BLOCKED',
  'INTENT_NOT_ALLOWED',
  'TEMPORAL_UNRESOLVED',
  'NO_FINANCIAL_DATA',
  'QUERY_INVALID',
  'EXECUTION_FAILED',
  'NO_DATA_AVAILABLE',
  'NARRATIVE_EMPTY',
  'SAFETY_REJECTED',
  'IDENTITY_CHANGED',
  'PENDING_ACTION_ACTIVE',
  'FACTS_INVALID',
  'SAFETY_REJECTED',
  'CANARY_FAILED',
]);

export const FINANCIAL_RUNTIME_VISIBLE_MIN_CONFIDENCE = 0.90;

export function calculateFinancialConfidence({
  eligibility,
  factualValidation,
  runtimeResult,
} = {}) {
  const safeEligibility = eligibility && typeof eligibility === 'object' ? eligibility : null;
  const safeFactual = factualValidation && typeof factualValidation === 'object' ? factualValidation : null;
  const safeRuntime = runtimeResult && typeof runtimeResult === 'object' ? runtimeResult : null;

  // Falhas críticas = confiança 0 imediata
  if (safeEligibility?.reasonCodes) {
    for (const reason of safeEligibility.reasonCodes) {
      if (CRITICAL_FAILURE_REASONS.includes(reason)) {
        return roundMoney(0);
      }
    }
  }

  if (!safeEligibility || safeEligibility.eligible !== true) {
    return roundMoney(0);
  }

  let score = 0;
  let totalWeight = 0;

  // intentSupported
  if (safeEligibility.intentSupported) {
    score += WEIGHTS.intentSupported;
  }
  totalWeight += WEIGHTS.intentSupported;

  // temporalResolved
  if (safeEligibility.temporalResolved) {
    score += WEIGHTS.temporalResolved;
  }
  totalWeight += WEIGHTS.temporalResolved;

  // queryValid
  if (safeEligibility.queryValid) {
    score += WEIGHTS.queryValid;
  }
  totalWeight += WEIGHTS.queryValid;

  // executionSuccessful
  if (safeEligibility.executionSuccessful) {
    score += WEIGHTS.executionSuccessful;
  }
  totalWeight += WEIGHTS.executionSuccessful;

  // dataAvailable
  if (safeEligibility.dataAvailable) {
    score += WEIGHTS.dataAvailable;
  }
  totalWeight += WEIGHTS.dataAvailable;

  // factsValidated
  if (safeFactual && safeFactual.valid === true) {
    score += WEIGHTS.factsValidated;
  } else if (safeEligibility.factsValidated) {
    score += WEIGHTS.factsValidated;
  }
  totalWeight += WEIGHTS.factsValidated;

  // narrativeValid
  if (safeEligibility.narrativeValid) {
    score += WEIGHTS.narrativeValid;
  }
  totalWeight += WEIGHTS.narrativeValid;

  // safetyApproved
  if (safeEligibility.safetyApproved) {
    score += WEIGHTS.safetyApproved;
  }
  totalWeight += WEIGHTS.safetyApproved;

  // Bonus por factual validation confiança
  if (safeFactual && typeof safeFactual.confidence === 'number') {
    score = clamp(score + safeFactual.confidence * 0.05, 0, 1);
  }

  // Penalidade por runtime status não 'completed'
  if (safeRuntime && safeRuntime.status !== 'completed') {
    score = clamp(score - 0.2, 0, 1);
  }

  // Penalidade por confiança do runtime baixa
  if (safeRuntime && typeof safeRuntime.confidence === 'number' && safeRuntime.confidence < 0.8) {
    score = clamp(score - 0.1, 0, 1);
  }

  const finalConfidence = clamp(score / totalWeight, 0, 1);
  return roundMoney(finalConfidence);
}

export function isConfidenceSufficient(confidence, minConfidence = FINANCIAL_RUNTIME_VISIBLE_MIN_CONFIDENCE) {
  return typeof confidence === 'number' && confidence >= minConfidence;
}

export function getConfidenceBucket(confidence) {
  if (confidence >= 0.95) return 'very_high';
  if (confidence >= 0.90) return 'high';
  if (confidence >= 0.80) return 'medium';
  if (confidence >= 0.70) return 'low';
  return 'very_low';
}