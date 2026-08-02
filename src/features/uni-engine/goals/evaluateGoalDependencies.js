export function evaluateGoalDependencies(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const completeness = safe.completeness ?? {};
  const workspaceType = String(safe.workspaceType ?? 'personal');

  const dependencies = [];
  const missing = completeness?.missing ?? [];

  if (missing.includes('target_amount')) {
    dependencies.push({ type: 'TARGET_AMOUNT', satisfied: false, description: 'Informar valor alvo do objetivo.' });
  } else {
    dependencies.push({ type: 'TARGET_AMOUNT', satisfied: true });
  }

  if (missing.includes('target_date')) {
    dependencies.push({ type: 'TARGET_DATE', satisfied: false, description: 'Informar data ou prazo do objetivo.' });
  } else {
    dependencies.push({ type: 'TARGET_DATE', satisfied: true });
  }

  if (missing.includes('financial_snapshot')) {
    dependencies.push({ type: 'FINANCIAL_SNAPSHOT', satisfied: false, description: 'Snapshot financeiro não disponível.' });
  } else {
    dependencies.push({ type: 'FINANCIAL_SNAPSHOT', satisfied: true });
  }

  if (missing.includes('memory')) {
    dependencies.push({ type: 'MEMORY', satisfied: false, description: 'Sem memórias persistentes do usuário.' });
  } else {
    dependencies.push({ type: 'MEMORY', satisfied: true });
  }

  if (workspaceType === 'business') {
    dependencies.push({ type: 'WORKSPACE_CONTEXT', satisfied: !missing.includes('business_context') });
  }

  const satisfiedCount = dependencies.filter((d) => d.satisfied).length;
  const allSatisfied = satisfiedCount === dependencies.length;

  return { dependencies, allSatisfied, satisfiedCount, totalCount: dependencies.length };
}