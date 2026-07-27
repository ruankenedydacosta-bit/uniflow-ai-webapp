import { normalizeFinancialText, parseFinancialText } from '../uni-intents/index.js';

const CONFIRMATION_PATTERNS = [
  /^(?:sim|confirmar|confirmo|certo|ok|pode registrar|pode salvar)[.!]?$/,
];
const CANCELLATION_PATTERNS = [
  /^(?:nao|cancelar|cancela|deixa|deixa pra la|esquece)[.!]?$/,
];

const ACCOUNT_IDENTITY_FIELDS = Object.freeze([
  'name',
  'institution_name',
  'institution',
  'nickname',
  'alias',
  'metadata.nickname',
  'metadata.alias',
]);

function readIdentityField(item, field) {
  return field.split('.').reduce((current, key) => current?.[key], item);
}

function belongsToWorkspace(item, workspaceId) {
  return !workspaceId || !item?.workspace_id || item.workspace_id === workspaceId;
}

function findMatches(items, input, fields = ['name'], workspaceId = null) {
  const normalizedInput = normalizeFinancialText(input);
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.is_active !== false)
    .filter((item) => belongsToWorkspace(item, workspaceId))
    .filter((item) => {
      const identities = fields
        .map((field) => normalizeFinancialText(readIdentityField(item, field)))
        .filter(Boolean);
      return identities.some((identity) => (
        identity === normalizedInput
        || normalizedInput.includes(identity)
        || identity.includes(normalizedInput)
      ));
    });
}

export function classifyPendingActionReply(value) {
  const normalized = normalizeFinancialText(value).replace(/[!?]+$/g, '');
  if (CONFIRMATION_PATTERNS.some((pattern) => pattern.test(normalized))) return 'confirm';
  if (CANCELLATION_PATTERNS.some((pattern) => pattern.test(normalized))) return 'cancel';
  return 'input';
}

export function resolvePendingActionInput({
  value,
  action,
  accounts = [],
  categories = [],
  workspaceId = null,
  referenceDate,
} = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || !action) return { kind: 'invalid', overrides: null };

  const firstIssue = action.issues?.[0]?.field ?? null;
  const normalized = normalizeFinancialText(text);
  const parsed = parseFinancialText(text, { referenceDate });
  const explicitField = /\b(?:valor|quantia)\b/.test(normalized) ? 'amount'
    : /\b(?:conta destino|destino)\b/.test(normalized) ? 'destinationAccount'
      : /\bconta\b/.test(normalized) ? 'account'
        : /\bcategoria\b/.test(normalized) ? 'category'
          : /\bdata\b/.test(normalized) ? 'date'
            : /\b(?:descricao|descrição|identificar)\b/.test(normalized) ? 'description'
              : null;
  const field = explicitField ?? firstIssue;

  if (field === 'amount') {
    const amount = Number(parsed.entities.amount);
    return Number.isFinite(amount) && amount > 0
      ? { kind: 'correction', overrides: { amount } }
      : { kind: 'invalid', overrides: null };
  }

  if (field === 'account' || field === 'destinationAccount') {
    const availableAccounts = (Array.isArray(accounts) ? accounts : [])
      .filter((account) => account?.is_active !== false)
      .filter((account) => belongsToWorkspace(account, workspaceId));
    const matches = findMatches(accounts, text, ACCOUNT_IDENTITY_FIELDS, workspaceId);
    if (matches.length > 1) {
      return { kind: 'ambiguous_account', accounts: matches, overrides: null };
    }
    if (!matches.length) {
      return { kind: 'account_not_found', accounts: availableAccounts, overrides: null };
    }
    const [account] = matches;
    return {
      kind: 'correction',
      overrides: field === 'destinationAccount'
        ? { destinationAccountId: account.id }
        : { accountId: account.id },
    };
  }

  if (field === 'category') {
    const [category] = findMatches(categories, text);
    return category
      ? { kind: 'correction', overrides: { categoryId: category.id } }
      : { kind: 'invalid', overrides: null };
  }

  if (field === 'date') {
    return parsed.entities.date
      ? { kind: 'correction', overrides: { date: parsed.entities.date } }
      : { kind: 'invalid', overrides: null };
  }

  if (field === 'description') {
    const description = text
      .replace(/^(?:descricao|descrição|identificar)\s*(?:é|e|:)?\s*/i, '')
      .trim();
    return description.length >= 2
      ? { kind: 'correction', overrides: { description } }
      : { kind: 'invalid', overrides: null };
  }

  return { kind: 'invalid', overrides: null };
}
