export const RUNTIME_ADAPTER_ORDER = Object.freeze([
  'context',
  'memory',
  'planning',
  'reflection',
  'security',
  'permissions',
  'cognitive',
  'structured_response',
  'communication',
]);

const SNAPSHOT_KEYS = Object.freeze([
  'parsedIntent', 'context', 'memory', 'planning', 'reflection', 'security',
  'permissions', 'cognition', 'structuredResponse', 'communication',
]);
const EXECUTION_KEYS = Object.freeze([
  'planning', 'reflection', 'security', 'permissions', 'structuredResponse', 'communication',
]);

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function communicationIsNull(structuredResponse) {
  const communication = structuredResponse?.communication;
  return communication?.emotion === null
    && communication?.personality === null
    && communication?.outputType === null;
}

export function validateRuntimeInvariants(snapshots = {}, executedAdapters = []) {
  const errors = [];
  if (JSON.stringify(executedAdapters) !== JSON.stringify(RUNTIME_ADAPTER_ORDER)) {
    errors.push('ADAPTER_ORDER_INVALID');
  }
  SNAPSHOT_KEYS.forEach((key) => {
    if (!snapshots[key] || typeof snapshots[key] !== 'object') {
      errors.push(`SNAPSHOT_MISSING:${key}`);
    } else if (!isDeepFrozen(snapshots[key])) {
      errors.push(`SNAPSHOT_NOT_FROZEN:${key}`);
    }
  });
  EXECUTION_KEYS.forEach((key) => {
    if (snapshots[key]?.executionAllowed !== false) {
      errors.push(`EXECUTION_NOT_BLOCKED:${key}`);
    }
  });
  if (snapshots.cognition?.shouldInvokeModel !== false
      || snapshots.cognition?.metadata?.externalCallMade !== false) {
    errors.push('MODEL_INVOCATION_NOT_BLOCKED');
  }
  if (!communicationIsNull(snapshots.structuredResponse)) {
    errors.push('STRUCTURED_COMMUNICATION_NOT_NULL');
  }
  if (snapshots.communication?.outputChannel !== null
      || snapshots.communication?.voiceProfile !== null) {
    errors.push('COMMUNICATION_OUTPUT_NOT_BLOCKED');
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}
