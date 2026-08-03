import { CAPABILITY_IDS } from '../capability-registry/capabilitySchema.js';
import { PROVIDER_IDS } from '../provider-registry/providerSchema.js';
import { ROUTING_ORDER_STRATEGIES, ROUTING_POLICY_IDS } from './routingPolicySchema.js';

function hasDuplicates(values = []) {
  return new Set(values).size !== values.length;
}

export function validateRoutingPolicy(policy) {
  const errors = [];
  if (!ROUTING_POLICY_IDS.includes(policy?.id)) errors.push('INVALID_ROUTING_POLICY');
  if (!ROUTING_ORDER_STRATEGIES.includes(policy?.orderBy)) errors.push('INVALID_ORDER_STRATEGY');
  if (typeof policy?.fallbackEnabled !== 'boolean') errors.push('INVALID_FALLBACK_FLAG');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateRoutingPolicyCatalog(policies) {
  if (!Array.isArray(policies)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['POLICY_CATALOG_ARRAY_REQUIRED']) });
  }
  const errors = [];
  const ids = new Set();
  policies.forEach((policy, index) => {
    validateRoutingPolicy(policy).errors.forEach((error) => errors.push(`${error}:${index}`));
    if (ids.has(policy?.id)) errors.push(`DUPLICATE_ROUTING_POLICY:${policy.id}`);
    ids.add(policy?.id);
  });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateRoutingInput({ capability, providerRegistry, policy } = {}) {
  const errors = [...validateRoutingPolicy(policy).errors];
  if (!CAPABILITY_IDS.includes(capability?.id)) errors.push('INVALID_CAPABILITY');
  if (!Array.isArray(providerRegistry?.providers)) errors.push('INVALID_PROVIDER_REGISTRY');
  else {
    const ids = providerRegistry.providers.map((provider) => provider.id);
    if (hasDuplicates(ids)) errors.push('DUPLICATE_PROVIDER_ID');
    if (providerRegistry.providers.some((provider) => !PROVIDER_IDS.includes(provider.id))) {
      errors.push('UNKNOWN_PROVIDER');
    }
    const priorities = providerRegistry.providers.map((provider) => provider.priority);
    if (hasDuplicates(priorities) || priorities.some((value) => !Number.isInteger(value) || value < 1)) {
      errors.push('INVALID_PROVIDER_PRIORITIES');
    }
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateRoutingDecision(snapshot, { capability, providerRegistry } = {}) {
  const errors = [];
  const decision = snapshot?.routingDecision;
  const knownProviders = new Map(
    (providerRegistry?.providers ?? []).map((provider) => [provider.id, provider]),
  );
  if (!ROUTING_POLICY_IDS.includes(decision?.policy)) errors.push('INVALID_DECISION_POLICY');
  const collections = [
    decision?.allowedProviders,
    decision?.blockedProviders,
    decision?.priorityOrder,
  ];
  if (collections.some((value) => !Array.isArray(value))) errors.push('INVALID_PROVIDER_COLLECTIONS');
  else {
    const [allowed, blocked, priority] = collections;
    if (collections.some(hasDuplicates)) errors.push('DUPLICATE_DECISION_PROVIDER');
    if ([...allowed, ...blocked, ...priority].some((id) => !knownProviders.has(id))) {
      errors.push('DECISION_PROVIDER_NOT_FOUND');
    }
    if (allowed.some((id) => !knownProviders.get(id)?.supportedCapabilities.includes(capability?.id))) {
      errors.push('INCOMPATIBLE_PROVIDER_CAPABILITY');
    }
    if (priority.some((id) => !allowed.includes(id)) || priority.length !== allowed.length) {
      errors.push('INVALID_PRIORITY_ORDER');
    }
    if (allowed.some((id) => blocked.includes(id))) errors.push('PROVIDER_BOTH_ALLOWED_AND_BLOCKED');
    if (new Set([...allowed, ...blocked]).size !== knownProviders.size) {
      errors.push('INCOMPLETE_PROVIDER_CLASSIFICATION');
    }
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
