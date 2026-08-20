import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../../app/SessionContext.jsx';
import { createNotification, hasUpdateNotification } from '../notifications/notificationsService.js';
import { isSupabaseConfigured } from '../../services/supabaseClient.js';
import { listActiveUpdates, listSeenUpdateIds, markUpdateAsSeen } from '../../services/uniUpdatesService.js';
import { buildNovidadeUrl, resolvePendingUpdate } from './uniUpdatesData.js';

const EMPTY_LIST = [];

const UPDATE_NOTIFICATION_TITLE = '🚀 Nova atualização da Uni';
const UPDATE_NOTIFICATION_MESSAGE = 'A Uni recebeu melhorias para deixar sua experiência ainda melhor.';

/**
 * UNIUPD1 -- fonte única da Central de Novidades da Uni. Parametrizado por
 * `limit` (mesmo padrão de useTransactions/useMonthlyReport) para que a
 * Home peça só o essencial (`limit: 1` -- a versão ativa mais recente já
 * basta para saber "existe pendente?") e "Sobre a UniFlow AI" peça o
 * histórico completo (sem limit), sem duplicar mecanismo nem estado
 * global entre as duas telas.
 *
 * A notificação companheira ("🚀 Nova atualização da Uni") é garantida
 * aqui dentro, não em um listener global novo -- ela dispara quando
 * QUALQUER instância deste hook detecta uma novidade pendente ainda não
 * notificada (dedup real fica no banco via hasUpdateNotification, o guard
 * local só evita chamadas repetidas a cada render da mesma instância).
 */
export function useUniUpdates({ limit } = {}) {
  const { user, workspace } = useSession();
  const userId = user?.id ?? null;
  const workspaceId = workspace?.id ?? null;
  const userCreatedAt = user?.created_at ?? null;

  const [updates, setUpdates] = useState(EMPTY_LIST);
  const [seenUpdateIds, setSeenUpdateIds] = useState(EMPTY_LIST);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const notifiedUpdateIdRef = useRef(null);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isSupabaseConfigured || !userId) {
      setUpdates(EMPTY_LIST);
      setSeenUpdateIds(EMPTY_LIST);
      setError(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    const [updatesResult, seenResult] = await Promise.all([
      listActiveUpdates({ limit }),
      listSeenUpdateIds(userId),
    ]);

    if (requestId !== requestIdRef.current) return null;

    setUpdates(updatesResult.data ?? EMPTY_LIST);
    setSeenUpdateIds(seenResult.data ?? EMPTY_LIST);
    setError(updatesResult.error ?? seenResult.error ?? null);
    setIsLoading(false);
    return { updatesResult, seenResult };
  }, [userId, limit]);

  useEffect(() => {
    // Mesmo padrão de useNotifications.js: setTimeout(0) evita setState
    // sincrono dentro do efeito de mount.
    requestIdRef.current += 1;
    const timeoutId = window.setTimeout(() => refresh(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const pendingUpdate = resolvePendingUpdate({ updates, seenUpdateIds, userCreatedAt });

  useEffect(() => {
    if (!pendingUpdate || !userId) return;
    if (notifiedUpdateIdRef.current === pendingUpdate.id) return;
    notifiedUpdateIdRef.current = pendingUpdate.id;

    (async () => {
      const existing = await hasUpdateNotification(userId, pendingUpdate.id);
      if (existing.error || existing.data) return;

      await createNotification(userId, {
        workspaceId,
        type: 'uni',
        title: UPDATE_NOTIFICATION_TITLE,
        message: UPDATE_NOTIFICATION_MESSAGE,
        actionUrl: buildNovidadeUrl(pendingUpdate.id),
        metadata: { update_id: pendingUpdate.id },
      });
    })();
  }, [pendingUpdate, userId, workspaceId]);

  // "Atualização concluída": nunca obriga leitura -- remove otimista o
  // destaque na hora, só reverte se a persistência falhar de verdade.
  const markAsSeen = useCallback(async (updateId) => {
    if (!isSupabaseConfigured || !userId || !updateId) return null;

    const previous = seenUpdateIds;
    setSeenUpdateIds((current) => (current.includes(updateId) ? current : [...current, updateId]));

    const result = await markUpdateAsSeen(userId, updateId);
    if (result.error) {
      setSeenUpdateIds(previous);
    }
    return result;
  }, [seenUpdateIds, userId]);

  const updatesWithSeen = updates.map((update) => ({
    ...update,
    seen: seenUpdateIds.includes(update.id),
  }));

  return {
    updates: updatesWithSeen,
    pendingUpdate,
    isLoading,
    error,
    markAsSeen,
    refresh,
  };
}
