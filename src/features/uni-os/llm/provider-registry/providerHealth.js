import { PROVIDER_HEALTH_STATUSES } from './providerSchema.js';

export function normalizeProviderHealth(healthStatus) {
  return PROVIDER_HEALTH_STATUSES.includes(healthStatus) ? healthStatus : 'UNKNOWN';
}

export function isProviderHealthy(provider) {
  return normalizeProviderHealth(provider?.healthStatus) === 'HEALTHY';
}

export function summarizeProviderHealth(providers = []) {
  const summary = Object.fromEntries(PROVIDER_HEALTH_STATUSES.map((status) => [status, 0]));
  if (Array.isArray(providers)) {
    providers.forEach((provider) => {
      summary[normalizeProviderHealth(provider?.healthStatus)] += 1;
    });
  }
  return Object.freeze(summary);
}

