export const VOICE_REVIEW_STATUSES = Object.freeze(['approved', 'replace']);

export function validateVoiceReviewEntries(reviewEntries, catalogEntries) {
  if (!Array.isArray(reviewEntries) || !Array.isArray(catalogEntries)) return false;
  const catalogIds = new Set(catalogEntries.map((entry) => entry.id));
  const reviewIds = new Set();

  return reviewEntries.every((review) => {
    const valid = typeof review?.audioId === 'string'
      && catalogIds.has(review.audioId)
      && !reviewIds.has(review.audioId)
      && VOICE_REVIEW_STATUSES.includes(review.reviewStatus)
      && typeof review.reviewedAt === 'string'
      && !Number.isNaN(Date.parse(review.reviewedAt))
      && typeof review.reviewObservation === 'string'
      && review.reviewedBy === 'founder_manual_review_v1';
    reviewIds.add(review?.audioId);
    return valid;
  });
}

export function applyVoiceReview(catalogEntries, reviewEntries) {
  if (!validateVoiceReviewEntries(reviewEntries, catalogEntries)) {
    throw new Error('Revisão de áudio inválida.');
  }
  const reviewById = new Map(reviewEntries.map((review) => [review.audioId, review]));

  return catalogEntries.map((entry) => {
    const review = reviewById.get(entry.id);
    if (!review) {
      return {
        ...entry,
        reviewStatus: 'unreviewed',
        reviewedAt: null,
        reviewObservation: '',
        reviewedBy: null,
        replacementPending: false,
      };
    }
    if (review.reviewStatus === 'replace') {
      const eligibleEntry = { ...entry };
      delete eligibleEntry.disabledReason;
      return {
        ...eligibleEntry,
        ...review,
        replacementPending: true,
        replacementPriority: 'future',
        approvedForMvp: true,
        enabled: true,
      };
    }
    return {
      ...entry,
      ...review,
      replacementPending: false,
    };
  });
}
