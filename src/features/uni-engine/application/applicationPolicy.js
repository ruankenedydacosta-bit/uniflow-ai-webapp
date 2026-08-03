// Uni Engine — Application (Parte 5, Bloco 3: política da primeira ativação
// controlada).
//
// A aplicação é a ÚLTIMA etapa do pipeline: somente aqui o texto da resposta
// pode realmente ser ajustado. Regras rígidas:
//   - aplicação desligada por padrão (enabledByDefault: false);
//   - exige motor + Activation + Integration + circuito fechado;
//   - RESPONSE_STYLE_GUIDANCE e RESPONSE_LENGTH_GUIDANCE podem ser APLICADAS
//     (texto); QUESTION_GUIDANCE (Bloco 2) e CLARIFICATION_GUIDANCE (Bloco 3)
//     produzem APENAS decisões observacionais (questionDecision /
//     clarificationDecision — nunca texto, nunca alteram a resposta);
//   - produção NUNCA ativa sem flag explícita; usuário deve estar na lista de
//     teste da Activation (testUserIds);
//   - qualquer falha de gate → fallback para o texto legado (applied=false).
import {
  ALLOWED_APPLICATION_CAPABILITIES,
  BLOCKED_APPLICATION_CAPABILITIES,
} from './applicationTypes.js';

export const APPLICATION_POLICY = Object.freeze({
  version: '2.0',

  // Flags de aplicação (nascem seguras — nada liga sem flag explícita).
  enabledByDefault: false,
  telemetryByDefault: false,
  legacyPreservedByDefault: true,

  // Dependências obrigatórias.
  requireEngine: true,
  requireActivation: true,
  requireIntegration: true,
  requireClosedCircuitBreaker: true,
  requireAllowedCapability: true,
  requireUserAuthorization: true,
  requireValidLegacyText: true,
  requireValidGuidance: true,

  // Capacidades que PODEM ser aplicadas ou decididas na Parte 5.
  allowedCapabilities: Object.freeze([...ALLOWED_APPLICATION_CAPABILITIES]),

  // Capacidades permanentemente bloqueadas nesta parte.
  blockedCapabilities: Object.freeze([...BLOCKED_APPLICATION_CAPABILITIES]),

  // Limites estruturais.
  maxAppliedCapabilities: 2,
  maxQuestionDecisionFields: 6,
  maxMissingInformation: 8,
  maxQuestionDiagnostics: 5,
  maxClarificationDecisionFields: 6,
  maxAmbiguousFields: 8,
  maxClarificationDiagnostics: 5,
  maxDiagnostics: 12,
  maxTelemetryItems: 20,

  // Confiança e risco (mesmos padrões da Integration).
  minimumConfidence: 0.7,
  // Threshold específico da decisão de pergunta (mesmo valor, nomeado para
  // o teste de capacidade QUESTION_GUIDANCE).
  questionMinimumConfidence: 0.7,
  // Threshold específico da decisão de esclarecimento (mesmo valor, nomeado
  // para o teste de capacidade CLARIFICATION_GUIDANCE).
  clarificationMinimumConfidence: 0.7,
  maximumRisk: 'LOW',

  // Performance.
  latencyTargets: Object.freeze({
    medianMs: 3,
    p95Ms: 8,
  }),

  // Comprimento: os mesmos limites da Integration para não divergir.
  maxTextLength: 240,
  shortTextLength: 110,

  // Estilo: preferência persistida SEMPRE vence a sugestão do motor.
  styleKeys: Object.freeze(['simple', 'normal', 'detailed']),

  // Tipos de resposta que NUNCA têm texto alterado pela aplicação.
  protectedResponseTypes: Object.freeze([
    'confirmation',
    'error',
    'success',
  ]),

  // Ambientes permitidos por padrão (nunca produção sem flag explícita).
  allowedEnvironments: Object.freeze(['development']),
  allowProductionActivation: false,
});

// Funções de política determinísticas

export function getApplicationPolicy() {
  return APPLICATION_POLICY;
}

export function isApplicationEnabledByPolicy(config) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  if (safeConfig.applicationEnabled === false) return false;
  if (APPLICATION_POLICY.enabledByDefault === false && safeConfig.applicationEnabled !== true) return false;
  return true;
}

export function isCapabilityAllowedByPolicy(capability) {
  if (typeof capability !== 'string') return false;
  return APPLICATION_POLICY.allowedCapabilities.includes(capability);
}

export function isCapabilityBlockedByPolicy(capability) {
  if (typeof capability !== 'string') return false;
  return APPLICATION_POLICY.blockedCapabilities.includes(capability);
}

export function isEnvironmentAllowedByPolicy(environment) {
  if (typeof environment !== 'string') return false;
  if (environment === 'production' && !APPLICATION_POLICY.allowProductionActivation) return false;
  return APPLICATION_POLICY.allowedEnvironments.includes(environment);
}

export function isUserAuthorizedByPolicy({ userId, testUserIds }) {
  const ids = Array.isArray(testUserIds) ? testUserIds : [];
  if (typeof userId !== 'string' || userId.trim() === '') return false;
  return ids.includes(userId);
}

export function isConfidenceAllowedByPolicy(confidence) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return false;
  return value >= APPLICATION_POLICY.minimumConfidence;
}

export function isRiskAllowedByPolicy(risk) {
  if (typeof risk !== 'string') return false;
  const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const maxAllowed = rank[APPLICATION_POLICY.maximumRisk] ?? 0;
  const actual = rank[risk] ?? 0;
  return actual <= maxAllowed;
}

