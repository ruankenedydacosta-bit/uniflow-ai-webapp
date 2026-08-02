// Activation Engine — orquestração (Fase 9, ativação gradual).
//
// Avalia UMA capacidade por chamada: roda os gates obrigatórios, deriva o
// modo de rollout determinístico, decide o status de ativação e produz uma
// decisão serializável. Garantias absolutas:
//   - nenhuma execução financeira, escrita de memória ou aplicação de
//     aprendizado nesta fase (BLOCKED_BY_POLICY);
//   - resposta real continua legado por padrão;
//   - falha interna → ERROR_SAFE com fallback legado;
//   - síncrono, puro e determinístico.
import { ACTIVATION_VERSION, createActivationDecision, createEmptyActivationDecision, validateActivationDecision } from './activationContracts.js';
import { ACTIVATION_POLICY, clampRolloutPercent, describeConfidence } from './activationPolicy.js';
import { evaluateCapabilityEligibility } from './capabilityEligibility.js';
import {
  ACTIVATION_GATES,
  gateEngineEnabled,
} from './gates.js';
import { resolveRolloutMode, isRolloutActive } from './rolloutEvaluation.js';
import { createShadowComparison } from './shadowComparison.js';
import { buildAppliedEffect } from './safeAdapter.js';
import { buildActivationTelemetry, emitActivationTelemetry } from './telemetry/activationTelemetry.js';
import { getCircuitBreakerStatus } from './circuitBreaker.js';
import { isValidActivationCapability } from './activationTypes.js';

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function buildSafeErrorDecision({ safe, capability, latencyMs }) {
  const decision = createEmptyActivationDecision({
    enabled: safe.activationEnabled,
    shadowMode: safe.shadowMode,
    environment: safe.environment ?? 'unknown',
    capability,
    requested: safe.requested,
    latencyMs,
  });
  return {
    ...decision,
    activationStatus: 'ERROR_SAFE',
    fallbackReason: 'ACTIVATION_INTERNAL_ERROR',
    diagnostics: ['SHADOW_ONLY', 'FALLBACK_USED', 'ERROR_SAFE'],
  };
}

