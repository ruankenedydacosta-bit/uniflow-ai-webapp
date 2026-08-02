// Sugestões não executáveis + próximo passo cognitivo do Goal Engine
// (Fase 7 — Shadow-only).
//
// Sugestões são apenas informativas: NENHUMA é executada automaticamente.
// Recomendações de investimento só existem com dados suficientes — com dados
// insuficientes a sugestão é sempre ASK_INVESTMENT_PREFERENCE (nunca agir).
export function buildGoalSuggestions(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const goalIntent = safe.goalIntent ?? {};
  const completeness = safe.completeness ?? {};
  const type = safe.type ?? 'UNKNOWN';
  const conflicts = Array.isArray(safe.conflicts) ? safe.conflicts : [];
  const risks = Array.isArray(safe.risks) ? safe.risks : [];

  if (!goalIntent.detected) {
    return { suggestions: ['NO_ACTION'], recommendedNextStep: 'NO_ACTION' };
  }

  const suggestions = [];
  const available = Array.isArray(completeness.available) ? completeness.available : [];
  const missing = Array.isArray(completeness.missing) ? completeness.missing : [];

  if (type === 'UNKNOWN') suggestions.push('CLARIFY_GOAL_TYPE');
  if (goalIntent.ambiguous) suggestions.push('CLARIFY_GOAL_AMBIGUITY');
  if (missing.includes('target_amount')) suggestions.push('ASK_TARGET_AMOUNT');
  if (missing.includes('target_date')) suggestions.push('ASK_TARGET_DATE');
  if (missing.includes('horizon')) suggestions.push('ASK_HORIZON');
  if (missing.includes('financial_snapshot')) suggestions.push('CONSULT_FINANCIAL_SNAPSHOT');
  if (missing.includes('business_context')) suggestions.push('ASK_BUSINESS_CONTEXT');
  if (type === 'INCOME' && !available.includes('memory')) suggestions.push('ASK_INCOME_SOURCE');
  if (type === 'DEBT_REDUCTION' || type === 'DEBT_PAYOFF') suggestions.push('ASK_DEBT_CONTEXT');
  if (type === 'INVESTMENT') suggestions.push('ASK_INVESTMENT_PREFERENCE');
  if (type === 'BUDGET') suggestions.push('ASK_BUDGET_CONSTRAINTS');
  if (conflicts.some((conflict) => conflict.type === 'PERSONAL_VS_BUSINESS')) {
    suggestions.push('SEPARATE_PERSONAL_BUSINESS');
  }
  if (conflicts.length > 0) suggestions.push('RESOLVE_CONFLICT');
  if (risks.some((risk) => risk?.type && risk.type !== 'NONE')) suggestions.push('MITIGATE_RISK');
  if (
    available.includes('target_amount')
    && !available.includes('target_date')
    && !available.includes('horizon')
  ) {
    suggestions.push('REFINE_TARGET');
  }
  if (completeness.isComplete && conflicts.length === 0 && type !== 'UNKNOWN') {
    suggestions.push('ESTABLISH_MILESTONES');
  }
  if (suggestions.length === 0) suggestions.push('WAIT_FOR_USER');

  return {
    suggestions,
    recommendedNextStep: recommendedNextStep({
      goalIntent,
      type,
      missing,
      available,
      conflicts,
    }),
  };
}

function recommendedNextStep({ goalIntent, type, missing, available, conflicts }) {
  if (goalIntent.ambiguous) return 'RESOLVE_AMBIGUITY';
  if (type === 'UNKNOWN') return 'REFINE_GOAL';
  if (missing.includes('target_amount')) return 'REQUEST_TARGET_DETAILS';
  if (missing.includes('target_date')) return 'REQUEST_TARGET_DETAILS';
  if (missing.includes('horizon')) return 'REQUEST_HORIZON';
  if (missing.includes('financial_snapshot')) return 'REQUEST_SNAPSHOT';
  if (type === 'INCOME' && !available.includes('memory')) return 'REQUEST_INCOME_CONTEXT';
  if (conflicts.length > 0) return 'WAIT_FOR_MORE_INFORMATION';
  return 'MONITOR_PROGRESS';
}
