// Detecção determinística de correção do usuário (Fase 8).
//
// Reconhece sinais linguísticos explícitos de correção sem usar LLM e sem
// `includes` genérico. Distingue:
//   - correção ("não, é...", "eu quis dizer...", "corrige...");
//   - cancelamento ("não quero registrar", "cancela");
//   - nova ação ("gastei 50 no mercado" enquanto havia pendência);
//   - mudança de assunto;
//   - confirmação ("isso mesmo", "pode registrar");
//   - simples negação ("não").
//
// Regra: correção NUNCA é inferida a partir de cancelamento, confirmação,
// nova ação ou mudança de assunto — apenas a partir de padrões explícitos.

const CORRECTION_PATTERNS = [
  /\bnão,?\s*é /i,
  /\beu quis dizer\b/i,
  /\beu queria dizer\b/i,
  /\bcorrige\b/i,
  /\bcorrija\b/i,
  /\bnão foi isso\b/i,
  /\bnão era isso\b/i,
  /\bvocê entendeu errado\b/i,
  /\bentendeu errado\b/i,
  /\ba conta certa é\b/i,
  /\bnão é ([a-zçá-ú]+),?\s*é ([a-zçá-ú]+)/i,
  /\bna verdade é\b/i,
  /\bde novo não\b/i,
  /\bjá falei\b/i,
];

const CANCELLATION_PATTERNS = [
  /\bnão quero registrar\b/i,
  /\bnão quero mais\b/i,
  /\bcancela\b/i,
  /\bcancele\b/i,
  /\besquece\b/i,
  /\bdeixa pra lá\b/i,
  /\bdesconsidera\b/i,
];

const CONFIRMATION_PATTERNS = [
  /\bisso mesmo\b/i,
  /\bexato\b/i,
  /\bpode registrar\b/i,
  /\bpode confirmar\b/i,
  /\bconfirmo\b/i,
  /\bcorreto\b/i,
  /\btudo certo\b/i,
];

const NEW_ACTION_PATTERNS = [
  /\bgastei\b/i,
  /\brecebi\b/i,
  /\bpaguei\b/i,
  /\btransfere\b/i,
  /\btransferi\b/i,
  /\bregistrei\b/i,
  /\banotei\b/i,
  /\bmovimentei\b/i,
  /\bcomprei\b/i,
  /\bvendi\b/i,
];

const SIMPLE_NEGATION_PATTERNS = [
  /\bnão\b/i,
];

function findPattern(patterns, text) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { pattern, raw: match[0], groups: match.slice(1) };
  }
  return null;
}

function extractCategoryPair(text) {
  const match = text.match(/\bnão é ([a-zçá-ú]+), é ([a-zçá-ú]+)/i);
  if (!match) return null;
  return { from: match[1].toLowerCase(), to: match[2].toLowerCase() };
}

export function detectUserCorrection(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return {
      type: 'none',
      isCorrection: false,
      isCancellation: false,
      isConfirmation: false,
      isNewAction: false,
      isTopicChange: false,
      isSimpleNegation: false,
      matchedPattern: null,
      correctionPair: null,
    };
  }

  // Cancelamento e confirmação têm precedência sobre correção: frases de
  // negação de intenção ("não quero registrar") não são correção.
  const cancellation = findPattern(CANCELLATION_PATTERNS, text);
  if (cancellation) {
    return {
      type: 'cancellation',
      isCorrection: false,
      isCancellation: true,
      isConfirmation: false,
      isNewAction: false,
      isTopicChange: false,
      isSimpleNegation: false,
      matchedPattern: cancellation.raw,
      correctionPair: null,
    };
  }

  const confirmation = findPattern(CONFIRMATION_PATTERNS, text);
  if (confirmation) {
    return {
      type: 'confirmation',
      isCorrection: false,
      isCancellation: false,
      isConfirmation: true,
      isNewAction: false,
      isTopicChange: false,
      isSimpleNegation: false,
      matchedPattern: confirmation.raw,
      correctionPair: null,
    };
  }

  const correction = findPattern(CORRECTION_PATTERNS, text);
  if (correction) {
    return {
      type: 'correction',
      isCorrection: true,
      isCancellation: false,
      isConfirmation: false,
      isNewAction: false,
      isTopicChange: false,
      isSimpleNegation: false,
      matchedPattern: correction.raw,
      correctionPair: extractCategoryPair(text),
    };
  }

  const newAction = findPattern(NEW_ACTION_PATTERNS, text);
  if (newAction) {
    return {
      type: 'new_action',
      isCorrection: false,
      isCancellation: false,
      isConfirmation: false,
      isNewAction: true,
      isTopicChange: false,
      isSimpleNegation: false,
      matchedPattern: newAction.raw,
      correctionPair: null,
    };
  }

  const negation = findPattern(SIMPLE_NEGATION_PATTERNS, text);
  if (negation) {
    return {
      type: 'simple_negation',
      isCorrection: false,
      isCancellation: false,
      isConfirmation: false,
      isNewAction: false,
      isTopicChange: false,
      isSimpleNegation: true,
      matchedPattern: negation.raw,
      correctionPair: null,
    };
  }

  return {
    type: 'none',
    isCorrection: false,
    isCancellation: false,
    isConfirmation: false,
    isNewAction: false,
    isTopicChange: false,
    isSimpleNegation: false,
    matchedPattern: null,
    correctionPair: null,
  };
}

// Mudança de assunto só é declarada com contexto: pendência ativa + intenção
// declarada nova e incompatível. Nunca inferida só pelo texto.
export function detectTopicChange({ text, pendingActive, pendingIntent, declaredIntent }) {
  if (!pendingActive) return false;
  if (typeof declaredIntent !== 'string' || typeof pendingIntent !== 'string') return false;
  if (declaredIntent === pendingIntent) return false;
  return findPattern(NEW_ACTION_PATTERNS, text) !== null
    || detectUserCorrection(text).type === 'new_action';
}
