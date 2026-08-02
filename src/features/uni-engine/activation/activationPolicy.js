// Activation Engine — política central (Fase 9).
//
// Todos os thresholds, limites e capacidades proibidas ficam aqui, nunca
// espalhados pelo código. Produção nunca ativa por acidente: as flags nascem
// false e o rollout percentual é clampado entre 0 e 100.
export const ACTIVATION_POLICY = Object.freeze({
  // Versão e metas de performance.
  version: '1.0',
  latencyTargets: Object.freeze({
    medianMs: 10,
    p95Ms: 20,
  }),

  // Limites estruturais.
  maxGates: 13,
  maxCapabilities: 20,
  maxSuggestedFields: 16,
  maxRolloutPercent: 100,

  // Rollout.
  defaultRolloutPercent: 0,
  fullRolloutBlocked: true,
  manualOverrideAlwaysShadow: true,

  // Ambiente permitido por padrão (nunca produção sem flag explícita).
  defaultAllowedEnvironments: Object.freeze(['development']),

  // Workspaces compatíveis por padrão.
  allowedWorkspaceTypes: Object.freeze([
    'personal',
    'business',
    'small_business',
  ]),

  // Gates.
  defaultConfidenceThreshold: 0.7,
  maxAllowedRiskLevel: 'LOW', // HIGH/CRITICAL sempre bloqueiam.
  dataSufficiencyRequired: true,

  // Circuit breaker local (somente memória).
  circuitBreaker: Object.freeze({
    failureThreshold: 5,
    divergenceThreshold: 5,
    openWindowMs: 5 * 60 * 1000,
    maxEntriesPerCapability: 100,
  }),

  // Capacidades PROIBIDAS nesta fase — bloqueio absoluto, mesmo que alguma
  // flag esteja configurada incorretamente.
  forbiddenCapabilities: Object.freeze([
    'RESPONSE_CONTENT_INFLUENCE',
    'MEMORY_WRITE',
    'FINANCIAL_EXECUTION',
    'LEARNING_APPLICATION',
  ]),

  // Primeira ativação controlada (apenas suporte técnico; nunca ligada por
  // padrão e nunca configurada com usuário real).
  firstWaveCapabilities: Object.freeze([
    'METADATA_ONLY',
    'QUESTION_GUIDANCE',
    'CLARIFICATION_GUIDANCE',
    'RESPONSE_STYLE_GUIDANCE',
    'RESPONSE_LENGTH_GUIDANCE',
  ]),

  // Bandas de confiança para telemetria (agregados, nunca valores).
  confidenceBands: Object.freeze([
    { min: 0.8, band: 'high' },
    { min: 0.6, band: 'medium' },
    { min: 0.4, band: 'low' },
    { min: 0, band: 'very_low' },
  ]),
});

export function clampRolloutPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ACTIVATION_POLICY.defaultRolloutPercent;
  }
  if (value < 0) return 0;
  if (value > ACTIVATION_POLICY.maxRolloutPercent) return ACTIVATION_POLICY.maxRolloutPercent;
  return Math.round(value);
}

export function describeConfidence(value) {
  const confidence = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  for (const band of ACTIVATION_POLICY.confidenceBands) {
    if (confidence >= band.min) return band.band;
  }
  return 'very_low';
}

export function isRiskAllowed(riskLevel) {
  const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const allowed = rank[ACTIVATION_POLICY.maxAllowedRiskLevel] ?? 0;
  return (rank[riskLevel] ?? 0) <= allowed;
}
