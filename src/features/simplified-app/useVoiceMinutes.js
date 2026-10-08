import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMyVoiceBalance } from '../../services/voiceQuotaService.js';
import { resolveVoiceMinutes } from './voiceMinutesPresentation.js';

// O voice_close da conversa sai sem esperar resposta. Até ele gravar, o saldo
// conta o bloco reservado inteiro como gasto.
export const VOICE_BALANCE_AFTER_CLOSE_DELAY_MS = 1500;

// O chip conta o tempo da conversa em andamento neste ritmo.
const LIVE_TICK_MS = 5000;

// Último saldo lido, por pessoa: a Home remonta a cada toque no orb vindo de
// outra aba, e sem isso abriria a conversa sem saber que o saldo zerou.
let lastKnownBalance = null;

function readCachedBalance(userId) {
  return userId && lastKnownBalance?.userId === userId ? lastKnownBalance : null;
}

// Saldo de minutos de voz para a Home e a tela de voz (tela 19).
// - Só se lê o saldo sem conversa aberta: com uma aberta, o banco desconta o
//   bloco reservado inteiro e o saldo pareceria menor (ou zerado).
// - Durante a conversa, o tempo dela sai do saldo lido antes de começar.
// - Uma falha de leitura mantém o último saldo conhecido: o servidor recusa
//   a conversa de qualquer jeito quando os minutos acabam.
export function useVoiceMinutes({ enabled, userId, sessionStartedAt = null, sessionEndedAt = null }) {
  const [snapshot, setSnapshot] = useState(() => readCachedBalance(userId));
  const [now, setNow] = useState(() => Date.now());
  const lastRequestRef = useRef(0);
  const isMountedRef = useRef(true);

  const refresh = useCallback(() => {
    if (!enabled || !userId) return;
    const requestId = lastRequestRef.current + 1;
    lastRequestRef.current = requestId;
    const readAt = Date.now();
    getMyVoiceBalance().then(({ data, error }) => {
      if (!isMountedRef.current || requestId !== lastRequestRef.current || error) return;
      const next = { userId, balance: data ?? null, readAt };
      lastKnownBalance = next;
      setSnapshot(next);
    });
  }, [enabled, userId]);

  useEffect(() => {
    isMountedRef.current = true;
    refresh();
    return () => {
      isMountedRef.current = false;
    };
  }, [refresh]);

  const isLive = sessionStartedAt !== null && sessionEndedAt === null;
  useEffect(() => {
    if (!isLive) return undefined;
    const interval = setInterval(() => setNow(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(interval);
  }, [isLive]);

  // Depois do fim da conversa, relê o saldo já com o tempo cobrado.
  useEffect(() => {
    if (sessionEndedAt === null) return undefined;
    const timer = setTimeout(refresh, VOICE_BALANCE_AFTER_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sessionEndedAt, refresh]);

  const current = snapshot?.userId === userId ? snapshot : null;
  const spentSeconds = current && sessionStartedAt !== null && current.readAt <= sessionStartedAt
    ? Math.floor(Math.max(0, (sessionEndedAt ?? now) - sessionStartedAt) / 1000)
    : 0;
  const voiceMinutes = useMemo(
    () => (enabled ? resolveVoiceMinutes(current?.balance, { spentSeconds }) : null),
    [current, enabled, spentSeconds],
  );
  return { voiceMinutes, refresh };
}
