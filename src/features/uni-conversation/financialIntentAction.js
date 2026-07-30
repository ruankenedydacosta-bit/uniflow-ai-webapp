import {
  ACCOUNT_RESOLUTION_STATUS,
  resolveFinancialAccount,
} from './accountResolution.js';
import {
  CATEGORY_RESOLUTION_STATUS,
  resolveFinancialCategory,
} from './categoryResolution.js';
import { provisionAccountAndTransaction } from './accountProvisioning.js';

const ACTION_INTENTS = Object.freeze({
  register_income: 'income',
  register_expense: 'expense',
  register_transfer: 'transfer',
});

const TYPE_LABELS = Object.freeze({
  income: 'Entrada',
  expense: 'Despesa',
  transfer: 'Transferência',
});

const ISSUE_PRIORITY = Object.freeze({
  amount: 1,
  account: 2,
  destinationAccount: 3,
  category: 4,
  description: 5,
  date: 6,
  type: 7,
});

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sanitizeDescription(value) {
  if (typeof value !== 'string') return null;
  const withoutControlCharacters = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');
  const sanitized = withoutControlCharacters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return sanitized.length >= 2 ? sanitized : null;
}

// BLOCO B: mapeia o status de resolveFinancialCategory (categoryResolution.js)
// para o codigo de issue exibido/interpretado pelo restante do fluxo.
// 'category_incompatible' preserva o comportamento anterior (categoryId
// explicito mas de tipo errado). 'category_approximate' e 'category_will_create'
// sao novos (Bloco B1/B2/B3). 'category_required' e o fallback final quando
// nao ha nem correspondencia nem nome algum para propor.
function mapCategoryIssueCode(categoryResult) {
  if (categoryResult.incompatible) return 'category_incompatible';
  if (categoryResult.status === CATEGORY_RESOLUTION_STATUS.PENDING_APPROXIMATE) return 'category_approximate';
  if (categoryResult.status === CATEGORY_RESOLUTION_STATUS.WILL_CREATE) return 'category_will_create';
  if (categoryResult.status === CATEGORY_RESOLUTION_STATUS.NOT_FOUND) {
    return categoryResult.proposedCategoryName ? 'category_not_found' : 'category_required';
  }
  return 'category_required';
}

function createIssue(field, code, candidates = []) {
  return { field, code, candidates };
}

export function isFinancialTransactionIntent(intent) {
  return Object.hasOwn(ACTION_INTENTS, intent);
}

export function buildFinancialIntentAction({
  parsed,
  accounts = [],
  accountTypes = [],
  categories = [],
  referenceDate,
  overrides = {},
  workspaceType = 'personal',
} = {}) {
  if (!parsed || !isFinancialTransactionIntent(parsed.intent)) {
    return { status: 'unsupported', intent: parsed?.intent ?? 'question', issues: [] };
  }

  const transactionType = ACTION_INTENTS[parsed.intent];
  const amount = Number(overrides.amount ?? parsed.entities.amount);
  const date = overrides.date ?? parsed.entities.date ?? referenceDate;
  const description = sanitizeDescription(
    overrides.description ?? parsed.entities.description,
  );
  const accountResult = resolveFinancialAccount({
    accounts,
    accountTypes,
    accountId: overrides.accountId,
    requestedName: overrides.accountName ?? parsed.entities.account,
    requestedType: overrides.accountType,
    decision: overrides.accountDecision,
    input: parsed.input,
  });
  const categoryResult = resolveFinancialCategory({
    categories,
    transactionType,
    categoryId: overrides.categoryId,
    requestedName: parsed.entities.category,
    description: parsed.entities.description,
    normalizedInput: parsed.normalizedInput,
    approved: overrides.categoryApproved,
    excludedCategoryId: overrides.rejectedCategoryId,
    excludedCategoryName: overrides.rejectedCategoryName,
    decision: overrides.categoryDecision,
    workspaceType,
    aiInference: overrides.aiInference ?? null,
  });
  const issues = [];

  if (!Number.isFinite(amount) || amount <= 0) {
    issues.push(createIssue('amount', 'amount_required'));
  }
  const accountIsReady = [
    ACCOUNT_RESOLUTION_STATUS.RESOLVED,
    ACCOUNT_RESOLUTION_STATUS.WILL_CREATE,
  ].includes(accountResult.status);
  if (!accountIsReady) {
    const issueCode = accountResult.status === ACCOUNT_RESOLUTION_STATUS.ARCHIVED_CONFLICT
      ? 'account_archived'
      : accountResult.status === ACCOUNT_RESOLUTION_STATUS.AMBIGUOUS
        ? 'account_ambiguous'
        : parsed.entities.account
          ? 'account_not_found'
          : 'account_required';
    issues.push(createIssue('account', issueCode, accountResult.candidates));
  }
  if (transactionType === 'transfer' && !overrides.destinationAccountId) {
    issues.push(createIssue('destinationAccount', 'destination_account_required', accountResult.candidates));
  }
  const categoryIsReady = Boolean(categoryResult.category)
    || categoryResult.status === CATEGORY_RESOLUTION_STATUS.WILL_CREATE;
  if (!categoryIsReady) {
    issues.push(createIssue('category', mapCategoryIssueCode(categoryResult), categoryResult.candidates));
  }
  if (!description) {
    issues.push(createIssue('description', 'description_required'));
  }
  if (!isValidDate(date)) {
    issues.push(createIssue('date', 'date_invalid'));
  }

  issues.sort((left, right) => ISSUE_PRIORITY[left.field] - ISSUE_PRIORITY[right.field]);

  const payload = issues.length
    ? null
    : {
        account_id: accountResult.account?.id ?? null,
        destination_account_id:
          transactionType === 'transfer' ? overrides.destinationAccountId : null,
        category_id: categoryResult.category?.id ?? null,
        transaction_type: transactionType,
        description,
        amount,
        transaction_date: date,
        status: 'completed',
      };

  return {
    status: issues.length ? 'needs_clarification' : 'ready',
    intent: parsed.intent,
    transactionType,
    typeLabel: TYPE_LABELS[transactionType],
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    date: isValidDate(date) ? date : null,
    description,
    account: accountResult.account ?? null,
    clientOperationId: overrides.clientOperationId ?? null,
    accountResolution: accountResult,
    proposedAccount: accountResult.proposedAccount ?? null,
    requestedAccountName: overrides.accountName ?? parsed.entities.account ?? null,
    category: categoryResult.category ?? null,
    categoryWasApproximate: Boolean(categoryResult.approximate),
    proposedCategory: categoryResult.proposedCategory ?? null,
    proposedCategoryName: categoryResult.proposedCategoryName ?? null,
    issues,
    options: {
      accounts: (Array.isArray(accounts) ? accounts : []).filter((account) => account.is_active !== false),
      accountTypes: (Array.isArray(accountTypes) ? accountTypes : []).filter((type) => type.is_active !== false),
      categories: categoryResult.candidates ?? [],
    },
    payload,
  };
}

export async function executeFinancialIntentAction(action, handlers) {
  if (action?.status !== 'ready' || !action.payload) {
    return {
      data: null,
      error: { code: 'ACTION_NOT_READY', message: 'Revise os dados antes de confirmar.' },
    };
  }
  return provisionAccountAndTransaction(action, handlers);
}
