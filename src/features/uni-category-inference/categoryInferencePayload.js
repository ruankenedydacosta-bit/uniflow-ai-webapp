import {
  CATEGORY_INFERENCE_LOCALE,
  MAX_CATEGORY_INFERENCE_CATEGORY_NAME_CHARS,
  MAX_CATEGORY_INFERENCE_DESCRIPTION_CHARS,
  MAX_CATEGORY_INFERENCE_OPTIONS,
} from './categoryInferenceConfig.js';

// BLOCO D: monta o payload MINIMO e sanitizado enviado a OpenAI para
// inferencia de categoria. So o estritamente necessario sai daqui -- por
// construcao (allowlist de campos), nunca saldo, CPF, e-mail, telefone,
// contas bancarias, historico completo, contexto Business ou qualquer
// secret.

function clampText(value, max) {
  if (typeof value !== 'string') return '';
  const withoutControlCharacters = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');
  return withoutControlCharacters.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * `categories` deve ser a lista JA filtrada pelo chamador (mesmo tipo de
 * transacao, workspace pessoal). Mesmo assim, por seguranca em profundidade,
 * esta funcao filtra de novo: nunca inclui uma categoria com
 * `applies_to === 'business'`, e nunca inclui mais do que
 * MAX_CATEGORY_INFERENCE_OPTIONS categorias nem categorias sem nome/ID
 * validos.
 */
export function buildCategoryInferencePayload({
  description,
  transactionType,
  categories = [],
} = {}) {
  const sanitizedDescription = clampText(description, MAX_CATEGORY_INFERENCE_DESCRIPTION_CHARS);
  const sanitizedCategories = (Array.isArray(categories) ? categories : [])
    .filter((category) => category
      && typeof category.id === 'string'
      && typeof category.name === 'string'
      && category.name.trim()
      && category.applies_to !== 'business')
    .slice(0, MAX_CATEGORY_INFERENCE_OPTIONS)
    .map((category) => ({
      id: category.id,
      name: clampText(category.name, MAX_CATEGORY_INFERENCE_CATEGORY_NAME_CHARS),
    }));

  return Object.freeze({
    description: sanitizedDescription,
    transactionType: transactionType === 'income' ? 'income' : 'expense',
    categories: Object.freeze(sanitizedCategories),
    locale: CATEGORY_INFERENCE_LOCALE,
  });
}
