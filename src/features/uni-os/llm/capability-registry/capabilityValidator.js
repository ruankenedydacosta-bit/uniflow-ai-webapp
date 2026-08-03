import {
  CAPABILITY_COMPLEXITIES,
  CAPABILITY_COST_LEVELS,
  CAPABILITY_IDS,
  CAPABILITY_LATENCY_LEVELS,
} from './capabilitySchema.js';

const BOOLEAN_FIELDS = Object.freeze([
  'supportsStreaming',
  'supportsVision',
  'supportsVoice',
  'requiresStructuredContext',
]);

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

export function validateCapability(value) {
  const errors = [];
  if (!isRecord(value)) return Object.freeze({ valid: false, errors: ['CAPABILITY_NOT_OBJECT'] });
  if (!CAPABILITY_IDS.includes(value.id)) errors.push('INVALID_CAPABILITY_ID');
  if (typeof value.name !== 'string' || !value.name.trim()) errors.push('CAPABILITY_NAME_REQUIRED');
  if (typeof value.description !== 'string' || !value.description.trim()) {
    errors.push('CAPABILITY_DESCRIPTION_REQUIRED');
  }
  if (!CAPABILITY_COMPLEXITIES.includes(value.complexity)) errors.push('INVALID_COMPLEXITY');
  if (!CAPABILITY_COST_LEVELS.includes(value.estimatedCost)) errors.push('INVALID_ESTIMATED_COST');
  if (!CAPABILITY_LATENCY_LEVELS.includes(value.estimatedLatency)) {
    errors.push('INVALID_ESTIMATED_LATENCY');
  }
  BOOLEAN_FIELDS.forEach((field) => {
    if (typeof value[field] !== 'boolean') errors.push(`INVALID_${field.toUpperCase()}`);
  });
  if (!isRecord(value.metadata)) errors.push('CAPABILITY_METADATA_REQUIRED');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateCapabilityCatalog(capabilities = []) {
  if (!Array.isArray(capabilities)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['CATALOG_NOT_ARRAY']) });
  }
  const errors = [];
  const ids = new Set();
  capabilities.forEach((capability, index) => {
    const result = validateCapability(capability);
    result.errors.forEach((error) => errors.push(`${error}:${index}`));
    if (typeof capability?.id === 'string' && ids.has(capability.id)) {
      errors.push(`DUPLICATE_CAPABILITY_ID:${capability.id}`);
    }
    if (typeof capability?.id === 'string') ids.add(capability.id);
  });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
