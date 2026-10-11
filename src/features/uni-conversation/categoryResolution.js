import { normalizeFinancialText } from '../uni-intents/index.js';
import { resolveCategoryAlias } from './categoryAliases.js';

// BLOCO B: espelha accountResolution.js -- mesmo padrão (status enum,
// candidatos, proposta) aplicado à categoria em vez da conta. Nenhuma
// arquitetura paralela: é a mesma forma já validada, reaproveitada.
export const CATEGORY_RESOLUTION_STATUS = Object.freeze({
  RESOLVED: 'resolved',
  PENDING_APPROXIMATE: 'pending_approximate',
  WILL_CREATE: 'will_create',
  NOT_FOUND: 'not_found',
  MISSING: 'missing',
});

// Prefixos comuns antes de um nome de categoria dito em linguagem natural
// ("Gastei R$ 90 com pet" -> depois de remover valor/verbo a descrição já
// extraída por entityExtractor.js fica "Com pet" -- isso só limpa esse
// prefixo para propor "Pet" como nome de categoria, nunca reescreve a
// descrição real da transação).
function guessCategoryNameFromDescription(description) {
  if (typeof description !== 'string') return null;
  const cleaned = description
    .replace(/^(?:com|de|do|da|no|na|em|para|pra|pro)\s+/i, '')
    .trim();
  if (!cleaned) return null;
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function categorySimilarity(category, requestedName, normalizedInput) {
  const name = normalizeFinancialText(category.name);
  const requested = normalizeFinancialText(requestedName ?? '');
  if (requested && name === requested) return 4;
  if (requested && (name.includes(requested) || requested.includes(name))) return 3;

  const nameWords = name.split(' ').filter((word) => word.length >= 4);
  return nameWords.some((word) => normalizedInput?.includes(word)) ? 2 : 0;
}

export function resolveFinancialCategory({
  categories = [],
  transactionType,
  categoryId,
  requestedName,
  description,
  normalizedInput = '',
  approved = false,
  excludedCategoryId = null,
  excludedCategoryName = null,
  decision,
  workspaceType = 'personal',
} = {}) {
  const compatible = (Array.isArray(categories) ? categories : []).filter(
    (category) => category?.is_active !== false
      && category.category_type === transactionType
      && category.id !== excludedCategoryId,
  );

  if (categoryId) {
    const category = compatible.find((item) => item.id === categoryId);
    return category
      ? { status: CATEGORY_RESOLUTION_STATUS.RESOLVED, category, candidates: compatible }
      : { status: CATEGORY_RESOLUTION_STATUS.MISSING, candidates: compatible, incompatible: true };
  }

  const rawProposedName = requestedName || guessCategoryNameFromDescription(description);
  const proposedName = (
    rawProposedName
    && normalizeFinancialText(rawProposedName) !== normalizeFinancialText(excludedCategoryName ?? '')
  ) ? rawProposedName : null;

  if (decision === 'create_new') {
    if (!proposedName) {
      return {
        status: CATEGORY_RESOLUTION_STATUS.MISSING,
        candidates: compatible,
        explanation: 'Não consegui identificar um nome para a nova categoria.',
      };
    }
    return {
      status: CATEGORY_RESOLUTION_STATUS.WILL_CREATE,
      proposedCategory: {
        name: proposedName,
        category_type: transactionType,
        applies_to: workspaceType === 'business' ? 'business' : 'personal',
      },
      candidates: compatible,
      explanation: `${proposedName} será criada somente após sua confirmação.`,
    };
  }

  const ranked = compatible
    .map((category) => ({
      category,
      score: categorySimilarity(category, requestedName, normalizedInput),
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  // BLOCO UNI 1A: nome real EXATO (score >= 4) tem prioridade sobre
  // qualquer alias -- se o texto já bate literalmente com uma categoria
  // existente, o alias nunca precisa (nem deve) ser consultado.
  if (ranked.length && ranked[0].score >= 4 && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
    return {
      status: CATEGORY_RESOLUTION_STATUS.RESOLVED,
      category: ranked[0].category,
      candidates: compatible,
      approximate: false,
    };
  }

  // BLOCO UNI 1A: alias determinístico -- só é consultado depois de
  // esgotada a correspondência exata, e ANTES da aproximação textual
  // fraca/IA (ordem exigida: exata > alias > aproximação > IA). Um alias
  // inequívoco (ex.: "mercado" -> Alimentação) nunca pede confirmação --
  // é tratado com a mesma confiança de um nome exato. Se a categoria
  // canônica do alias não existir de fato no workspace, o pedido é
  // preservado e cai no fluxo já existente de criação assistida (nunca
  // finge que a categoria existe).
  const aliasMatch = resolveCategoryAlias({
    text: requestedName || normalizedInput || description,
    transactionType,
  });
  if (aliasMatch) {
    const canonicalIdentity = normalizeFinancialText(aliasMatch.canonicalName);
    const canonicalCategory = compatible.find(
      (category) => normalizeFinancialText(category.name) === canonicalIdentity,
    );
    if (canonicalCategory) {
      return {
        status: CATEGORY_RESOLUTION_STATUS.RESOLVED,
        category: canonicalCategory,
        candidates: compatible,
        approximate: false,
        viaAlias: true,
      };
    }
    // BLOCO UNI 1A: alias reconhecido, mas a categoria canônica ainda não
    // existe neste workspace -- nunca inventamos a categoria; o nome vira
    // uma PROPOSTA sujeita ao mesmo fluxo de criação assistida (com
    // confirmação) que qualquer outra categoria não encontrada.
    return {
      status: CATEGORY_RESOLUTION_STATUS.NOT_FOUND,
      proposedCategoryName: aliasMatch.canonicalName,
      candidates: compatible,
      explanation: `A categoria ${aliasMatch.canonicalName} ainda não existe.`,
      viaAlias: true,
    };
  }

  if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
    // BLOCO UNI 1A: preserva o comportamento anterior a esta mudança --
    // `approved` (confirmação explícita de um turno anterior, ex.:
    // "categoryApproved: true") resolve diretamente uma aproximação local
    // já proposta, mesmo sem ser um nome exato.
    if (approved) {
      return {
        status: CATEGORY_RESOLUTION_STATUS.RESOLVED,
        category: ranked[0].category,
        candidates: compatible,
        approximate: true,
      };
    }
    return {
      status: CATEGORY_RESOLUTION_STATUS.PENDING_APPROXIMATE,
      proposedCategory: ranked[0].category,
      candidates: compatible,
      explanation: `Esse gasto parece ser de ${ranked[0].category.name}. Posso usar essa categoria?`,
    };
  }

  return {
    status: CATEGORY_RESOLUTION_STATUS.NOT_FOUND,
    proposedCategoryName: proposedName,
    candidates: compatible,
    explanation: proposedName
      ? `A categoria ${proposedName} ainda não existe.`
      : 'Não encontrei uma categoria compatível.',
  };
}
