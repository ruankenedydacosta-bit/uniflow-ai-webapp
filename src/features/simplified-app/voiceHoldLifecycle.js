export const MAX_VOICE_POINTER_CAPTURE_RECOVERIES = 2;

function readEventTimestamp(event) {
  const timestamp = Number(event?.timeStamp);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function createVoicePointerGesture(event) {
  return {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    startedAt: readEventTimestamp(event),
    captureStarted: false,
    captureRecoveryCount: 0,
  };
}

export function isVoicePointerEventForGesture(event, gesture) {
  if (!gesture || event?.pointerId !== gesture.pointerId) return false;

  const eventTimestamp = readEventTimestamp(event);
  if (eventTimestamp === null || gesture.startedAt === null) return true;

  return eventTimestamp >= gesture.startedAt;
}

export function recoverVoicePointerCapture({
  element,
  pointerId,
  visibilityState,
}) {
  if (
    visibilityState === 'hidden'
    || !element
    || typeof element.setPointerCapture !== 'function'
  ) return false;

  try {
    element.setPointerCapture(pointerId);
    return typeof element.hasPointerCapture !== 'function'
      || element.hasPointerCapture(pointerId);
  } catch {
    return false;
  }
}
