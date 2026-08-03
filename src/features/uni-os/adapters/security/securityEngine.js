import {
  mapInconsistencyReason,
  planningRequiresKnownPermission,
} from './securityPolicy.js';

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function reflectionIssues(reflectionSnapshot) {
  return Array.isArray(reflectionSnapshot?.inconsistencies)
    ? reflectionSnapshot.inconsistencies
    : [];
}

export function evaluateSecuritySnapshots({
  parsedIntent = {},
  contextSnapshot = {},
  memorySnapshot = {},
  planningSnapshot = {},
  reflectionSnapshot = {},
} = {}) {
  void parsedIntent;
  void contextSnapshot;
  void memorySnapshot;
  const reasons = [];
  const warnings = [];
  const inconsistencies = reflectionIssues(reflectionSnapshot);

  inconsistencies.forEach((item) => addUnique(reasons, mapInconsistencyReason(item?.code)));
  if (reflectionSnapshot?.ambiguityDetected === true && !reasons.some((reason) =>
    reason.startsWith('AMBIGUOUS_'))) {
    addUnique(reasons, 'AMBIGUOUS_INTERPRETATION');
  }
  if (reflectionSnapshot?.overallRisk === 'HIGH') addUnique(reasons, 'HIGH_RISK');
  if (reflectionSnapshot?.confidence < 0.5) addUnique(reasons, 'LOW_CONFIDENCE');
  if (!reflectionSnapshot?.metadata?.version) addUnique(reasons, 'STRUCTURAL_CONFLICT');
  if (planningSnapshot?.executionAllowed !== false) addUnique(reasons, 'STRUCTURAL_CONFLICT');
  if (reflectionSnapshot?.executionAllowed !== false) addUnique(reasons, 'STRUCTURAL_CONFLICT');
  if (planningRequiresKnownPermission(planningSnapshot)) addUnique(reasons, 'PERMISSION_UNKNOWN');

  const confirmationRequired = reflectionSnapshot?.confirmationRequired === true
    || planningSnapshot?.requiresConfirmation === true;
  if (confirmationRequired) addUnique(warnings, 'CONFIRMATION_REQUIRED');
  if (reflectionSnapshot?.overallRisk === 'MEDIUM') addUnique(warnings, 'REVIEW_RECOMMENDED');

  return {
    status: reasons.length
      ? 'BLOCK'
      : confirmationRequired
        ? 'ALLOW_WITH_CONFIRMATION'
        : 'ALLOW',
    confirmationRequired,
    confidence: reflectionSnapshot?.confidence,
    risk: reflectionSnapshot?.overallRisk,
    reasons,
    warnings,
  };
}
