import { normalizeSearchText } from '../../utils/searchText.js';

// BLOCO B: espelha accountResolution.js -- mesmo padrão (status enum,
// candidatos, proposta) aplicado à categoria em vez da conta.
//
// #80: a categoria nunca sai de palavra solta da frase. A lista fixa de
// termos ("das" → Impostos, "mercado" → Alimentação) errava o sentido:
// "mensalidade escolar das crianças" virava Impostos. Quem escolhe é o
// uni-interpret (categoryId) ou a pessoa: pelo nome exato de uma categoria
// dela ou pelos chips. Sem nada disso, o rascunho pergunta.
export const CATEGORY_RESOLUTION_STATUS = Object.freeze({
  RESOLVED: 'resolved',
  WILL_CREATE: 'will_create',
  NOT_FOUND: 'not_found',
  MISSING: 'missing',
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function semPontuacao(texto) {
  return normalizeSearchText(texto)
    .replace(/[.,;:!?"'“”‘’()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoriaComONome(categorias, nome) {
  const procurado = normalizeSearchText(nome);
  if (!procurado) return null;
  return categorias.find((categoria) => normalizeSearchText(categoria.name) === procurado) ?? null;
}

// "Gastei 50 na categoria Mercado": a pessoa escolheu pelo nome. Vale só o
// nome inteiro de uma categoria dela, logo depois da palavra "categoria".
// Com dois nomes possíveis ("Contas" e "Contas da casa"), vence o maior.
function categoriaCitadaPeloNome(categorias, frase) {
  const texto = ` ${semPontuacao(frase)} `;
  if (!texto.includes(' categoria ')) return null;
  let escolhida = null;
  let tamanhoEscolhido = 0;
  for (const categoria of categorias) {
    const nome = semPontuacao(categoria.name);
    if (!nome || nome.length <= tamanhoEscolhido) continue;
    const citada = new RegExp(`\\scategoria\\s(?:(?:e|eh|de|da|do|das|dos)\\s)?${escapeRegExp(nome)}\\s`).test(texto);
    if (citada) {
      escolhida = categoria;
      tamanhoEscolhido = nome.length;
    }
  }
  return escolhida;
}

export function resolveFinancialCategory({
  categories = [],
  transactionType,
  categoryId,
  requestedName,
  input = '',
  excludedCategoryName = null,
  decision,
  workspaceType = 'personal',
} = {}) {
  const compatible = (Array.isArray(categories) ? categories : []).filter(
    (category) => category?.is_active !== false
      && category.category_type === transactionType,
  );

  if (categoryId) {
    const category = compatible.find((item) => item.id === categoryId);
    return category
      ? { status: CATEGORY_RESOLUTION_STATUS.RESOLVED, category, candidates: compatible }
      : { status: CATEGORY_RESOLUTION_STATUS.MISSING, candidates: compatible, incompatible: true };
  }

  const nomePedido = typeof requestedName === 'string' ? requestedName.trim() : '';
  const proposedName = (
    nomePedido
    && normalizeSearchText(nomePedido) !== normalizeSearchText(excludedCategoryName ?? '')
  ) ? nomePedido : null;

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

  const category = proposedName
    ? categoriaComONome(compatible, proposedName)
    : categoriaCitadaPeloNome(compatible, input);
  if (category) {
    return { status: CATEGORY_RESOLUTION_STATUS.RESOLVED, category, candidates: compatible };
  }

  // Nome pedido que não existe vira proposta de criação, com confirmação.
  // Sem nome pedido, a pessoa escolhe entre as candidatas.
  return {
    status: CATEGORY_RESOLUTION_STATUS.NOT_FOUND,
    proposedCategoryName: proposedName,
    candidates: compatible,
    explanation: proposedName
      ? `A categoria ${proposedName} ainda não existe.`
      : 'Não encontrei uma categoria compatível.',
  };
}
