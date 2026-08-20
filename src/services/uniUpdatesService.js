import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const UPDATE_FIELDS = 'id, version, icon, title, description, features, active, created_at';

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

function createMissingUserResult() {
  return createResult(null, {
    code: 'USER_REQUIRED',
    message: 'Usuario autenticado ausente.',
  });
}

/**
 * Lista o changelog ativo, mais recente primeiro. `limit` é o mesmo
 * mecanismo de listNotifications (userTransactions/useMonthlyReport):
 * a Home pede `limit: 1` (só precisa saber "existe pendente?", nunca
 * carrega o histórico inteiro), "Sobre a UniFlow AI" pede o histórico
 * completo (sem limit).
 */
export async function listActiveUpdates({ limit } = {}) {
  if (!supabase) return createUnavailableResult([]);

  let query = supabase
    .from('updates')
    .select(UPDATE_FIELDS)
    .order('created_at', { ascending: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

/**
 * Ids das novidades que o usuário já marcou como vistas -- usado junto
 * com resolvePendingUpdate (uniUpdatesData.js) para decidir o que ainda
 * está pendente.
 */
export async function listSeenUpdateIds(userId) {
  if (!supabase) return createUnavailableResult([]);
  if (!userId) return createMissingUserResult();

  const { data, error } = await supabase
    .from('user_seen_updates')
    .select('update_id')
    .eq('user_id', userId);

  const ids = (data ?? []).map((row) => row.update_id);
  return createResult(ids, error);
}

/**
 * Marca uma novidade como vista ("Atualização concluída"). Idempotente:
 * upsert com ignoreDuplicates (chave composta user_id+update_id já
 * garante, do lado do banco, que repetir nunca gera erro nem duplica --
 * ver migration 044).
 */
export async function markUpdateAsSeen(userId, updateId) {
  if (!supabase) return createUnavailableResult(null);
  if (!userId) return createMissingUserResult();
  if (!updateId) {
    return createResult(null, {
      code: 'INVALID_UPDATE_ID',
      message: 'updateId e obrigatorio.',
    });
  }

  const { error } = await supabase
    .from('user_seen_updates')
    .upsert({ user_id: userId, update_id: updateId }, { onConflict: 'user_id,update_id', ignoreDuplicates: true });

  return createResult(error ? null : { userId, updateId }, error);
}
