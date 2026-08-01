const TYPE_PATTERNS = Object.freeze([
  ['SAVINGS', /\b(?:juntar|economizar|guardar|poupar|reserva|economia)\b/],
  ['DEBT', /\b(?:divida|dividas|endividado|endividada|quitar|parcelamento)\b/],
  ['INVESTMENT', /\b(?:investir|investimento|aplicar|aplicacao|carteira)\b/],
  ['BUDGET', /\b(?:orcamento|planejar gastos|limite mensal|controle mensal)\b/],
  ['BUSINESS', /\b(?:empresa|negocio|faturamento|capital de giro|fluxo de caixa)\b/],
  ['FINANCIAL', /\b(?:meta financeira|objetivo financeiro|vida financeira)\b/],
  ['GENERAL', /\b(?:quero planejar|fazer um plano|meu objetivo|tenho uma meta)\b/],
]);

export function detectPlanningIntent(input = {}) {
  const normalized = input?.normalizedMessage ?? input?.normalized ?? input ?? {};
  const text = String(normalized.searchableText ?? normalized.trimmedText ?? '').toLowerCase();
  const sourceIntent = input?.classification?.primaryIntent ?? input?.sourceIntent ?? null;
  const detectedGoalTypes = TYPE_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([type]) => type);
  if (sourceIntent === 'create_goal' && detectedGoalTypes.length === 0) {
    detectedGoalTypes.push('FINANCIAL');
  }
  const multiple = detectedGoalTypes.length > 1
    || /\b(?:dois objetivos|duas metas|varias metas|multiplos objetivos)\b/.test(text);
  const detected = detectedGoalTypes.length > 0 || sourceIntent === 'create_goal';
  return {
    detected,
    primaryGoalType: detectedGoalTypes[0] ?? (detected ? 'FINANCIAL' : 'UNKNOWN'),
    detectedGoalTypes: detectedGoalTypes.slice(0, 4),
    multiple,
    sourceIntent,
  };
}

export { TYPE_PATTERNS as PLANNING_INTENT_PATTERNS };
