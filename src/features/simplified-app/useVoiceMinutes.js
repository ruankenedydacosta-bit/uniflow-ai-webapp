import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMyVoiceBalance } from '../../services/voiceQuotaService.js';
import { resolveVoiceMinutes } from './voiceMinutesPresentation.js';

// Saldo de minutos de voz para a Home e a tela de voz (tela 19). Uma falha de
// leitura mantém o último saldo conhecido: o servidor recusa a conversa de
// qualquer jeito quando os minutos acabam.
export function useVoiceMinutes({ enabled }) {
  const [balance, setBalance] = useState(null);
  const lastRequestRef = useRef(0);
  const isMountedRef = useRef(true);

  const refresh = useCallback(() => {
    if (!enabled) return;
    const requestId = lastRequestRef.current + 1;
    lastRequestRef.current = requestId;
    getMyVoiceBalance().then(({ data, error }) => {
      if (!isMountedRef.current || requestId !== lastRequestRef.current || error) return;
      setBalance(data ?? null);
    });
  }, [enabled]);

  useEffect(() => {
    isMountedRef.current = true;
    refresh();
    return () => {
      isMountedRef.current = false;
    };
  }, [refresh]);

  const voiceMinutes = useMemo(() => (enabled ? resolveVoiceMinutes(balance) : null), [balance, enabled]);
  return { voiceMinutes, refresh };
}
