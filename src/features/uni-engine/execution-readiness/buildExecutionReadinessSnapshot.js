// Uni Engine — Execution Readiness (Parte 4, Bloco 2).
//
// buildExecutionReadinessSnapshot({ observationSnapshot,
// decisionReadinessSnapshot, capabilityReadinessSnapshot, context }):
//   1. consome o Observation Snapshot (Parte 2), o Decision Readiness
//      (Parte 3) e o Capability Readiness (Parte 4, Bloco 1);
//   2. avalia, de forma observacional, se uma FUTURA execução seria segura:
//      executionAvailable, executionBlockedReasons, executionConfidence,
//      requiredCapabilities, missingRequirements, executionRisk e
//      executionRecommendation;
//   3. nunca executa nada, nunca altera integração/resposta, nunca persiste;
//   4. qualquer erro → snapshot vazio seguro (falha segura).
//
// Garantias: nada é executado, nada altera a resposta, nada chama banco,
// memória, RPC ou voz. A Decision Layer e a Activation Engine apenas são
// lidas (resultados já produzidos).
import { isValidDecisionType, isValidDecisionRisk } from '../decision/decisionTypes.js';
import {
  EXECUTION_CAPABILITY,
  isExecutionCapabilityAllowed,
} from './executionReadinessTypes.js';
import {
  EXECUTION_READINESS_POLICY,
  clamp01,
  getRequiredCapabilities,
  deriveExecutionRecommendation,
} from './executionReadinessPolicy.js';
import {
  createEmptyExecutionReadinessSnapshot,
  createExecutionReadinessSnapshot,
  validateExecutionReadinessSnapshot,
} from './executionReadinessContracts.js';
import { buildExecutionReadinessDiagnostics } from './buildExecutionReadinessDiagnostics.js';

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] execution-readiness ${message}`);
  }
}

// Tipos de decisão que representam uma intenção executável (futura).
const EXECUTABLE_DECISION_TYPES = Object.freeze([
  'ANSWER',
  'CONFIRM',
  'CONSULT_DATABASE',
]);

export function buildExecutionReadinessSnapshot(options = {}) {
  const safe = safeObject(options);
  const safeContext = safeObject(safe.context);
  const isDev = Boolean(safeContext.isDev);
  const observationSnapshot = safeObject(safe.observationSnapshot);
  const decisionReadinessSnapshot = safeObject(safe.decisionReadinessSnapshot);
  const capabilityReadinessSnapshot = safeObject(safe.capabilityReadinessSnapshot);

  try {
    // --- entrada: decisão já produzida --------------------------------
    const decisionStatus = isValidDecisionType(decisionReadinessSnapshot.decisionStatus)
      ? decisionReadinessSnapshot.decisionStatus
      : 'UNKNOWN';
    const decisionAvailable = Boolean(decisionReadinessSnapshot.decisionAvailable);
    const decisionConfidence = clamp01(decisionReadinessSnapshot.confidence);
    const decisionRisk = isValidDecisionRisk(decisionReadinessSnapshot.risk)
      ? decisionReadinessSnapshot.risk
      : 'NONE';

    // --- capacidades obrigatórias para uma execução segura ------------
    const requiredCapabilities = getRequiredCapabilities();
    const eligibleCapabilities = Array.isArray(capabilityReadinessSnapshot.eligibleCapabilities)
      ? capabilityReadinessSnapshot.eligibleCapabilities
      : [];
    const executionCapabilityEligible = eligibleCapabilities.includes(EXECUTION_CAPABILITY);

    // --- circuit breaker (somente leitura) ----------------------------
    const circuitOpen = Boolean(
      decisionReadinessSnapshot.circuitBreakerStatus?.open
      ?? observationSnapshot.activationSnapshot?.circuitOpen
      ?? false,
    );

    // --- requisitos faltantes ------------------------------------------
    const missingInformation = Array.isArray(decisionReadinessSnapshot.missingInformation)
      ? decisionReadinessSnapshot.missingInformation
      : [];
    const missingRequirements = missingInformation.slice(0, EXECUTION_READINESS_POLICY.maxMissingRequirements);

    // --- data sufficiency ----------------------------------------------
    const dataSufficient = Boolean(
      observationSnapshot.metadata?.dataSufficient
      ?? observationSnapshot.integrationSnapshot?.dataSufficient
      ?? true,
    );

    // --- razões de bloqueio (fechadas, nunca executam) ----------------
    const blockedReasons = [];
    if (!isExecutionCapabilityAllowed()) {
      blockedReasons.push('FORBIDDEN_CAPABILITY');
    }
    if (!executionCapabilityEligible && isExecutionCapabilityAllowed()) {
      blockedReasons.push('EXECUTION_CAPABILITY_UNAVAILABLE');
    }
    if (circuitOpen) {
      blockedReasons.push('CIRCUIT_BREAKER_OPEN');
    }
    if (decisionAvailable && decisionConfidence < EXECUTION_READINESS_POLICY.safeExecutionConfidence) {
      blockedReasons.push('INSUFFICIENT_CONFIDENCE');
    }
    if (decisionRisk === 'HIGH' || decisionRisk === 'CRITICAL') {
      blockedReasons.push('HIGH_RISK');
    }
    if (missingRequirements.length > 0) {
      blockedReasons.push('MISSING_REQUIREMENTS');
    }
    if (!dataSufficient) {
      blockedReasons.push('DATA_INSUFFICIENT');
    }
    if (!EXECUTABLE_DECISION_TYPES.includes(decisionStatus)) {
      blockedReasons.push('DECISION_NOT_EXECUTABLE');
    }
    if (blockedReasons.length === 0) {
      blockedReasons.push('NOT_EVALUATED');
    }
    const uniqueBlocked = [...new Set(blockedReasons)].sort();

    const executionAvailable = uniqueBlocked.length === 0;
    const highRisk = uniqueBlocked.includes('HIGH_RISK');
    const missingRequirementsBlock = uniqueBlocked.includes('MISSING_REQUIREMENTS');
    const decisionNotExecutable = uniqueBlocked.includes('DECISION_NOT_EXECUTABLE');

    const executionConfidence = decisionAvailable ? decisionConfidence : 0;
    const executionRisk = decisionRisk;
    const executionRecommendation = deriveExecutionRecommendation({
      executionAvailable,
      executionRisk,
      executionConfidence,
      hasBlockedReasons: uniqueBlocked.length > 0,
      highRisk,
      missingRequirements: missingRequirementsBlock,
      decisionNotExecutable,
    });

    const shadowMode = Boolean(
      safeContext.shadowMode
      ?? observationSnapshot.shadowMode
      ?? true,
    );

    const diagnostics = buildExecutionReadinessDiagnostics({
      executionAvailable,
      executionConfidence,
      requiredCapabilitiesPresent: executionCapabilityEligible,
      missingRequirements: missingRequirementsBlock,
      highRisk,
      recommendation: executionRecommendation,
      shadowMode,
      legacyPreserved: true,
      applied: false,
    });

    const metadata = {
      sources: ['observation', 'decision-readiness', 'capability-readiness'],
      blockedReasonCount: uniqueBlocked.length,
      requiredCapabilityCount: requiredCapabilities.length,
      missingRequirementCount: missingRequirements.length,
      environment: typeof safeContext.environment === 'string' ? safeContext.environment : null,
    };

    const snapshot = createExecutionReadinessSnapshot({
      enabled: Boolean(observationSnapshot && observationSnapshot.serializable === true),
      shadowMode,
      executionAvailable,
      executionBlockedReasons: uniqueBlocked,
      executionConfidence,
      requiredCapabilities,
      missingRequirements,
      executionRisk,
      executionRecommendation,
      diagnostics,
      metadata,
    });

    const validation = validateExecutionReadinessSnapshot(snapshot);
    if (!validation.valid) {
      warn(isDev, `contract invalid: ${validation.errors.join(',')}`);
      return createEmptyExecutionReadinessSnapshot({ shadowMode });
    }
    return snapshot;
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'EXECUTION_READINESS_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    return createEmptyExecutionReadinessSnapshot({
      shadowMode: Boolean(safeContext.shadowMode ?? true),
    });
  }
}
