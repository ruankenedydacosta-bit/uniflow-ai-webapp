export function compareRoutingCandidates(left, right) {
  if (left.score !== right.score) return right.score - left.score;
  if (left.policyPosition !== right.policyPosition) {
    return left.policyPosition - right.policyPosition;
  }
  if (left.providerPriority !== right.providerPriority) {
    return left.providerPriority - right.providerPriority;
  }
  return left.providerId.localeCompare(right.providerId);
}

export function sortRoutingCandidates(candidates = []) {
  return [...candidates].sort(compareRoutingCandidates);
}

