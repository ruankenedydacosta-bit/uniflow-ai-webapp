export const FINANCIAL_INTENTS = Object.freeze([
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
  'check_balance',
  'forecast',
  'question',
]);

const INTENT_RULES = [
  {
    intent: 'register_transfer',
    confidence: 0.98,
    patterns: [
      /\btransfer(?:i|ir|encia|indo)\b/,
      /\b(?:fiz|mandei|enviei)\s+(?:um\s+)?pix\b/,
      /\bpix\s+(?:de\s+)?[\d.,]+\s+para\b/,
    ],
  },
  {
    intent: 'create_goal',
    confidence: 0.96,
    patterns: [
      /\bquero\s+(?:juntar|guardar|economizar)\b/,
      /\b(?:criar|definir)\s+(?:uma\s+)?(?:meta|objetivo)\b/,
      /\bmeta\s+de\s+[\d.,]+/,
    ],
  },
  {
    intent: 'forecast',
    confidence: 0.93,
    patterns: [
      /\bquanto\s+(?:eu\s+)?posso\s+(?:gastar|investir|retirar)\b/,
      /\b(?:previsao|projecao|projetad[oa])\b/,
      /\b(?:vai|deve)\s+(?:sobrar|faltar)\b/,
      /\bcomo\s+(?:fica|ficara)\s+(?:meu\s+)?(?:saldo|caixa)\b/,
    ],
  },
  {
    intent: 'check_balance',
    confidence: 0.94,
    patterns: [
      /\b(?:qual|quanto)\s+(?:e|eh|tenho|tem)\s+(?:o\s+|de\s+)?(?:meu\s+)?saldo\b/,
      /\bqual\s+(?:o\s+)?meu\s+saldo\b/,
      /\bquanto\s+(?:eu\s+)?tenho\s+(?:na|no|em)\b/,
      /\bconsultar\s+(?:o\s+)?saldo\b/,
      /\bsaldo\s+(?:atual|disponivel)\b/,
    ],
  },
  {
    intent: 'register_income',
    confidence: 0.96,
    patterns: [
      /^(?:eu\s+)?(?:recebi|ganhei|faturei)\b/,
      /^(?:entrou|caiu)\s+[\d.,]+/,
      /\brecebi\s+(?:r\$\s*)?[\d.,]+/,
    ],
  },
  {
    intent: 'register_expense',
    confidence: 0.96,
    patterns: [
      /^(?:eu\s+)?(?:paguei|gastei|comprei|abasteci)\b/,
      /^(?:custou|saiu)\s+(?:r\$\s*)?[\d.,]+/,
      /\b(?:paguei|gastei)\s+(?:r\$\s*)?[\d.,]+/,
    ],
  },
];

export function normalizeFinancialText(value) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyIntent(input) {
  const normalizedText = normalizeFinancialText(input);

  if (!normalizedText) {
    return { intent: 'question', confidence: 0, signals: [] };
  }

  for (const rule of INTENT_RULES) {
    const matchedPattern = rule.patterns.find((pattern) =>
      pattern.test(normalizedText),
    );

    if (matchedPattern) {
      return {
        intent: rule.intent,
        confidence: rule.confidence,
        signals: [matchedPattern.source],
      };
    }
  }

  return {
    intent: 'question',
    confidence: normalizedText.includes('?') ? 0.78 : 0.55,
    signals: [],
  };
}
