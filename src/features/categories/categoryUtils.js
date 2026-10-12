// Lógica pura da área de Categorias — sem dependências de React/DOM,
// para permitir testes via `node --test` (o setup do projeto não renderiza JSX).

export const CATEGORY_TYPES = Object.freeze({
  EXPENSE: 'expense',
  INCOME: 'income',
  TRANSFER: 'transfer',
});

// A partir deste número de itens no tipo ativo, a busca passa a valer a pena.
export const SEARCH_MIN_ITEMS = 8;

/**
 * Normaliza texto para comparação: minúsculo, sem acentos e sem espaços nas
 * pontas. Usado tanto na busca quanto na checagem de nome duplicado.
 */
export function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Filtra categorias pelo termo digitado (case e acento-insensível).
 * Termo vazio retorna a lista original (sem cópia desnecessária).
 */
export function filterCategoriesBySearch(categories, query) {
  const list = Array.isArray(categories) ? categories : [];
  const term = normalizeText(query);
  if (!term) return list;
  return list.filter((category) => normalizeText(category?.name).includes(term));
}

/**
 * Separa a lista de categorias por tipo, ignorando as inativas.
 * Retorna { expense: [], income: [], transfer: [] }.
 */
export function splitCategoriesByType(categories) {
  const buckets = { expense: [], income: [], transfer: [] };
  const list = Array.isArray(categories) ? categories : [];
  for (const category of list) {
    if (category?.is_active === false) continue;
    const type = category?.category_type;
    if (type && buckets[type]) {
      buckets[type].push(category);
    }
  }
  return buckets;
}

/**
 * Verifica se já existe categoria com o mesmo nome dentro do MESMO tipo.
 * Ignora o próprio registro em edição (excludeId).
 */
export function isDuplicateCategoryName(categories, name, categoryType, { excludeId = null } = {}) {
  const target = normalizeText(name);
  if (!target) return false;
  const list = Array.isArray(categories) ? categories : [];
  return list.some((category) => {
    if (excludeId && category?.id === excludeId) return false;
    if (category?.category_type !== categoryType) return false;
    return normalizeText(category?.name) === target;
  });
}

/**
 * Decide se o usuário pode editar e excluir a categoria. Espelha as policies
 * categories_update/delete_owner_admin_or_creator: categoria do sistema nunca;
 * do espaço, owner/admin sempre e member só a que ele mesmo criou.
 */
export function canManageCategory(category, { canUpdate, canDelete, userId } = {}) {
  if (!category || category.is_system === true || !category.workspace_id) return false;
  if (canDelete === true) return true;
  return canUpdate === true && Boolean(userId) && category.created_by === userId;
}

/**
 * Traduz o erro de criar, editar ou excluir categoria para texto de tela.
 * Mensagem crua do Postgres/PostgREST nunca chega ao usuário.
 */
export function getCategoryErrorMessage(error, fallbackMessage) {
  if (!error) return '';
  if (error.code === '23505') return 'Já existe uma categoria com esse nome. Escolha outro nome.';
  if (error.code === 'CATEGORY_NOT_FOUND') {
    return 'Esta categoria não existe mais. Feche e confira a lista.';
  }
  if (error.code === 'CATEGORY_HAS_DEPENDENCIES' || error.code === 'INVALID_CATEGORY_REQUEST') {
    return error.message;
  }
  return fallbackMessage;
}

/**
 * Quantos lançamentos impedem a exclusão, segundo o erro do serviço. Zero
 * quando o erro é outro ou não há erro.
 */
export function lancamentosQueBloqueiam(error) {
  if (!error || error.code !== 'CATEGORY_HAS_DEPENDENCIES') return 0;
  const total = Number(error.dependencyCount);
  return Number.isFinite(total) && total > 0 ? total : 1;
}

/**
 * Categorias que podem receber os lançamentos de `category` quando ela é
 * excluída: ativas, do mesmo tipo (saída não vira entrada) e nunca a própria.
 * A lista já vem filtrada pelo espaço e pelo contexto (PF/PJ) do hook.
 * Mantém a ordem de entrada (padrão primeiro, depois por nome).
 */
export function categoriasDestinoParaMover(categories, category) {
  if (!category?.id || !category?.category_type) return [];
  const list = Array.isArray(categories) ? categories : [];
  return list.filter((candidate) =>
    Boolean(candidate?.id)
    && candidate.id !== category.id
    && candidate.category_type === category.category_type
    && candidate.is_active !== false,
  );
}

/** Decide se a busca deve ser exibida para uma dada quantidade de itens. */
export function shouldShowSearch(itemCount) {
  return Number(itemCount) >= SEARCH_MIN_ITEMS;
}

/** Rótulo do botão principal da Uni conforme o tipo ativo. */
export function getUniButtonLabel(categoryType) {
  return categoryType === CATEGORY_TYPES.INCOME
    ? 'Registrar entrada com a Uni'
    : 'Registrar gasto com a Uni';
}

