// Uni Engine — Context Bridge (Fase 11, Bloco 2): política.
//
// Regras rígidas de quando a ponte pode autorizar influência:
//   - ponte desligada por padrão (contextBridgeEnabled: true explícito);
//   - resultado do MESMO turno (gateway aceito e turnId correspondente);
//   - rollout efetivo ROLLOUT_INTERNAL e usuário autorizado pelo rollout;
//   - ambiente development;
//   - usuário explicitamente autorizado (activationTestUserIds);
//   - orchestrator e readiness válidos;
//   - capability individual habilitada (activationCapabilities);
//   - confiança mínima e risco máximo permitidos;
//   - circuit breaker fechado;
//   - resultado downstream (integration) válido.
// Qualquer falha → influenceAllowed=false e resposta legada preservada.
import {
  ALLOWED_CONTEXT_INFLUENCES,
  BLOCKED_CONTEXT_INFLUENCES,
} from './contextBridgeTypes.js';
import { isRolloutStage } from '../rollout/rolloutTypes.js';

export const CONTEXT_BRIDGE_POLICY = Object.freeze({
  version: '1.0',

  // Flags da ponte (nascem seguras — nada liga sem flag explícita).
  enabledByDefault: false,
  telemetryByDefault: false,

  // Gates obrigatórios.
  requireGatewaySameTurn: true,
  requireRolloutInternal: true,
  requireUserAuthorization: true,
  requireOrchestratorValid: true,
  requireReadinessValid: true,
  requireDownstreamValid: true,
  requireClosedCircuitBreaker: true,

  // Ambientes permitidos por padrão (nunca produção sem flag explícita).
  allowedEnvironments: Object.freeze(['development']),
  allowProductionActivation: false,

  // Confiança e risco (mesmos padrões da Application/Integration).
  minimumConfidence: 0.7,
  maximumRisk: 'LOW',

  // Limites estruturais.
  maxDiagnostics: 6,
  maxInfluences: 8,
  maxDecisionFields: 6,
  maxDecisionListItems: 8,
  maxReasonLength: 40,
});

export function isBridgeEnabledByPolicy(config) {
  const safe = config && typeof config === 'object' ? config : {};
  if (CONTEXT_BRIDGE_POLICY.enabledByDefault === false && safe.contextBridgeEnabled !== true) {
    return false;
  }
  return safe.contextBridgeEnabled === true;
}

export function isEnvironmentAllowedByBridgePolicy(environment) {
  if (typeof environment !== 'string' || environment.trim() === '') return false;
  if (environment === 'production' && !CONTEXT_BRIDGE_POLICY.allowProductionActivation) {
    return false;
  }
  return CONTEXT_BRIDGE_POLICY.allowedEnvironments.includes(environment);
}

export function isUserAuthorizedByBridgePolicy({ userId, testUserIds }) {
  const ids = Array.isArray(testUserIds) ? testUserIds : [];
  if (typeof userId !== 'string' || userId.trim() === '') return false;
  return ids.includes(userId);
}

// Rollout efetivo INTERNAL autorizado: stage efetivo ROLLOUT_INTERNAL e o
// usuário autorizado (flags já produzidas no snapshot — nunca reavaliadas).
export function isRolloutInternalAuthorizedByBridgePolicy(rolloutSnapshot) {
  if (!rolloutSnapshot || typeof rolloutSnapshot !== 'object' || Array.isArray(rolloutSnapshot)) {
    return false;
  }
  const stage = rolloutSnapshot.effectiveStage ?? rolloutSnapshot.metadata?.stage ?? null;
  if (!isRolloutStage(stage) || stage !== 'ROLLOUT_INTERNAL') return false;
  const authorized = rolloutSnapshot.userAuthorized === true
    || rolloutSnapshot.metadata?.authorized === true;
  return authorized;
}

export function rolloutStageOf(rolloutSnapshot) {
  if (!rolloutSnapshot || typeof rolloutSnapshot !== 'object' || Array.isArray(rolloutSnapshot)) {
    return 'ROLLOUT_OFF';
  }
  const stage = rolloutSnapshot.effectiveStage ?? rolloutSnapshot.metadata?.stage ?? null;
  return isRolloutStage(stage) ? stage : 'ROLLOUT_BLOCKED';
}

export function isOrchestratorValidByBridgePolicy(cognitiveSnapshot) {
  if (!cognitiveSnapshot || typeof cognitiveSnapshot !== 'object' || Array.isArray(cognitiveSnapshot)) {
    return false;
  }
  if (cognitiveSnapshot.orchestratorStatus !== 'ORCHESTRATED') return false;
  return cognitiveSnapshot.legacyPreserved === true || cognitiveSnapshot.sameTurn === true;
}

export function isReadinessValidByBridgePolicy(operationalReadiness) {
  return Boolean(
    operationalReadiness
    && typeof operationalReadiness === 'object'
    && !Array.isArray(operationalReadiness),
  );
}

export function isConfidenceAllowedByBridgePolicy(confidence) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return true;
  return value >= CONTEXT_BRIDGE_POLICY.minimumConfidence;
}

export function isRiskAllowedByBridgePolicy(risk) {
  if (typeof risk !== 'string' || risk.trim() === '') return true;
  const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const maxAllowed = rank[CONTEXT_BRIDGE_POLICY.maximumRisk] ?? 0;
  const actual = rank[risk] ?? 0;
  return actual <= maxAllowed;
}

// Capability individual: só é habilitada com flag explícita no config
// (activationCapabilities.<CAP> === true). Variável ausente nunca habilita.
export function isCapabilityEnabledByBridgePolicy(config, capability) {
  const safe = config && typeof config === 'object' ? config : {};
  const capabilities = safe.activationCapabilities && typeof safe.activationCapabilities === 'object'
    ? safe.activationCapabilities
    : {};
  return capabilities[capability] === true;
}

export function isInfluenceAllowedByBridgePolicy(capability) {
  if (typeof capability !== 'string') return false;
  return ALLOWED_CONTEXT_INFLUENCES.includes(capability);
}

export function isInfluenceBlockedByBridgePolicy(capability) {
  if (typeof capability !== 'string') return false;
  return BLOCKED_CONTEXT_INFLUENCES.includes(capability);
}
