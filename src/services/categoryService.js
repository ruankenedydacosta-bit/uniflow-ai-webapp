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

export async function deleteCategory(workspaceId, categoryId) {
  if (!supabase) {
    return createUnavailableResult(null);
  }

  if (!isValidUuid(workspaceId) || !isValidUuid(categoryId)) {
    return createValidationResult('Workspace ou categoria invalida.');
  }

  const { count: dependencyCount, error: dependencyError } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('category_id', categoryId);

  if (dependencyError) {
    return createResult(null, dependencyError);
  }

  if (dependencyCount > 0) {
    return createResult(null, {
      code: 'CATEGORY_HAS_DEPENDENCIES',
      message: 'Esta categoria possui lançamentos vinculados e não pode ser excluída.',
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
