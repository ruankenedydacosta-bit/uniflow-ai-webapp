// Activation Engine — elegibilidade de capacidade (Fase 9).
//
// Combina o registro de capacidades com a flag individual. Capacidades
// proibidas retornam BLOCKED_BY_POLICY mesmo que a flag esteja ligada.
import {
  isCapabilityEligible,
  isCapabilityForbidden,
  getCapabilityConfidenceThreshold,
} from './capabilityRegistry.js';
import { isValidActivationCapability } from './activationTypes.js';

export function evaluateCapabilityEligibility(options = {}) {
  const safe = options ?? {};
  const capability = isValidActivationCapability(safe.capability)
    ? safe.capability
    : 'UNKNOWN';

  if (!isValidActivationCapability(capability)) {
    return { status: 'BLOCKED_BY_POLICY', reasonCode: 'CAPABILITY_UNKNOWN', confidenceThreshold: null };
  }

  if (isCapabilityForbidden(capability)) {
    return { status: 'BLOCKED_BY_POLICY', reasonCode: 'CAPABILITY_FORBIDDEN_BY_POLICY', confidenceThreshold: null };
  }

  if (!isCapabilityEligible(capability)) {
    return { status: 'BLOCKED_BY_POLICY', reasonCode: 'CAPABILITY_NOT_ELIGIBLE', confidenceThreshold: null };
  }

  if (!safe.capabilityEnabled) {
    return { status: 'BLOCKED_BY_FLAG', reasonCode: 'CAPABILITY_FLAG_OFF', confidenceThreshold: null };
  }

  return {
    status: 'ELIGIBLE',
    reasonCode: 'CAPABILITY_ELIGIBLE',
    confidenceThreshold: getCapabilityConfidenceThreshold(capability),
  };
}
