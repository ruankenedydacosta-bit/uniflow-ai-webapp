import { sortRoutingCandidates } from './routingComparator.js';

const STATUS_SCORE = Object.freeze({ AVAILABLE: 8, EXPERIMENTAL: 3 });
const HEALTH_SCORE = Object.freeze({ HEALTHY: 6, UNKNOWN: 2, DEGRADED: -6, OFFLINE: -100 });

function scoreProvider(provider, policyPosition) {
  const policyScore = Math.max(0, 1000 - (policyPosition * 20));
  return policyScore
    + (STATUS_SCORE[provider.status] ?? 0)
    + (HEALTH_SCORE[provider.healthStatus] ?? 0);
}

export function scoreRoutingCandidates(providers = [], priorityOrder = []) {
  const policyPositions = new Map(priorityOrder.map((providerId, index) => [providerId, index]));
  const scored = providers
    .filter((provider) => provider.healthStatus !== 'OFFLINE')
    .map((provider) => {
      const policyPosition = policyPositions.get(provider.id) ?? Number.MAX_SAFE_INTEGER;
      return {
        providerId: provider.id,
        score: scoreProvider(provider, policyPosition),
        policyPosition,
        providerPriority: provider.priority,
        status: provider.status,
        healthStatus: provider.healthStatus,
      };
    });
  return sortRoutingCandidates(scored);
}

export function calculateRoutingConfidence(selectedCandidate) {
  if (!selectedCandidate) return 0;
  const healthConfidence = {
    HEALTHY: 0.95,
    UNKNOWN: 0.75,
    DEGRADED: 0.5,
  }[selectedCandidate.healthStatus] ?? 0.4;
  const statusAdjustment = selectedCandidate.status === 'EXPERIMENTAL' ? -0.1 : 0;
  return Math.max(0, Math.min(1, healthConfidence + statusAdjustment));
}

