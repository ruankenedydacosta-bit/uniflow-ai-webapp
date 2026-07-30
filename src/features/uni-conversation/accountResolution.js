import { normalizeFinancialText } from '../uni-intents/index.js';
import { normalizeFinancialInstitutionName } from '../financial-institutions/index.js';

export const ACCOUNT_RESOLUTION_STATUS = Object.freeze({
  RESOLVED: 'resolved',
  WILL_CREATE: 'will_create',
  ARCHIVED_CONFLICT: 'archived_conflict',
  AMBIGUOUS: 'ambiguous',
  MISSING: 'missing',
});

function cleanAccountName(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/^\s*(?:conta|cart[aã]o)(?:\s+(?:corrente|digital|de\s+cr[eé]dito))?\s+/iu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function normalizeAccountIdentity(value) {
  return normalizeFinancialText(typeof value === 'string' ? value : '')
    .replace(/\b(?:conta|cartao|banco|carteira)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

function accountMatches(account, requestedIdentity) {
  return [account?.name, account?.institution_name]
    .map(normalizeAccountIdentity)
    .filter(Boolean)
    .some((identity) => identity === requestedIdentity);
}

function selectAccountType({ accountTypes, requestedType, input }) {
  const activeTypes = (Array.isArray(accountTypes) ? accountTypes : [])
    .filter((type) => type?.is_active !== false && typeof type?.code === 'string');
  const availableCodes = new Set(activeTypes.map((type) => type.code));

  if (requestedType && availableCodes.has(requestedType)) return requestedType;

  const normalizedInput = normalizeFinancialText(input ?? '');
  const preferences = /\bcartao\b/.test(normalizedInput)
    ? ['credit_card']
    : /\bpoupanca\b/.test(normalizedInput)
      ? ['savings']
      : /\bconta corrente\b/.test(normalizedInput)
        ? ['checking']
        : ['digital_wallet', 'checking', 'other'];

  return preferences.find((code) => availableCodes.has(code)) ?? activeTypes[0]?.code ?? null;
}

function createProposedAccount({ requestedName, requestedType, accountTypes, input }) {
  const name = cleanAccountName(requestedName);
  const accountType = selectAccountType({ accountTypes, requestedType, input });

  if (!name || !accountType) return null;

  return {
    name,
    institution_name: name,
    account_type: accountType,
    currency_code: 'BRL',
    initial_balance: 0,
    current_balance: 0,
    is_active: true,
  };
}

export function resolveFinancialAccount({
  accounts = [],
  accountTypes = [],
  requestedName,
  requestedType,
  accountId,
  decision,
  input,
} = {}) {
  const availableAccounts = Array.isArray(accounts) ? accounts : [];

  if (accountId) {
    const selected = availableAccounts.find((account) => account.id === accountId);
    if (!selected) {
      return {
        status: ACCOUNT_RESOLUTION_STATUS.MISSING,
        candidates: [],
        explanation: 'A conta escolhida não pertence a este espaço.',
      };
    }
    if (selected.is_active === false && decision !== 'reactivate') {
      return {
        status: ACCOUNT_RESOLUTION_STATUS.ARCHIVED_CONFLICT,
        candidates: [selected],
        explanation: `Encontrei a conta ${selected.name} arquivada. Você quer reativá-la ou criar uma nova conta?`,
      };
    }
    return {
      status: ACCOUNT_RESOLUTION_STATUS.RESOLVED,
      account: selected,
      candidates: [selected],
      provisioning: selected.is_active === false ? 'reactivate' : null,
      explanation: selected.is_active === false ? 'A conta será reativada somente após sua confirmação.' : null,
    };
  }

  // Camada de normalizacao de instituicoes financeiras (100% determinística/
  // offline, nunca a OpenAI): uma transcricao de voz garbled como "No Bank"
  // (Nubank) normaliza para o nome canonico -- mas SO passa a valer se o
  // texto ORIGINAL nao encontrar nenhuma conta real primeiro (uma conta
  // literalmente chamada "Caixa" continua batendo com "Caixa" sem que a
  // normalizacao para "Caixa Economica Federal" atrapalhe). Corrige o caso
  // real "Gastei 50 reais no mercado e foi no Nubank" transcrito como
  // "...e foi no No Bank", que sem isso tentaria criar uma conta "No Bank"
  // em vez de reconhecer a conta existente "Nubank".
  const originalIdentity = normalizeAccountIdentity(requestedName);
  const originalMatches = originalIdentity
    ? availableAccounts.filter((account) => accountMatches(account, originalIdentity))
    : [];

  let requestedIdentity = originalIdentity;
  let matches = originalMatches;
  let effectiveRequestedName = requestedName;

  if (!matches.length) {
    const institutionMatch = normalizeFinancialInstitutionName(requestedName, { hasAccountContext: true });
    if (institutionMatch.canonicalName) {
      effectiveRequestedName = institutionMatch.canonicalName;
      const canonicalIdentity = normalizeAccountIdentity(institutionMatch.canonicalName);
      const canonicalMatches = availableAccounts.filter((account) => accountMatches(account, canonicalIdentity));
      if (canonicalMatches.length) {
        matches = canonicalMatches;
        requestedIdentity = canonicalIdentity;
      }
    }
  }

  const proposedAccount = createProposedAccount({
    requestedName: effectiveRequestedName,
    requestedType,
    accountTypes,
    input,
  });

  if (decision === 'create_new' && proposedAccount) {
    return {
      status: ACCOUNT_RESOLUTION_STATUS.WILL_CREATE,
      proposedAccount,
      candidates: [],
      explanation: `${proposedAccount.name} será criada somente após sua confirmação.`,
    };
  }

  if (!requestedIdentity) {
    return {
      status: ACCOUNT_RESOLUTION_STATUS.MISSING,
      candidates: availableAccounts.filter((account) => account.is_active !== false),
      explanation: 'Informe qual conta deve ser usada.',
    };
  }

  const activeMatches = matches.filter((account) => account.is_active !== false);
  const archivedMatches = matches.filter((account) => account.is_active === false);

  if (activeMatches.length === 1) {
    return {
      status: ACCOUNT_RESOLUTION_STATUS.RESOLVED,
      account: activeMatches[0],
      candidates: activeMatches,
      explanation: null,
    };
  }
  if (activeMatches.length > 1) {
    return {
      status: ACCOUNT_RESOLUTION_STATUS.AMBIGUOUS,
      candidates: activeMatches,
      explanation: 'Encontrei mais de uma conta ativa com esse nome. Escolha a conta correta.',
    };
  }
  if (archivedMatches.length) {
    return {
      status: ACCOUNT_RESOLUTION_STATUS.ARCHIVED_CONFLICT,
      candidates: archivedMatches,
      explanation: `Encontrei uma conta ${cleanAccountName(effectiveRequestedName)} arquivada. Você quer reativá-la ou criar uma nova conta?`,
    };
  }
  if (proposedAccount) {
    return {
      status: ACCOUNT_RESOLUTION_STATUS.WILL_CREATE,
      proposedAccount,
      candidates: [],
      explanation: `${proposedAccount.name} será criada somente após sua confirmação.`,
    };
  }

  return {
    status: ACCOUNT_RESOLUTION_STATUS.MISSING,
    candidates: availableAccounts.filter((account) => account.is_active !== false),
    explanation: 'Não consegui preparar a conta com os tipos disponíveis.',
  };
}
