export const COGNITIVE_ORCHESTRATOR_VERSION = '1.0';

export const ORCHESTRATOR_STEP_IDS = Object.freeze([
  'REASONING_PLANNER',
  'DECISION_ENGINE',
  'CONFIDENCE_ENGINE',
  'COGNITIVE_EXECUTION_PLAN',
  'PROMPT_BUILDER',
  'PROMPT_COMPILER',
]);

export const ORCHESTRATOR_STATUSES = Object.freeze([
  'COMPLETED',
  'FAILED',
]);

export const ORCHESTRATOR_ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'MODULE_UNAVAILABLE',
  'MODULE_FAILURE',
  'SNAPSHOT_INVALID',
  'PROMPT_COMPILATION_BLOCKED',
]);

export function createStepTrace(step, status, validationErrors = []) {
  return {
    step,
    status,
    validationErrors: Array.isArray(validationErrors) ? [...validationErrors] : [],
  };
}
