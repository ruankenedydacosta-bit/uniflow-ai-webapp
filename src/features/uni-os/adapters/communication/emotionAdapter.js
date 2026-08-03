import { resolveCommunicationEmotion } from './emotionEngine.js';

export function adaptEmotion({ structuredResponse = {}, contextSnapshot = {} } = {}) {
  return resolveCommunicationEmotion({ structuredResponse, contextSnapshot });
}
