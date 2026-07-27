export const PENDING_ACTION_STACK_VERSION = 1;

export const PENDING_ACTION_STATUS = Object.freeze({
  PENDING: 'pending',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  SUSPENDED: 'suspended',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
});

const ACTIVE_STATUSES = new Set([
  PENDING_ACTION_STATUS.PENDING,
  PENDING_ACTION_STATUS.AWAITING_CONFIRMATION,
  PENDING_ACTION_STATUS.SUSPENDED,
  PENDING_ACTION_STATUS.EXECUTING,
  PENDING_ACTION_STATUS.FAILED,
]);

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function freezeClone(value) {
  return deepFreeze(clone(value));
}

function normalizeIdentity(identity = {}) {
  const normalized = {
    userId: typeof identity.userId === 'string' ? identity.userId.trim() : '',
    workspaceId: typeof identity.workspaceId === 'string' ? identity.workspaceId.trim() : '',
    conversationId: typeof identity.conversationId === 'string'
      ? identity.conversationId.trim()
      : '',
  };

  if (!normalized.userId || !normalized.workspaceId || !normalized.conversationId) {
    throw new Error('PENDING_ACTION_IDENTITY_REQUIRED');
  }
  return normalized;
}

function assertStack(stack) {
  if (
    !stack
    || stack.version !== PENDING_ACTION_STACK_VERSION
    || !Array.isArray(stack.actions)
    || !Array.isArray(stack.history)
  ) {
    throw new Error('PENDING_ACTION_STACK_INVALID');
  }
}

