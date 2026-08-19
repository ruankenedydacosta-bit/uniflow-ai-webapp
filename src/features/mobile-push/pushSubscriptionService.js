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

/**
 * PUSH1: salva (ou reativa) a subscription deste dispositivo/browser.
 * endpoint e a chave de idempotencia (unique real no banco, migration 042)
 * -- reautorizar no MESMO dispositivo faz upsert na mesma linha, nunca
 * duplica. RLS garante ownership: mesmo que o cliente informe um endpoint
 * de outro usuario, o UPDATE do upsert e bloqueado pela policy
 * (USING auth.uid() = user_id na linha existente) -- nunca uma checagem de
 * aplicacao.
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
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      workspace_id: workspaceId,
      endpoint,
      p256dh,
      auth: authKey,
      platform,
      updated_at: nowIso,
      last_seen_at: nowIso,
      revoked_at: null,
    }, { onConflict: 'endpoint' })
    .select('id, endpoint, revoked_at')
    .maybeSingle();

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
