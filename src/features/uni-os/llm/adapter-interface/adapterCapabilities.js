import { CAPABILITY_IDS } from '../capability-registry/capabilitySchema.js';

export const ADAPTER_CAPABILITIES = CAPABILITY_IDS;

export function validateAdapterCapabilities(capabilities) {
  const errors = [];
  if (!Array.isArray(capabilities)) {
    errors.push('ADAPTER_CAPABILITIES_ARRAY_REQUIRED');
  } else {
    if (new Set(capabilities).size !== capabilities.length) {
      errors.push('DUPLICATE_ADAPTER_CAPABILITY');
    }
    if (capabilities.some((capability) => !CAPABILITY_IDS.includes(capability))) {
      errors.push('INVALID_ADAPTER_CAPABILITY');
    }
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function supportsAdapterCapability(interfaceSnapshot, capabilityId) {
  if (typeof capabilityId !== 'string') return false;
  const normalizedId = capabilityId.trim().toUpperCase();
  return interfaceSnapshot?.adapterInterface?.supportedCapabilities?.includes(normalizedId) === true;
}

