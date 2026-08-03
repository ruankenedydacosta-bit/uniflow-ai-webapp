// Uni Engine — Execution Readiness (Parte 4, Bloco 2).
//
// Camada estritamente observacional que avalia se uma FUTURA execução seria
// segura. Ela NÃO executa nada: apenas informa se a execução estaria
// disponível, por que estaria bloqueada, a confiança, as capabilities
// necessárias, os requisitos faltantes, o risco e a recomendação.
//
// Este módulo NÃO re-executa a Activation Engine nem a Decision Layer — lê
// apenas os resultados já produzidos. Nada é executado, alterado ou
// persistido. Tudo permanece observacional.
import { isValidActivationCapability } from '../activation/activationTypes.js';
import { isCapabilityForbidden } from '../activation/capabilityRegistry.js';

export const EXECUTION_READINESS_VERSION = '1.0';

export const EXECUTION_READINESS_MODES = Object.freeze(['observational']);

// Capacidade de execução: a única capability que representaria execução real.
// Nunca é executada nesta parte — apenas referenciada para avaliar prontidão.
export const EXECUTION_CAPABILITY = 'FINANCIAL_EXECUTION';

// Razões fechadas de bloqueio de execução.
export const EXECUTION_BLOCK_REASONS = Object.freeze([
  'FORBIDDEN_CAPABILITY',
  'EXECUTION_CAPABILITY_UNAVAILABLE',
  'BLOCKED_BY_ACTIVATION',
  'CIRCUIT_BREAKER_OPEN',
  'INSUFFICIENT_CONFIDENCE',
  'HIGH_RISK',
  'MISSING_REQUIREMENTS',
  'DATA_INSUFFICIENT',
  'DECISION_NOT_EXECUTABLE',
  'NOT_EVALUATED',
]);

// Níveis de risco de execução (vocabulário fechado — nunca texto livre).
export const EXECUTION_RISKS = Object.freeze([
  'NONE',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

// Recomendações de execução (vocabulário fechado — nunca executam nada).
export const EXECUTION_RECOMMENDATIONS = Object.freeze([
  'EXECUTE',
  'REQUIRE_CONFIRMATION',
  'GATHER_INFORMATION',
  'DEFER',
  'BLOCK_EXECUTION',
  'OBSERVE_ONLY',
]);

// Diagnósticos estruturados (vocabulário fechado — nunca texto livre).
export const EXECUTION_READINESS_DIAGNOSTIC_CODES = Object.freeze([
  'EXECUTION_READINESS_COMPUTED',
  'EXECUTION_AVAILABLE',
  'EXECUTION_UNAVAILABLE',
  'EXECUTION_CONFIDENCE_HIGH',
  'EXECUTION_CONFIDENCE_LOW',
  'REQUIRED_CAPABILITIES_PRESENT',
  'REQUIRED_CAPABILITIES_MISSING',
  'REQUIREMENTS_COMPLETE',
  'REQUIREMENTS_MISSING',
  'RISK_ACCEPTABLE',
  'RISK_UNACCEPTABLE',
  'EXECUTION_RECOMMENDATION',
  'SHADOW_MODE',
  'LEGACY_PRESERVED',
  'NOTHING_APPLIED',
  'UNKNOWN',
]);

export function isExecutionReadinessMode(value) {
  return EXECUTION_READINESS_MODES.includes(value);
}

export function isExecutionBlockReason(value) {
  return EXECUTION_BLOCK_REASONS.includes(value);
}

export function isExecutionRisk(value) {
  return EXECUTION_RISKS.includes(value);
}

export function isExecutionRecommendation(value) {
  return EXECUTION_RECOMMENDATIONS.includes(value);
}

// A capacidade de execução é válida e NÃO é proibida pelo registro.
export function isExecutionCapabilityAllowed() {
  if (!isValidActivationCapability(EXECUTION_CAPABILITY)) return false;
  return !isCapabilityForbidden(EXECUTION_CAPABILITY);
}
