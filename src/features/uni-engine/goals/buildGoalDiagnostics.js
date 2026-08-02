// Diagnósticos estruturados do Goal Engine (Fase 7 — Shadow-only).
//
// Monta o conjunto de diagnósticos (enum fechado) + resumo de evidências +
// resumo de fontes. Somente dados estruturais entram aqui; nunca conteúdo
// livre da mensagem.
export function buildGoalDiagnostics(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const goalIntent = safe.goalIntent ?? {};
  const completeness = safe.completeness ?? {};
  const conflicts = Array.isArray(safe.conflicts) ? safe.conflicts : [];
  const risks = Array.isArray(safe.risks) ? safe.risks : [];
  const dependencyEvaluation = safe.dependencyEvaluation ?? {};
  const progress = safe.progress;
  const workspaceType = String(safe.workspaceType ?? 'personal');
  const status = safe.status ?? 'UNKNOWN';
  const type = safe.type ?? 'UNKNOWN';
  const recommendedNextStep = safe.recommendedNextStep ?? 'NO_ACTION';

  const diagnostics = [];
  const available = Array.isArray(completeness.available) ? completeness.available : [];
  const missing = Array.isArray(completeness.missing) ? completeness.missing : [];

  if (!goalIntent.detected) {
    diagnostics.push('GOAL_NOT_DETECTED');
  } else {
    diagnostics.push('GOAL_DETECTED');
    if (goalIntent.explicit) diagnostics.push('GOAL_EXPLICIT');
    if (goalIntent.implicit) diagnostics.push('GOAL_IMPLICIT');
    if (goalIntent.ambiguous) diagnostics.push('GOAL_AMBIGUOUS');
    if (type !== 'UNKNOWN') diagnostics.push('GOAL_TYPE_IDENTIFIED');
    else diagnostics.push('GOAL_TYPE_UNKNOWN');
    if (completeness.isComplete) diagnostics.push('GOAL_COMPLETE');
    else diagnostics.push('GOAL_INCOMPLETE');
    if (available.includes('target_amount')) diagnostics.push('TARGET_AMOUNT_AVAILABLE');
    else diagnostics.push('TARGET_AMOUNT_MISSING');
    if (available.includes('target_date')) diagnostics.push('TARGET_DATE_AVAILABLE');
    else diagnostics.push('TARGET_DATE_MISSING');
    if (available.includes('financial_snapshot')) diagnostics.push('SNAPSHOT_AVAILABLE');
    else diagnostics.push('SNAPSHOT_MISSING');
    if (available.includes('memory')) diagnostics.push('MEMORY_AVAILABLE');
    else diagnostics.push('MEMORY_MISSING');
    if (dependencyEvaluation.allSatisfied) diagnostics.push('DEPENDENCIES_SATISFIED');
    else diagnostics.push('DEPENDENCIES_PENDING');
    if (conflicts.length > 0) diagnostics.push('CONFLICTS_DETECTED');
    else diagnostics.push('NO_CONFLICTS_DETECTED');
    if (risks.some((risk) => risk?.type && risk.type !== 'NONE')) diagnostics.push('RISKS_DETECTED');
    else diagnostics.push('NO_RISKS_DETECTED');
    if (typeof progress === 'number' && Number.isFinite(progress)) diagnostics.push('PROGRESS_ESTIMATED');
    else diagnostics.push('PROGRESS_INSUFFICIENT_DATA');
    if (recommendedNextStep !== 'NO_ACTION') diagnostics.push('NEXT_STEP_SUGGESTED');
    if ((goalIntent.matchedTypeCount ?? 0) > 1) diagnostics.push('MULTIPLE_GOALS_DETECTED');
  }

  diagnostics.push('SHADOW_ONLY');
  if (workspaceType === 'business') diagnostics.push('BUSINESS_WORKSPACE');
  else diagnostics.push('PERSONAL_WORKSPACE');

  const evidenceSummary = {
    targetAmount: available.includes('target_amount'),
    targetDate: available.includes('target_date'),
    horizon: available.includes('horizon'),
    financialSnapshot: available.includes('financial_snapshot'),
    memory: available.includes('memory'),
    workspaceContext: !missing.includes('business_context'),
  };

  const sourceSummary = {
    detected: Boolean(goalIntent.detected),
    explicit: Boolean(goalIntent.explicit),
    implicit: Boolean(goalIntent.implicit),
    ambiguous: Boolean(goalIntent.ambiguous),
    source: goalIntent.explicit
      ? 'explicit_user_statement'
      : goalIntent.implicit
        ? 'implicit_inference'
        : 'none',
    matchedKeywordsCount: Array.isArray(goalIntent.matchedKeywords) ? goalIntent.matchedKeywords.length : 0,
    matchedTypeCount: goalIntent.matchedTypeCount ?? 0,
    workspaceType,
    status,
  };

  return { diagnostics, evidenceSummary, sourceSummary };
}
