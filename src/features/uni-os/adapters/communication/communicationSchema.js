import {
  COMMUNICATION_EMOTIONS,
} from './emotionEngine.js';
import {
  COMMUNICATION_PERSONALITIES,
} from './personalityEngine.js';

export const UNI_OS_COMMUNICATION_SCHEMA_VERSION = '1.0';
export const COMMUNICATION_TONES = Object.freeze([
  'calm', 'objective', 'educational', 'empathetic', 'encouraging',
  'celebratory', 'careful', 'urgent_calm', 'focused', 'supportive',
]);
export const COMMUNICATION_VERBOSITY = Object.freeze(['CONCISE', 'BALANCED', 'STRUCTURED']);
export const COMMUNICATION_STYLES = Object.freeze([
  'BALANCED_GUIDANCE', 'DIRECT_CLARITY', 'WARM_GUIDANCE', 'STRATEGIC_CLARITY',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createCommunicationSnapshot(input = {}) {
  return deepFreeze({
    communicationId: typeof input.communicationId === 'string' ? input.communicationId : '',
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    emotion: COMMUNICATION_EMOTIONS.includes(input.emotion) ? input.emotion : 'CALM',
    personality: COMMUNICATION_PERSONALITIES.includes(input.personality)
      ? input.personality
      : 'DIDACTIC',
    tone: COMMUNICATION_TONES.includes(input.tone) ? input.tone : 'calm',
    verbosity: COMMUNICATION_VERBOSITY.includes(input.verbosity)
      ? input.verbosity
      : 'BALANCED',
    communicationStyle: COMMUNICATION_STYLES.includes(input.communicationStyle)
      ? input.communicationStyle
      : 'BALANCED_GUIDANCE',
    outputChannel: null,
    voiceProfile: null,
    executionAllowed: false,
    metadata: {
      version: UNI_OS_COMMUNICATION_SCHEMA_VERSION,
    },
  });
}
