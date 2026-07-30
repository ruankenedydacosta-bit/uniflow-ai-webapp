const PRESENTATION_STORAGE_PREFIX = 'uniflow.presentation.v1.completed';
const COMPLETED_VALUE = 'true';

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getPresentationStorageKey(userId) {
  if (typeof userId !== 'string' || !userId.trim()) return null;
  return `${PRESENTATION_STORAGE_PREFIX}:${userId.trim()}`;
}

export function isPresentationCompleted(userId, storage = getDefaultStorage()) {
  const key = getPresentationStorageKey(userId);
  if (!key || !storage) return false;

  try {
    return storage.getItem(key) === COMPLETED_VALUE;
  } catch {
    return false;
  }
}

export function markPresentationCompleted(userId, storage = getDefaultStorage()) {
  const key = getPresentationStorageKey(userId);
  if (!key || !storage) return false;

  try {
    storage.setItem(key, COMPLETED_VALUE);
    return true;
  } catch {
    return false;
  }
}

