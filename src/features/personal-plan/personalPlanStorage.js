const PERSONAL_PLAN_STORAGE_PREFIX = 'uniflow.personal-plan.v1.completed';
const COMPLETED_VALUE = 'true';

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getPersonalPlanStorageKey(userId) {
  if (typeof userId !== 'string' || !userId.trim()) return null;
  return `${PERSONAL_PLAN_STORAGE_PREFIX}:${userId.trim()}`;
}

export function isPersonalPlanCompleted(userId, storage = getDefaultStorage()) {
  const key = getPersonalPlanStorageKey(userId);
  if (!key || !storage) return false;

  try {
    return storage.getItem(key) === COMPLETED_VALUE;
  } catch {
    return false;
  }
}

export function markPersonalPlanCompleted(userId, storage = getDefaultStorage()) {
  const key = getPersonalPlanStorageKey(userId);
  if (!key || !storage) return false;

  try {
    storage.setItem(key, COMPLETED_VALUE);
    return true;
  } catch {
    return false;
  }
}
