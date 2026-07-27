import {
  createPendingActionStack,
  getActivePendingAction,
  pushPendingAction,
  validatePendingActionStack,
} from './pendingActionStack.js';

export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;
const STORAGE_PREFIX = 'uniflow.uni.pending-action.v1';
const STORAGE_VERSION = 2;

function getStorageKey({ userId, workspaceId, conversationId }, prefix = STORAGE_PREFIX) {
  if (![userId, workspaceId, conversationId].every((value) => typeof value === 'string' && value)) {
    return null;
  }
  return `${prefix}:${userId}:${workspaceId}:${conversationId}`;
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
    const emptyStack = createPendingActionStack(identity, { now });
    const transition = pushPendingAction(emptyStack, {
      id: snapshot.action.clientOperationId
        ?? `legacy:${snapshot.action.intent ?? 'action'}:${now}`,
      type: snapshot.action.intent ?? 'legacy_action',
      status: snapshot.action.status === 'ready'
        ? 'awaiting_confirmation'
        : 'pending',
      deduplicationKey: snapshot.action.clientOperationId ?? null,
      fields: { snapshot },
      context: {
        source: 'legacy_pending_action',
      },
    }, { now });
    storage?.setItem(key, JSON.stringify({
      version: STORAGE_VERSION,
      expiresAt: now + PENDING_ACTION_TTL_MS,
      stack: transition.stack,
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
    if (!Number.isFinite(parsed?.expiresAt) || parsed.expiresAt <= now) {
      storage?.removeItem(key);
      return null;
    }
    if (parsed.version === 1) {
      if (!parsed.snapshot?.action) storage?.removeItem(key);
      return parsed.snapshot?.action ? parsed.snapshot : null;
    }
    if (
      parsed.version !== STORAGE_VERSION
      || !validatePendingActionStack(parsed.stack, identity)
    ) {
      storage?.removeItem(key);
      return null;
    }
    return getActivePendingAction(parsed.stack)?.fields?.snapshot ?? null;
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

export function savePendingActionStack(
  identity,
  stack,
  storage = globalThis.sessionStorage,
  now = Date.now(),
) {
  const key = getStorageKey(identity);
  if (!key || !validatePendingActionStack(stack, identity)) return false;
  try {
    storage?.setItem(key, JSON.stringify({
      version: STORAGE_VERSION,
      expiresAt: now + PENDING_ACTION_TTL_MS,
      stack,
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingActionStack(
  identity,
  storage = globalThis.sessionStorage,
  now = Date.now(),
) {
  const key = getStorageKey(identity);
  if (!key) return null;
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? 'null');
    if (
      parsed?.version !== STORAGE_VERSION
      || !Number.isFinite(parsed.expiresAt)
      || parsed.expiresAt <= now
      || !validatePendingActionStack(parsed.stack, identity)
    ) {
      storage?.removeItem(key);
      return null;
    }
    return parsed.stack;
  } catch {
    storage?.removeItem(key);
    return null;
  }
}

export function clearPendingActionStack(identity, storage = globalThis.sessionStorage) {
  const key = getStorageKey(identity);
  if (!key) return false;
  try {
    storage?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
