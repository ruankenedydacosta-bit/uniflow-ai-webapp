import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { ROUTING_POLICY_CATALOG } from './routingPolicyCatalog.js';
import { buildRoutingDecision } from './routingDecision.js';
import { createRoutingPolicySchema } from './routingPolicySchema.js';
import {
  validateRoutingDecision,
  validateRoutingInput,
} from './routingPolicyValidator.js';

export class RoutingPolicyValidationError extends Error {
  constructor(errors) {
    super('Routing policy validation failed.');
    this.name = 'RoutingPolicyValidationError';
    this.codes = Object.freeze([...errors]);
  }
}

export function findRoutingPolicy(policyId = 'DEFAULT') {
  if (typeof policyId !== 'string') return null;
  const normalizedId = policyId.trim().toUpperCase();
  return ROUTING_POLICY_CATALOG.find((policy) => policy.id === normalizedId) ?? null;
}

export function evaluateRoutingPolicy(input = {}) {
  const policy = findRoutingPolicy(input.policy ?? 'DEFAULT');
  const validation = validateRoutingInput({ ...input, policy });
  if (!validation.valid) throw new RoutingPolicyValidationError(validation.errors);

  const rawDecision = buildRoutingDecision({
    capability: input.capability,
    providerRegistry: input.providerRegistry,
    policy,
    metadata: input.compiledContextMetadata,
  });
  const snapshot = createRoutingPolicySchema(rawDecision);
  const decisionValidation = validateRoutingDecision(snapshot, input);
  if (!decisionValidation.valid) {
    throw new RoutingPolicyValidationError(decisionValidation.errors);
  }
  return snapshot;
}

export function logRoutingPolicySummary(logger, snapshot) {
  logger.info?.('[UNI OS] Routing Policy Loaded', {
    policySelected: snapshot.routingDecision.policy,
    allowedProvidersCount: snapshot.routingDecision.allowedProviders.length,
    fallbackEnabled: snapshot.routingDecision.fallbackEnabled,
  });
}

export async function runRoutingPoliciesShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', routingDecision: null });

  try {
    const snapshot = evaluateRoutingPolicy(input);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) {
      logRoutingPolicySummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({ status: 'OBSERVED', routingDecision: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Routing Policy failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', routingDecision: null });
  }
}

