import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../../app/SessionContext.jsx';
import { isSupabaseConfigured } from '../../services/supabaseClient.js';
import {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  dismissNotification as dismissNotificationService,
} from './notificationsService.js';
import {
  getNextAgendaNotificationDelay,
  syncDueAgendaNotifications,
} from './agendaNotificationSync.js';
import { countUnread } from './notificationFormatting.js';

const EMPTY_LIST = [];

/**
 * Fonte única de contagem e lista de notificações -- usada tanto pelo sino
 * desktop (Topbar) quanto pelo painel mobile, sem estado duplicado. Chave
 * exclusivamente pelo `user.id` da sessão (nunca por workspaceId sozinho):
 * ao trocar/perder o usuário (logout, novo login), a lista é sempre
 * recarregada do zero -- nunca preserva notificações do usuário anterior.
 */
export function useNotifications() {
  const { user, workspace } = useSession();
  const userId = user?.id ?? null;
  const workspaceId = workspace?.id ?? null;

  const [notifications, setNotifications] = useState(EMPTY_LIST);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured || !userId) {
      setNotifications(EMPTY_LIST);
      setError(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    await syncDueAgendaNotifications(userId, workspaceId);
    const result = await listNotifications(userId, { workspaceId });

    if (requestId !== requestIdRef.current) return null;

    setNotifications(result.data ?? EMPTY_LIST);
    setError(result.error);
    setIsLoading(false);
    return result;
  }, [userId, workspaceId]);

  useEffect(() => {
    // Troca/perda de usuário invalida qualquer requisição em andamento do
    // usuário anterior -- a resposta tardia dela nunca sobrescreve o estado
    // do usuário novo. setTimeout(0) evita setState sincrono dentro do
    // efeito (mesmo padrao de useGoals.js).
    requestIdRef.current += 1;
    const timeoutId = window.setTimeout(() => refresh(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  useEffect(() => {
    if (!userId || !workspaceId) return undefined;

    let minuteTimerId = null;
    let disposed = false;
    let scheduleGeneration = 0;
    let foregroundRefreshPromise = null;

    const scheduleNextMinute = (generation = scheduleGeneration) => {
      if (disposed || generation !== scheduleGeneration) return;
      minuteTimerId = window.setTimeout(async () => {
        try {
          if (document.visibilityState === 'visible') await refresh();
        } finally {
          scheduleNextMinute(generation);
        }
      }, getNextAgendaNotificationDelay());
    };

    const handleForeground = () => {
      if (document.visibilityState !== 'visible' || foregroundRefreshPromise) return;
      scheduleGeneration += 1;
      const generation = scheduleGeneration;
      if (minuteTimerId) window.clearTimeout(minuteTimerId);
      foregroundRefreshPromise = Promise.resolve(refresh())
        .catch(() => null)
        .finally(() => {
          foregroundRefreshPromise = null;
          scheduleNextMinute(generation);
        });
    };

    scheduleNextMinute();
    document.addEventListener('visibilitychange', handleForeground);
    document.addEventListener('resume', handleForeground);
    window.addEventListener('focus', handleForeground);
    window.addEventListener('pageshow', handleForeground);
    window.addEventListener('online', handleForeground);
    return () => {
      disposed = true;
      scheduleGeneration += 1;
      if (minuteTimerId) window.clearTimeout(minuteTimerId);
      document.removeEventListener('visibilitychange', handleForeground);
      document.removeEventListener('resume', handleForeground);
      window.removeEventListener('focus', handleForeground);
      window.removeEventListener('pageshow', handleForeground);
      window.removeEventListener('online', handleForeground);
    };
  }, [refresh, userId, workspaceId]);

  const markAsRead = useCallback(async (notificationId) => {
    if (!isSupabaseConfigured || !userId) return null;

    const result = await markNotificationAsRead(userId, notificationId);
    if (!result.error) {
      setNotifications((current) => current.map((n) => (
        n.id === notificationId ? { ...n, read_at: result.data?.read_at ?? new Date().toISOString() } : n
      )));
    }
    return result;
  }, [userId]);

  const markAllAsRead = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) return null;

    const result = await markAllNotificationsAsRead(userId, { workspaceId });
    if (!result.error) {
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((n) => (
        n.read_at ? n : { ...n, read_at: readAt }
      )));
    }
    return result;
  }, [userId, workspaceId]);

  // NOTIF3: remoção otimista -- some da lista imediatamente (arrastar/X
  // precisa parecer instantâneo), e só volta se a persistência falhar de
  // fato no servidor. Persistência é soft-delete (dismissed_at), nunca
  // exclusão física -- nunca mexe no compromisso/registro de origem, só
  // esta notificação.
  const dismissNotification = useCallback(async (notificationId) => {
    if (!isSupabaseConfigured || !userId) return null;

    const previous = notifications;
    setNotifications((current) => current.filter((n) => n.id !== notificationId));

    const result = await dismissNotificationService(userId, notificationId);
    if (result.error) {
      setNotifications(previous);
    }
    return result;
  }, [notifications, userId]);

  return {
    notifications,
    unreadCount: countUnread(notifications),
    isLoading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
    dismissNotification,
  };
}
