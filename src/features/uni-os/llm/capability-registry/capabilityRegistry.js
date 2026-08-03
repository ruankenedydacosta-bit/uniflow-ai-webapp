import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { CAPABILITY_CATALOG } from './capabilityCatalog.js';
import { createCapabilityRegistrySchema } from './capabilitySchema.js';
import { validateCapabilityCatalog } from './capabilityValidator.js';

export class CapabilityRegistryValidationError extends Error {
  constructor(errors) {
    super('Capability registry validation failed.');
    this.name = 'CapabilityRegistryValidationError';
    this.codes = Object.freeze([...errors]);
  }
}

export function createCapabilityRegistry(capabilities = CAPABILITY_CATALOG) {
  const validation = validateCapabilityCatalog(capabilities);
  if (!validation.valid) throw new CapabilityRegistryValidationError(validation.errors);
  return createCapabilityRegistrySchema(capabilities);
}

export function findCapability(registry, capabilityId) {
  if (!registry || !Array.isArray(registry.capabilities) || typeof capabilityId !== 'string') {
    return null;
  }
  const normalizedId = capabilityId.trim().toUpperCase();
  return registry.capabilities.find((capability) => capability.id === normalizedId) ?? null;
}

export function hasCapability(registry, capabilityId) {
  return findCapability(registry, capabilityId) !== null;
}

export function listCapabilities(registry) {
  return Array.isArray(registry?.capabilities) ? registry.capabilities : Object.freeze([]);
}

export function logCapabilityRegistrySummary(logger, registry) {
  logger.info?.('[UNI OS] Capability Registry Loaded', {
    capabilitiesCount: registry.capabilities.length,
    registryVersion: registry.version,
  });
}

export async function runCapabilityRegistryShadow(options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', registry: null });

  try {
    const registry = createCapabilityRegistry(options.catalog ?? CAPABILITY_CATALOG);
    if (typeof options.observer === 'function') await options.observer(registry);
    if (options.isDevelopment === true) {
      logCapabilityRegistrySummary(options.logger ?? console, registry);
    }
    return Object.freeze({ status: 'OBSERVED', registry: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Capability Registry failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', registry: null });
  }
}

export const capabilityRegistry = createCapabilityRegistry();
