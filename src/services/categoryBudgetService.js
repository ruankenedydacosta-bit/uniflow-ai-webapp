import { isSupabaseConfigured, supabase } from './supabaseClient.js';

// Teto mensal por categoria (#121, migration 060). Um teto por categoria em
// cada espaço: salvar de novo substitui o valor.

const BUDGET_FIELDS = 'id, workspace_id, category_id, monthly_limit, created_at, updated_at';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Mesmo limite de numeric(14, 2).
export const MAX_MONTHLY_LIMIT = 999_999_999_999.99;

function createResult(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Supabase ainda nao esta configurado. O modo demo continua disponivel.',
  });
}

function createValidationResult(message) {
  return createResult(null, { code: 'INVALID_CATEGORY_BUDGET_REQUEST', message });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Valor do teto em reais, com duas casas. Devolve null para vazio, zero,
 * negativo ou acima do limite da coluna.
 */
export function normalizeMonthlyLimit(value) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONTHLY_LIMIT) return null;
  return amount;
}

export async function listCategoryBudgets(workspaceId) {
  if (!supabase) return createUnavailableResult([]);
  if (!isValidUuid(workspaceId)) return createValidationResult('Espaço inválido.');

  const { data, error } = await supabase
    .from('category_budgets')
    .select(BUDGET_FIELDS)
    .eq('workspace_id', workspaceId);
  return createResult(data ?? [], error);
}

export async function saveCategoryBudget(workspaceId, categoryId, monthlyLimit) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(workspaceId) || !isValidUuid(categoryId)) {
    return createValidationResult('Categoria inválida.');
  }
  if (Number(monthlyLimit) > MAX_MONTHLY_LIMIT) {
    return createValidationResult('O teto pode ser de até R$ 999.999.999.999,99.');
  }
  const amount = normalizeMonthlyLimit(monthlyLimit);
  if (amount === null) return createValidationResult('Informe um valor maior que zero.');

  // Atualiza e, sem linha, insere. Um upsert do PostgREST atualizaria também
  // workspace_id e category_id no conflito, e o UPDATE só tem grant em
  // monthly_limit (migration 060). Se outro aparelho inserir no meio, o
  // INSERT cai na chave única (23505) e a atualização roda de novo.
  const update = () => supabase
    .from('category_budgets')
    .update({ monthly_limit: amount })
    .eq('workspace_id', workspaceId)
    .eq('category_id', categoryId)
    .select(BUDGET_FIELDS);

  const updated = await update();
  if (updated.error) return createResult(null, updated.error);
  if (updated.data?.length) return createResult(updated.data[0]);

  const inserted = await supabase
    .from('category_budgets')
    .insert({ workspace_id: workspaceId, category_id: categoryId, monthly_limit: amount })
    .select(BUDGET_FIELDS)
    .single();
  if (inserted.error?.code === '23505') {
    const retried = await update();
    if (retried.error || retried.data?.length) return createResult(retried.data?.[0] ?? null, retried.error);
    return createResult(null, {
      code: 'CATEGORY_BUDGET_CONFLICT',
      message: 'O teto mudou em outro aparelho. Tente salvar de novo.',
    });
  }
  return createResult(inserted.data ?? null, inserted.error);
}

export async function deleteCategoryBudget(workspaceId, categoryId) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(workspaceId) || !isValidUuid(categoryId)) {
    return createValidationResult('Categoria inválida.');
  }

  const { error } = await supabase
    .from('category_budgets')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('category_id', categoryId);
  return createResult(error ? null : { workspace_id: workspaceId, category_id: categoryId }, error);
}