export function runActivationEngine(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const start = nowMillis();

  try {
    const capability = isValidActivationCapability(safe.capability) ? safe.capability : 'UNKNOWN';
    const environment = typeof safe.environment === 'string' ? safe.environment : 'unknown';
    const shadowMode = Boolean(safe.shadowMode);
    const engineEnabled = Boolean(safe.engineEnabled);
    const activationEnabled = Boolean(safe.activationEnabled);
    const requested = Boolean(safe.requested);
    const confidence = typeof safe.confidence === 'number' && Number.isFinite(safe.confidence)
      ? safe.confidence
      : null;
    const risk = typeof safe.risk === 'string' ? safe.risk : null;
    const workspaceType = typeof safe.workspaceType === 'string' ? safe.workspaceType : null;
    const dataSufficient = Boolean(safe.dataSufficient);
    const userId = typeof safe.userId === 'string' ? safe.userId : null;
    const testUserIds = Array.isArray(safe.testUserIds) ? safe.testUserIds : [];
    const inTestCohort = userId !== null && testUserIds.includes(userId);
    const percent = clampRolloutPercent(safe.rolloutPercent);
    const allowedEnvironments = Array.isArray(safe.allowedEnvironments)
      ? safe.allowedEnvironments
      : ACTIVATION_POLICY.defaultAllowedEnvironments;
    const capabilityEnabled = Boolean(safe.capabilityEnabled);

    // Gate 1 — motor.
    const engineGate = gateEngineEnabled({ engineEnabled });
    const gates = [engineGate];
    if (!engineGate.passed) {
      const fallback = createEmptyActivationDecision({
        enabled: false,
        shadowMode,
        environment,
        capability,
        requested,
        latencyMs: nowMillis() - start,
      });
      return {
        ...fallback,
        activationStatus: 'DISABLED',
        fallbackReason: 'ENGINE_DISABLED',
        gates,
        diagnostics: ['SHADOW_ONLY', 'FALLBACK_USED'],
        shadow: { ...fallback.shadow, shadowMode },
      };
    }

    // Demais gates — avaliação independente e auditável.
    const gateOptions = {
      engineEnabled,
      activationEnabled,
      capabilityEnabled,
      environment,
      allowedEnvironments,
      userId,
      testUserIds,
      identity: userId,
      percent,
      confidence,
      threshold: safe.confidenceThreshold
        ?? (evaluateCapabilityEligibility({ capability, capabilityEnabled }).confidenceThreshold
          ?? ACTIVATION_POLICY.defaultConfidenceThreshold),
      risk,
      workspaceType,
      dataSufficient,
      capability,
      circuitOpen: getCircuitBreakerStatus(capability).open,
      legacyAvailable: safe.legacyAvailable !== false,
      shadowMode,
    };
    const rest = ACTIVATION_GATES.slice(1).map((gate) => gate(gateOptions));
    gates.push(...rest);

    const eligibility = evaluateCapabilityEligibility({ capability, capabilityEnabled });
    const rollout = resolveRolloutMode({
      percent,
      environment,
      identity: userId,
      inTestCohort,
      developmentOnly: safe.developmentOnly,
      manualOverride: safe.manualOverride,
    });

    // Derivação do status pela PRIMEIRA falha relevante (ordem fixa).
    const byGate = Object.freeze({
      ACTIVATION_ENABLED: 'BLOCKED_BY_FLAG',
      CAPABILITY_ENABLED: 'BLOCKED_BY_FLAG',
      ENVIRONMENT_ALLOWED: 'BLOCKED_BY_ENVIRONMENT',
      PERCENTAGE_ROLLOUT: 'BLOCKED_BY_FLAG',
      CONFIDENCE_THRESHOLD: 'BLOCKED_BY_CONFIDENCE',
      RISK_THRESHOLD: 'BLOCKED_BY_RISK',
      WORKSPACE_COMPATIBLE: 'BLOCKED_BY_WORKSPACE',
      DATA_SUFFICIENCY: 'BLOCKED_BY_DATA',
      CAPABILITY_POLICY: 'BLOCKED_BY_POLICY',
      CIRCUIT_BREAKER: 'BLOCKED_BY_CIRCUIT_BREAKER',
    });

    // A porta PERCENTAGE_ROLLOUT nunca BLOQUEIA: ela apenas decide inclusão
    // em rollout percentual. Cohorte de teste, dev-only e override manual
    // contornam a porcentagem; a exclusão cai em ELIGIBLE (não ativo).
    const failedGate = gates.find((gate) => !gate.passed && gate.name !== 'PERCENTAGE_ROLLOUT');
    let activationStatus = 'UNKNOWN';
    let fallbackUsed = true;
    let fallbackReason = null;

    if (eligibility.status === 'BLOCKED_BY_FLAG') {
      activationStatus = 'BLOCKED_BY_FLAG';
      fallbackReason = 'CAPABILITY_FLAG_OFF';
    } else if (eligibility.status === 'BLOCKED_BY_POLICY') {
      activationStatus = 'BLOCKED_BY_POLICY';
      fallbackReason = eligibility.reasonCode;
    } else if (failedGate && failedGate.name !== 'ENGINE_ENABLED' && byGate[failedGate.name]) {
      activationStatus = byGate[failedGate.name];
      fallbackReason = failedGate.reasonCode;
    } else if (rollout.blockedByPolicy) {
      activationStatus = 'BLOCKED_BY_POLICY';
      fallbackReason = 'FULL_ROLLOUT_BLOCKED_BY_POLICY';
    } else if (shadowMode) {
      activationStatus = 'SHADOW_ONLY';
      fallbackReason = null;
      fallbackUsed = true;
    } else if (isRolloutActive(rollout.mode)) {
      activationStatus = rollout.mode === 'TEST_USERS' ? 'ACTIVE_TEST' : 'ACTIVE_ROLLOUT';
      fallbackUsed = false;
      fallbackReason = null;
    } else {
      activationStatus = 'ELIGIBLE';
      fallbackReason = 'NOT_IN_ROLLOUT';
    }

    // Efeito aplicado — somente quando ativo e seguro.
    const appliedEffect = buildAppliedEffect({
      capability,
      suggested: safe.suggested ?? null,
    });
    const applied = !fallbackUsed
      && activationStatus !== 'SHADOW_ONLY'
      && appliedEffect.applied;

    const comparison = createShadowComparison({
      legacy: safe.legacy ?? null,
      suggested: safe.suggested
        ? { effect: appliedEffect.effect }
        : null,
      confidence,
      risk,
      blockingGate: failedGate?.name ?? null,
      fallbackUsed,
    });

    const latencyMs = nowMillis() - start;

    let telemetry = null;
    if (safe.telemetryEnabled) {
      telemetry = buildActivationTelemetry({
        engineVersion: safe.engineVersion ?? null,
        activationVersion: ACTIVATION_VERSION,
        enabled: activationEnabled,
        shadowMode,
        capability,
        activationStatus,
        rolloutMode: rollout.mode,
        rolloutBucket: rollout.bucket,
        confidenceBand: describeConfidence(confidence),
        riskBand: risk,
        workspaceType,
        dataSufficient,
        gates,
        fallbackUsed,
        fallbackReason,
        circuitBreakerStatus: getCircuitBreakerStatus(capability).open ? 'open' : 'closed',
        latencyMs,
        errorCode: null,
      });
      emitActivationTelemetry(telemetry, safe.telemetryAdapter ?? null);
    }

    const decision = createActivationDecision({
      enabled: activationEnabled,
      shadowMode,
      environment,
      capability,
      requested,
      eligible: eligibility.status === 'ELIGIBLE',
      activationStatus,
      rolloutMode: rollout.mode,
      rolloutBucket: rollout.bucket,
      confidence,
      confidenceThreshold: gateOptions.threshold,
      risk,
      workspaceType,
      dataSufficient,
      gates,
      applied,
      appliedEffect: applied ? appliedEffect : null,
      fallbackUsed,
      fallbackReason,
      comparison,
      diagnostics: ['SHADOW_ONLY', 'FALLBACK_USED'].slice(0, fallbackUsed ? 2 : 0),
      telemetry,
      shadow: {
        shadowMode,
        appliedToDecision: applied && appliedEffect.effect === 'metadata',
        appliedToResponse: applied && appliedEffect.effect === 'guidance',
        executed: false,
        persisted: false,
        changedBehavior: false,
        memoryModified: false,
        databaseCalled: false,
        voiceTouched: false,
      },
      latencyMs,
    });

    return decision;
  } catch (error) {
    const latencyMs = nowMillis() - start;
    const capability = isValidActivationCapability(safe?.capability) ? safe.capability : 'UNKNOWN';
    if (safe?.isDev && typeof console?.warn === 'function') {
      console.warn(`[uni-engine] activation error: ${error?.code ?? 'ACTIVATION_INTERNAL_ERROR'}`);
    }
    return buildSafeErrorDecision({
      safe: safe ?? {},
      capability,
      latencyMs,
    });
  }
}

export function validateActivationEngineOutput(decision) {
  const validation = validateActivationDecision(decision);
  return { valid: validation.valid, errors: validation.errors };
}
