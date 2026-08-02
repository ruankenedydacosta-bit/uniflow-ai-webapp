// Política central do Reflection & Learning Engine (Fase 8).
//
// TODOS os thresholds, pesos, limites e janelas temporais da reflexão ficam
// centralizados aqui — nunca espalhados pelo código. A Fase 8 apenas gera e
// avalia candidatos em Shadow Mode: nenhum número aqui autoriza aplicar,
// persistir ou mudar comportamento.

export const REFLECTION_POLICY = Object.freeze({
  // Limites de processamento (anti-explosão).
  maxSignals: 24,
  maxReviews: 8,
  maxCandidates: 12,
  maxEvidencePerCandidate: 8,
  maxEvidencePerSignal: 6,
  maxHistoryMessages: 20,
  maxHistoryForRepetition: 8,

  // Confiança.
  minCandidateConfidence: 0.5,
  supportedConfidence: 0.6,
  highConfidence: 0.8,
  lowConfidenceThreshold: 0.6,
  minEvidenceThreshold: 1,

  // Repetição do usuário.
  repetitionThreshold: 2,

  // Pesos da confiança (determinísticos).
  confidenceWeights: Object.freeze({
    base: 0.3,
    explicitCorrection: 0.35,
    userConfirmation: 0.2,
    repetition: 0.12,
    consistency: 0.06,
    conflictPenalty: -0.25,
    weakEvidencePenalty: -0.1,
    stalePenalty: -0.15,
    providerFailurePenalty: -0.3,
    otherWorkspacePenalty: -0.4,
  }),

  // Janelas de expiração por tipo de candidato (milissegundos).
  expiration: Object.freeze({
    EPISODIC_CONTEXT_MS: 24 * 60 * 60 * 1000,
    STYLE_PREFERENCE_MS: 90 * 24 * 60 * 60 * 1000,
    ACCOUNT_CATEGORY_PATTERN_MS: 180 * 24 * 60 * 60 * 1000,
    QUESTION_STRATEGY_MS: 30 * 24 * 60 * 60 * 1000,
    CORRECTION_PATTERN_MS: 30 * 24 * 60 * 60 * 1000,
    SUCCESS_REINFORCEMENT_MS: 180 * 24 * 60 * 60 * 1000,
    DEFAULT_MS: 30 * 24 * 60 * 60 * 1000,
  }),

  // Alvos de performance (ms).
  targetMedianMs: 10,
  targetP95Ms: 20,
});

export function clamp01(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

export function describeConfidence(confidence) {
  const safe = clamp01(confidence);
  if (safe >= 0.8) return 'HIGH';
  if (safe >= 0.6) return 'MEDIUM';
  if (safe >= 0.4) return 'LOW';
  return 'VERY_LOW';
}

export function describePriority(priority) {
  return priority ?? 'UNDETERMINED';
}

export function describeRisk(risk) {
  return risk ?? 'UNKNOWN';
}

// Janela de expiração padrão por tipo de candidato.
export function expirationMsForType(type) {
  switch (type) {
    case 'CONVERSATION_PREFERENCE':
    case 'CONTEXT_RESOLUTION_PATTERN':
      return REFLECTION_POLICY.expiration.EPISODIC_CONTEXT_MS;
    case 'RESPONSE_STYLE_PREFERENCE':
      return REFLECTION_POLICY.expiration.STYLE_PREFERENCE_MS;
    case 'ACCOUNT_PREFERENCE':
    case 'CATEGORY_PREFERENCE':
    case 'MERCHANT_CATEGORY_ASSOCIATION':
    case 'MERCHANT_ACCOUNT_ASSOCIATION':
    case 'SUCCESS_REINFORCEMENT':
      return REFLECTION_POLICY.expiration.ACCOUNT_CATEGORY_PATTERN_MS;
    case 'QUESTION_STRATEGY':
      return REFLECTION_POLICY.expiration.QUESTION_STRATEGY_MS;
    case 'USER_CORRECTION_PATTERN':
      return REFLECTION_POLICY.expiration.CORRECTION_PATTERN_MS;
    default:
      return REFLECTION_POLICY.expiration.DEFAULT_MS;
  }
}

// Detecta conteúdo sensível de forma determinística (CPF, tokens, senhas,
// chaves). Nunca usado para bloquear o chat — apenas para impedir geração de
// candidatos de aprendizado a partir de texto sensível.
const SENSITIVE_PATTERNS = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b(?:secret|senha|password|token|apikey|api[-_]?key|bearer)\b/i,
  /\b[A-Za-z0-9_-]{20,}\b/,
];

export function containsSensitiveContent(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const text = value.toLowerCase();
  if (text.includes('cpf') || text.includes('senha') || text.includes('token')) {
    return true;
  }
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

// Indica se o candidato deve ser classificado como preferência permanente
// ou como padrão episódico — usado para decidir janela de expiração.
export function isEphemeralCandidateType(type) {
  return type === 'CONVERSATION_PREFERENCE'
    || type === 'CONTEXT_RESOLUTION_PATTERN'
    || type === 'QUESTION_STRATEGY';
}
