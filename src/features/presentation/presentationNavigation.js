import { PRESENTATION_SLIDES } from './presentationConfig.js';

const LAST_SLIDE_INDEX = PRESENTATION_SLIDES.length - 1;
const SWIPE_THRESHOLD = 42;

export function clampPresentationIndex(index) {
  if (!Number.isFinite(index)) return 0;
  return Math.min(LAST_SLIDE_INDEX, Math.max(0, Math.trunc(index)));
}

export function getAdjacentPresentationIndex(index, direction) {
  return clampPresentationIndex(index + (direction > 0 ? 1 : -1));
}

export function getSwipeDirection(startX, endX) {
  if (!Number.isFinite(startX) || !Number.isFinite(endX)) return 0;
  const distance = startX - endX;
  if (Math.abs(distance) < SWIPE_THRESHOLD) return 0;
  return distance > 0 ? 1 : -1;
}