function nowIso(now) {
  const date = now instanceof Date ? now : new Date(now ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new Error('PENDING_ACTION_TIME_INVALID');
  return date.toISOString();
}

function actionId(action) {
  const id = typeof action?.id === 'string' ? action.id.trim() : '';
  if (!id) throw new Error('PENDING_ACTION_ID_REQUIRED');
  return id;
}

function actionType(action) {
  const type = typeof action?.type === 'string' ? action.type.trim() : '';
  if (!type) throw new Error('PENDING_ACTION_TYPE_REQUIRED');
  return type;
}

function createFrame(action, parentActionId, timestamp) {
  return {
    id: actionId(action),
    type: actionType(action),
    status: action.status === PENDING_ACTION_STATUS.AWAITING_CONFIRMATION
      ? PENDING_ACTION_STATUS.AWAITING_CONFIRMATION
      : PENDING_ACTION_STATUS.PENDING,
    parentActionId,
    deduplicationKey: typeof action.deduplicationKey === 'string'
      ? action.deduplicationKey.trim() || null
      : null,
    fields: clone(action.fields ?? {}),
    context: clone(action.context ?? {}),
    metadata: clone(action.metadata ?? {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function transition(stack, details = {}) {
  return freezeClone({ stack, ...details });
}

export function createPendingActionStack(identity, { now } = {}) {
  const timestamp = nowIso(now);
  return freezeClone({
    version: PENDING_ACTION_STACK_VERSION,
    identity: normalizeIdentity(identity),
    actions: [],
    history: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function getActivePendingAction(stack) {
  assertStack(stack);
  return stack.actions.at(-1) ?? null;
}

export function pushPendingAction(stack, action, { now } = {}) {
  assertStack(stack);
  const timestamp = nowIso(now);
  const id = actionId(action);
  const deduplicationKey = typeof action?.deduplicationKey === 'string'
    ? action.deduplicationKey.trim()
    : '';
  const duplicate = stack.actions.find((item) => (
    item.id === id
    || (deduplicationKey && item.deduplicationKey === deduplicationKey)
  ));

  if (duplicate) {
    return transition(stack, {
      changed: false,
      reason: 'duplicate',
      activeAction: getActivePendingAction(stack),
    });
  }

  const actions = stack.actions.map((item, index) => (
    index === stack.actions.length - 1 && ACTIVE_STATUSES.has(item.status)
      ? { ...item, status: PENDING_ACTION_STATUS.SUSPENDED, updatedAt: timestamp }
      : item
  ));
  const parentActionId = actions.at(-1)?.id ?? null;
  actions.push(createFrame(action, parentActionId, timestamp));

  const nextStack = {
    ...stack,
    actions,
    updatedAt: timestamp,
  };
  return transition(nextStack, {
    changed: true,
    activeAction: actions.at(-1),
    suspendedAction: parentActionId ? actions.at(-2) : null,
  });
}

export function updatePendingAction(stack, actionIdValue, patch, { now } = {}) {
  assertStack(stack);
  const timestamp = nowIso(now);
  const index = stack.actions.findIndex((item) => item.id === actionIdValue);
  if (index < 0) {
    return transition(stack, { changed: false, reason: 'not_found' });
  }

  const current = stack.actions[index];
  const actions = stack.actions.map((item, itemIndex) => (
    itemIndex === index
      ? {
          ...item,
          fields: clone(patch?.fields ?? item.fields),
          context: clone(patch?.context ?? item.context),
          metadata: clone(patch?.metadata ?? item.metadata),
          updatedAt: timestamp,
        }
      : item
  ));
  const nextStack = { ...stack, actions, updatedAt: timestamp };
  return transition(nextStack, { changed: true, action: actions[index], previousAction: current });
}

export function confirmPendingAction(stack, actionIdValue, { now } = {}) {
  assertStack(stack);
  const active = getActivePendingAction(stack);
  if (!active || active.id !== actionIdValue) {
    return transition(stack, { changed: false, reason: 'not_active' });
  }

  const timestamp = nowIso(now);
  const confirmed = {
    ...active,
    status: PENDING_ACTION_STATUS.EXECUTING,
    updatedAt: timestamp,
  };
  const actions = [...stack.actions.slice(0, -1), confirmed];
  return transition({ ...stack, actions, updatedAt: timestamp }, {
    changed: true,
    activeAction: confirmed,
  });
}

export function completePendingAction(
  stack,
  actionIdValue,
  result,
  { now } = {},
) {
  assertStack(stack);
  const active = getActivePendingAction(stack);
  if (!active || active.id !== actionIdValue) {
    return transition(stack, { changed: false, reason: 'not_active' });
  }

  const timestamp = nowIso(now);
  const completedAction = {
    ...active,
    status: PENDING_ACTION_STATUS.COMPLETED,
    result: clone(result ?? null),
    updatedAt: timestamp,
  };
  const actions = stack.actions.slice(0, -1);
  let resumedAction = null;

  if (actions.length) {
    resumedAction = {
      ...actions.at(-1),
      status: PENDING_ACTION_STATUS.PENDING,
      context: {
        ...actions.at(-1).context,
        completedDependency: {
          actionId: completedAction.id,
          type: completedAction.type,
          result: clone(result ?? null),
        },
      },
      updatedAt: timestamp,
    };
    actions[actions.length - 1] = resumedAction;
  }

  const nextStack = {
    ...stack,
    actions,
    history: [...stack.history, completedAction],
    updatedAt: timestamp,
  };
  return transition(nextStack, {
    changed: true,
    completedAction,
    resumedAction,
  });
}

export function failPendingAction(stack, actionIdValue, error, { now } = {}) {
  assertStack(stack);
  const active = getActivePendingAction(stack);
  if (!active || active.id !== actionIdValue) {
    return transition(stack, { changed: false, reason: 'not_active' });
  }

  const timestamp = nowIso(now);
  const failedAction = {
    ...active,
    status: PENDING_ACTION_STATUS.FAILED,
    error: clone(error ?? { code: 'PENDING_ACTION_FAILED' }),
    updatedAt: timestamp,
  };
  const actions = [...stack.actions.slice(0, -1), failedAction];
  return transition({ ...stack, actions, updatedAt: timestamp }, {
    changed: true,
    activeAction: failedAction,
  });
}

export function cancelPendingAction(
  stack,
  actionIdValue,
  { cascade = false, now } = {},
) {
  assertStack(stack);
  const active = getActivePendingAction(stack);
  if (!active || active.id !== actionIdValue) {
    return transition(stack, { changed: false, reason: 'not_active' });
  }

  const timestamp = nowIso(now);
  const canceled = cascade ? stack.actions : [active];
  const canceledActions = canceled.map((item) => ({
    ...item,
    status: PENDING_ACTION_STATUS.CANCELED,
    updatedAt: timestamp,
  }));
  const actions = cascade ? [] : stack.actions.slice(0, -1);
  let resumedAction = null;

  if (!cascade && actions.length) {
    resumedAction = {
      ...actions.at(-1),
      status: PENDING_ACTION_STATUS.PENDING,
      updatedAt: timestamp,
    };
    actions[actions.length - 1] = resumedAction;
  }

  const nextStack = {
    ...stack,
    actions,
    history: [...stack.history, ...canceledActions],
    updatedAt: timestamp,
  };
  return transition(nextStack, {
    changed: true,
    canceledActions,
    resumedAction,
  });
}

export function validatePendingActionStack(stack, identity = null) {
  try {
    assertStack(stack);
    const normalizedIdentity = identity ? normalizeIdentity(identity) : null;
    const identityMatches = !normalizedIdentity
      || Object.keys(normalizedIdentity).every(
        (key) => stack.identity?.[key] === normalizedIdentity[key],
      );
    const uniqueIds = new Set(stack.actions.map((action) => action.id));
    const validParents = stack.actions.every((action, index) => (
      index === 0
        ? action.parentActionId === null
        : action.parentActionId === stack.actions[index - 1].id
    ));
    return identityMatches
      && uniqueIds.size === stack.actions.length
      && validParents
      && stack.actions.every((action) => (
        typeof action.type === 'string'
        && ACTIVE_STATUSES.has(action.status)
      ));
  } catch {
    return false;
  }
}
