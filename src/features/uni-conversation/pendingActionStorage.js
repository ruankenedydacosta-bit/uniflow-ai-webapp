export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;
const STORAGE_PREFIX = 'uniflow.uni.pending-action.v1';

function getStorageKey({ userId, workspaceId, conversationId }) {
  if (![userId, workspaceId, conversationId].every((value) => typeof value === 'string' && value)) {
    return null;
  }
  return `${STORAGE_PREFIX}:${userId}:${workspaceId}:${conversationId}`;
}

export function savePendingAction(
  identity,
  snapshot,
  storage = globalThis.sessionStorage,
  now = Date.now(),
) {
  const key = getStorageKey(identity);
  if (!key || !snapshot?.action) return false;
  try {
    storage?.setItem(key, JSON.stringify({
      version: 1,
      expiresAt: now + PENDING_ACTION_TTL_MS,
      snapshot,
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingAction(
  identity,
  storage = globalThis.sessionStorage,
  now = Date.now(),
) {
  const key = getStorageKey(identity);
  if (!key) return null;
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? 'null');
    if (
      parsed?.version !== 1
      || !parsed.snapshot?.action
      || !Number.isFinite(parsed.expiresAt)
      || parsed.expiresAt <= now
    ) {
      storage?.removeItem(key);
      return null;
    }
    return parsed.snapshot;
  } catch {
    storage?.removeItem(key);
    return null;
  }
}

export function clearPendingAction(identity, storage = globalThis.sessionStorage) {
  const key = getStorageKey(identity);
  if (!key) return false;
  try {
    storage?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
