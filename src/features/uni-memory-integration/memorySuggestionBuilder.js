import { normalizeMemoryText } from '../uni-memory/memoryTypes.js';

const GENERIC_DESCRIPTIONS = new Set([
  'despesa', 'entrada', 'pagamento', 'compra', 'mercado', 'transferencia', 'gasto',
]);

function isSpecificDescription(value) {
  const normalized = normalizeMemoryText(value);
  return normalized.length >= 4 && !GENERIC_DESCRIPTIONS.has(normalized);
}

function hasDuplicate(context, type, key) {
  return (context?.memories ?? []).some(
    (memory) => memory.type === type && memory.key === normalizeMemoryText(key),
  );
}

export function buildMemorySuggestion({
  parsedResult,
  previousAction,
  correctedAction,
  corrections,
  memoryContext,
} = {}) {
  if (!correctedAction || !corrections) return null;
  const description = correctedAction.description ?? parsedResult?.entities?.description;

  if (
    corrections.categoryId &&
    correctedAction.category?.id &&
    correctedAction.category.id !== previousAction?.category?.id &&
    isSpecificDescription(description)
  ) {
    const key = `merchant:${normalizeMemoryText(description)}`;
    if (hasDuplicate(memoryContext, 'merchant_category_mapping', key)) return null;
    return Object.freeze({
      id: `suggestion-${key}`,
      field: 'category',
      prompt: `Quer que eu me lembre de que ${description} pertence à categoria ${correctedAction.category.name}?`,
      candidate: Object.freeze({
        type: 'merchant_category_mapping',
        key,
        value: Object.freeze({
          merchant: description,
          category_id: correctedAction.category.id,
          category_name: correctedAction.category.name,
        }),
        source: 'user_correction',
      }),
    });
  }

  if (
    corrections.accountId &&
    correctedAction.account?.id &&
    correctedAction.account.id !== previousAction?.account?.id
  ) {
    const transaction = correctedAction.transactionType ?? 'expense';
    const key = `account:${transaction}`;
    if (hasDuplicate(memoryContext, 'account_preference', key)) return null;
    return Object.freeze({
      id: `suggestion-${key}`,
      field: 'account',
      prompt: `Quer que eu me lembre de usar ${correctedAction.account.name} para movimentações como esta?`,
      candidate: Object.freeze({
        type: 'account_preference',
        key,
        value: Object.freeze({
          account_id: correctedAction.account.id,
          account_name: correctedAction.account.name,
          transaction_type: transaction,
        }),
        source: 'explicit_user',
      }),
    });
  }

  return null;
}

export function buildExplicitMemoryPayload(suggestion) {
  if (!suggestion?.candidate) return null;
  const { type, key, value, source } = suggestion.candidate;
  return Object.freeze({ type, key, value, source });
}

export function resolveMemorySuggestionChoice(suggestion, choice) {
  if (!['remember', 'once', 'cancel'].includes(choice)) {
    return Object.freeze({ shouldPersist: false, payload: null, outcome: 'invalid' });
  }
  return Object.freeze({
    shouldPersist: choice === 'remember' && Boolean(suggestion?.candidate),
    payload: choice === 'remember' ? buildExplicitMemoryPayload(suggestion) : null,
    outcome: choice,
  });
}
