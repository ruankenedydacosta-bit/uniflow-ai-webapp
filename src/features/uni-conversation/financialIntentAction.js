import { normalizeFinancialText } from '../uni-intents/index.js';

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

function normalize(value) {
  return normalizeFinancialText(typeof value === 'string' ? value : '');
}

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

function accountSearchTerms(parsed, overrideName) {
  return [overrideName, parsed.entities.account]
    .filter(Boolean)
    .map(normalize)
    .filter(Boolean);
}

function accountMatchesInput(account, normalizedInput) {
  const accountName = normalize(account.name);
  const institutionName = normalize(account.institution_name);
  return [accountName, institutionName]
    .filter((value) => value.length >= 3)
    .some((value) => normalizedInput.includes(value));
}

function resolveAccount({ accounts, parsed, accountId, accountName }) {
  const allAccounts = Array.isArray(accounts) ? accounts : [];
  const normalizedInput = normalize(parsed.input);

  if (accountId) {
    const account = allAccounts.find((item) => item.id === accountId);
    if (!account) return { code: 'account_not_found', candidates: [] };
    if (account.is_active === false) {
      return { code: 'account_archived', candidates: [account] };
    }
    return { account, candidates: [account] };
  }

  const explicitTerms = accountSearchTerms(parsed, accountName);
  const explicitMatches = allAccounts.filter((account) => {
    const values = [normalize(account.name), normalize(account.institution_name)];
    return explicitTerms.some((term) =>
      values.some((value) => value === term || value.includes(term) || term.includes(value)),
    );
  });
  const inferredMatches = explicitTerms.length
    ? explicitMatches
    : allAccounts.filter((account) => accountMatchesInput(account, normalizedInput));
  const matches = inferredMatches.filter(
    (account, index, current) => current.findIndex((item) => item.id === account.id) === index,
  );

  if (matches.length === 1 && matches[0].is_active !== false) {
    return { account: matches[0], candidates: matches };
  }
  if (matches.some((account) => account.is_active === false) &&
      matches.every((account) => account.is_active === false)) {
    return { code: 'account_archived', candidates: matches };
  }
  if (matches.filter((account) => account.is_active !== false).length > 1) {
    return {
      code: 'account_ambiguous',
      candidates: matches.filter((account) => account.is_active !== false),
    };
  }
  return {
    code: explicitTerms.length || inferredMatches.length ? 'account_not_found' : 'account_required',
    candidates: allAccounts.filter((account) => account.is_active !== false),
  };
}

function categorySimilarity(category, requestedCategory, normalizedInput) {
  const name = normalize(category.name);
  const requested = normalize(requestedCategory);
  if (requested && name === requested) return 4;
  if (requested && (name.includes(requested) || requested.includes(name))) return 3;

  const nameWords = name.split(' ').filter((word) => word.length >= 4);
  return nameWords.some((word) => normalizedInput.includes(word)) ? 2 : 0;
}

function resolveCategory({ categories, parsed, categoryId, transactionType }) {
  const compatible = (Array.isArray(categories) ? categories : []).filter(
    (category) =>
      category.is_active !== false && category.category_type === transactionType,
  );

  if (categoryId) {
    const category = compatible.find((item) => item.id === categoryId);
    return category
      ? { category, candidates: compatible }
      : { code: 'category_incompatible', candidates: compatible };
  }

  const ranked = compatible
    .map((category) => ({
      category,
      score: categorySimilarity(category, parsed.entities.category, parsed.normalizedInput),
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
    return { category: ranked[0].category, candidates: compatible, approximate: ranked[0].score < 4 };
  }

  return {
    code: parsed.entities.category ? 'category_not_found' : 'category_required',
    candidates: compatible,
  };
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
  categories = [],
  referenceDate,
  overrides = {},
} = {}) {
  if (!parsed || !isFinancialTransactionIntent(parsed.intent)) {
    return { status: 'unsupported', intent: parsed?.intent ?? 'question', issues: [] };
  }

  const transactionType = ACTION_INTENTS[parsed.intent];
  const amount = Number(overrides.amount ?? parsed.entities.amount);
  const date = overrides.date ?? parsed.entities.date ?? referenceDate;
  const fallbackDescription = transactionType === 'income'
    ? 'Entrada'
    : transactionType === 'transfer'
      ? 'Transferência'
      : 'Despesa';
  const description = sanitizeDescription(
    overrides.description ?? parsed.entities.description ?? fallbackDescription,
  );
  const accountResult = resolveAccount({
    accounts,
    parsed,
    accountId: overrides.accountId,
    accountName: overrides.accountName,
  });
  const categoryResult = resolveCategory({
    categories,
    parsed,
    categoryId: overrides.categoryId,
    transactionType,
  });
  const issues = [];

  if (!Number.isFinite(amount) || amount <= 0) {
    issues.push(createIssue('amount', 'amount_required'));
  }
  if (!accountResult.account) {
    issues.push(createIssue('account', accountResult.code, accountResult.candidates));
  }
  if (transactionType === 'transfer' && !overrides.destinationAccountId) {
    issues.push(createIssue('destinationAccount', 'destination_account_required', accountResult.candidates));
  }
  if (!categoryResult.category) {
    issues.push(createIssue('category', categoryResult.code, categoryResult.candidates));
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
        account_id: accountResult.account.id,
        destination_account_id:
          transactionType === 'transfer' ? overrides.destinationAccountId : null,
        category_id: categoryResult.category.id,
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
    category: categoryResult.category ?? null,
    categoryWasApproximate: Boolean(categoryResult.approximate),
    issues,
    options: {
      accounts: (Array.isArray(accounts) ? accounts : []).filter((account) => account.is_active !== false),
      categories: categoryResult.candidates ?? [],
    },
    payload,
  };
}

export async function executeFinancialIntentAction(action, saveTransaction) {
  if (action?.status !== 'ready' || !action.payload) {
    return {
      data: null,
      error: { code: 'ACTION_NOT_READY', message: 'Revise os dados antes de confirmar.' },
    };
  }
  if (typeof saveTransaction !== 'function') {
    return {
      data: null,
      error: { code: 'TRANSACTION_HANDLER_MISSING', message: 'Não foi possível acessar o financeiro agora.' },
    };
  }
  return saveTransaction(action.payload);
}
