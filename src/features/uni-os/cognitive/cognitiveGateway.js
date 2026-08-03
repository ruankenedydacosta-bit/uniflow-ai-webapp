export const COGNITIVE_GATEWAY_STATUS = Object.freeze({
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

export async function requestCognitiveProcessing() {
  return Object.freeze({
    status: COGNITIVE_GATEWAY_STATUS.NOT_IMPLEMENTED,
    data: null,
    provider: null,
    externalCallMade: false,
  });
}