/**
 * Monta o objeto de estado de navegação enviado ao Chat da Uni.
 * Nunca inclui dados sensíveis — apenas contexto de intenção.
 */
export function buildUniNavigationState(categoryType, categoryName = null) {
  const tipoInicial = categoryType === CATEGORY_TYPES.INCOME ? 'receita' : 'despesa';
  const state = {
    origin: 'categorias',
    intent: 'registrar_transacao',
    tipoInicial,
  };
  if (typeof categoryName === 'string' && categoryName.trim()) {
    state.categoriaSugerida = categoryName.trim();
  }
  return state;
}

/**
 * A partir do state de navegação, monta o texto inicial (não enviado
 * automaticamente) que aparece no campo do chat. Retorna string vazia
 * quando o state não é da área de Categorias.
 */
export function buildUniPrefillFromState(state) {
  if (!state || state.origin !== 'categorias' || state.intent !== 'registrar_transacao') {
    return '';
  }
  const base = state.tipoInicial === 'receita'
    ? 'Registrar uma entrada'
    : 'Registrar um gasto';
  if (typeof state.categoriaSugerida === 'string' && state.categoriaSugerida.trim()) {
    return `${base} em ${state.categoriaSugerida.trim()}: `;
  }
  return `${base}: `;
}

// --- Fase 3: especializacao PF/PJ das categorias globais -------------------

export const APPLIES_TO = Object.freeze({
  PERSONAL: 'personal',
  BUSINESS: 'business',
  BOTH: 'both',
});

/**
 * Mapa declarativo (espelha o backfill/seed da migration
 * 20260721_014_categories_applies_to.sql) de categoria global -> applies_to.
 * Mantido aqui como dado testavel: garante que o front e a migration
 * concordem sobre a natureza de cada categoria padrao. Chave = lower(name).
 */
export const DEFAULT_GLOBAL_CATEGORY_APPLIES_TO = Object.freeze({
  // Receitas PF
  'salário': 'personal',
  'rendimentos': 'personal',
  'freelance': 'personal',
  'reembolso': 'personal',
  'presente': 'personal',
  'aluguel recebido': 'personal',
  // Despesas PF
  'moradia': 'personal',
  'alimentação': 'personal',
  'transporte': 'personal',
  'saúde': 'personal',
  'educação': 'personal',
  'lazer': 'personal',
  'dívidas': 'personal',
  // Receitas PJ
  'receita de vendas': 'business',
  'prestação de serviços': 'business',
  'comissão': 'business',
  'recebimentos': 'business',
  'contratos': 'business',
  // Despesas PJ
  'impostos': 'business',
  'fornecedores': 'business',
  'operacional': 'business',
  'folha': 'business',
  'marketing': 'business',
  'aluguel': 'business',
  'equipamentos': 'business',
  // Genericas / ambos
  'outras entradas': 'both',
  'outras despesas': 'both',
  'assinaturas': 'both',
  'transferência': 'both',
});

/** Normaliza o contexto ativo para 'personal' | 'business'. */
export function normalizeWorkspaceContext(currentWorkspace) {
  return currentWorkspace === APPLIES_TO.BUSINESS
    ? APPLIES_TO.BUSINESS
    : APPLIES_TO.PERSONAL;
}

/**
 * Decide se uma categoria deve aparecer no contexto ativo (PF/PJ).
 * - Categorias customizadas de workspace (is_system=false ou com workspace_id)
 *   pertencem apenas ao seu workspace: sempre visiveis no proprio contexto,
 *   independentemente de applies_to.
 * - Categorias globais do sistema (is_system=true e workspace_id nulo) sao
 *   filtradas por applies_to: visiveis quando 'both' ou igual ao contexto.
 *   applies_to ausente e tratado de forma fail-closed. A migration 014
 *   tornou o campo NOT NULL e fez backfill; um global sem o campo indica
 *   dado legado/incompleto e nao pode aparecer por suposicao no Pessoal.
 */
export function categoryAppliesToContext(category, currentWorkspace) {
  if (!category) return false;
  const context = normalizeWorkspaceContext(currentWorkspace);
  const isGlobalSystem =
    category.is_system === true &&
    (category.workspace_id === null || category.workspace_id === undefined);
  if (!isGlobalSystem) return true;
  const appliesTo = category.applies_to;
  if (!appliesTo) return false;
  return appliesTo === APPLIES_TO.BOTH || appliesTo === context;
}

/**
 * Filtra uma lista de categorias para o contexto ativo (PF/PJ), respeitando
 * applies_to das globais e preservando as customizadas do workspace.
 */
export function filterCategoriesForContext(categories, currentWorkspace) {
  const list = Array.isArray(categories) ? categories : [];
  return list.filter((category) =>
    categoryAppliesToContext(category, currentWorkspace),
  );
}
