import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { LLM_ADAPTER_REQUIRED_METHODS } from './adapterContracts.js';
import { createAdapterInterfaceSchema } from './adapterSchema.js';
import { validateAdapterDefinition } from './adapterValidator.js';

export class LLMAdapterInterfaceValidationError extends Error {
  constructor(errors) {
    super('LLM adapter interface validation failed.');
    this.name = 'LLMAdapterInterfaceValidationError';
    this.codes = Object.freeze([...errors]);
  }
}

export function createLLMAdapterInterface(definition = {}) {
  const validation = validateAdapterDefinition(definition);
  if (!validation.valid) throw new LLMAdapterInterfaceValidationError(validation.errors);
  return createAdapterInterfaceSchema(definition);
}

export function logLLMAdapterInterfaceSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Adapter Interface Loaded', {
    contractVersion: snapshot.version,
    supportedMethods: LLM_ADAPTER_REQUIRED_METHODS,
  });
}

export async function runLLMAdapterInterfaceShadow(definition = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', adapterInterface: null });

  try {
    const snapshot = createLLMAdapterInterface(definition);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) {
      logLLMAdapterInterfaceSummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({ status: 'OBSERVED', adapterInterface: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Adapter Interface failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', adapterInterface: null });
  }
}

export const llmAdapterInterface = createLLMAdapterInterface({
  name: 'UNI_OS_LLM_ADAPTER_CONTRACT',
  version: '1.0',
  supportedCapabilities: [],
  supportsStreaming: false,
  supportsVision: false,
  supportsVoice: false,
  supportsStructuredOutput: false,
  supportsFunctionCalling: false,
  metadata: { abstract: true, implementationProvided: false },
});

