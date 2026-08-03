import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { capabilityRegistry as defaultCapabilityRegistry } from '../capability-registry/index.js';
import { providerRegistry as defaultProviderRegistry } from '../provider-registry/index.js';
import { ROUTING_POLICY_CATALOG } from '../routing-policies/index.js';
import { resolveRoutingCandidates } from './routingResolver.js';
import { calculateRoutingConfidence, scoreRoutingCandidates } from './routingScorer.js';
import { createModelRoutingSchema } from './routingSchema.js';

function createEmptyResult(requestedCapability, routingPolicy) {
  return createModelRoutingSchema({
    requestedCapability,
    routingPolicy,
    decisionReason: 'CAPABILITY_NOT_REGISTERED',
    metadata: { candidateCount: 0, fallbackCount: 0, providerInvoked: false },
  });
}

export function routeModel(input = {}) {
  const routingPolicy = typeof input.routingPolicy === 'string'
    ? input.routingPolicy.trim().toUpperCase()
    : 'DEFAULT';
  const resolution = resolveRoutingCandidates({
    compiledContext: input.compiledContext,
    requestedCapability: input.requestedCapability,
    capabilityRegistry: input.capabilityRegistry ?? defaultCapabilityRegistry,
    providerRegistry: input.providerRegistry ?? defaultProviderRegistry,
    routingPolicies: input.routingPolicies ?? ROUTING_POLICY_CATALOG,
    routingPolicy,
  });

  if (!resolution.capability) return createEmptyResult(resolution.requestedId, routingPolicy);

  const scoredCandidates = scoreRoutingCandidates(
    resolution.providers,
    resolution.policyDecision.priorityOrder,
  );
  const selectedCandidate = scoredCandidates[0] ?? null;
  const selectedProvider = selectedCandidate?.providerId ?? null;
  const selectedRecord = resolution.providers.find((provider) => provider.id === selectedProvider);
  const decisionReason = !selectedCandidate
    ? 'NO_ELIGIBLE_PROVIDERS'
    : selectedCandidate.healthStatus === 'DEGRADED'
      ? 'DEGRADED_PROVIDER_REPRESENTED'
      : 'ROUTING_POLICY_APPLIED';

  return createModelRoutingSchema({
    requestedCapability: resolution.requestedId,
    resolvedCapability: resolution.capability.id,
    candidateProviders: scoredCandidates,
    selectedProvider,
    fallbackProviders: scoredCandidates.slice(1).map((candidate) => candidate.providerId),
    routingPolicy: resolution.policyDecision.policy,
    decisionReason,
    estimatedCost: selectedRecord?.estimatedCost ?? null,
    estimatedLatency: selectedRecord?.estimatedLatency ?? null,
    requiresStructuredContext: resolution.policyDecision.requiresStructuredContext,
    requiresStreaming: resolution.policyDecision.requiresStreaming,
    requiresVision: resolution.policyDecision.requiresVision,
    requiresVoice: resolution.policyDecision.requiresVoice,
    confidence: calculateRoutingConfidence(selectedCandidate),
    metadata: {
      candidateCount: scoredCandidates.length,
      fallbackCount: Math.max(0, scoredCandidates.length - 1),
      policyFallbackEnabled: resolution.policyDecision.fallbackEnabled,
      providerInvoked: false,
      finalSelectionRepresentational: selectedProvider !== null,
    },
  });
}

export function logModelRoutingSummary(logger, snapshot) {
  const result = snapshot.routingResult;
  logger.info?.('[UNI OS] Model Router', {
    capabilityRequested: result.requestedCapability,
    candidateProviders: result.candidateProviders.map((candidate) => candidate.providerId),
    selectedProvider: result.selectedProvider,
    fallbackCount: result.fallbackProviders.length,
    estimatedCost: result.estimatedCost,
    estimatedLatency: result.estimatedLatency,
  });
}

export async function runModelRouterShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', routingResult: null });

  try {
    const snapshot = routeModel(input);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) logModelRoutingSummary(options.logger ?? console, snapshot);
    return Object.freeze({ status: 'OBSERVED', routingResult: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Model Router failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', routingResult: null });
  }
}

export const modelRouter = Object.freeze({ route: routeModel });

