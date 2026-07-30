import { normalizeFinancialText, parseFinancialText } from '../uni-intents/index.js';
import { normalizeFinancialInstitutionName } from '../financial-institutions/index.js';

// BLOCO F: fala real do usuário raramente é um token isolado ("confirma")
// -- variações comuns como "sim, pode confirmar" ou "confirma isso aí"
// não batiam antes, caindo num fallback genérico (ou, no pior caso, no
// chat de texto livre, que corretamente se descreve como incapaz de
// executar ações -- nunca deveria ser alcançado com uma confirmação real
// pendente). Continua exigindo a frase INTEIRA bater com um destes
// padrões -- nunca um "includes" cego que arriscaria confirmar/cancelar a
// partir de texto ambíguo.
const CONFIRMATION_PATTERNS = [
  /^(?:sim|confirmar|confirmo|confirma|confirmado|certo|ok|isso|pode|pode usar|cria)[.!]?$/,
  /^(?:pode registrar|pode salvar|pode confirmar|pode continuar)[.!]?$/,
  /^sim,?\s*(?:pode\s+)?confirma(?:r)?[.!]?$/,
  /^confirma(?:r)?\s+isso(?:\s+a[íi])?[.!]?$/,
  /^t[áa]\s+certo,?\s*(?:pode\s+)?confirma(?:r)?[.!]?$/,
];
const CANCELLATION_PATTERNS = [
  /^(?:nao|cancelar|cancela|deixa|deixa pra la|esquece)[.!]?$/,
  /^(?:sim,?\s*)?cancela(?:r)?\s+tudo[.!]?$/,
  /^n[ãa]o,?\s*cancela(?:r)?[.!]?$/,
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
    let matches = findMatches(accounts, text, ACCOUNT_IDENTITY_FIELDS, workspaceId);
    if (!matches.length) {
      // Camada de normalizacao de instituicoes financeiras (offline,
      // determinística): uma transcricao garbled como "foi no No Bank"
      // nao bate literalmente com a conta real "Nubank" -- tenta de novo
      // usando o nome canonico da instituicao antes de concluir que a
      // conta nao existe (nunca antes de tentar o texto original).
      const institutionMatch = normalizeFinancialInstitutionName(text, { hasAccountContext: true });
      if (institutionMatch.canonicalName) {
        matches = findMatches(accounts, institutionMatch.canonicalName, ACCOUNT_IDENTITY_FIELDS, workspaceId);
      }
    }
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
    const availableCategories = (Array.isArray(categories) ? categories : [])
      .filter((category) => category?.is_active !== false);
    const [category] = findMatches(categories, text);
    if (category) {
      return { kind: 'correction', overrides: { categoryId: category.id } };
    }
    return { kind: 'category_not_found', categories: availableCategories, overrides: null };
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
