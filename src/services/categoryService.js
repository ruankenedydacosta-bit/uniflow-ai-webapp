import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const CATEGORY_FIELDS =
  'id, workspace_id, name, category_type, parent_category_id, icon, color, is_system, is_active, applies_to, created_by, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_CATEGORY_CONTEXTS = Object.freeze(['personal', 'business']);

function createResult(data, error = null) {
  return {
    data,
    error,
    isConfigured: isSupabaseConfigured,
  };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Supabase ainda nao esta configurado. O modo demo continua disponivel.',
  });
}

function createValidationResult(message) {
  return createResult(null, {
    code: 'INVALID_CATEGORY_REQUEST',
    message,
  });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function pickDefined(source, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => source[field] !== undefined)
      .map((field) => [field, source[field]]),
  );
}

function normalizeSingleResult(data, error, message) {
  if (!error && !data) {
    return createResult(null, {
      code: 'CATEGORY_NOT_FOUND',
      message,
    });
  }

  return createResult(data, error);
}

export async function listGlobalCategories({ categoryType, activeOnly = true } = {}) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  let query = supabase
    .from('categories')
    .select(CATEGORY_FIELDS)
    .is('workspace_id', null)
    .eq('is_system', true)
    .order('category_type')
    .order('name');

  if (categoryType) {
    query = query.eq('category_type', categoryType);
  }

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function listCategories(
  workspaceId,
  { categoryType, activeOnly = true, context = null } = {},
) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar categorias.');
  }
  if (context !== null && !VALID_CATEGORY_CONTEXTS.includes(context)) {
    return createValidationResult('Contexto invalido para listar categorias.');
  }

  let query = supabase
    .from('categories')
    .select(CATEGORY_FIELDS)
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('is_system', { ascending: false })
    .order('name');

  if (categoryType) {
    query = query.eq('category_type', categoryType);
  }

  if (activeOnly) {
    query = query.eq('is_active', true);
  }
  if (context) {
    query = query.in('applies_to', [context, 'both']);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

export async function createCategory(workspaceId, category = {}) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para criar a categoria.');
  }

  if (
    typeof category.name !== 'string' ||
    !category.name.trim() ||
    typeof category.category_type !== 'string' ||
    !category.category_type
  ) {
    return createValidationResult('Nome e tipo da categoria sao obrigatorios.');
  }
  if (
    category.applies_to !== undefined
    && !['personal', 'business', 'both'].includes(category.applies_to)
  ) {
    return createValidationResult('Contexto invalido para criar a categoria.');
  }

  if (
    category.parent_category_id &&
    !isValidUuid(category.parent_category_id)
  ) {
    return createValidationResult('Categoria pai invalida.');
  }

  const payload = {
    workspace_id: workspaceId,
    ...pickDefined(category, [
      'name',
      'category_type',
      'parent_category_id',
      'icon',
      'color',
      'is_active',
      'applies_to',
    ]),
    name: category.name.trim(),
  };

  const { data, error } = await supabase
    .from('categories')
    .insert(payload)
    .select(CATEGORY_FIELDS)
    .single();

  return createResult(data, error);
}

export async function updateCategory(
  workspaceId,
  categoryId,
  changes = {},
) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(categoryId)) {
    return createValidationResult('Workspace ou categoria invalida.');
  }

  if (
    changes.parent_category_id &&
    !isValidUuid(changes.parent_category_id)
  ) {
    return createValidationResult('Categoria pai invalida.');
  }

  const payload = pickDefined(changes, [
    'name',
    'category_type',
    'parent_category_id',
    'icon',
    'color',
    'is_active',
  ]);

  if (typeof payload.name === 'string') {
    payload.name = payload.name.trim();
  } else if (payload.name !== undefined) {
    return createValidationResult('O nome da categoria deve ser um texto valido.');
  }

  if (Object.keys(payload).length === 0 || payload.name === '') {
    return createValidationResult('Nenhuma alteracao valida foi informada.');
  }

  const { data, error } = await supabase
    .from('categories')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('id', categoryId)
    .select(CATEGORY_FIELDS)
    .maybeSingle();

  return normalizeSingleResult(
    data,
    error,
    'Categoria nao encontrada para atualizacao.',
  );
}

/** Quantos lançamentos do espaço apontam para a categoria, em qualquer status. */
export async function contarLancamentosDaCategoria(workspaceId, categoryId) {
  if (!supabase) {
    return createUnavailableResult(0);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(categoryId)) {
    return createValidationResult('Workspace ou categoria invalida.');
  }

  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('category_id', categoryId);

  return createResult(error ? null : Number(count) || 0, error);
}

