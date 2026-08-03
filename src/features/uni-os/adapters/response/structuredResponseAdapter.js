import { UNI_OS_ENABLED } from '../featureFlags.js';
import { buildStructuredResponseSections } from './structuredResponseBuilder.js';
import { createStructuredResponseSnapshot } from './structuredResponseSchema.js';

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uni-response-${Date.now().toString(36)}`;
}

export function adaptStructuredResponse(input = {}, options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory;
  const sections = buildStructuredResponseSections(input);

  return createStructuredResponseSnapshot({
    responseId: idFactory(),
    timestamp: now(),
    ...sections,
    metadata: {
      generatedInShadowMode: options.generatedInShadowMode !== false,
    },
  });
}

export function logStructuredResponseSummary(logger, response) {
  logger.info?.('[UNI OS] Structured Response', {
    sections: ['facts', 'planning', 'reflection', 'security', 'permissions', 'cognition'],
    schemaVersion: response.metadata.schemaVersion,
    shadowMode: response.metadata.generatedInShadowMode,
    executionAllowed: response.executionAllowed,
  });
}

export async function runStructuredResponseShadow(input, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', response: null });

  try {
    const response = adaptStructuredResponse(input, options.adapterOptions);
    if (typeof options.observer === 'function') await options.observer(response);
    if (options.isDevelopment === true) {
      logStructuredResponseSummary(options.logger ?? console, response);
    }
    return Object.freeze({ status: 'OBSERVED', response: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Structured Response failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', response: null });
  }
}
