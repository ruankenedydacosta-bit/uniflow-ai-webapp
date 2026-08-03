// Uni Engine — Capability Activation Readiness (Parte 4, Bloco 1).
//
// Camada estritamente observacional que determina, a partir dos resultados
// JÁ produzidos pela Activation Engine (decisões existentes), pela
// integração e pelo guidance, QUAIS capabilities poderiam ser ativadas no
// futuro. Ela NÃO ativa nada: apenas responde quais são elegíveis, quais
// continuam bloqueadas, quais dependências faltam e qual seria a próxima
// capability recomendada.
//
// Este módulo NÃO re-executa a Activation Engine, NÃO executa capability,
// NÃO modifica integração, NÃO escreve memória, NÃO acessa banco/RPC/TTS e
// NÃO altera a resposta. Tudo permanece observacional.
import { isValidActivationCapability } from '../activation/activationTypes.js';
import { isCapabilityEligible } from '../activation/capabilityRegistry.js';

export const CAPABILITY_READINESS_VERSION = '1.0';

export const CAPABILITY_READINESS_MODES = Object.freeze(['observational']);

// Status por capability no snapshot de prontidão de ativação.
export const CAPABILITY_STATUSES = Object.freeze([
  'ELIGIBLE',
  'BLOCKED',
  'NOT_EVALUATED',
]);

// Razões fechadas de bloqueio de uma capability para ativação futura.
export const CAPABILITY_BLOCK_REASONS = Object.freeze([
  'FORBIDDEN_CAPABILITY',
  'BLOCKED_BY_ACTIVATION',
  'NOT_ELIGIBLE_IN_REGISTRY',
  'DEPENDENCY_MISSING',
  'NOT_EVALUATED',
]);

// Capacidades PROIBIDAS: bloqueio absoluto, jamais elegíveis.
export const FORBIDDEN_CAPABILITIES = Object.freeze([
  'FINANCIAL_EXECUTION',
  'MEMORY_WRITE',
  'LEARNING_APPLICATION',
  'RESPONSE_CONTENT_INFLUENCE',
]);

// Diagnósticos estruturados (vocabulário fechado — nunca texto livre).
export const CAPABILITY_READINESS_DIAGNOSTIC_CODES = Object.freeze([
  'CAPABILITY_READINESS_COMPUTED',
  'CAPABILITIES_ELIGIBLE',
  'NO_ELIGIBLE_CAPABILITIES',
  'CAPABILITIES_BLOCKED',
  'NO_BLOCKED_CAPABILITIES',
  'DEPENDENCIES_MISSING',
  'NO_MISSING_DEPENDENCIES',
  'NEXT_CAPABILITY_RECOMMENDED',
  'NO_NEXT_CAPABILITY_RECOMMENDED',
  'SHADOW_MODE',
  'LEGACY_PRESERVED',
  'NOTHING_APPLIED',
  'UNKNOWN',
]);

export function isCapabilityReadinessMode(value) {
  return CAPABILITY_READINESS_MODES.includes(value);
}

export function isCapabilityStatus(value) {
  return CAPABILITY_STATUSES.includes(value);
}

export function isCapabilityBlockReason(value) {
  return CAPABILITY_BLOCK_REASONS.includes(value);
}

export function isForbiddenCapability(value) {
  return FORBIDDEN_CAPABILITIES.includes(value);
}

// Uma capability é candidata à ativação futura se é conhecida e o registro
// da Activation Engine a marca como elegível (nunca proibida).
export function isActivationCandidate(capability) {
  if (!isValidActivationCapability(capability)) return false;
  if (isForbiddenCapability(capability)) return false;
  return isCapabilityEligible(capability);
}
