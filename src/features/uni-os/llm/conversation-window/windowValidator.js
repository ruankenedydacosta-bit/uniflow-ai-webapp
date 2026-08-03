import { CONVERSATION_WINDOW_POLICY_IDS } from './windowPolicy.js';
import { CONVERSATION_WINDOW_VERSION } from './windowSchema.js';

const COLLECTIONS = Object.freeze(['messages', 'goals', 'memory', 'context', 'insights']);
const REQUIRED_RECORDS = Object.freeze(['reflection', 'security', 'permissions', 'metadata']);

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

export function validateConversationWindow(snapshot) {
  const errors = [];
  if (!isRecord(snapshot)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['WINDOW_SNAPSHOT_REQUIRED']) });
  }

  const window = snapshot.conversationWindow;
  if (!isRecord(window)) errors.push('CONVERSATION_WINDOW_REQUIRED');
  COLLECTIONS.forEach((key) => {
    if (!Array.isArray(window?.[key])) errors.push(`WINDOW_${key.toUpperCase()}_ARRAY_REQUIRED`);
  });
  REQUIRED_RECORDS.forEach((key) => {
    if (!isRecord(window?.[key])) errors.push(`WINDOW_${key.toUpperCase()}_RECORD_REQUIRED`);
  });
  if (!CONVERSATION_WINDOW_POLICY_IDS.includes(window?.metadata?.policy)) {
    errors.push('INVALID_WINDOW_POLICY');
  }
  if (snapshot.metadata?.version !== CONVERSATION_WINDOW_VERSION
    || window?.metadata?.version !== CONVERSATION_WINDOW_VERSION) {
    errors.push('INVALID_WINDOW_VERSION');
  }
  if (snapshot.metadata?.selectionOnly !== true
    || snapshot.metadata?.snapshotsModified !== false
    || snapshot.metadata?.summarized !== false
    || snapshot.metadata?.promptGenerated !== false
    || snapshot.metadata?.modelInvoked !== false
    || snapshot.metadata?.tokensConsumed !== 0
    || snapshot.metadata?.executionAllowed !== false) {
    errors.push('INVALID_WINDOW_INVARIANTS');
  }
  COLLECTIONS.forEach((key) => {
    const selected = snapshot.statistics?.selected?.[key];
    const eligible = snapshot.statistics?.eligible?.[key];
    const limit = window?.metadata?.limits?.[key];
    if (!Number.isInteger(selected) || selected < 0 || selected !== window?.[key]?.length) {
      errors.push(`INVALID_SELECTED_${key.toUpperCase()}_COUNT`);
    }
    if (!Number.isInteger(eligible) || eligible < selected) {
      errors.push(`INVALID_ELIGIBLE_${key.toUpperCase()}_COUNT`);
    }
    if (!Number.isInteger(limit) || limit < selected) {
      errors.push(`INVALID_${key.toUpperCase()}_LIMIT`);
    }
  });
  if (!isDeepFrozen(snapshot)) errors.push('CONVERSATION_WINDOW_NOT_IMMUTABLE');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
