export function createVoiceTtsRequestOwnership() {
  let currentRequestId = 0;
  return Object.freeze({
    begin() {
      currentRequestId += 1;
      return currentRequestId;
    },
    invalidate() {
      currentRequestId += 1;
    },
    isCurrent(requestId) {
      return requestId === currentRequestId;
    },
  });
}