// Gate da capacidade QUESTION_GUIDANCE: a flag precisa estar explicitamente
// ligada no config (variável ausente nunca ativa). Produz SOMENTE decisão
// observacional — nunca texto.
export function isQuestionCapabilityEnabledByConfig(config) {
  const safe = config && typeof config === 'object' ? config : {};
  const capabilities = safe.activationCapabilities && typeof safe.activationCapabilities === 'object'
    ? safe.activationCapabilities
    : {};
  return capabilities.QUESTION_GUIDANCE === true;
}

// Threshold específico da decisão de pergunta (0.7, mesmo padrão da
// Integration). Uma decisão só é emitida com confiança suficiente.
export function isQuestionConfidenceAllowedByPolicy(confidence) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return false;
  return value >= APPLICATION_POLICY.questionMinimumConfidence;
}

// Gate da capacidade CLARIFICATION_GUIDANCE: a flag precisa estar
// explicitamente ligada no config (variável ausente nunca ativa). Produz
// SOMENTE decisão observacional — nunca texto.
export function isClarificationCapabilityEnabledByConfig(config) {
  const safe = config && typeof config === 'object' ? config : {};
  const capabilities = safe.activationCapabilities && typeof safe.activationCapabilities === 'object'
    ? safe.activationCapabilities
    : {};
  return capabilities.CLARIFICATION_GUIDANCE === true;
}

// Threshold específico da decisão de esclarecimento (0.7, mesmo padrão da
// Integration). Uma decisão só é emitida com confiança suficiente.
export function isClarificationConfidenceAllowedByPolicy(confidence) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return false;
  return value >= APPLICATION_POLICY.clarificationMinimumConfidence;
}

// Decisão central: a aplicação DEVE cair para fallback (texto legado) quando
// qualquer gate falhar. Sempre retorna { shouldFallback, reasonCode }.
export function shouldUseApplicationFallback(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const config = safe.config && typeof safe.config === 'object' ? safe.config : {};

  // Aplicação desabilitada (flag ausente/inválida nunca ativa).
  if (!isApplicationEnabledByPolicy(config)) {
    return { shouldFallback: true, reasonCode: 'APPLICATION_DISABLED' };
  }

  // Motor desligado.
  if (APPLICATION_POLICY.requireEngine && config.enabled !== true) {
    return { shouldFallback: true, reasonCode: 'APPLICATION_DISABLED' };
  }

  // Activation desligada.
  if (APPLICATION_POLICY.requireActivation && config.activationEnabled !== true) {
    return { shouldFallback: true, reasonCode: 'ACTIVATION_DISABLED' };
  }

  // Integration desligada.
  if (APPLICATION_POLICY.requireIntegration && config.integrationEnabled !== true) {
    return { shouldFallback: true, reasonCode: 'APPLICATION_DISABLED' };
  }

  // Ambiente não autorizado.
  if (!isEnvironmentAllowedByPolicy(safe.environment)) {
    return { shouldFallback: true, reasonCode: 'ENVIRONMENT_NOT_ALLOWED' };
  }

  // Usuário não autorizado.
  if (
    APPLICATION_POLICY.requireUserAuthorization
    && !isUserAuthorizedByPolicy({ userId: safe.userId, testUserIds: safe.testUserIds })
  ) {
    return { shouldFallback: true, reasonCode: 'USER_NOT_AUTHORIZED' };
  }

  // Capacidade bloqueada ou não autorizada nesta parte.
  const capabilities = Array.isArray(safe.capabilities) ? safe.capabilities : [];
  if (capabilities.some((c) => isCapabilityBlockedByPolicy(c))) {
    return { shouldFallback: true, reasonCode: 'CAPABILITY_BLOCKED' };
  }
  if (APPLICATION_POLICY.requireAllowedCapability) {
    const allowed = capabilities.filter((c) => isCapabilityAllowedByPolicy(c));
    if (allowed.length === 0) {
      return { shouldFallback: true, reasonCode: 'CAPABILITY_NOT_ALLOWED' };
    }
  }

  // Circuit breaker aberto.
  if (APPLICATION_POLICY.requireClosedCircuitBreaker && safe.circuitBreakerOpen === true) {
    return { shouldFallback: true, reasonCode: 'CIRCUIT_BREAKER_OPEN' };
  }

  // Confiança insuficiente.
  if (typeof safe.confidence === 'number' && !isConfidenceAllowedByPolicy(safe.confidence)) {
    return { shouldFallback: true, reasonCode: 'LOW_CONFIDENCE' };
  }

  // Risco excessivo.
  if (typeof safe.risk === 'string' && !isRiskAllowedByPolicy(safe.risk)) {
    return { shouldFallback: true, reasonCode: 'HIGH_RISK' };
  }

  // Texto legado ausente/inválido.
  if (APPLICATION_POLICY.requireValidLegacyText) {
    if (typeof safe.text !== 'string' || safe.text.trim() === '') {
      return { shouldFallback: true, reasonCode: 'INVALID_LEGACY_TEXT' };
    }
  }

  // Guidance ausente/inválida.
  if (APPLICATION_POLICY.requireValidGuidance) {
    if (!safe.guidance || typeof safe.guidance !== 'object') {
      return { shouldFallback: true, reasonCode: 'INVALID_GUIDANCE' };
    }
  }

  return { shouldFallback: false, reasonCode: null };
}

export function shouldPreserveLegacyPipeline() {
  return APPLICATION_POLICY.legacyPreservedByDefault === true;
}

export function isStyleAllowedByPolicy(style) {
  if (typeof style !== 'string') return false;
  return APPLICATION_POLICY.styleKeys.includes(style);
}

export function isLengthAllowedByPolicy(band) {
  if (typeof band !== 'string') return false;
  return APPLICATION_POLICY.styleKeys.includes(band);
}
