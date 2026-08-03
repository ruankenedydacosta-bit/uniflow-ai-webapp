// Uni Engine — Cognitive Orchestrator: política (Parte 9, Bloco Único).
//
// Política fechada de ativação e validação do orquestrador.
// Interruptor mestre: flag explícita + cascata segura (motor + Activation +
// Integration + Application). Produção nunca ativa por acidente.
import { COGNITIVE_ORCHESTRATOR_VERSION } from './cognitiveOrchestratorTypes.js';

export const COGNITIVE_ORCHESTRATOR_POLICY = Object.freeze({
  version: COGNITIVE_ORCHESTRATOR_VERSION,
  enabledByDefault: false,
  requireEngine: true,
  requireActivation: true,
  requireIntegration: true,
  requireApplication: true,
  allowedEnvironments: Object.freeze(['development']),
  allowProductionActivation: false,
  maxDiagnostics: 12,
  maxSources: 8,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isCognitiveOrchestratorEnabledByConfig(config) {
  const safeConfig = config ?? {};
  if (safeConfig.cognitiveOrchestratorEnabled !== true) return false;
  if (safeConfig.enabled !== true) return false;
  if (safeConfig.activationEnabled !== true) return false;
  if (safeConfig.integrationEnabled !== true) return false;
  if (safeConfig.applicationEnabled !== true) return false;
  return true;
}

export function isEnvironmentAllowedByOrchestratorPolicy(environment) {
  if (typeof environment !== 'string') return false;
  if (environment === 'production' && !COGNITIVE_ORCHESTRATOR_POLICY.allowProductionActivation) {
    return false;
  }
  return COGNITIVE_ORCHESTRATOR_POLICY.allowedEnvironments.includes(environment);
}