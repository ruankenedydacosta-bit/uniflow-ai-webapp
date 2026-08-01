// Normalizador de linguagem do Uni Engine (Fase 1).
//
// Função pura: prepara a mensagem para análise SEM alterar o sentido e SEM
// duplicar parsers existentes — reutiliza os utilitários validados:
//   - normalizeFinancialText/classifyIntent (uni-intents)
//   - extractEntities (uni-intents) — valores, contas, datas, descrição
//   - resolveCategory (uni-intents) — categoria financeira
//   - isContextContinuation (uni-intents) — continuação de pendência
//   - classifyPendingActionReply (uni-conversation) — confirmação/cancelamento
//   - normalizeSearchText (utils) — representação auxiliar para busca
import { normalizeSearchText } from '../../utils/searchText.js';
import { classifyIntent } from '../uni-intents/intentClassifier.js';
import { extractEntities } from '../uni-intents/entityExtractor.js';
import { resolveCategory } from '../uni-intents/categoryResolver.js';
import { isContextContinuation } from '../uni-intents/conversationContext.js';
import { classifyPendingActionReply } from '../uni-conversation/pendingActionInput.js';

const QUESTION_WORD_PATTERN = /^(?:quanto|quantos|quantas|qual|quais|quando|como|onde|por\s*que|porque)\b/i;

const FINANCIAL_VERB_PATTERN =
  /\b(?:gastei|paguei|comprei|abasteci|coloquei|botei|recebi|ganhei|faturei|entrou|caiu|entraram|cairam|custou|saiu|transferi|transfiro|transferir|lancei|lanca|registrei|registra|anotei|anota|tenho|estou)\b/i;

const SAFETY_BLOCKED_PATTERN =
  /(?:apaga|apagar|exclui|excluir|deleta|deletar|remove|remover)\s+(?:minha|minhas|meu|meus|todas|todos|a|o)?\s*(?:conta|contas|transacoes|transações|dados|historico|histórico|tudo|registros)/i;

const CORRECTION_PATTERN =
  /\b(?:nao\s+era|nao\s+era\s+assim|era\s+na\s+verdade|na\s+verdade|corrige|corrija|correcao|correção|troca\s+para|mudei\s+de\s+ideia|me\s+enganei|nao\s+e\s+isso|não\s+é\s+isso)\b/i;

const SMALL_TALK_PATTERN =
  /^(?:oi|ola|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|obrigado|obrigada|valeu|parabens|e\s+isso)[.!?]*$/i;

const AMOUNT_PATTERN = /(?:r\$\s*)?\d[\d.,]*\b|cinquentao|cinquentinha/i;

function tokenize(searchableText) {
  const normalized = typeof searchableText === 'string' ? searchableText.trim() : '';
  return normalized ? normalized.split(/\s+/) : [];
}

export function normalizeUserMessage(input, options = {}) {
  const text = typeof input === 'string'
    ? input
    : (input?.text ?? '');
  const safeText = typeof text === 'string' ? text : '';
  const referenceDate = options?.referenceDate ?? null;

  const originalText = safeText;
  const trimmedText = safeText.trim();
  const searchableText = normalizeSearchText(trimmedText);

  const declaration = classifyIntent(trimmedText);
  const entities = extractEntities(trimmedText, {
    intent: declaration.intent,
    referenceDate,
  });
  const category = resolveCategory(trimmedText, declaration.intent);
  const pendingReply = classifyPendingActionReply(trimmedText);

  const hasQuestionMark = /[?]\s*$/.test(trimmedText);
  const hasQuestionWord = QUESTION_WORD_PATTERN.test(trimmedText);
  const hasAmount = entities.amount != null && Number(entities.amount) > 0;
  const financialVerb = FINANCIAL_VERB_PATTERN.test(trimmedText);
  const isQuestion = hasQuestionMark || hasQuestionWord;
  const isActionIntent = [
    'register_income',
    'register_expense',
    'register_transfer',
    'set_balance',
    'ambiguous_balance_or_income',
    'create_goal',
  ].includes(declaration.intent);

  return {
    originalText,
    trimmedText,
    searchableText,
    tokens: tokenize(searchableText),
    linguisticSignals: {
      isQuestion,
      hasQuestionMark,
      hasQuestionWord,
      isConfirmation: pendingReply === 'confirm',
      isCancellation: pendingReply === 'cancel',
      isContinuation: isContextContinuation(trimmedText),
      isCorrection: CORRECTION_PATTERN.test(searchableText),
      isFinancialStatement: !isQuestion && (isActionIntent || financialVerb),
      financialVerb,
      hasAmount,
      hasAccountReference: Boolean(entities.account),
      hasDestinationAccountReference: Boolean(entities.destinationAccount),
      hasDateReference: Boolean(entities.date),
      hasCategorySignal: Boolean(category.category),
      hasNegation: /\b(?:nao|não|nunca|jamais)\b/.test(searchableText),
      isSmallTalk: SMALL_TALK_PATTERN.test(searchableText),
      isSafetyBlocked: SAFETY_BLOCKED_PATTERN.test(searchableText),
    },
    extractedHints: {
      amount: entities.amount,
      account: entities.account,
      destinationAccount: entities.destinationAccount ?? null,
      category: category.category,
      categoryConfidence: category.confidence,
      description: entities.description,
      date: entities.date,
      hasExplicitAmount: hasAmount || AMOUNT_PATTERN.test(trimmedText),
      hasExplicitCategoryWord: /\bcategoria\b/i.test(searchableText),
    },
    classificationEvidence: {
      intent: declaration.intent,
      confidence: declaration.confidence,
      signals: Array.isArray(declaration.signals) ? declaration.signals : [],
      confirmationReply: pendingReply,
    },
  };
}
