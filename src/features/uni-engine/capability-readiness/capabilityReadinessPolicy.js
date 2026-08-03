// Uni Engine — Capability Activation Readiness: políticas (Parte 4, Bloco 1).
//
// Política pura de agregação da camada de prontidão de ativação. Define os
// limites do snapshot, as dependências entre capabilities (que determinam
// quais dependências faltam para uma ativação futura) e a ordem
// determinística para escolher a próxima capability recomendada.
//
// Nada aqui executa capability: apenas modela, de forma observacional, o
// estado de prontidão para uma ativação FUTURA.
import { ACTIVATION_CAPABILITIES } from '../activation/activationTypes.js';

export const CAPABILITY_READINESS_POLICY = Object.freeze({
  maxEligibleCapabilities: 20,
  maxBlockedCapabilities: 20,
  maxMissingDependencies: 16,
  maxDiagnostics: 12,
});

export function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// Dependências entre capabilities para ativação futura. Uma capability só é
// considerada elegível se todas as suas dependências também estiverem
// elegíveis (ou já ativas). Dependência é sempre de outra capability
// registrada — nunca de serviços externos.
export const CAPABILITY_DEPENDENCIES = Object.freeze({
  METADATA_ONLY: Object.freeze([]),
  DIAGNOSTICS_ONLY: Object.freeze(['METADATA_ONLY']),
  QUESTION_GUIDANCE: Object.freeze([]),
  CLARIFICATION_GUIDANCE: Object.freeze(['QUESTION_GUIDANCE']),
  RESPONSE_STYLE_GUIDANCE: Object.freeze([]),
  RESPONSE_LENGTH_GUIDANCE: Object.freeze(['RESPONSE_STYLE_GUIDANCE']),
  CATEGORY_SUGGESTION: Object.freeze(['CLARIFICATION_GUIDANCE']),
  ACCOUNT_SUGGESTION: Object.freeze(['CLARIFICATION_GUIDANCE']),
  GOAL_SUGGESTION: Object.freeze(['METADATA_ONLY']),
  PLANNING_SUGGESTION: Object.freeze(['GOAL_SUGGESTION']),
  RISK_WARNING: Object.freeze(['METADATA_ONLY']),
  CONFIDENCE_DISCLOSURE: Object.freeze(['METADATA_ONLY']),
  MEMORY_READ_GUIDANCE: Object.freeze(['METADATA_ONLY']),
  EPISTEMIC_CAUTION: Object.freeze(['MEMORY_READ_GUIDANCE', 'CONFIDENCE_DISCLOSURE']),
  DECISION_RECOMMENDATION: Object.freeze(['EPISTEMIC_CAUTION', 'CONFIDENCE_DISCLOSURE']),
});

export function getCapabilityDependencies(capability) {
  const deps = CAPABILITY_DEPENDENCIES[capability];
  return Array.isArray(deps) ? deps : [];
}

// Ordem determinística de prioridade para a próxima capability recomendada.
// Capacidades da primeira onda vêm primeiro; o restante segue a ordem do
// registro da Activation Engine.
const DEFAULT_PRIORITY = Object.freeze([
  'QUESTION_GUIDANCE',
  'CLARIFICATION_GUIDANCE',
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
  'METADATA_ONLY',
  'DIAGNOSTICS_ONLY',
  'CATEGORY_SUGGESTION',
  'ACCOUNT_SUGGESTION',
  'GOAL_SUGGESTION',
  'PLANNING_SUGGESTION',
  'RISK_WARNING',
  'CONFIDENCE_DISCLOSURE',
  'MEMORY_READ_GUIDANCE',
  'EPISTEMIC_CAUTION',
  'DECISION_RECOMMENDATION',
]);

export function capabilityPriorityIndex(capability) {
  const index = DEFAULT_PRIORITY.indexOf(capability);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

// Escolhe a próxima capability recomendada (única e determinística) a partir
// das elegíveis. Retorna null quando nenhuma está elegível.
export function selectNextRecommendedCapability(eligibleCapabilities) {
  const safe = Array.isArray(eligibleCapabilities) ? eligibleCapabilities : [];
  let best = null;
  let bestIndex = Number.MAX_SAFE_INTEGER;
  for (const capability of safe) {
    const index = capabilityPriorityIndex(capability);
    if (index < bestIndex) {
      bestIndex = index;
      best = capability;
    }
  }
  return best;
}

// Lista determinística de capacidades conhecidas (ordem do registro).
export function getKnownCapabilities() {
  return ACTIVATION_CAPABILITIES.filter((capability) => capability !== 'UNKNOWN');
}
