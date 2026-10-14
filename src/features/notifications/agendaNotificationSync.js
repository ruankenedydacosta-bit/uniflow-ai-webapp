import { listDueAgendaItemsForUser } from '../../services/agendaService.js';
import {
  createNotification,
  listAgendaNotificationItemIds,
} from './notificationsService.js';
import { formatAgendaNotificationTime } from './notificationFormatting.js';

const syncsByScope = new Map();
const MINUTE_MS = 60_000;
const CLOCK_SETTLE_MS = 250;

function createSyncResult(created = [], error = null) {
  return { data: { created }, error };
}

function belongsToUser(item, userId) {
  if (item?.assigned_user_id) return item.assigned_user_id === userId;
  return item?.created_by === userId;
}

function isDueScheduledItem(item, userId, workspaceId, now) {
  if (
    !item
    || item.workspace_id !== workspaceId
    || item.status !== 'scheduled'
    || !belongsToUser(item, userId)
  ) return false;

  const startsAt = new Date(item.starts_at);
  return !Number.isNaN(startsAt.getTime()) && startsAt.getTime() <= now.getTime();
}

export function getNextAgendaNotificationDelay(nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) return MINUTE_MS;
  return MINUTE_MS - (nowMs % MINUTE_MS) + CLOCK_SETTLE_MS;
}

export async function syncDueAgendaNotificationsOnce(userId, workspaceId, {
  now = new Date(),
  listDueItems = listDueAgendaItemsForUser,
  listNotifiedItemIds = listAgendaNotificationItemIds,
  create = createNotification,
  timeZone,
} = {}) {
  if (!userId || !workspaceId) return createSyncResult();

  try {
    const dueResult = await listDueItems(workspaceId, userId, { dueAt: now.toISOString() });
    if (dueResult?.error) return createSyncResult([], dueResult.error);

    const existingResult = await listNotifiedItemIds(userId, workspaceId);
    if (existingResult?.error) return createSyncResult([], existingResult.error);

    const notifiedItemIds = new Set(existingResult?.data ?? []);
    const created = [];
    let firstError = null;

    for (const item of dueResult?.data ?? []) {
      if (!isDueScheduledItem(item, userId, workspaceId, now) || notifiedItemIds.has(item.id)) {
        continue;
      }

      const result = await create(userId, {
        workspaceId,
        type: 'agenda',
        title: item.title,
        // Texto gravado: sempre com a data, nunca "Hoje" (envelheceria no banco).
        // O painel recalcula o relativo a partir de metadata.agenda_starts_at.
        message: formatAgendaNotificationTime(item.starts_at, { timeZone, now: null }),
        actionUrl: '/app/agenda',
        metadata: {
          agenda_item_id: item.id,
          agenda_starts_at: item.starts_at,
          source: 'agenda_due_sync_v2',
        },
      });

      if (result?.error) {
        firstError ??= result.error;
        continue;
      }

      notifiedItemIds.add(item.id);
      if (result?.data) created.push(result.data);
    }

    return createSyncResult(created, firstError);
  } catch (error) {
    return createSyncResult([], {
      code: 'AGENDA_NOTIFICATION_SYNC_FAILED',
      message: 'Nao foi possivel sincronizar os lembretes da Agenda.',
      cause: error,
    });
  }
}

export function syncDueAgendaNotifications(userId, workspaceId, options) {
  if (!userId || !workspaceId) return Promise.resolve(createSyncResult());

  const scopeKey = `${userId}:${workspaceId}`;
  const currentSync = syncsByScope.get(scopeKey);
  if (currentSync) return currentSync;

  const nextSync = syncDueAgendaNotificationsOnce(userId, workspaceId, options)
    .finally(() => syncsByScope.delete(scopeKey));
  syncsByScope.set(scopeKey, nextSync);
  return nextSync;
}
