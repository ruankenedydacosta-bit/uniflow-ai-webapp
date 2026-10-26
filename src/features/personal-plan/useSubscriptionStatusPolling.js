import { useEffect, useRef, useState } from 'react';
import { getSubscription, syncSubscription } from '../../services/billingService.js';

// BLOCO FINAL DO MVP: consulta billing-get-subscription em intervalo
// controlado enquanto a assinatura está em um estado NÃO terminal
// (pending/past_due/suspended) -- para automaticamente ao chegar em
// active/canceled/expired, ou após MAX_ATTEMPTS (nunca um loop
// indefinido). Uma falha de rede NUNCA apaga o último estado conhecido --
// só marca o erro, preservando `status` para a tela continuar mostrando o
// que já sabia.
const DEFAULT_INTERVAL_MS = 4000;
const DEFAULT_MAX_ATTEMPTS = 30; // ~2 minutos no intervalo padrão
const RECONCILE_EVERY_ATTEMPTS = 3; // consulta a Asaas no máximo a cada 12s durante o polling
const TERMINAL_STATUSES = new Set(['active', 'canceled', 'expired']);

export function useSubscriptionStatusPolling({
  workspaceId,
  active,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
} = {}) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const attemptsRef = useRef(0);

  useEffect(() => {
    // isPolling já começa false e a limpeza do efeito anterior (abaixo)
    // garante que volta a false ao desativar -- nenhum setState extra
    // necessário aqui (evita setState síncrono direto no corpo do efeito).
    if (!active || !workspaceId) {
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;
    attemptsRef.current = 0;

    async function tick() {
      setIsPolling(true);
      attemptsRef.current += 1;
      if (attemptsRef.current % RECONCILE_EVERY_ATTEMPTS === 0) {
        // billing-get-subscription é leitura local; este fallback consulta a
        // Asaas e sincroniza o pagamento quando o webhook atrasar ou falhar.
        // O polling é limitado, e a reconciliação roda a cada terceiro tick.
        await syncSubscription({ workspaceId });
        if (cancelled) return;
      }
      const { data, error: fetchError } = await getSubscription({ workspaceId });
      if (cancelled) return;

      if (fetchError) {
        setError(fetchError);
      } else {
        setError(null);
        setStatus(data);
      }

      const isTerminal = Boolean(data?.exists && TERMINAL_STATUSES.has(data.internal_status));
      const reachedLimit = attemptsRef.current >= maxAttempts;
      if (isTerminal || reachedLimit || cancelled) {
        setIsPolling(false);
        return;
      }
      timeoutId = window.setTimeout(tick, intervalMs);
    }

    void tick();

    return () => {
      cancelled = true;
      setIsPolling(false);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [active, workspaceId, intervalMs, maxAttempts]);

  return { status, error, isPolling };
}
