function copySignals(value) {
  return Object.freeze(Array.isArray(value) ? [...value] : []);
}

export function reflectOnPlan(plan = {}, signals = {}) {
  const conflicts = copySignals(signals.conflicts);
  const ambiguities = copySignals(signals.ambiguities);
  const risks = copySignals(signals.risks);
  return Object.freeze({
    plan,
    conflicts,
    ambiguities,
    risks,
    confirmationPending: Boolean(plan.requiresConfirmation && signals.confirmed !== true),
    valid: conflicts.length === 0 && ambiguities.length === 0,
    changedPlan: false,
  });
}