export async function deleteCategory(workspaceId, categoryId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(categoryId)) {
    return createValidationResult('Workspace ou categoria invalida.');
  }

  const { data: dependencyCount, error: dependencyError } = await contarLancamentosDaCategoria(
    workspaceId,
    categoryId,
  );

  if (dependencyError) {
    return createResult(null, dependencyError);
  }

  if (dependencyCount > 0) {
    return createResult(null, {
      code: 'CATEGORY_HAS_DEPENDENCIES',
      message: 'Esta categoria tem lançamentos. Escolha a categoria que vai recebê-los antes de excluir.',
      dependencyCount,
    });
  }

  const { data, error } = await supabase
    .from('categories')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', categoryId)
    .select('id')
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Categoria nao encontrada para exclusao.');
}

/**
 * Ids das categorias que o espaço ocultou (tabela workspace_hidden_categories,
 * migration 067). Vale para categoria do espaço e para categoria padrão.
 */
export async function listarCategoriasOcultas(workspaceId) {
  if (!supabase) {
    return createUnavailableResult([]);
  }

  if (!isValidUuid(workspaceId)) {
    return createValidationResult('Workspace invalido para listar categorias ocultas.');
  }

  const { data, error } = await supabase
    .from('workspace_hidden_categories')
    .select('category_id')
    .eq('workspace_id', workspaceId);

  return createResult((data ?? []).map((linha) => linha.category_id), error);
}

/** Oculta a categoria no espaço. Ocultar de novo uma categoria já oculta não é erro. */
export async function ocultarCategoria(workspaceId, categoryId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(categoryId)) {
    return createValidationResult('Workspace ou categoria invalida.');
  }

  const { error } = await supabase
    .from('workspace_hidden_categories')
    .upsert({ workspace_id: workspaceId, category_id: categoryId }, {
      onConflict: 'workspace_id,category_id',
      ignoreDuplicates: true,
    });

  return createResult(error ? null : { id: categoryId }, error);
}

/** Volta a mostrar a categoria no espaço. */
export async function reexibirCategoria(workspaceId, categoryId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(categoryId)) {
    return createValidationResult('Workspace ou categoria invalida.');
  }

  const { error } = await supabase
    .from('workspace_hidden_categories')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('category_id', categoryId);

  return createResult(error ? null : { id: categoryId }, error);
}

// Mensagens-código da função excluir_categoria_movendo_lancamentos (migration
// 064) traduzidas para texto de tela. Qualquer outro erro segue cru para o
// fallback da interface.
const MENSAGENS_MOVER_E_EXCLUIR = Object.freeze({
  categoria_sessao_obrigatoria: 'Sua sessão expirou. Entre de novo e tente outra vez.',
  categoria_parametros_obrigatorios: 'Escolha a categoria que vai receber os lançamentos.',
  categoria_destino_igual: 'Escolha uma categoria diferente da que será excluída.',
  categoria_nao_encontrada: 'Esta categoria não existe mais. Feche e confira a lista.',
  categoria_destino_invalida:
    'A categoria escolhida não serve de destino. Escolha uma categoria ativa do mesmo tipo.',
  categoria_lancamentos_nao_movidos:
    'Não foi possível mover os lançamentos. Confira sua permissão no espaço e tente de novo.',
  categoria_sem_permissao: 'Você não tem permissão para excluir esta categoria.',
});

/**
 * Move os lançamentos da categoria para `destinoId` e exclui a categoria, na
 * mesma transação do banco. Devolve em `data.movedCount` quantos lançamentos
 * foram movidos.
 */
export async function excluirCategoriaMovendoLancamentos(workspaceId, categoryId, destinoId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(categoryId)) {
    return createValidationResult('Workspace ou categoria invalida.');
  }
  if (!isValidUuid(destinoId)) {
    return createValidationResult('Escolha a categoria que vai receber os lançamentos.');
  }
  if (destinoId === categoryId) {
    return createValidationResult(MENSAGENS_MOVER_E_EXCLUIR.categoria_destino_igual);
  }

  const { data, error } = await supabase.rpc('excluir_categoria_movendo_lancamentos', {
    p_workspace_id: workspaceId,
    p_category_id: categoryId,
    p_destination_category_id: destinoId,
  });

  if (error) {
    const mensagem = MENSAGENS_MOVER_E_EXCLUIR[error.message];
    if (error.message === 'categoria_nao_encontrada') {
      return createResult(null, { code: 'CATEGORY_NOT_FOUND', message: mensagem });
    }
    return createResult(null, mensagem ? { code: 'INVALID_CATEGORY_REQUEST', message: mensagem } : error);
  }

  return createResult({ id: categoryId, movedCount: Number(data) || 0 });
}
