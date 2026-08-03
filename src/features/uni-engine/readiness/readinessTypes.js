// Uni Engine — Decision Readiness (Parte 3).
//
// Camada estritamente observacional que consome o Observation Snapshot da
// Parte 2 (mais o resultado da Decision Layer e as decisões da Activation
// Engine já produzidas) e responde tecnicamente se o sistema ESTARIA pronto
// para uma aplicação futura — sem nunca aplicar nada nesta parte.
//
// Este módulo NÃO re-executa a Decision Layer nem a Activation Engine: ele
// apenas lê e agrega os resultados existentes dessas camadas. Capacidades
// proibidas permanecem sempre bloqueadas; capacidades desconhecidas são
// descartadas; apenas as capacidades observacionais podem ser recomendadas
// ou elegíveis (sem aplicação).
import { isValidActivationCapability } from '../activation/activationTypes.js';

export const READINESS_VERSION = '1.0';

export const READINESS_MODES = Object.freeze(['observational']);

// Capacidades OBSERVACIONAIS da Parte 3: podem aparecer como recomendadas ou
// elegíveis, mas NUNCA são aplicadas.
export const OBSERVATIONAL_CAPABILITIES = Object.freeze([
  'QUESTION_GUIDANCE',
  'CLARIFICATION_GUIDANCE',
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
  'METADATA_ONLY',
  'DIAGNOSTICS_ONLY',
]);

// Capacidades PROIBIDAS: bloqueio absoluto, sempre em blockedCapabilities e
// jamais em recommended/eligible.
export const FORBIDDEN_CAPABILITIES = Object.freeze([
  'FINANCIAL_EXECUTION',
  'MEMORY_WRITE',
  'LEARNING_APPLICATION',
  'RESPONSE_CONTENT_INFLUENCE',
]);

// Próxima ação recomendada (vocabulário fechado — nunca executa).
export const READINESS_NEXT_STEPS = Object.freeze([
  'RESPOND',
  'ASK_FOR_MISSING_INFORMATION',
  'REQUEST_CONFIRMATION',
  'WAIT_FOR_USER',
  'CONSULT_MEMORY',
  'CONSULT_DATABASE',
  'REJECT',
  'CANCEL_PENDING',
  'DEFER',
  'OBSERVE_ONLY',
  'EVALUATE_CONTEXT',
]);

// Estado de prontidão da Activation Engine para uma aplicação FUTURA.
export const ACTIVATION_READINESS_STATUSES = Object.freeze([
  'ACTIVE',
  'READY',
  'PARTIAL',
  'SHADOW_ONLY',
  'BLOCKED',
  'NOT_EVALUATED',
]);

// Razões fechadas dos bloqueios de capacidade no readiness.
export const READINESS_BLOCK_REASONS = Object.freeze([
  'FORBIDDEN_CAPABILITY',
  'BLOCKED_BY_ACTIVATION',
  'NOT_OBSERVATIONAL_IN_READINESS',
]);

// Diagnósticos estruturados (nunca texto livre).
export const READINESS_DIAGNOSTIC_CODES = Object.freeze([
  'READINESS_COMPUTED',
  'DECISION_AVAILABLE',
  'DECISION_UNAVAILABLE',
  'RECOMMENDED_CAPABILITIES',
  'NO_RECOMMENDED_CAPABILITIES',
  'ELIGIBLE_CAPABILITIES',
  'NO_ELIGIBLE_CAPABILITIES',
  'BLOCKED_CAPABILITIES',
  'NO_BLOCKED_CAPABILITIES',
  'ACTIVATION_READY',
  'ACTIVATION_PARTIAL',
  'ACTIVATION_SHADOW_ONLY',
  'ACTIVATION_BLOCKED',
  'ACTIVATION_NOT_EVALUATED',
  'CIRCUIT_CLOSED',
  'CIRCUIT_OPEN',
  'SHADOW_MODE',
  'LEGACY_PRESERVED',
  'NOTHING_APPLIED',
  'UNKNOWN',
]);

export function isReadinessMode(value) {
  return READINESS_MODES.includes(value);
}

export function isObservationalCapability(value) {
  return OBSERVATIONAL_CAPABILITIES.includes(value);
}

export function isForbiddenCapability(value) {
  return FORBIDDEN_CAPABILITIES.includes(value);
}

export function isReadinessNextStep(value) {
  return READINESS_NEXT_STEPS.includes(value);
}

export function isActivationReadinessStatus(value) {
  return ACTIVATION_READINESS_STATUSES.includes(value);
}

export function isReadinessBlockReason(value) {
  return READINESS_BLOCK_REASONS.includes(value);
}

export function isValidReadinessCapability(value) {
  return isValidActivationCapability(value);
}
