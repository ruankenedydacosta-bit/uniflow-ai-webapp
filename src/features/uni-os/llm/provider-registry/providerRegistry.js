import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { PROVIDER_CATALOG } from './providerCatalog.js';
import { createProviderRegistrySchema } from './providerSchema.js';
import { validateProviderCatalog } from './providerValidator.js';

export class ProviderRegistryValidationError extends Error {
  constructor(errors) {
    super('Provider registry validation failed.');
    this.name = 'ProviderRegistryValidationError';
    this.codes = Object.freeze([...errors]);
  }
}

export function createProviderRegistry(providers = PROVIDER_CATALOG) {
  const validation = validateProviderCatalog(providers);
  if (!validation.valid) throw new ProviderRegistryValidationError(validation.errors);
  return createProviderRegistrySchema(providers);
}

export function findProvider(registry, providerId) {
  if (!Array.isArray(registry?.providers) || typeof providerId !== 'string') return null;
  const normalizedId = providerId.trim().toUpperCase();
  return registry.providers.find((provider) => provider.id === normalizedId) ?? null;
}

export function listProviders(registry) {
  return Array.isArray(registry?.providers) ? registry.providers : Object.freeze([]);
}

export function findProvidersByCapability(registry, capabilityId) {
  if (typeof capabilityId !== 'string') return Object.freeze([]);
  const normalizedId = capabilityId.trim().toUpperCase();
  return Object.freeze(listProviders(registry).filter(
    (provider) => provider.supportedCapabilities.includes(normalizedId),
  ));
}

export function logProviderRegistrySummary(logger, registry) {
  logger.info?.('[UNI OS] Provider Registry Loaded', {
    providersCount: registry.providers.length,
    registryVersion: registry.version,
  });
}

export async function runProviderRegistryShadow(options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', registry: null });

  try {
    const registry = createProviderRegistry(options.catalog ?? PROVIDER_CATALOG);
    if (typeof options.observer === 'function') await options.observer(registry);
    if (options.isDevelopment === true) {
      logProviderRegistrySummary(options.logger ?? console, registry);
    }
    return Object.freeze({ status: 'OBSERVED', registry: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Provider Registry failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', registry: null });
  }
}

export const providerRegistry = createProviderRegistry();

