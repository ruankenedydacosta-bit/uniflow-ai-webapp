const REQUIRED_IDENTITY_FIELDS = Object.freeze([
  'userId',
  'workspaceId',
  'conversationId',
  'turnId',
  'messageId',
]);

function hasIdentityValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasCompleteToolCallingIdentity(identity) {
  return Boolean(
    identity
    && typeof identity === 'object'
    && REQUIRED_IDENTITY_FIELDS.every((field) => hasIdentityValue(identity[field])),
  );
}

export function buildToolCallingAuthorization({
  config,
  identity,
  pendingAction = false,
  confirmationPending = false,
} = {}) {
  const enabled = config?.enabled === true && config?.toolCallingEnabled === true;
  const identityComplete = hasCompleteToolCallingIdentity(identity);
  const authorized = enabled && identityComplete;
  const executionAllowed = Boolean(
    authorized
    && config?.toolCallingShadowMode === false
    && config?.toolCallingExecutionAllowed === true
    && pendingAction !== true
    && confirmationPending !== true,
  );

  let reason;
  if (!enabled) reason = 'TOOL_CALLING_DISABLED';
  else if (!identityComplete) reason = 'IDENTITY_INCOMPLETE';
  else if (pendingAction === true) reason = 'PENDING_ACTION_ACTIVE';
  else if (confirmationPending === true) reason = 'CONFIRMATION_PENDING';
  else if (config?.toolCallingShadowMode !== false) reason = 'SHADOW_MODE';
  else if (config?.toolCallingExecutionAllowed !== true) reason = 'EXECUTION_NOT_EXPLICITLY_ALLOWED';
  else reason = 'EXECUTION_AUTHORIZED';

  return Object.freeze({
    authorized,
    executionAllowed,
    pendingAction: pendingAction === true,
    confirmationPending: confirmationPending === true,
    identityComplete,
    reason,
  });
}

export { REQUIRED_IDENTITY_FIELDS };
