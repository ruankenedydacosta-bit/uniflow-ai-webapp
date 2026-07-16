export const AUDIO_REVIEW_STORAGE_KEY = 'uniflow.dev.audio-review.v1';
export const AUDIO_REVIEW_STATUSES = Object.freeze([
  'unreviewed',
  'approved',
  'review',
  'replace',
  'disable_future',
]);

const getDefaultStorage = () => globalThis.localStorage;

export function readAudioReviews(storage = getDefaultStorage()) {
  try {
    const parsed = JSON.parse(storage?.getItem(AUDIO_REVIEW_STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, review]) => (
      AUDIO_REVIEW_STATUSES.includes(review?.status)
      && typeof review?.note === 'string'
      && typeof review?.timestamp === 'string'
    )));
  } catch {
    return {};
  }
}

export function writeAudioReview(audioId, review, storage = getDefaultStorage(), now = Date.now()) {
  if (typeof audioId !== 'string' || !AUDIO_REVIEW_STATUSES.includes(review?.status)) {
    return readAudioReviews(storage);
  }
  const current = readAudioReviews(storage);
  const next = {
    ...current,
    [audioId]: {
      status: review.status,
      note: String(review.note ?? ''),
      timestamp: new Date(now).toISOString(),
    },
  };
  try {
    storage?.setItem(AUDIO_REVIEW_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return current;
  }
  return next;
}

export function createAudioReviewExport(reviews) {
  return Object.entries(reviews)
    .filter(([, review]) => review.status !== 'unreviewed' || review.note)
    .map(([audioId, review]) => ({
      audioId,
      status: review.status,
      observation: review.note,
      timestamp: review.timestamp,
    }))
    .sort((left, right) => left.audioId.localeCompare(right.audioId));
}

export function downloadAudioReviewJson(reviews, documentRef = globalThis.document) {
  const payload = JSON.stringify(createAudioReviewExport(reviews), null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = 'uniflow-audio-review-v1.json';
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
