export const PERSONAL_PLAN_PROMOTION_DURATION_MS = 11 * 60 * 1000;
export const PERSONAL_PLAN_PROMOTION_STORAGE_KEY = 'uniflow:personal-plan:promotion-expires-at:v1';
export const PERSONAL_PLAN_PROMOTION_DOCUMENT_KEY = 'uniflow:personal-plan:promotion-document:v1';

export function getPromotionDocumentContext(runtime = globalThis) {
  const navigationEntry = runtime?.performance?.getEntriesByType?.('navigation')?.[0];
  const navigationType = navigationEntry?.type ?? 'navigate';
  const timeOrigin = Number(runtime?.performance?.timeOrigin);

  return {
    navigationType,
    documentId: Number.isFinite(timeOrigin) && timeOrigin > 0
      ? String(timeOrigin)
      : null,
  };
}

export function resolvePromotionExpiry(
  storage,
  now = Date.now(),
  {
    canStartNewWindow = true,
    navigationType = null,
    documentId = null,
  } = {},
) {
  const storedExpiry = Number(storage?.getItem?.(PERSONAL_PLAN_PROMOTION_STORAGE_KEY));
  const hasStoredExpiry = Number.isFinite(storedExpiry) && storedExpiry > 0;

  if (!canStartNewWindow) {
    return hasStoredExpiry ? storedExpiry : null;
  }

  const previousDocumentId = storage?.getItem?.(PERSONAL_PLAN_PROMOTION_DOCUMENT_KEY) ?? null;
  const isNewDocument = Boolean(documentId && documentId !== previousDocumentId);
  const isNewApplicationEntry = isNewDocument && navigationType === 'navigate';

  if (hasStoredExpiry && !isNewApplicationEntry) {
    try {
      if (documentId) {
        storage?.setItem?.(PERSONAL_PLAN_PROMOTION_DOCUMENT_KEY, documentId);
      }
    } catch {
      // The existing window remains usable when storage is restricted.
    }
    return storedExpiry;
  }

  const expiresAt = now + PERSONAL_PLAN_PROMOTION_DURATION_MS;

  try {
    storage?.setItem?.(PERSONAL_PLAN_PROMOTION_STORAGE_KEY, String(expiresAt));
    if (documentId) {
      storage?.setItem?.(PERSONAL_PLAN_PROMOTION_DOCUMENT_KEY, documentId);
    }
  } catch {
    // The current window still gets an accurate timestamp without storage.
  }

  return expiresAt;
}

export function getPromotionRemainingSeconds(expiresAt, now = Date.now()) {
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

export function splitPromotionCountdown(totalSeconds) {
  const safeTotal = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeTotal / 3600);
  const minutes = Math.floor((safeTotal % 3600) / 60);
  const seconds = safeTotal % 60;

  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}
