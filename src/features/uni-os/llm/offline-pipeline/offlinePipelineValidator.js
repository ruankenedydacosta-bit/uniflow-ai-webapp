import { OFFLINE_PIPELINE_MODULE_ORDER } from './offlinePipelineTelemetry.js';
import { OFFLINE_PIPELINE_VERSION } from './offlinePipelineSchema.js';

const REQUIRED_SNAPSHOTS = Object.freeze([
  'routing',
  'conversationWindow',
  'tokenBudget',
  'structuredPrompt',
  'validationReport',
]);

function isDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every(
    (nested) => isDeepFrozen(nested, seen),
  );
}

function expectedOrder(approved) {
  return approved
    ? OFFLINE_PIPELINE_MODULE_ORDER
    : OFFLINE_PIPELINE_MODULE_ORDER.slice(0, -1);
}

export function validateOfflinePipelineResult(snapshot) {
  const errors = [];
  const result = snapshot?.offlinePipelineResult;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['PIPELINE_RESULT_REQUIRED']) });
  }
  REQUIRED_SNAPSHOTS.forEach((key) => {
    if (!result[key] || typeof result[key] !== 'object') errors.push(`SNAPSHOT_MISSING:${key}`);
  });
  const approved = result.validationReport?.validationReport?.approved === true;
  const modules = result.statistics?.executedModules ?? [];
  if (JSON.stringify(modules) !== JSON.stringify(expectedOrder(approved))) {
    errors.push('MODULE_ORDER_INVALID');
  }
  if (approved && result.mockResponse === null) errors.push('APPROVED_PROMPT_MOCK_NOT_EXECUTED');
  if (!approved && result.mockResponse !== null) errors.push('REJECTED_PROMPT_MOCK_EXECUTED');
  if (result.metadata?.mockExecuted !== approved
    || result.statistics?.mockExecuted !== approved) {
    errors.push('MOCK_EXECUTION_STATUS_INVALID');
  }
  if (result.mockResponse !== null
    && (result.mockResponse.provider !== 'UNI_OS_MOCK'
      || result.mockResponse.metadata?.simulated !== true
      || result.mockResponse.metadata?.externalRequest !== false
      || result.mockResponse.metadata?.modelExecuted !== false
      || result.mockResponse.metadata?.tokensConsumed !== 0)) {
    errors.push('MOCK_RESPONSE_INTEGRITY_INVALID');
  }
  if (snapshot.version !== OFFLINE_PIPELINE_VERSION
    || result.metadata?.version !== OFFLINE_PIPELINE_VERSION) {
    errors.push('PIPELINE_VERSION_INVALID');
  }
  if (snapshot.metadata?.localOnly !== true
    || snapshot.metadata?.shadowMode !== true
    || snapshot.metadata?.previousSnapshotsModified !== false
    || snapshot.metadata?.realProviderUsed !== false
    || snapshot.metadata?.mockAdapterOnly !== true
    || snapshot.metadata?.modelExecuted !== false
    || snapshot.metadata?.externalCallsMade !== false
    || snapshot.metadata?.httpRequestsMade !== false
    || snapshot.metadata?.tokensConsumed !== 0
    || snapshot.metadata?.legacyFlowModified !== false
    || snapshot.metadata?.executionAllowed !== false) {
    errors.push('PIPELINE_INVARIANTS_INVALID');
  }
  if (!isDeepFrozen(snapshot)) errors.push('PIPELINE_RESULT_NOT_IMMUTABLE');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export { isDeepFrozen };
