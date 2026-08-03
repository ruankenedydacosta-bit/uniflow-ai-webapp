// Uni Engine — Execution Readiness: políticas (Parte 4, Bloco 2).
//
// Política pura de agregação da camada de prontidão de execução. Define os
// limites do snapshot, as capabilities obrigatórias para uma execução segura
// e as regras determinísticas para risco e recomendação.
//
// Nada aqui executa: apenas modela, de forma observacional, se uma futura
// execução seria segura.
export const EXECUTION_READINESS_POLICY = Object.freeze({
  maxBlockedReasons: 12,
  maxRequiredCapabilities: 16,
  maxMissingRequirements: 16,
  maxDiagnostics: 12,
  // Confiança mínima para considerar a execução segura (uma futura
  // execução só seria recomendada acima deste limiar).
  safeExecutionConfidence: 0.7,
});

export function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// Capabilities obrigatórias para uma execução segura. Nesta fase, apenas a
// própria capacidade de execução é exigida — nunca é executada, apenas
// referenciada para avaliar a prontidão.
export const EXECUTION_REQUIRED_CAPABILITIES = Object.freeze([
  'FINANCIAL_EXECUTION',
]);

export function getRequiredCapabilities() {
  return [...EXECUTION_REQUIRED_CAPABILITIES];
}

// Ordena risco de execução (índice maior = mais arriscado).
const RISK_INDEX = Object.freeze({
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
});

export function riskIndex(risk) {
  return RISK_INDEX[risk] ?? 0;
}

// Deriva a recomendação de execução (vocabulário fechado — nunca executa).
//   - disponível + risco baixo/none + confiança suficiente → EXECUTE
//   - disponível + risco médio ou confiança insuficiente → REQUIRE_CONFIRMATION
//   - indisponível por requisitos/dados → GATHER_INFORMATION
//   - indisponível por risco alto → BLOCK_EXECUTION
//   - indisponível por decisão não executável → DEFER
//   - qualquer outro caso → OBSERVE_ONLY
export function deriveExecutionRecommendation({
  executionAvailable = false,
  executionRisk = 'NONE',
  executionConfidence = 0,
  hasBlockedReasons = false,
  highRisk = false,
  missingRequirements = false,
  decisionNotExecutable = false,
} = {}) {
  const safe = EXECUTION_READINESS_POLICY.safeExecutionConfidence;
  const isHighRisk = highRisk || riskIndex(executionRisk) >= riskIndex('HIGH');
  if (executionAvailable && !hasBlockedReasons) {
    if (isHighRisk) return 'BLOCK_EXECUTION';
    if (riskIndex(executionRisk) >= riskIndex('MEDIUM')) return 'REQUIRE_CONFIRMATION';
    if (executionConfidence < safe) return 'REQUIRE_CONFIRMATION';
    return 'EXECUTE';
  }
  if (hasBlockedReasons && isHighRisk) return 'BLOCK_EXECUTION';
  if (hasBlockedReasons && missingRequirements) return 'GATHER_INFORMATION';
  if (hasBlockedReasons && decisionNotExecutable) return 'DEFER';
  return 'OBSERVE_ONLY';
}
