// One provider reconciliation on reload, only for an existing unpaid attempt.
// Active subscriptions and polling reads keep their existing local behavior.
export async function recoverPendingSubscription(result, { workspaceId, sync, read }) {
  if (result.error || !result.data?.exists || result.data.internal_status !== 'pending'
    || result.data.payment_method === 'pix_automatico') return result;
  try {
    const synced = await sync({ workspaceId });
    if (synced.error || !synced.data?.synced) return result;
    const refreshed = await read({ workspaceId, localOnly: true });
    return refreshed.error ? result : refreshed;
  } catch { return result; }
}
