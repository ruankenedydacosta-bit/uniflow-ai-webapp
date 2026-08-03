import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { createCognitiveContextSnapshot } from './contextBuilderSchema.js';
import { compileCognitiveContext } from './contextCompiler.js';

export function buildCognitiveContext(input = {}, options = {}) {
  const compiled = compileCognitiveContext(input, { now: options.now });
  return createCognitiveContextSnapshot(compiled);
}

export function logCognitiveContextSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Cognitive Context', {
    sections: Object.keys(snapshot.compiledContext),
    outputItems: snapshot.statistics.outputItems,
    executionAllowed: snapshot.metadata.executionAllowed,
  });
}

export async function runCognitiveContextBuilderShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', compiledContext: null });

  try {
    const snapshot = buildCognitiveContext(input, options.builderOptions);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) {
      logCognitiveContextSummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({ status: 'OBSERVED', compiledContext: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Cognitive Context failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', compiledContext: null });
  }
}

export const cognitiveContextBuilder = Object.freeze({ build: buildCognitiveContext });
