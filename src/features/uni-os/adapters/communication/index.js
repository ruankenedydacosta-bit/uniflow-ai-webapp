export { adaptEmotion } from './emotionAdapter.js';
export {
  COMMUNICATION_EMOTIONS,
  resolveCommunicationEmotion,
} from './emotionEngine.js';
export { adaptPersonality } from './personalityAdapter.js';
export {
  COMMUNICATION_PERSONALITIES,
  resolveCommunicationPersonality,
} from './personalityEngine.js';
export {
  composeCommunication,
  logCommunicationSummary,
  runCommunicationShadow,
} from './communicationComposer.js';
export {
  COMMUNICATION_STYLES,
  COMMUNICATION_TONES,
  COMMUNICATION_VERBOSITY,
  createCommunicationSnapshot,
  UNI_OS_COMMUNICATION_SCHEMA_VERSION,
} from './communicationSchema.js';
