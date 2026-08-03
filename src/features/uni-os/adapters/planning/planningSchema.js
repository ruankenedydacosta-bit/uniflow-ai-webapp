export const UNI_OS_PLANNING_SCHEMA_VERSION = '1.0';

export const PLANNING_STEP_TYPES = Object.freeze([
  'identify_account',
  'identify_category',
  'identify_amount',
  'identify_date',
  'ask_confirmation',
  'create_account_candidate',
  'reuse_account',
  'reactivate_account_candidate',
  'persist_transaction',
  'respond_question',
  'inform_user',
]);

const STEP_STATUSES = new Set(['planned']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
  );
}

function normalizeStep(step, index) {
  const type = PLANNING_STEP_TYPES.includes(step?.type) ? step.type : 'inform_user';
  return {
    id: typeof step?.id === 'string' && step.id ? step.id : `step-${index + 1}`,
    type,
    description: typeof step?.description === 'string' ? step.description : '',
    status: STEP_STATUSES.has(step?.status) ? step.status : 'planned',
  };
}

export function createPlanningPlan(input = {}) {
  const confidence = Number.isFinite(input.confidence)
    ? Math.min(1, Math.max(0, input.confidence))
    : 0;
  const steps = Array.isArray(input.steps)
    ? input.steps.map(normalizeStep).map(cloneValue)
    : [];

  return deepFreeze({
    planId: typeof input.planId === 'string' ? input.planId : '',
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    intent: typeof input.intent === 'string' ? input.intent : 'question',
    confidence,
    requiresConfirmation: input.requiresConfirmation === true,
    executionAllowed: false,
    steps,
    metadata: {
      version: UNI_OS_PLANNING_SCHEMA_VERSION,
    },
  });
}
