import { CAPABILITY_IDS } from '../capability-registry/capabilitySchema.js';
import {
  PROVIDER_COST_LEVELS,
  PROVIDER_HEALTH_STATUSES,
  PROVIDER_IDS,
  PROVIDER_LATENCY_LEVELS,
  PROVIDER_STATUSES,
  PROVIDER_TYPES,
} from './providerSchema.js';

const BOOLEAN_FIELDS = [
  'supportsStreaming',
  'supportsVision',
  'supportsVoice',
  'supportsStructuredOutput',
  'supportsFunctionCalling',
];

export function validateProvider(provider) {
  const errors = [];
  if (!PROVIDER_IDS.includes(provider?.id)) errors.push('INVALID_PROVIDER_ID');
  if (typeof provider?.name !== 'string' || !provider.name.trim()) errors.push('PROVIDER_NAME_REQUIRED');
  if (!PROVIDER_STATUSES.includes(provider?.status)) errors.push('INVALID_PROVIDER_STATUS');
  if (!Number.isInteger(provider?.priority) || provider.priority < 1) errors.push('INVALID_PRIORITY');
  if (!PROVIDER_TYPES.includes(provider?.type)) errors.push('INVALID_PROVIDER_TYPE');
  if (!Array.isArray(provider?.supportedCapabilities)) errors.push('CAPABILITIES_ARRAY_REQUIRED');
  else if (provider.supportedCapabilities.some((id) => !CAPABILITY_IDS.includes(id))) {
    errors.push('INVALID_SUPPORTED_CAPABILITY');
  }
  if (!PROVIDER_LATENCY_LEVELS.includes(provider?.estimatedLatency)) errors.push('INVALID_ESTIMATED_LATENCY');
  if (!PROVIDER_COST_LEVELS.includes(provider?.estimatedCost)) errors.push('INVALID_ESTIMATED_COST');
  BOOLEAN_FIELDS.forEach((field) => {
    if (typeof provider?.[field] !== 'boolean') errors.push(`INVALID_${field.toUpperCase()}`);
  });
  if (!PROVIDER_HEALTH_STATUSES.includes(provider?.healthStatus)) errors.push('INVALID_HEALTH_STATUS');
  if (!Number.isInteger(provider?.fallbackPriority) || provider.fallbackPriority < 1) {
    errors.push('INVALID_FALLBACK_PRIORITY');
  }
  if (!provider?.metadata || typeof provider.metadata !== 'object' || Array.isArray(provider.metadata)) {
    errors.push('PROVIDER_METADATA_REQUIRED');
  }
  return { valid: errors.length === 0, errors };
}

export function validateProviderCatalog(providers) {
  if (!Array.isArray(providers)) return { valid: false, errors: ['PROVIDER_CATALOG_ARRAY_REQUIRED'] };
  const errors = [];
  const ids = new Set();
  const priorities = new Set();
  const fallbackPriorities = new Set();

  providers.forEach((provider, index) => {
    validateProvider(provider).errors.forEach((error) => errors.push(`${error}:${index}`));
    if (ids.has(provider?.id)) errors.push(`DUPLICATE_PROVIDER_ID:${provider.id}`);
    if (priorities.has(provider?.priority)) errors.push(`DUPLICATE_PRIORITY:${provider.priority}`);
    if (fallbackPriorities.has(provider?.fallbackPriority)) {
      errors.push(`DUPLICATE_FALLBACK_PRIORITY:${provider.fallbackPriority}`);
    }
    ids.add(provider?.id);
    priorities.add(provider?.priority);
    fallbackPriorities.add(provider?.fallbackPriority);
  });

  return { valid: errors.length === 0, errors };
}

