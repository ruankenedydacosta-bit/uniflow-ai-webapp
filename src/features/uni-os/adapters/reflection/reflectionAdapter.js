import { UNI_OS_ENABLED } from '../featureFlags.js';
import { analyzePlanningSnapshot } from './reflectionAnalyzer.js';
import { createReflectionSnapshot } from './reflectionSchema.js';

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uni-reflection-${Date.now().toString(36)}`;
}

export function adaptReflectionInput(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory;
  const analysis = analyzePlanningSnapshot({
    parsedIntent: source.parsedIntent,
    contextSnapshot: source.contextSnapshot,
    memorySnapshot: source.memorySnapshot,
    planningSnapshot: source.planningSnapshot,
  });

  return createReflectionSnapshot({
    reflectionId: idFactory(),
    timestamp: now(),
    ...analysis,
  });
}

export function logReflectionSummary(logger, reflection) {
  logger.info?.('[UNI OS] Reflection', {
    risk: reflection.overallRisk,
    confidence: reflection.confidence,
    recommendations: reflection.recommendations,
    flags: {
      confirmationRequired: reflection.confirmationRequired,
      ambiguityDetected: reflection.ambiguityDetected,
      inconsistencyCount: reflection.inconsistencies.length,
      executionAllowed: reflection.executionAllowed,
    },
  });
}

export async function runReflectionAdapterShadow(input, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', reflection: null });

  try {
    const reflection = adaptReflectionInput(input, options.adapterOptions);
    if (typeof options.observer === 'function') await options.observer(reflection);
    if (options.isDevelopment === true) {
      logReflectionSummary(options.logger ?? console, reflection);
    }
    return Object.freeze({ status: 'OBSERVED', reflection: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Reflection shadow validation failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', reflection: null });
  }
}
