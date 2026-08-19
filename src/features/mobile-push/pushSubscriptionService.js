import { isSupabaseConfigured, supabase } from '../../services/supabaseClient.js';

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
    message: 'Supabase ainda nao esta configurado.',
  });
}

function createMissingUserResult() {
  return createResult(null, {
    code: 'USER_REQUIRED',
    message: 'Usuario autenticado ausente.',
  });
}

const UNIQUE_VIOLATION_CODE = '23505';

// PUSH1 (correcao 403): busca a PROPRIA linha (RLS ja restringe a
// user_id = auth.uid()) para este endpoint -- nunca enxerga a subscription
// de outro usuario, mesmo que o endpoint (globalmente unico por definicao
// do protocolo Push API) por algum motivo colida.
async function findOwnSubscriptionByEndpoint(userId, endpoint) {
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', endpoint)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

// PUSH1 (correcao 403): so reescreve as colunas que a migration 042
// realmente concede por UPDATE (p256dh, auth, platform, updated_at,
// last_seen_at, revoked_at) -- nunca user_id/workspace_id/endpoint numa
// reativacao. revoked_at volta para null (reativa mesmo se tinha sido
// desativada antes).
async function updateOwnSubscription(userId, subscriptionId, { p256dh, authKey, platform, nowIso }) {
  return supabase
    .from('push_subscriptions')
    .update({
      p256dh, auth: authKey, platform, updated_at: nowIso, last_seen_at: nowIso, revoked_at: null,
    })
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .select('id, endpoint, revoked_at')
    .maybeSingle();
}

/**
 * PUSH1 (correcao 403): salva (ou reativa) a subscription deste
 * dispositivo/browser -- NUNCA via upsert/on_conflict. PostgREST traduz
 * upsert em `INSERT ... ON CONFLICT (endpoint) DO UPDATE SET <toda coluna
 * do payload>` -- Postgres exige privilegio de UPDATE em TODAS essas
 * colunas em tempo de PLANEJAMENTO, mesmo quando a linha e nova e o ramo
 * ON CONFLICT nunca executa de verdade. Como user_id/workspace_id nunca
 * foram concedidos por UPDATE (de proposito -- ninguem pode trocar o dono
 * de uma subscription), TODO upsert falhava com "permission denied",
 * inclusive a primeira ativacao (bug real visto em Production).
 *
 * Fluxo seguro, sem exigir nenhum grant novo:
 * 1. procura a PROPRIA linha para este endpoint (RLS-scoped);
 * 2. se existe: UPDATE só nas colunas já concedidas (reativa);
 * 3. se não existe: INSERT normal (privilégio de INSERT já cobre a
 *    tabela inteira, migration 042);
 * 4. corrida rara (duas abas do MESMO usuário inserindo o mesmo endpoint
 *    ao mesmo tempo): o INSERT perdedor recebe unique_violation (23505) --
 *    nunca produz uma segunda linha, busca a própria de novo e converte em
 *    UPDATE.
 */
export async function upsertPushSubscription(userId, {
  workspaceId = null, endpoint, p256dh, auth: authKey, platform = null,
} = {}) {
  if (!supabase) return createUnavailableResult(null);
  if (!userId) return createMissingUserResult();
  if (!endpoint || !p256dh || !authKey) {
    return createResult(null, { code: 'INVALID_SUBSCRIPTION', message: 'Subscription invalida.' });
  }

  const nowIso = new Date().toISOString();

  const existing = await findOwnSubscriptionByEndpoint(userId, endpoint);
  if (existing) {
    const { data, error } = await updateOwnSubscription(userId, existing.id, { p256dh, authKey, platform, nowIso });
    return createResult(data, error);
  }

  const { data, error } = await supabase
    .from('push_subscriptions')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      endpoint,
      p256dh,
      auth: authKey,
      platform,
      updated_at: nowIso,
      last_seen_at: nowIso,
    })
    .select('id, endpoint, revoked_at')
    .maybeSingle();

  if (error?.code === UNIQUE_VIOLATION_CODE) {
    const retryExisting = await findOwnSubscriptionByEndpoint(userId, endpoint);
    if (retryExisting) {
      const retry = await updateOwnSubscription(userId, retryExisting.id, { p256dh, authKey, platform, nowIso });
      return createResult(retry.data, retry.error);
    }
  }

  return createResult(data, error);
}

/**
 * PUSH1: soft-revoke -- nunca DELETE fisico (mesma decisao de
 * notifications.dismissed_at). Restrito a endpoint + user_id: um usuario
 * nunca revoga a subscription de outro, mesmo sabendo o endpoint.
 */
export async function revokePushSubscription(userId, endpoint) {
  if (!supabase) return createUnavailableResult(null);
  if (!userId) return createMissingUserResult();
  if (!endpoint) {
    return createResult(null, { code: 'INVALID_ENDPOINT', message: 'Endpoint invalido.' });
  }

  const { data, error } = await supabase
    .from('push_subscriptions')
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('endpoint', endpoint)
    .eq('user_id', userId)
    .select('id, endpoint, revoked_at')
    .maybeSingle();

  return createResult(data, error);
}
