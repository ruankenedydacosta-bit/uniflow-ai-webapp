// Uni Engine — Decision Readiness: políticas (Parte 3).
//
// Políticas de agregação pura da camada de readiness. Não re-executa a
// Decision Layer nem a Activation Engine — apenas mapeia os resultados já
// existentes (decisionType → próxima ação, status de ativação → prontidão)
// para o vocabulário fechado da Parte 3.
import {
  READINESS_NEXT_STEPS,
  READINESS_BLOCK_REASONS,
} from './readinessTypes.js';

export const READINESS_POLICY = Object.freeze({
  maxRecommendedCapabilities: 16,
  maxEligibleCapabilities: 16,
  maxBlockedCapabilities: 16,
  maxMissingInformation: 8,
  maxDiagnostics: 12,
});

export function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// Próxima ação recomendada a partir do tipo de decisão já calculado pela
// Decision Layer (vocabulário fechado; nunca executa).
const NEXT_STEP_BY_DECISION_TYPE = Object.freeze({
  ANSWER: 'RESPOND',
  ASK: 'ASK_FOR_MISSING_INFORMATION',
  CONFIRM: 'REQUEST_CONFIRMATION',
  WAIT: 'WAIT_FOR_USER',
  CONSULT_MEMORY: 'CONSULT_MEMORY',
  CONSULT_DATABASE: 'CONSULT_DATABASE',
  REJECT: 'REJECT',
  CANCEL: 'CANCEL_PENDING',
  DEFER: 'DEFER',
  UNKNOWN: 'EVALUATE_CONTEXT',
});

export function mapDecisionToNextStep(decisionType) {
  const nextStep = NEXT_STEP_BY_DECISION_TYPE[decisionType];
  return READINESS_NEXT_STEPS.includes(nextStep) ? nextStep : 'EVALUATE_CONTEXT';
}

// Estados de ativação que permitem uma aplicação futura (lidos das decisões
// já produzidas pela Activation Engine — nada é reavaliado aqui).
const FUTURE_APPLICABLE_STATUSES = Object.freeze([
  'ACTIVE_TEST',
  'ACTIVE_ROLLOUT',
  'ELIGIBLE',
  'SHADOW_ONLY',
]);

export function isActivationStatusFutureApplicable(status) {
  return FUTURE_APPLICABLE_STATUSES.includes(status);
}

function countStatus(status) {
  if (status === 'ACTIVE_TEST' || status === 'ACTIVE_ROLLOUT') return 'active';
  if (status === 'ELIGIBLE') return 'eligible';
  if (status === 'SHADOW_ONLY') return 'shadow';
  if (status === 'ERROR_SAFE') return 'error';
  if (status === 'DISABLED' || status === 'FALLBACK_LEGACY' || status.startsWith('BLOCKED_')) {
    return 'blocked';
  }
  return 'other';
}

// Agrega as decisões de Activation já existentes em um estado de prontidão
// para uma aplicação FUTURA. O resultado nunca aplica nada.
export function deriveActivationReadiness(decisions) {
  const safe = Array.isArray(decisions) ? decisions : [];
  const counts = {
    decisionsCount: 0,
    activeCount: 0,
    eligibleCount: 0,
    shadowCount: 0,
    blockedCount: 0,
    errorCount: 0,
  };
  for (const decision of safe) {
    const status = typeof decision?.activationStatus === 'string'
      ? decision.activationStatus
      : 'UNKNOWN';
    counts.decisionsCount += 1;
    const bucket = countStatus(status);
    if (bucket === 'active') counts.activeCount += 1;
    else if (bucket === 'eligible') counts.eligibleCount += 1;
    else if (bucket === 'shadow') counts.shadowCount += 1;
    else if (bucket === 'error') counts.errorCount += 1;
    else if (bucket === 'blocked') counts.blockedCount += 1;
  }

  let status = 'NOT_EVALUATED';
  if (counts.decisionsCount > 0) {
    if (counts.activeCount > 0) {
      status = 'ACTIVE';
    } else if (counts.eligibleCount > 0 && counts.blockedCount === 0) {
      status = 'READY';
    } else if (counts.eligibleCount > 0) {
      status = 'PARTIAL';
    } else if (counts.shadowCount > 0) {
      status = 'SHADOW_ONLY';
    } else {
      status = 'BLOCKED';
    }
  }

  return { status, ...counts };
}

export function isReadinessBlockReason(value) {
  return READINESS_BLOCK_REASONS.includes(value);
}
