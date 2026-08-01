// Política central da Camada de Decisão Cognitiva (Fase 5 — Shadow Mode).
//
// TODOS os números da camada de decisão (bandas de confiança, limiares,
// penalidades, bônus, janelas de recência, limites, políticas When*)
// vivem neste único arquivo — nenhum número arbitrário espalhado.
//
// Princípios:
//   - determinística (sem LLM, sem aleatoriedade, sem rede);
//   - a camada NUNCA executa; apenas recomenda (appliedToDecision = false);
//   - banco/FinancialSnapshot vence memória;
//   - confiança sempre explicável a partir do contexto avaliado.

export const DECISION_POLICY = Object.freeze({
  // Limites físicos de uma rodada de decisão (desempenho).
  limits: Object.freeze({
    maxDiagnostics: 16,
    maxRecommendations: 12,
    maxMissingInformation: 12,
    maxReasonLines: 12,
    maxConflicts: 8,
    maxSuggestionDetail: 6,
  }),

  // Faixas conceituais de confiança de decisão (0..1).
  bands: Object.freeze({
    veryLowMax: 0.24,
    lowMax: 0.49,
    mediumMax: 0.69,
    highMax: 0.89,
    veryHighMin: 0.9,
  }),

  // Limiares de escolha de decisão.
  thresholds: Object.freeze({
    answerMinConfidence: 0.7,
    confirmMinConfidence: 0.45,
    askMaxConfidence: 0.55,
    rejectMaxConfidence: 0.25,
    waitMaxConfidence: 0.2,
    partialAskConfidence: 0.6,
  }),

  // Fórmula da confiança:
  //   conf = clamp01(base + bônus + penalidades)
  confidence: Object.freeze({
    base: 0.4,
    intentKnownBonus: 0.1,
    intentConfirmedBonus: 0.08,
    epistemicHighBonus: 0.1,
    epistemicHighThreshold: 0.7,
    epistemicLowThreshold: 0.5,
    epistemicConfidenceBonus: 0.04,
    epistemicConfidencePenalty: 0.04,
    confirmationBonus: 0.08,
    snapshotFreshBonus: 0.08,
    memorySupportBonus: 0.04,
    historyAvailableBonus: 0.02,
    missingFieldPenalty: 0.12,
    conflictPenalty: 0.2,
    memoryConflictPenalty: 0.15,
    stalePenalty: 0.15,
    pendingActionPenalty: 0.1,
    ambiguousReferencePenalty: 0.12,
    inconsistentPenalty: 0.15,
    executorUnavailablePenalty: 0.1,
  }),

  // Regras de risco.
  risk: Object.freeze({
    // Intents cuja execução errada é crítica (dinheiro em jogo).
    criticalIntents: Object.freeze([
      'register_income',
      'register_expense',
      'register_transfer',
      'set_balance',
      'create_goal',
    ]),
    // Intents que exigem executor financeiro concreto.
    executorRequiredIntents: Object.freeze([
      'register_income',
      'register_expense',
      'register_transfer',
      'set_balance',
      'create_goal',
      'check_balance',
    ]),
    wrongCategoryLevel: 'HIGH',
    wrongAccountLevel: 'HIGH',
    balanceConflictLevel: 'CRITICAL',
    insufficientContextLevel: 'MEDIUM',
    staleInformationLevel: 'MEDIUM',
    ambiguousReferenceLevel: 'MEDIUM',
    inconsistentMemoryLevel: 'MEDIUM',
    divergentDatabaseLevel: 'HIGH',
    incorrectExecutorLevel: 'CRITICAL',
    interpretationLevel: 'LOW',
    contextLevel: 'LOW',
  }),

  // Janelas de recência (determinísticas; null = nunca expira).
  recency: Object.freeze({
    snapshotFreshMs: 7 * 24 * 60 * 60 * 1000,
    memoryFreshMs: 30 * 24 * 60 * 60 * 1000,
  }),
});

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// Faixa conceitual de uma confiança de decisão.
export function describeConfidence(confidence, policy = DECISION_POLICY) {
  const value = Number(confidence) || 0;
  if (value >= policy.bands.veryHighMin) return 'very_high';
  if (value > policy.bands.mediumMax) return 'high';
  if (value > policy.bands.lowMax) return 'medium';
  if (value > policy.bands.veryLowMax) return 'low';
  return 'very_low';
}

// -----------------------------------------------
// Políticas When* (regras de quando cada decisão é recomendável)
// -----------------------------------------------

// Responder é recomendável quando o contexto é suficiente, a confiança é
// alta e não há risco bloqueante.
export function whenAnswerPolicy({ context, confidence, risk, pending }) {
  const safeContext = context ?? {};
  const safeRisk = risk ?? {};
  const safePending = pending ?? null;
  return Boolean(
    safeContext.sufficiency === 'SUFFICIENT'
    && confidence >= DECISION_POLICY.thresholds.answerMinConfidence
    && (safeRisk.level === 'NONE' || safeRisk.level === 'LOW')
    && !(safePending && safePending.status === 'ready'),
  );
}

// Perguntar é recomendável quando falta informação ou a confiança é baixa.
export function whenAskPolicy({ context, confidence, missingFields, pending }) {
  const safeContext = context ?? {};
  const missing = Array.isArray(missingFields) ? missingFields : [];
  const safePending = pending ?? null;
  const pendingNeedsInput = Boolean(safePending && safePending.status === 'needs_clarification');
  return Boolean(
    (missing.length > 0 || pendingNeedsInput)
    && safeContext.sufficiency !== 'SUFFICIENT'
    && confidence <= DECISION_POLICY.thresholds.askMaxConfidence + 0.15,
  );
}

// Rejeitar é recomendável quando o risco é crítico ou o contexto é tão
// insuficiente que qualquer ação seria insegura.
export function whenRejectPolicy({ confidence, risk, safetyBlocked }) {
  const safeRisk = risk ?? {};
  return Boolean(
    safetyBlocked === true
    || safeRisk.level === 'CRITICAL'
    || (safeRisk.level === 'HIGH' && confidence < DECISION_POLICY.thresholds.answerMinConfidence),
  );
}

// Esperar é recomendável quando a pipeline já está executando ou o usuário
// precisa agir primeiro (estado em execução / conversa trocada).
export function whenWaitPolicy({ pending, conversationSwitched }) {
  const safePending = pending ?? null;
  return Boolean(
    (safePending && safePending.status === 'executing')
    || conversationSwitched === true,
  );
}

// Confirmar é recomendável quando há um pending pronto, risco controlável e
// confiança intermediária (nunca executa — apenas recomenda confirmação).
export function whenConfirmPolicy({ confidence, risk, pending }) {
  const safeRisk = risk ?? {};
  const safePending = pending ?? null;
  return Boolean(
    (safePending && safePending.status === 'ready')
    && confidence >= DECISION_POLICY.thresholds.confirmMinConfidence
    && (safeRisk.level === 'NONE' || safeRisk.level === 'LOW' || safeRisk.level === 'MEDIUM'),
  );
}
