import {
  COGNITIVE_ORCHESTRATOR_VERSION,
  ORCHESTRATOR_ERROR_CODES,
  ORCHESTRATOR_STATUSES,
  ORCHESTRATOR_STEP_IDS,
} from './orchestratorPolicies.js';

export function deepClone(value, seen = new WeakMap()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  Object.entries(value).forEach(([key, nested]) => {
    clone[key] = deepClone(nested, seen);
  });
  return clone;
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}

function timestamp(value) {
  const date = new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function safeStatus(value) {
  return ORCHESTRATOR_STATUSES.includes(value) ? value : 'FAILED';
}

function safeStep(value) {
  return ORCHESTRATOR_STEP_IDS.includes(value) ? value : null;
}

function safeError(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    code: ORCHESTRATOR_ERROR_CODES.includes(value.code) ? value.code : 'MODULE_FAILURE',
    step: safeStep(value.step),
    details: Array.isArray(value.details) ? [...value.details] : [],
  };
}

export function createOrchestratorSnapshot(draft = {}) {
  const source = deepClone(draft && typeof draft === 'object' ? draft : {});
  const generatedAt = timestamp(source.generatedAt);
  const snapshots = source.snapshots && typeof source.snapshots === 'object'
    ? source.snapshots : {};
  const trace = Array.isArray(source.trace) ? source.trace : [];
  const status = safeStatus(source.status);

  return deepFreeze({
    orchestratorId: `cognitive-orchestrator:${generatedAt}`,
    generatedAt,
    status,
    snapshots,
    trace,
    metrics: {
      modulesExpected: ORCHESTRATOR_STEP_IDS.length,
      modulesExecuted: trace.filter((item) => item.status === 'COMPLETED').length,
      validationErrors: trace.reduce(
        (total, item) => total + (item.validationErrors?.length ?? 0), 0,
      ),
      durationMs: Number.isFinite(source.durationMs) ? Math.max(0, source.durationMs) : 0,
    },
    error: safeError(source.error),
    executionAllowed: false,
    safeToExecute: false,
    discarded: true,
    metadata: {
      version: COGNITIVE_ORCHESTRATOR_VERSION,
      shadowMode: true,
      deterministicPipeline: true,
      sourceSnapshotsModified: false,
      responseDelivered: false,
      promptInterpreted: false,
      modelInvoked: false,
      externalCallsMade: false,
      tokensConsumed: 0,
    },
  });
}
