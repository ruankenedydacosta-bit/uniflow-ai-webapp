import { validateAdapterCapabilities } from './adapterCapabilities.js';
import { getMissingAdapterMethods } from './adapterContracts.js';
import { LLM_ADAPTER_INTERFACE_VERSION } from './adapterSchema.js';

const BOOLEAN_FIELDS = Object.freeze([
  'supportsStreaming',
  'supportsVision',
  'supportsVoice',
  'supportsStructuredOutput',
  'supportsFunctionCalling',
]);

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

export function validateAdapterDefinition(definition) {
  const errors = [];
  if (!isRecord(definition)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['ADAPTER_DEFINITION_REQUIRED']) });
  }
  if (typeof definition.name !== 'string' || !definition.name.trim()) {
    errors.push('ADAPTER_NAME_REQUIRED');
  }
  if (typeof definition.version !== 'string' || !definition.version.trim()) {
    errors.push('ADAPTER_VERSION_REQUIRED');
  }
  errors.push(...validateAdapterCapabilities(definition.supportedCapabilities).errors);
  BOOLEAN_FIELDS.forEach((field) => {
    if (typeof definition[field] !== 'boolean') errors.push(`INVALID_${field.toUpperCase()}`);
  });
  if (!isRecord(definition.metadata)) errors.push('ADAPTER_METADATA_REQUIRED');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateAdapterInterfaceSnapshot(snapshot) {
  const errors = [];
  const definition = snapshot?.adapterInterface;
  errors.push(...validateAdapterDefinition(definition).errors);
  if (snapshot?.version !== LLM_ADAPTER_INTERFACE_VERSION) {
    errors.push('INVALID_INTERFACE_CONTRACT_VERSION');
  }
  if (!Object.isFrozen(snapshot)
    || !Object.isFrozen(definition)
    || !Object.isFrozen(definition?.supportedCapabilities)
    || !Object.isFrozen(definition?.metadata)) {
    errors.push('ADAPTER_INTERFACE_NOT_IMMUTABLE');
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateAdapterContract(adapter) {
  const errors = [...validateAdapterInterfaceSnapshot(adapter).errors];
  getMissingAdapterMethods(adapter).forEach((method) => {
    errors.push(`MISSING_ADAPTER_METHOD:${method}`);
  });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

