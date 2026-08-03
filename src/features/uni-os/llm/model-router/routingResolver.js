import { findCapability } from '../capability-registry/capabilityRegistry.js';
import { ROUTING_POLICY_CATALOG } from '../routing-policies/routingPolicyCatalog.js';
import { evaluateRoutingPolicy } from '../routing-policies/routingPolicyEngine.js';

export class RoutingResolverError extends Error {
  constructor(code) {
    super('Model routing resolution failed.');
    this.name = 'RoutingResolverError';
    this.code = code;
  }
}

function normalizeCapabilityId(requestedCapability) {
  if (typeof requestedCapability === 'string') return requestedCapability.trim().toUpperCase();
  if (typeof requestedCapability?.id === 'string') return requestedCapability.id.trim().toUpperCase();
  return null;
}

function resolveContextMetadata(compiledContext) {
  if (!compiledContext || typeof compiledContext !== 'object') return {};
  const metadata = compiledContext.metadata;
  return metadata && !Array.isArray(metadata) && typeof metadata === 'object' ? metadata : {};
}

export function resolveRoutingCandidates({
  compiledContext,
  requestedCapability,
  capabilityRegistry,
  providerRegistry,
  routingPolicies = ROUTING_POLICY_CATALOG,
  routingPolicy = 'DEFAULT',
} = {}) {
  if (!Array.isArray(capabilityRegistry?.capabilities)) {
    throw new RoutingResolverError('INVALID_CAPABILITY_REGISTRY');
  }
  if (!Array.isArray(providerRegistry?.providers)) {
    throw new RoutingResolverError('INVALID_PROVIDER_REGISTRY');
  }
  if (!Array.isArray(routingPolicies)) throw new RoutingResolverError('INVALID_ROUTING_POLICIES');

  const requestedId = normalizeCapabilityId(requestedCapability);
  const capability = findCapability(capabilityRegistry, requestedId ?? '');
  if (!capability) {
    return { requestedId, capability: null, policyDecision: null, providers: [] };
  }

  const normalizedPolicy = typeof routingPolicy === 'string'
    ? routingPolicy.trim().toUpperCase()
    : 'DEFAULT';
  if (!routingPolicies.some((policy) => policy.id === normalizedPolicy)) {
    throw new RoutingResolverError('ROUTING_POLICY_NOT_FOUND');
  }

  const policySnapshot = evaluateRoutingPolicy({
    policy: normalizedPolicy,
    capability,
    providerRegistry,
    compiledContextMetadata: resolveContextMetadata(compiledContext),
  });
  const decision = policySnapshot.routingDecision;
  const byId = new Map(providerRegistry.providers.map((provider) => [provider.id, provider]));
  const providers = decision.priorityOrder.map((providerId) => byId.get(providerId)).filter(Boolean);

  return { requestedId, capability, policyDecision: decision, providers };
}

