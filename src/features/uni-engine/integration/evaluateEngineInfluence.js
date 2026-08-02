// Integration — avaliação de influência (Parte 1).
//
// Recebe as decisões da Activation Engine (activation.decisions do Shadow
// Mode) e REVALIDA cada uma com defesa em profundidade — nada é confiado
// cegamente. Uma capacidade só pode influenciar quando TODOS os critérios
// fecham:
//   - está na allowlist autorizada da Parte 1;
//   - decisão existe, é um objeto válido e serializável;
//   - activationStatus é ACTIVE_TEST ou ACTIVE_ROLLOUT (nunca shadow);
//   - fallbackUsed é false (a Activation não caiu em fallback);
//   - appliedEffect existe com efeito guidance/metadata;
//   - flags de sombra são todas false (nunca executou/persistiu/escreveu
//     memória/chamou banco/voz);
//   - gates obrigatórios fechados (incluindo circuit breaker).
// Em Shadow Mode a integração avalia, mas NUNCA aplica (status 'shadow').
import {
  isAuthorizedIntegrationCapability,
  isIntegrationStatus,
  normalizeIntegrationStatus,
} from './integrationTypes.js';
import { INTEGRATION_POLICY } from './integrationPolicy.js';

const ACTIVE_STATUSES = Object.freeze(new Set(['ACTIVE_TEST', 'ACTIVE_ROLLOUT']));

const REQUIRED_GATES = Object.freeze([
  'ENGINE_ENABLED',
  'ACTIVATION_ENABLED',
  'CAPABILITY_ENABLED',
  'ENVIRONMENT_ALLOWED',
  'CONFIDENCE_THRESHOLD',
  'RISK_THRESHOLD',
  'WORKSPACE_COMPATIBLE',
  'DATA_SUFFICIENCY',
  'CAPABILITY_POLICY',
  'CIRCUIT_BREAKER',
]);

export function normalizeActivationDecisions(decisions) {
  if (!Array.isArray(decisions)) return [];
  return decisions
    .filter((decision) => decision && typeof decision === 'object')
    .slice(0, INTEGRATION_POLICY.maxCapabilitiesPerRun);
}

export function isActivationDecisionActive(decision) {
  if (!decision || typeof decision !== 'object') return false;
  if (!ACTIVE_STATUSES.has(decision.activationStatus)) return false;
  if (decision.fallbackUsed === true) return false;
  if (!decision.appliedEffect || typeof decision.appliedEffect !== 'object') return false;
  if (!['guidance', 'metadata'].includes(decision.appliedEffect.effect)) return false;
  const shadow = decision.shadow ?? {};
  if (
    shadow.executed === true
    || shadow.persisted === true
    || shadow.memoryModified === true
    || shadow.databaseCalled === true
    || shadow.voiceTouched === true
    || shadow.appliedToDecision === true
  ) {
    return false;
  }
  if (!Array.isArray(decision.gates)) return false;
  const gateNames = new Set(decision.gates.map((gate) => gate?.name));
  for (const required of REQUIRED_GATES) {
    if (!gateNames.has(required)) return false;
  }
  for (const gate of decision.gates) {
    if (REQUIRED_GATES.includes(gate?.name) && gate?.passed !== true) return false;
  }
  return true;
}

function checkPolicyGates(decision, context = {}) {
  const blocked = [];
  if (!decision) return { passed: false, blocked: ['NO_DECISION'] };

  // ENVIRONMENT_ALLOWED
  if (context.environment && !INTEGRATION_POLICY.allowedEnvironments.includes(context.environment)) {
    if (context.environment === 'production' && !INTEGRATION_POLICY.allowProductionActivation) {
      blocked.push('ENVIRONMENT_NOT_ALLOWED');
    }
  }

  // CONFIDENCE_THRESHOLD
  if (typeof context.confidence === 'number' && context.confidence < INTEGRATION_POLICY.minimumConfidence) {
    blocked.push('CONFIDENCE_INSUFFICIENT');
  }

  // RISK_THRESHOLD
  if (context.risk) {
    const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    const maxAllowed = rank[INTEGRATION_POLICY.maximumRisk] ?? 0;
    const actual = rank[context.risk] ?? 0;
    if (actual > maxAllowed) blocked.push('RISK_EXCESSIVE');
  }

  // DATA_SUFFICIENCY
  if (INTEGRATION_POLICY.requireSufficientData && context.dataSufficient === false) {
    blocked.push('CONTEXT_INSUFFICIENT');
  }

  // CIRCUIT_BREAKER
  if (INTEGRATION_POLICY.requireClosedCircuitBreaker && context.circuitBreakerOpen === true) {
    blocked.push('CIRCUIT_BREAKER_OPEN');
  }

  return { passed: blocked.length === 0, blocked };
}

