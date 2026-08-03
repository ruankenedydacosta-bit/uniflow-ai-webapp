import {
  COGNITIVE_ORCHESTRATOR_VERSION,
  ORCHESTRATOR_STEP_IDS,
} from './orchestratorPolicies.js';

export function isDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value)
    && Object.values(value).every((nested) => isDeepFrozen(nested, seen));
}

export function validateCognitiveOrchestration(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') errors.push('ORCHESTRATION_REQUIRED');
  if (!['COMPLETED', 'FAILED'].includes(snapshot?.status)) errors.push('STATUS_INVALID');
  if (!Array.isArray(snapshot?.trace)) errors.push('TRACE_REQUIRED');
  if (snapshot?.status === 'COMPLETED') {
    const order = snapshot.trace.map((item) => item.step);
    if (JSON.stringify(order) !== JSON.stringify(ORCHESTRATOR_STEP_IDS)) {
      errors.push('PIPELINE_ORDER_INVALID');
    }
  }
  if (snapshot?.executionAllowed !== false || snapshot?.safeToExecute !== false) {
    errors.push('EXECUTION_INVARIANT_INVALID');
  }
  if (snapshot?.discarded !== true || snapshot?.metadata?.shadowMode !== true) {
    errors.push('SHADOW_INVARIANT_INVALID');
  }
  if (snapshot?.metadata?.version !== COGNITIVE_ORCHESTRATOR_VERSION) {
    errors.push('VERSION_INVALID');
  }
  if (!isDeepFrozen(snapshot)) errors.push('ORCHESTRATION_NOT_IMMUTABLE');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
