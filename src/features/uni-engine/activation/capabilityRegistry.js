// Activation Engine — registro de capacidades (Fase 9).
//
// Define, para cada capacidade, se pode ser elegível nesta fase, se está
// proibida (bloqueio absoluto) e qual o threshold de confiança individual.
// O registro é a ÚNICA fonte de verdade para elegibilidade.
import { ACTIVATION_POLICY } from './activationPolicy.js';
import { ACTIVATION_CAPABILITIES, isValidActivationCapability } from './activationTypes.js';

const CAPABILITY_PROPERTIES = Object.freeze({
  METADATA_ONLY: { eligible: true, forbidden: false, confidence: 0.5 },
  DIAGNOSTICS_ONLY: { eligible: true, forbidden: false, confidence: 0.5 },
  QUESTION_GUIDANCE: { eligible: true, forbidden: false, confidence: 0.7 },
  CLARIFICATION_GUIDANCE: { eligible: true, forbidden: false, confidence: 0.7 },
  RESPONSE_STYLE_GUIDANCE: { eligible: true, forbidden: false, confidence: 0.6 },
  RESPONSE_LENGTH_GUIDANCE: { eligible: true, forbidden: false, confidence: 0.6 },
  CATEGORY_SUGGESTION: { eligible: true, forbidden: false, confidence: 0.7 },
  ACCOUNT_SUGGESTION: { eligible: true, forbidden: false, confidence: 0.7 },
  GOAL_SUGGESTION: { eligible: true, forbidden: false, confidence: 0.7 },
  PLANNING_SUGGESTION: { eligible: true, forbidden: false, confidence: 0.7 },
  RISK_WARNING: { eligible: true, forbidden: false, confidence: 0.6 },
  CONFIDENCE_DISCLOSURE: { eligible: true, forbidden: false, confidence: 0.5 },
  MEMORY_READ_GUIDANCE: { eligible: true, forbidden: false, confidence: 0.6 },
  EPISTEMIC_CAUTION: { eligible: true, forbidden: false, confidence: 0.6 },
  DECISION_RECOMMENDATION: { eligible: true, forbidden: false, confidence: 0.75 },
  RESPONSE_CONTENT_INFLUENCE: { eligible: false, forbidden: true, confidence: 1 },
  MEMORY_WRITE: { eligible: false, forbidden: true, confidence: 1 },
  FINANCIAL_EXECUTION: { eligible: false, forbidden: true, confidence: 1 },
  LEARNING_APPLICATION: { eligible: false, forbidden: true, confidence: 1 },
});

export const CAPABILITY_REGISTRY = Object.freeze(
  ACTIVATION_CAPABILITIES.map((capability) => {
    const props = CAPABILITY_PROPERTIES[capability] ?? { eligible: false, forbidden: false, confidence: 0.5 };
    return {
      capability,
      eligible: props.eligible,
      forbidden: props.forbidden,
      confidenceThreshold: props.confidence,
      firstWave: ACTIVATION_POLICY.firstWaveCapabilities.includes(capability),
    };
  }),
);

export function getCapabilityEntry(capability) {
  if (!isValidActivationCapability(capability)) return null;
  return CAPABILITY_REGISTRY.find((entry) => entry.capability === capability) ?? null;
}

export function isCapabilityForbidden(capability) {
  return getCapabilityEntry(capability)?.forbidden === true
    || ACTIVATION_POLICY.forbiddenCapabilities.includes(capability);
}

export function isCapabilityEligible(capability) {
  return getCapabilityEntry(capability)?.eligible === true;
}

export function getCapabilityConfidenceThreshold(capability) {
  return getCapabilityEntry(capability)?.confidenceThreshold
    ?? ACTIVATION_POLICY.defaultConfidenceThreshold;
}
