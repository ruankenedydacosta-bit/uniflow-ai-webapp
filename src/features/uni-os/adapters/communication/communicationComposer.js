import { UNI_OS_ENABLED } from '../featureFlags.js';
import { adaptEmotion } from './emotionAdapter.js';
import { adaptPersonality } from './personalityAdapter.js';
import { createCommunicationSnapshot } from './communicationSchema.js';

const EMOTION_TONES = Object.freeze({
  CALM: 'calm',
  OBJECTIVE: 'objective',
  EDUCATIONAL: 'educational',
  EMPATHETIC: 'empathetic',
  ENCOURAGING: 'encouraging',
  CELEBRATING: 'celebratory',
  CAREFUL: 'careful',
  URGENT: 'urgent_calm',
  FOCUSED: 'focused',
  SUPPORTIVE: 'supportive',
});

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uni-communication-${Date.now().toString(36)}`;
}

export function composeCommunication(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory;
  const emotion = adaptEmotion(source);
  const personality = adaptPersonality(source);
  return createCommunicationSnapshot({
    communicationId: idFactory(),
    timestamp: now(),
    emotion,
    personality: personality.personality,
    tone: EMOTION_TONES[emotion],
    verbosity: personality.verbosity,
    communicationStyle: personality.communicationStyle,
  });
}

export function logCommunicationSummary(logger, communication) {
  logger.info?.('[UNI OS] Communication', {
    emotion: communication.emotion,
    personality: communication.personality,
    tone: communication.tone,
    verbosity: communication.verbosity,
    communicationStyle: communication.communicationStyle,
  });
}

export async function runCommunicationShadow(input, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', communication: null });

  try {
    const communication = composeCommunication(input, options.adapterOptions);
    if (typeof options.observer === 'function') await options.observer(communication);
    if (options.isDevelopment === true) {
      logCommunicationSummary(options.logger ?? console, communication);
    }
    return Object.freeze({ status: 'OBSERVED', communication: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Communication failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', communication: null });
  }
}