export function evaluateEngineInfluence({
  decisions = [],
  shadowMode = true,
  requestedCapabilities = null,
  context = {},
} = {}) {
  const safeContext = context && typeof context === 'object' ? context : {};
  const normalized = normalizeActivationDecisions(decisions);
  const byCapability = {};
  const requested = [];
  const active = [];
  const applied = [];
  const blocked = [];
  const allowed = [];
  const diagnostics = [];

  for (const decision of normalized) {
    const capability = decision.capability;

    // Capacidade não autorizada na Parte 1
    if (!isAuthorizedIntegrationCapability(capability)) {
      blocked.push({ capability, reason: 'CAPABILITY_NOT_ALLOWED' });
      diagnostics.push(`${capability}: CAPABILITY_NOT_ALLOWED`);
      continue;
    }

    // Capacidade bloqueada permanentemente
    if (INTEGRATION_POLICY.blockedCapabilities.includes(capability)) {
      blocked.push({ capability, reason: 'CAPABILITY_BLOCKED' });
      diagnostics.push(`${capability}: CAPABILITY_BLOCKED`);
      continue;
    }

    if (requested.includes(capability)) continue;
    requested.push(capability);

    const gateCheck = checkPolicyGates(decision, safeContext);
    const decisionActive = isActivationDecisionActive(decision);
    const capabilityRequested = requestedCapabilities
      ? requestedCapabilities.includes(capability)
      : true;

    byCapability[capability] = {
      decision,
      active: false,
      applied: false,
      blockedBy: null,
      gateCheck,
      decisionActive,
      capabilityRequested,
    };

    // Avaliar se a capability pode ser ativa
    if (!decisionActive) {
      byCapability[capability].blockedBy = 'CAPABILITY_NOT_ACTIVE';
      blocked.push({ capability, reason: 'CAPABILITY_NOT_ACTIVE' });
      diagnostics.push(`${capability}: CAPABILITY_NOT_ACTIVE`);
      continue;
    }

    if (!capabilityRequested) {
      byCapability[capability].blockedBy = 'CAPABILITY_NOT_REQUESTED';
      blocked.push({ capability, reason: 'CAPABILITY_NOT_REQUESTED' });
      diagnostics.push(`${capability}: CAPABILITY_NOT_REQUESTED`);
      continue;
    }

    if (!gateCheck.passed) {
      byCapability[capability].blockedBy = gateCheck.blocked[0] || 'POLICY_GATE_FAILED';
      blocked.push({ capability, reason: gateCheck.blocked[0] || 'POLICY_GATE_FAILED' });
      diagnostics.push(`${capability}: ${gateCheck.blocked.join(',')}`);
      continue;
    }

    // Capability autorizada e ativa
    byCapability[capability].active = true;
    active.push(capability);
    allowed.push(capability);
    diagnostics.push(`${capability}: ACTIVE`);

    // Em shadow mode, não aplica
    if (!shadowMode) {
      byCapability[capability].applied = true;
      applied.push(capability);
      diagnostics.push(`${capability}: APPLIED`);
    }
  }

  // Determinar fallbackReason se houver capacidades bloqueadas ou nenhum active.
  // Em shadow mode, capacidades não ativas são esperadas (avaliação em sombra):
  // não derrubam a integração — apenas não aplicam.
  let fallbackReason = null;
  if (requested.length === 0) {
    fallbackReason = normalized.length === 0 ? 'ACTIVATION_DECISIONS_MISSING' : 'CAPABILITY_NOT_AUTHORIZED';
  } else if (!shadowMode && active.length === 0 && blocked.length > 0) {
    fallbackReason = blocked[0].reason;
  }

  // Status da integração
  let status;
  if (fallbackReason) {
    status = 'fallback';
  } else if (requested.length === 0) {
    status = 'disabled';
  } else if (shadowMode) {
    status = 'shadow';
  } else if (applied.length > 0) {
    status = 'active';
  } else {
    status = 'fallback';
  }

  // Normalizar status via integrationTypes
  const normalizedStatus = normalizeIntegrationStatus(status);

  // Resultado serializável
  const influenceResult = {
    requested,
    active,
    applied,
    blocked,
    allowed,
    byCapability,
    shadowMode: shadowMode === true,
    status: normalizedStatus,
    fallbackReason,
    shadowOnly: shadowMode === true || active.length === 0,
    applyIntegration: !shadowMode && active.length > 0 && applied.length > 0 && !fallbackReason,
    diagnostics: diagnostics.slice(0, INTEGRATION_POLICY.maxDiagnostics),
  };

  return Object.freeze(influenceResult);
}

export function resolveIntegrationStatus(evaluation, fallbackUsed) {
  if (fallbackUsed) return 'fallback';
  const status = evaluation?.status ?? 'disabled';
  return isIntegrationStatus(status) ? status : 'disabled';
}

// Helper para criar resultado de fallback seguro
export function createFallbackInfluenceResult(reason = 'UNKNOWN') {
  return Object.freeze({
    requested: [],
    active: [],
    applied: [],
    blocked: [],
    allowed: [],
    byCapability: {},
    shadowMode: true,
    status: 'fallback',
    fallbackReason: reason,
    shadowOnly: true,
    applyIntegration: false,
    diagnostics: [reason],
  });
}