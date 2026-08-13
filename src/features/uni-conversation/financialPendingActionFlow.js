import { normalizeAccountIdentity } from './accountResolution.js';
import { normalizeFinancialText } from '../uni-intents/index.js';
import {
  cancelPendingAction,
  completePendingAction,
  createPendingActionStack,
  getActivePendingAction,
  pushPendingAction,
  updatePendingAction,
} from './pendingActionStack.js';

export const FINANCIAL_PENDING_ACTION_TYPES = Object.freeze({
  TRANSACTION: 'financial_transaction',
  CREATE_ACCOUNT: 'create_financial_account',
  CREATE_CATEGORY: 'create_financial_category',
});

const CANCEL_ALL_PATTERNS = [
  /^(?:cancelar|cancela)\s+(?:tudo|o fluxo|a operacao|a operação)[.!]?$/u,
  /^(?:desistir|esquecer)\s+(?:de tudo|da operacao|da operação)[.!]?$/u,
];

function readAccountIdentities(account) {
  return [
    account?.name,
    account?.institution_name,
    account?.institution,
    account?.nickname,
    account?.alias,
    account?.metadata?.nickname,
    account?.metadata?.alias,
  ]
    .map(normalizeAccountIdentity)
    .filter(Boolean);
}

function belongsToWorkspace(account, workspaceId) {
  return Boolean(
    account
    && account.is_active !== false
    && (!workspaceId || !account.workspace_id || account.workspace_id === workspaceId),
  );
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (
          left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
        ),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function identitiesAreSimilar(left, right) {
  if (left.includes(right) || right.includes(left)) return true;
  if (Math.min(left.length, right.length) < 5) return false;
  return editDistance(left, right) <= 2;
}

function assertFinancialSnapshot(snapshot) {
  if (!snapshot?.action?.clientOperationId || !snapshot?.action?.intent) {
    throw new Error('FINANCIAL_PENDING_SNAPSHOT_INVALID');
  }
}

function assertProposedAccount(account) {
  if (
    !account
    || typeof account.name !== 'string'
    || !account.name.trim()
    || typeof account.account_type !== 'string'
    || !account.account_type
  ) {
    throw new Error('ACCOUNT_DEPENDENCY_FIELDS_REQUIRED');
  }
}

function suspendFinancialSnapshotForAccount(financialSnapshot) {
  const action = financialSnapshot.action;
  const otherIssues = (Array.isArray(action.issues) ? action.issues : [])
    .filter((issue) => issue?.field !== 'account');
  return {
    ...financialSnapshot,
    action: {
      ...action,
      status: 'needs_clarification',
      account: null,
      accountResolution: {
        status: 'missing',
        candidates: action.options?.accounts ?? [],
        explanation: 'A criação da conta está pendente de confirmação.',
      },
      proposedAccount: null,
      payload: null,
      issues: [
        {
          field: 'account',
          code: 'account_required',
          candidates: action.options?.accounts ?? [],
        },
        ...otherIssues,
      ],
    },
  };
}

function assertProposedCategory(category) {
  if (
    !category
    || typeof category.name !== 'string'
    || !category.name.trim()
    || typeof category.category_type !== 'string'
    || !category.category_type
  ) {
    throw new Error('CATEGORY_DEPENDENCY_FIELDS_REQUIRED');
  }
}

function suspendFinancialSnapshotForCategory(financialSnapshot) {
  const action = financialSnapshot.action;
  const otherIssues = (Array.isArray(action.issues) ? action.issues : [])
    .filter((issue) => issue?.field !== 'category');
  return {
    ...financialSnapshot,
    action: {
      ...action,
      status: 'needs_clarification',
      category: null,
      proposedCategory: null,
      payload: null,
      issues: [
        {
          field: 'category',
          code: 'category_required',
          candidates: action.options?.categories ?? [],
        },
        ...otherIssues,
      ],
    },
  };
}

export function findAccountCreationConflicts({
  accounts = [],
  requestedName,
  workspaceId,
} = {}) {
  const requestedIdentity = normalizeAccountIdentity(requestedName);
  if (!requestedIdentity) return Object.freeze({ exact: [], similar: [] });

  const exact = [];
  const similar = [];
  for (const account of Array.isArray(accounts) ? accounts : []) {
    if (!belongsToWorkspace(account, workspaceId)) continue;
    const identities = readAccountIdentities(account);
    if (identities.some((identity) => identity === requestedIdentity)) {
      exact.push(account);
      continue;
    }
    if (identities.some((identity) => identitiesAreSimilar(identity, requestedIdentity))) {
      similar.push(account);
    }
  }

  return Object.freeze({
    exact: Object.freeze([...exact]),
    similar: Object.freeze([...similar]),
  });
}

export function startAccountCreationDependency({
  stack = null,
  identity,
  financialSnapshot,
  proposedAccount,
  now,
} = {}) {
  assertFinancialSnapshot(financialSnapshot);
  assertProposedAccount(proposedAccount);

  let nextStack = stack;
  const operationId = financialSnapshot.action.clientOperationId;
  const suspendedSnapshot = suspendFinancialSnapshotForAccount(financialSnapshot);
  const parent = nextStack?.actions?.find(
    (action) => action.type === FINANCIAL_PENDING_ACTION_TYPES.TRANSACTION,
  );

  if (!nextStack) {
    nextStack = createPendingActionStack(identity, { now });
  }
  if (!parent) {
    nextStack = pushPendingAction(nextStack, {
      id: operationId,
      type: FINANCIAL_PENDING_ACTION_TYPES.TRANSACTION,
      deduplicationKey: `financial:${operationId}`,
      fields: { snapshot: suspendedSnapshot },
      context: {
        workspaceId: identity.workspaceId,
        conversationId: identity.conversationId,
      },
    }, { now }).stack;
  } else {
    nextStack = updatePendingAction(nextStack, parent.id, {
      fields: { snapshot: suspendedSnapshot },
    }, { now }).stack;
  }

  const accountIdentity = normalizeAccountIdentity(proposedAccount.name);
  return pushPendingAction(nextStack, {
    id: `${operationId}:account:${accountIdentity}`,
    type: FINANCIAL_PENDING_ACTION_TYPES.CREATE_ACCOUNT,
    deduplicationKey: `create-account:${identity.workspaceId}:${accountIdentity}`,
    status: 'awaiting_confirmation',
    fields: {
      account: proposedAccount,
      sourceOperationId: operationId,
    },
    context: {
      workspaceId: identity.workspaceId,
      conversationId: identity.conversationId,
      userId: identity.userId,
    },
  }, { now });
}

export function buildAccountCreationConfirmation(action, {
  accountTypes = [],
  workspaceType = 'personal',
} = {}) {
  if (action?.type !== FINANCIAL_PENDING_ACTION_TYPES.CREATE_ACCOUNT) return null;
  const account = action.fields?.account;
  const typeLabel = accountTypes.find((type) => type.code === account?.account_type)?.name
    ?? account?.account_type
    ?? '';

  return Object.freeze({
    title: 'Criar conta para continuar',
    status: 'pending',
    editable: false,
    rows: Object.freeze([
      Object.freeze({ label: 'Conta', value: account?.name ?? '' }),
      Object.freeze({ label: 'Tipo', value: typeLabel }),
      Object.freeze({
        label: 'Espaço',
        value: workspaceType === 'business' ? 'Empresa' : 'Pessoal',
      }),
    ]),
  });
}

export function completeAccountCreationDependency(stack, account, { now } = {}) {
  const active = getActivePendingAction(stack);
  if (active?.type !== FINANCIAL_PENDING_ACTION_TYPES.CREATE_ACCOUNT) {
    return Object.freeze({ stack, changed: false, reason: 'account_dependency_not_active' });
  }
  return completePendingAction(stack, active.id, account, { now });
}

export function updateResumedFinancialSnapshot(stack, financialSnapshot, { now } = {}) {
  const parent = stack?.actions?.find(
    (action) => action.type === FINANCIAL_PENDING_ACTION_TYPES.TRANSACTION,
  );
  if (!parent) return Object.freeze({ stack, changed: false, reason: 'financial_parent_missing' });
  return updatePendingAction(stack, parent.id, {
    fields: { snapshot: financialSnapshot },
  }, { now });
}

export function cancelAccountCreationDependency(stack, {
  cascade = false,
  now,
} = {}) {
  const active = getActivePendingAction(stack);
  if (active?.type !== FINANCIAL_PENDING_ACTION_TYPES.CREATE_ACCOUNT) {
    return Object.freeze({ stack, changed: false, reason: 'account_dependency_not_active' });
  }
  return cancelPendingAction(stack, active.id, { cascade, now });
}

export function isAccountCreationDependency(action) {
  return action?.type === FINANCIAL_PENDING_ACTION_TYPES.CREATE_ACCOUNT;
}

// BLOCO B3: espelha startAccountCreationDependency/buildAccountCreationConfirmation/
// completeAccountCreationDependency/cancelAccountCreationDependency/
// isAccountCreationDependency -- mesma pilha de ação pendente, mesma forma,
// aplicada à criação de categoria em vez de conta. Nenhuma arquitetura paralela.
export function startCategoryCreationDependency({
  stack = null,
  identity,
  financialSnapshot,
  proposedCategory,
  now,
} = {}) {
  assertFinancialSnapshot(financialSnapshot);
  assertProposedCategory(proposedCategory);

  let nextStack = stack;
  const operationId = financialSnapshot.action.clientOperationId;
  const suspendedSnapshot = suspendFinancialSnapshotForCategory(financialSnapshot);
  const parent = nextStack?.actions?.find(
    (action) => action.type === FINANCIAL_PENDING_ACTION_TYPES.TRANSACTION,
  );

  if (!nextStack) {
    nextStack = createPendingActionStack(identity, { now });
  }
  if (!parent) {
    nextStack = pushPendingAction(nextStack, {
      id: operationId,
      type: FINANCIAL_PENDING_ACTION_TYPES.TRANSACTION,
      deduplicationKey: `financial:${operationId}`,
      fields: { snapshot: suspendedSnapshot },
      context: {
        workspaceId: identity.workspaceId,
        conversationId: identity.conversationId,
      },
    }, { now }).stack;
  } else {
    nextStack = updatePendingAction(nextStack, parent.id, {
      fields: { snapshot: suspendedSnapshot },
    }, { now }).stack;
  }

  const categoryIdentity = normalizeFinancialText(proposedCategory.name);
  return pushPendingAction(nextStack, {
    id: `${operationId}:category:${categoryIdentity}`,
    type: FINANCIAL_PENDING_ACTION_TYPES.CREATE_CATEGORY,
    deduplicationKey: `create-category:${identity.workspaceId}:${proposedCategory.category_type}:${categoryIdentity}`,
    status: 'awaiting_confirmation',
    fields: {
      category: proposedCategory,
      sourceOperationId: operationId,
    },
    context: {
      workspaceId: identity.workspaceId,
      conversationId: identity.conversationId,
      userId: identity.userId,
    },
  }, { now });
}

export function buildCategoryCreationConfirmation(action, {
  workspaceType = 'personal',
} = {}) {
  if (action?.type !== FINANCIAL_PENDING_ACTION_TYPES.CREATE_CATEGORY) return null;
  const category = action.fields?.category;
  const typeLabel = category?.category_type === 'income' ? 'Entrada' : 'Saída';

  return Object.freeze({
    title: 'Criar categoria para continuar',
    status: 'pending',
    editable: false,
    rows: Object.freeze([
      Object.freeze({ label: 'Categoria', value: category?.name ?? '' }),
      Object.freeze({ label: 'Tipo', value: typeLabel }),
      Object.freeze({
        label: 'Espaço',
        value: workspaceType === 'business' ? 'Empresa' : 'Pessoal',
      }),
    ]),
  });
}

export function completeCategoryCreationDependency(stack, category, { now } = {}) {
  const active = getActivePendingAction(stack);
  if (active?.type !== FINANCIAL_PENDING_ACTION_TYPES.CREATE_CATEGORY) {
    return Object.freeze({ stack, changed: false, reason: 'category_dependency_not_active' });
  }
  return completePendingAction(stack, active.id, category, { now });
}

export function cancelCategoryCreationDependency(stack, {
  cascade = false,
  now,
} = {}) {
  const active = getActivePendingAction(stack);
  if (active?.type !== FINANCIAL_PENDING_ACTION_TYPES.CREATE_CATEGORY) {
    return Object.freeze({ stack, changed: false, reason: 'category_dependency_not_active' });
  }
  return cancelPendingAction(stack, active.id, { cascade, now });
}

export function isCategoryCreationDependency(action) {
  return action?.type === FINANCIAL_PENDING_ACTION_TYPES.CREATE_CATEGORY;
}

export function isCancelEntirePendingFlow(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return CANCEL_ALL_PATTERNS.some((pattern) => pattern.test(normalized));
}
