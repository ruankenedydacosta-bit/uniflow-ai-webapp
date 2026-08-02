export function classifyGoalType(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const goalIntent = safe.goalIntent ?? {};
  const candidate = safe.candidate ?? {};
  const text = String(candidate?.normalizedText ?? safe.normalizedMessage?.searchableText ?? safe.normalizedMessage?.text ?? '');
  const workspaceType = String(safe.workspaceType ?? 'personal');

  if (!goalIntent.detected || !text.trim()) return 'UNKNOWN';

  const dominantType = goalIntent.dominantType;
  if (dominantType && dominantType !== 'UNKNOWN') {
    if (workspaceType === 'business') {
      if (['BUSINESS', 'CASH_FLOW', 'INCOME', 'BUDGET'].includes(dominantType)) return dominantType;
    }
    return dominantType;
  }

  const matchedTypes = Array.isArray(goalIntent.matchedTypes) ? goalIntent.matchedTypes : [];
  if (matchedTypes.length > 0) {
    return workspaceType === 'business' ? determineBusinessType(matchedTypes, text) : matchedTypes[0];
  }

  return 'UNKNOWN';
}

function determineBusinessType(matchedTypes, text) {
  const lower = text.toLowerCase();
  if (lower.includes('empresa') || lower.includes('negócio') || lower.includes('cnpj')) return 'BUSINESS';
  if (matchedTypes.includes('BUSINESS')) return 'BUSINESS';
  if (lower.includes('fluxo') && (lower.includes('caixa') || lower.includes('financeiro'))) return 'CASH_FLOW';
  if (lower.includes('faturamento') || lower.includes('receita')) return 'INCOME';
  return matchedTypes[0];
}