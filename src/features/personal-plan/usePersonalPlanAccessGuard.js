import { useEffect, useState } from 'react';
import { getSubscription } from '../../services/billingService.js';
import { resolvePersonalPlanAccess } from './resolvePersonalPlanAccess.js';

// Revalidate persisted backend state without repeatedly querying Asaas. The
// lifecycle worker/webhook owns financial reconciliation and access changes.
export function usePersonalPlanAccessGuard({ workspaceId, enabled, revalidateWhenLeavingRoute = false }) {
  const [status, setStatus] = useState('idle');
  const [statusWorkspaceId, setStatusWorkspaceId] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function refresh(initial = false) {
      if (cancelled || inFlight) return;
      if (!enabled) { setStatus('idle'); return; }
      if (!workspaceId) { setStatusWorkspaceId(null); setStatus('blocked'); return; }
      inFlight = true;
      if (initial) { setStatusWorkspaceId(workspaceId); setStatus('loading'); }
      try {
        const { data, error } = await getSubscription({ workspaceId, localOnly: true });
        if (!cancelled) setStatus(error ? 'blocked' : resolvePersonalPlanAccess(data));
      } catch {
        if (!cancelled) setStatus('blocked');
      } finally {
        inFlight = false;
      }
    }
    const timeoutId = window.setTimeout(() => refresh(true), 0);
    const onFocus = () => { if (!document.hidden) refresh(); };
    const intervalId = window.setInterval(onFocus, 30_000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [workspaceId, enabled, revalidateWhenLeavingRoute]);
  // A previous workspace's result cannot authorize the first render after a
  // workspace change, even before the deferred effect has started.
  return { status: !enabled || statusWorkspaceId !== workspaceId ? 'idle' : status };
}
