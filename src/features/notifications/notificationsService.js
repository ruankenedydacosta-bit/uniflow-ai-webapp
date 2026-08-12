import { isSupabaseConfigured, supabase } from '../../services/supabaseClient.js';

const NOTIFICATION_FIELDS =
  'id, user_id, workspace_id, type, title, message, action_url, metadata, read_at, created_at';

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
 * Lista as notificações do usuário, mais recentes primeiro. Quando
 * `workspaceId` é informado, retorna as notificações desse workspace MAIS
 * as globais (workspace_id nulo) -- mesmo padrão global+específico já usado
 * por listCategories (categoryService.js). Sem `workspaceId`, retorna todas
 * as notificações do usuário (qualquer workspace).
 */
export async function listNotifications(userId, { workspaceId, limit = 50 } = {}) {
  if (!supabase) return createUnavailableResult([]);
  if (!userId) return createMissingUserResult();

  let query = supabase
    .from('notifications')
    .select(NOTIFICATION_FIELDS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (workspaceId) {
    query = query.or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);
  }

  const { data, error } = await query;
  return createResult(data ?? [], error);
}

/**
 * Retorna compromissos que ja possuem notificacao materializada. O escopo
 * inclui usuario, workspace e tipo para impedir deduplicacao cruzada.
 */
export async function listAgendaNotificationItemIds(userId, workspaceId) {
  if (!supabase) return createUnavailableResult([]);
  if (!userId) return createMissingUserResult();

  const { data, error } = await supabase
    .from('notifications')
    .select('metadata')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('type', 'agenda');

  const itemIds = (data ?? [])
    .map((notification) => notification.metadata?.agenda_item_id)
    .filter((itemId) => typeof itemId === 'string' && itemId);

  return createResult(itemIds, error);
}

export async function markNotificationAsRead(userId, notificationId) {
  if (!supabase) return createUnavailableResult(null);
  if (!userId) return createMissingUserResult();

  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select(NOTIFICATION_FIELDS)
    .maybeSingle();

  return createResult(data, error);
}

export async function markAllNotificationsAsRead(userId, { workspaceId } = {}) {
  if (!supabase) return createUnavailableResult([]);
  if (!userId) return createMissingUserResult();

  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (workspaceId) {
    query = query.or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);
  }

  const { data, error } = await query.select(NOTIFICATION_FIELDS);
  return createResult(data ?? [], error);
}

/**
 * NOTIF2: dispensa (exclui) UMA notificação do próprio usuário. Nunca afeta
 * o compromisso/registro de origem -- só a linha em notifications some (o
 * cascade de agenda_item_id cuida do caso "excluí o compromisso" à parte,
 * direto no banco).
 */
export async function deleteNotification(userId, notificationId) {
  if (!supabase) return createUnavailableResult(null);
  if (!userId) return createMissingUserResult();

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', userId);

  return createResult(notificationId, error);
}

/**
 * Cria uma notificação para o PRÓPRIO usuário (RLS garante user_id =
 * auth.uid(), nunca para outra pessoa). Usada tanto por eventos reais e
 * seguros já existentes quanto para validar a interface quando ainda não
 * há uma origem real adequada. Nunca lança: falha aqui não deve derrubar
 * o fluxo que a chamou.
 */
export async function createNotification(userId, {
  workspaceId = null,
  type,
  title,
  message = '',
  actionUrl = null,
  metadata = {},
} = {}) {
  if (!supabase) return createUnavailableResult(null);
  if (!userId) return createMissingUserResult();

  if (typeof title !== 'string' || !title.trim()) {
    return createResult(null, {
      code: 'INVALID_NOTIFICATION_REQUEST',
      message: 'Titulo da notificacao e obrigatorio.',
    });
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      type,
      title: title.trim(),
      message,
      action_url: actionUrl,
      metadata,
    })
    .select(NOTIFICATION_FIELDS)
    .single();

  return createResult(data, error);
}
