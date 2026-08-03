// Uni Engine — Decision Readiness (Parte 3).
//
// buildDecisionReadinessSnapshot({ observationSnapshot, decisionSnapshot,
// activationDecisions, context }):
//   1. consome o Observation Snapshot da Parte 2 (obrigatório);
//   2. lê o resultado da Decision Layer (decisionSnapshot) e as decisões da
//      Activation Engine (activationDecisions ou, na ausência, as decisões
//      redigidas embutidas no observationSnapshot);
//   3. agrega capabilities recomendadas/elegíveis/bloqueadas usando o
//      registro existente da Activation Engine (sem re-executar gates);
//   4. normaliza confiança/risco, deriva activationReadiness, lê o circuit
//      breaker (somente leitura) e a próxima ação recomendada;
//   5. consolida o snapshot serializável e congelado (mode observational,
//      legacyPreserved true, applied false);
//   6. qualquer erro → snapshot vazio seguro (falha segura, nunca altera o
//      pipeline).
//
// Garantias: nada é aplicado, nada altera a resposta, nada executa, nada
// persiste, nenhuma telemetria sensível. Este módulo NÃO re-executa a
// Decision Layer nem a Activation Engine — apenas lê os resultados.
import {
  isValidDecisionType,
  isValidDecisionRisk,
  describeDecisionConfidence,
} from '../decision/decisionTypes.js';
import {
  isValidActivationCapability,
} from '../activation/activationTypes.js';
import {
  isCapabilityForbidden,
} from '../activation/capabilityRegistry.js';
import { getCircuitBreakerStatus } from '../activation/circuitBreaker.js';
import {
  isObservationalCapability,
  isReadinessBlockReason,
} from './readinessTypes.js';
import {
  READINESS_POLICY,
  clamp01,
  mapDecisionToNextStep,
  deriveActivationReadiness,
  isActivationStatusFutureApplicable,
} from './readinessPolicy.js';
import {
  createEmptyReadinessSnapshot,
  createReadinessSnapshot,
  validateReadinessSnapshot,
} from './readinessContracts.js';
import { buildReadinessDiagnostics } from './buildReadinessDiagnostics.js';

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] readiness ${message}`);
  }
}

function collectActivationDecisions({ observationSnapshot, activationDecisions }) {
  if (Array.isArray(activationDecisions) && activationDecisions.length > 0) {
    return activationDecisions;
  }
  const decisions = observationSnapshot?.activationSnapshot?.decisions;
  return Array.isArray(decisions) ? decisions : [];
}

function normalizeDecision(decision) {
  return decision && typeof decision === 'object' && !Array.isArray(decision) ? decision : null;
}

// Classifica uma capacidade a partir da decisão de Activation existente.
// Retorna { bucket: 'recommended'|'eligible'|'blocked'|'discard', reason? }.
function classifyCapability(capability, decision) {
  const status = typeof decision?.activationStatus === 'string'
    ? decision.activationStatus
    : 'UNKNOWN';

  if (!isValidActivationCapability(capability)) {
    return { bucket: 'discard', reason: 'UNKNOWN_CAPABILITY' };
  }
  if (isCapabilityForbidden(capability)) {
    return { bucket: 'blocked', reason: 'FORBIDDEN_CAPABILITY' };
  }
  if (!isObservationalCapability(capability)) {
    return { bucket: 'blocked', reason: 'NOT_OBSERVATIONAL_IN_READINESS' };
  }
  if (status.startsWith('BLOCKED_') || status === 'DISABLED') {
    return { bucket: 'blocked', reason: 'BLOCKED_BY_ACTIVATION' };
  }
  if (decision?.eligible === true && isActivationStatusFutureApplicable(status)) {
    return { bucket: 'eligible', reason: null };
  }
  return { bucket: 'blocked', reason: 'BLOCKED_BY_ACTIVATION' };
}

export function buildDecisionReadinessSnapshot(options = {}) {
  const safe = safeObject(options);
  const safeContext = safeObject(safe.context);
  const isDev = Boolean(safeContext.isDev);
  const observationSnapshot = safeObject(safe.observationSnapshot);
  const decisionSnapshot = safeObject(safe.decisionSnapshot);

  try {
    const decisions = collectActivationDecisions(safe);

    // --- capabilities ----------------------------------------------
    const recommended = [];
    const eligible = [];
    const blocked = [];
    const seenRecommended = new Set();
    const seenEligible = new Set();
    const seenBlocked = new Set();

    const pushBlocked = (capability, reason) => {
      if (!isValidActivationCapability(capability) || seenBlocked.has(capability)) return;
      if (!isReadinessBlockReason(reason)) reason = 'BLOCKED_BY_ACTIVATION';
      seenBlocked.add(capability);
      blocked.push({ capability, reason });
    };

    const requested = Array.isArray(observationSnapshot?.integrationSnapshot?.capabilitiesRequested)
      ? observationSnapshot.integrationSnapshot.capabilitiesRequested
      : [];
    const computed = Array.isArray(observationSnapshot?.guidanceSnapshot?.capabilitiesComputed)
      ? observationSnapshot.guidanceSnapshot.capabilitiesComputed
      : [];
    for (const capability of [...requested, ...computed]) {
      if (typeof capability !== 'string' || seenRecommended.has(capability)) continue;
      if (!isValidActivationCapability(capability)) continue;
      if (isCapabilityForbidden(capability)) {
        pushBlocked(capability, 'FORBIDDEN_CAPABILITY');
        continue;
      }
      if (!isObservationalCapability(capability)) {
        pushBlocked(capability, 'NOT_OBSERVATIONAL_IN_READINESS');
        continue;
      }
      seenRecommended.add(capability);
      recommended.push(capability);
    }

    for (const decision of decisions) {
      const normalized = normalizeDecision(decision);
      if (!normalized) continue;
      const capability = typeof normalized.capability === 'string'
        ? normalized.capability
        : 'UNKNOWN';
      const classification = classifyCapability(capability, normalized);
      if (classification.bucket === 'discard') continue;
      if (classification.bucket === 'blocked') {
        pushBlocked(capability, classification.reason);
      } else if (classification.bucket === 'eligible' && !seenEligible.has(capability)) {
        seenEligible.add(capability);
        eligible.push(capability);
      }
    }

    // Capacidades proibidas presentes em qualquer fonte permanecem
    // bloqueadas mesmo sem decisão de Activation explícita.
    const allCandidates = [...requested, ...computed, ...decisions.map((d) => d?.capability ?? null)];
    for (const capability of allCandidates) {
      if (typeof capability === 'string' && isCapabilityForbidden(capability)) {
        pushBlocked(capability, 'FORBIDDEN_CAPABILITY');
      }
    }

    recommended.sort();
    eligible.sort();
    blocked.sort((a, b) => a.capability.localeCompare(b.capability));

    // --- decisão ----------------------------------------------------
    const decisionType = isValidDecisionType(decisionSnapshot.decisionType)
      ? decisionSnapshot.decisionType
      : 'UNKNOWN';
    const decisionAvailable = decisionType !== 'UNKNOWN' && Boolean(decisionSnapshot.enabled);

    // --- confiança / risco (normalizados) --------------------------
    const confidence = clamp01(decisionSnapshot.confidence);
    const confidenceBand = describeDecisionConfidence(confidence);
    const risk = isValidDecisionRisk(decisionSnapshot.risk)
      ? decisionSnapshot.risk
      : 'NONE';

    const missingInformation = Array.isArray(decisionSnapshot.missingInformation)
      ? decisionSnapshot.missingInformation
        .filter((item) => typeof item === 'string' && item)
        .slice(0, READINESS_POLICY.maxMissingInformation)
      : [];

    // --- activation readiness --------------------------------------
    const activationReadiness = deriveActivationReadiness(decisions);

    // --- circuit breaker (somente leitura) --------------------------
    const candidateCaps = [...new Set([
      ...recommended,
      ...eligible,
      ...blocked.map((entry) => entry.capability),
    ])].sort();
    const openCapabilities = candidateCaps.filter((capability) => getCircuitBreakerStatus(capability).open);
    const circuitBreakerStatus = {
      open: openCapabilities.length > 0,
      openCapabilities,
    };

    // --- próxima ação recomendada -----------------------------------
    let recommendedNextStep = mapDecisionToNextStep(decisionType);
    if (!decisionAvailable && activationReadiness.status === 'NOT_EVALUATED') {
      recommendedNextStep = 'OBSERVE_ONLY';
    }

    const shadowMode = Boolean(
      safeContext.shadowMode
      ?? observationSnapshot.shadowMode
      ?? true,
    );

    const diagnostics = buildReadinessDiagnostics({
      decisionAvailable,
      recommendedCount: recommended.length,
      eligibleCount: eligible.length,
      blockedCount: blocked.length,
      activationReadiness,
      circuitOpen: circuitBreakerStatus.open,
      shadowMode,
      legacyPreserved: true,
      applied: false,
    });

    const metadata = {
      sources: ['observation'],
      recommendedCount: recommended.length,
      eligibleCount: eligible.length,
      blockedCount: blocked.length,
      decisionType,
      activationReadinessStatus: activationReadiness.status,
      environment: typeof safeContext.environment === 'string' ? safeContext.environment : null,
    };
    if (decisionSnapshot && decisionSnapshot.version) metadata.sources.push('decision');
    if (decisions.length > 0) metadata.sources.push('activation');

    const snapshot = createReadinessSnapshot({
      enabled: Boolean(observationSnapshot && observationSnapshot.serializable === true),
      shadowMode,
      decisionAvailable,
      decisionStatus: decisionType,
      recommendedCapabilities: recommended,
      eligibleCapabilities: eligible,
      blockedCapabilities: blocked,
      missingInformation,
      confidence,
      confidenceBand,
      risk,
      activationReadiness,
      circuitBreakerStatus,
      recommendedNextStep,
      diagnostics,
      metadata,
    });

    const validation = validateReadinessSnapshot(snapshot);
    if (!validation.valid) {
      warn(isDev, `contract invalid: ${validation.errors.join(',')}`);
      return createEmptyReadinessSnapshot({ shadowMode });
    }
    return snapshot;
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'READINESS_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    return createEmptyReadinessSnapshot({
      shadowMode: Boolean(safeContext.shadowMode ?? true),
    });
  }
}
