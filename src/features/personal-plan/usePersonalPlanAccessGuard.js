import { useEffect, useRef, useState } from 'react';
import { getSubscription } from '../../services/billingService.js';
import { resolvePersonalPlanAccess } from './resolvePersonalPlanAccess.js';

// GUARD FIX: consulta real de acesso ao Plano Pessoal -- App.jsx usava
// isPersonalPlanCompleted() (localStorage) como autorização, o que liberava
// /app/home para quem nunca teve assinatura real (ou cujo status mudou
// depois: cancelou, ficou pending/past_due/suspended). Este hook é a única
// fonte de verdade para o guard de rota: 'loading' enquanto a consulta real
// acontece (nunca decide com dado velho/local), 'active' só com
// internal_status === 'active' confirmado agora, 'blocked' em qualquer
// outro caso -- inclusive erro de rede (nunca libera acesso sem
// confirmação real).
//
// `revalidateWhenLeavingRoute`: booleano que representa "estou numa rota do
// fluxo do Plano Pessoal agora" (ex.: isPersonalPlanRoute em App.jsx). Ao
// virar de true->false (usuário acabou de sair de /plano-pessoal ou da
// rota de retorno do Checkout), o hook refaz a consulta -- é o único
// momento em que o status pode legitimamente ter mudado dentro da mesma
// sessão (assinatura criada/confirmada).
export function usePersonalPlanAccessGuard({ workspaceId, enabled, revalidateWhenLeavingRoute = false }) {
  const [status, setStatus] = useState('idle'); // idle | loading | active | blocked
  const wasOnPersonalPlanRoute = useRef(revalidateWhenLeavingRoute);

  useEffect(() => {
    // Deferido via setTimeout(0) -- mesmo padrão já usado em
    // PersonalPlanPage.jsx/useTransactions.js -- evita disparar setState
    // sincrono direto no corpo do efeito.
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      if (!enabled) {
        setStatus('idle');
        return;
      }
      if (!workspaceId) {
        // Sessão ainda sem workspace resolvido -- nunca decide sem dado real.
        setStatus('loading');
        return;
      }
      setStatus('loading');
      getSubscription({ workspaceId }).then(({ data, error }) => {
        if (cancelled) return;
        // Falha de rede/backend: nunca libera acesso sem confirmação real.
        setStatus(error ? 'blocked' : resolvePersonalPlanAccess(data));
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timeoutId); };
  }, [workspaceId, enabled]);

  useEffect(() => {
    const was = wasOnPersonalPlanRoute.current;
    wasOnPersonalPlanRoute.current = revalidateWhenLeavingRoute;
    if (!enabled || !workspaceId || !(was && !revalidateWhenLeavingRoute)) return undefined;

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setStatus('loading');
      getSubscription({ workspaceId }).then(({ data, error }) => {
        if (cancelled) return;
        setStatus(error ? 'blocked' : resolvePersonalPlanAccess(data));
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timeoutId); };
  }, [revalidateWhenLeavingRoute, enabled, workspaceId]);

  return { status };
}
