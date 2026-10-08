import {
  ACCOUNT_RESOLUTION_STATUS,
  normalizeAccountIdentity,
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
  set_balance: 'adjustment',
});

const TYPE_OVERRIDE_INTENTS = Object.freeze({
  income: 'register_income',
  expense: 'register_expense',
});

const TYPE_LABELS = Object.freeze({
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência',
  adjustment: 'Ajuste de saldo',
});

const ISSUE_PRIORITY = Object.freeze({
  intent: 0,
  amount: 2,
  account: 3,
  destinationAccount: 4,
  category: 5,
  description: 6,
  date: 7,
  type: 8,
  balance: 9,
});

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

// "Tenho R$ 1.000" é ambíguo por natureza (receita declarada ou saldo
// declarado) -- a pergunta é feita à pessoa, nunca decidida por nós.
const AMBIGUOUS_DECISION_INTENTS = new Set(['register_income', 'set_balance']);

export function isAmbiguousBalanceOrIncomeIntent(intent) {
  return intent === 'ambiguous_balance_or_income';
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// BUG REAL (Sprint 2.1, BUG 2): "Gastei 50 reais no Nubank." não era
// reconhecido -- extractAccount só cobre "na conta X"/"no banco X"/"pelo
// X" para receita/despesa (a forma coloquial "no/na <Nome>" sem "conta"/
// "banco" só era tentada em declarações de saldo ambíguas). Ampliar aquele
// regex cegamente quebrava casos reais já cobertos por teste ("Gastei
// cinquentão no mercado" precisa continuar com account: null, "mercado"
// vira descrição/categoria, nunca uma conta inventada).
//
// Correção correta: só este módulo (financialIntentAction.js) tem a lista
// REAL de contas do workspace -- então, e SOMENTE quando nenhuma conta foi
// extraída do jeito normal, procura no texto bruto por uma correspondência
// INEQUÍVOCA (uma única conta ativa cujo nome/instituição aparece no
// texto). Se nenhuma conta real bater (ex.: "mercado"), o resultado
// continua null e o comportamento anterior é preservado -- nunca inventa
// nem propõe criar uma conta a partir de uma palavra qualquer.
function findAccountMentionedInText(accounts, input) {
  if (typeof input !== 'string' || !input.trim() || !Array.isArray(accounts) || !accounts.length) {
    return null;
  }
  const normalizedInput = normalizeAccountIdentity(input);
  if (!normalizedInput) return null;

  const matches = new Map();
  for (const account of accounts) {
    if (!account || account.is_active === false) continue;
    const identities = [account.name, account.institution_name]
      .map((value) => normalizeAccountIdentity(value))
      .filter((identity) => identity.length >= 4);
    if (identities.some((identity) => normalizedInput.includes(identity))) {
      matches.set(account.id, account);
    }
  }
  const unique = [...matches.values()];
  return unique.length === 1 ? unique[0].name : null;
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
  accountBalances = null,
} = {}) {
  if (!parsed) {
    return { status: 'unsupported', intent: 'question', issues: [] };
  }

  // "Tenho R$ 1.000" → pergunta de decisão (receita vs saldo), nunca
  // lançamento direto. A decisão chega via overrides.intentDecision na
  // próxima rodada e então o fluxo continua pelo intent decidido.
  if (isAmbiguousBalanceOrIncomeIntent(parsed.intent)) {
    if (!AMBIGUOUS_DECISION_INTENTS.has(overrides.intentDecision)) {
      const amount = Number(overrides.amount ?? parsed.entities.amount);
      return {
        status: 'needs_clarification',
        intent: parsed.intent,
        amount: Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null,
        account: null,
        issues: [{ field: 'intent', code: 'ambiguous_balance_or_income' }],
        options: {
          accounts: (Array.isArray(accounts) ? accounts : []).filter((account) => account.is_active !== false),
          accountTypes: (Array.isArray(accountTypes) ? accountTypes : []).filter((type) => type.is_active !== false),
          categories: [],
        },
        payload: null,
      };
    }
    return buildFinancialIntentAction({
      parsed: { ...parsed, intent: overrides.intentDecision },
      accounts,
      accountTypes,
      categories,
      referenceDate,
      overrides,
      workspaceType,
      accountBalances,
    });
  }

  // Correção de tipo do rascunho ("salário não é despesa, é receita"): troca
  // entre entrada e saída. A categoria e os demais campos são reavaliados para
  // o tipo novo; transferência e ajuste de saldo não trocam de tipo assim.
  const switchedIntent = Object.hasOwn(TYPE_OVERRIDE_INTENTS, overrides.transactionType)
    ? TYPE_OVERRIDE_INTENTS[overrides.transactionType]
    : null;
  if (
    switchedIntent
    && switchedIntent !== parsed.intent
    && Object.values(TYPE_OVERRIDE_INTENTS).includes(parsed.intent)
  ) {
    return buildFinancialIntentAction({
      parsed: { ...parsed, intent: switchedIntent },
      accounts,
      accountTypes,
      categories,
      referenceDate,
      overrides,
      workspaceType,
      accountBalances,
    });
  }

  if (!isFinancialTransactionIntent(parsed.intent)) {
    return { status: 'unsupported', intent: parsed.intent, issues: [] };
  }

  const transactionType = ACTION_INTENTS[parsed.intent];
  const isAdjustment = transactionType === 'adjustment';
  const amount = Number(overrides.amount ?? parsed.entities.amount);
  const date = overrides.date ?? parsed.entities.date ?? referenceDate;
  let description = sanitizeDescription(
    overrides.description ?? parsed.entities.description,
  ) ?? (isAdjustment ? 'Ajuste de saldo' : null);
  const explicitAccountName = overrides.accountName ?? parsed.entities.account;
  // BUG REAL (Sprint 2.1, BUG 2): só tenta a correspondência por texto
  // bruto contra a lista real de contas quando a extração normal não achou
  // NADA -- nunca substitui uma conta já identificada, e fica de fora de
  // transferência (origem/destino têm semântica própria, já resolvida
  // separadamente).
  const fallbackAccountName = !explicitAccountName && (transactionType === 'income' || transactionType === 'expense')
    ? findAccountMentionedInText(accounts, parsed.input)
    : null;
  const accountResult = resolveFinancialAccount({
    accounts,
    accountTypes,
    accountId: overrides.accountId,
    requestedName: explicitAccountName ?? fallbackAccountName,
    requestedType: overrides.accountType,
    decision: overrides.accountDecision,
    input: parsed.input,
  });
  const categoryResult = isAdjustment
    ? null
    : resolveFinancialCategory({
        categories,
        transactionType,
        categoryId: overrides.categoryId,
        // categoryName: a categoria que o card de criação já propunha, preservada
        // quando o rascunho volta com uma correção de outro campo.
        requestedName: overrides.categoryName ?? parsed.entities.category,
        description: parsed.entities.description,
        normalizedInput: parsed.normalizedInput,
        approved: overrides.categoryApproved,
        excludedCategoryId: overrides.rejectedCategoryId,
        excludedCategoryName: overrides.rejectedCategoryName,
        decision: overrides.categoryDecision,
        workspaceType,
        aiInference: overrides.aiInference ?? null,
      });
  // BUG REAL (BUG 2): transferência precisa resolver a conta de DESTINO
  // ("para o Inter") além da origem. Só conta existente resolve
  // (RESOLVED) -- nunca propomos criar a conta de destino no fluxo de uma
  // única operação (isso é responsabilidade da camada neural/plano); um
  // nome sem conta vira destination_account_required e a pendência
  // pergunta pelo destino.
  const destinationResult = transactionType === 'transfer'
    ? resolveFinancialAccount({
        accounts,
        accountTypes,
        accountId: overrides.destinationAccountId,
        requestedName: overrides.destinationAccountName ?? parsed.entities.destinationAccount,
        requestedType: overrides.destinationAccountType,
        input: parsed.input,
      })
    : null;
  // BUG REAL (BUG 2): a descrição usa o NOME CANÔNICO da conta de destino
  // resolvida ("Transferência para Conta principal") -- o texto bruto
  // extraído ("Principal") nunca aparece em descrição nem no card.
  if (transactionType === 'transfer' && destinationResult?.account?.name) {
    description = `Transferência para ${destinationResult.account.name}`;
  }
  const issues = [];

  if (!Number.isFinite(amount) || amount <= 0) {
    issues.push(createIssue('amount', 'amount_required'));
  }
  const accountIsReady = [
    ACCOUNT_RESOLUTION_STATUS.RESOLVED,
    ACCOUNT_RESOLUTION_STATUS.WILL_CREATE,
  ].includes(accountResult.status);
  // BLOCO CONTA-OPCIONAL: entrada/despesa nunca mais bloqueiam por causa da
  // conta -- meses de atrito real vinham daqui (resolução de conta por texto
  // falado/transcrito é inerentemente instável: nome ambíguo, conta
  // arquivada, homônimo). "Gastei 350 de combustível" agora salva direto com
  // account_id null; se o usuário citar uma conta reconhecível ("no
  // Nubank"), ela ainda é usada quando resolve sem ambiguidade -- só deixa
  // de ser um requisito. Transferência (a seguir) e ajuste de saldo
  // continuam exigindo conta: uma transferência sem origem/destino ou um
  // ajuste sem a conta cujo saldo muda não tem significado, então essas
  // duas operações preservam o comportamento anterior.
  const accountIsBlocking = !accountIsReady
    && (transactionType === 'transfer' || isAdjustment);
  if (accountIsBlocking) {
    const issueCode = accountResult.status === ACCOUNT_RESOLUTION_STATUS.ARCHIVED_CONFLICT
      ? 'account_archived'
      : accountResult.status === ACCOUNT_RESOLUTION_STATUS.AMBIGUOUS
        ? 'account_ambiguous'
        : parsed.entities.account
          ? 'account_not_found'
          : 'account_required';
    issues.push(createIssue('account', issueCode, accountResult.candidates));
  }
  // Para receita/despesa, só aceitamos o resultado da resolução quando ele
  // já é uma conta REAL e existente (RESOLVED): nunca dispara criação
  // implícita de conta a partir de um nome mal ouvido/transcrito (WILL_CREATE
  // criaria uma conta nova sem confirmação nenhuma, já que essa operação não
  // bloqueia mais) e nunca carrega um estado de ambiguidade/arquivada que a
  // execução tentaria resolver sozinha -- nesses casos o lançamento
  // simplesmente segue sem conta.
  const accountRequiredForType = transactionType === 'transfer' || isAdjustment;
  const accountResultForPayload = accountRequiredForType || accountResult.status === ACCOUNT_RESOLUTION_STATUS.RESOLVED
    ? accountResult
    : { status: ACCOUNT_RESOLUTION_STATUS.MISSING, candidates: [], explanation: null };
  if (transactionType === 'transfer') {
    const destinationReady = destinationResult?.status === ACCOUNT_RESOLUTION_STATUS.RESOLVED;
    if (!destinationReady) {
      issues.push(createIssue('destinationAccount', 'destination_account_required', destinationResult?.candidates ?? []));
    }
  }
  if (!isAdjustment) {
    const categoryIsReady = Boolean(categoryResult.category)
      || categoryResult.status === CATEGORY_RESOLUTION_STATUS.WILL_CREATE;
    if (!categoryIsReady) {
      issues.push(createIssue('category', mapCategoryIssueCode(categoryResult), categoryResult.candidates));
    }
  }
  if (!description) {
    issues.push(createIssue('description', 'description_required'));
  }
  if (!isValidDate(date)) {
    issues.push(createIssue('date', 'date_invalid'));
  }

  // Ajuste de saldo: o amount é o ALVO ("meu saldo é R$ 1.000"). O delta
  // assinado aplicado à conta é calculado contra o saldo derivado atual;
  // nunca inventamos o delta nem o alvo. Conta recém-criada parte de zero.
  let balanceTarget = null;
  let balanceDelta = null;
  let currentBalance = null;
  if (isAdjustment && accountIsReady && Number.isFinite(amount) && amount > 0) {
    balanceTarget = roundMoney(amount);
    const balancesById = accountBalances instanceof Map
      ? accountBalances
      : new Map(Object.entries(accountBalances ?? {}));
    const resolvedCurrent = accountResult.status === ACCOUNT_RESOLUTION_STATUS.WILL_CREATE
      ? 0
      : balancesById.get(accountResult.account?.id);
    if (resolvedCurrent == null) {
      issues.push(createIssue('balance', 'balance_required'));
    } else {
      currentBalance = roundMoney(resolvedCurrent);
      const delta = roundMoney(balanceTarget - currentBalance);
      if (Math.abs(delta) < 0.005) {
        issues.push(createIssue('balance', 'balance_same'));
      } else {
        balanceDelta = delta;
      }
    }
  }

  issues.sort((left, right) => ISSUE_PRIORITY[left.field] - ISSUE_PRIORITY[right.field]);

  const payload = issues.length
    ? null
    : {
        account_id: accountResultForPayload.account?.id ?? null,
        destination_account_id:
          transactionType === 'transfer' ? destinationResult?.account?.id ?? null : null,
        category_id: isAdjustment ? null : categoryResult.category?.id ?? null,
        transaction_type: isAdjustment ? 'adjustment' : transactionType,
        description,
        amount: isAdjustment ? Math.abs(balanceDelta) : amount,
        transaction_date: date,
        status: 'completed',
        ...(isAdjustment ? { adjustment_delta: balanceDelta } : {}),
      };

  return {
    status: issues.length ? 'needs_clarification' : 'ready',
    intent: parsed.intent,
    transactionType: isAdjustment ? 'adjustment' : transactionType,
    typeLabel: TYPE_LABELS[isAdjustment ? 'adjustment' : transactionType],
    amount: Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null,
    date: isValidDate(date) ? date : null,
    description,
    account: accountResultForPayload.account ?? null,
    destinationAccount: transactionType === 'transfer' ? destinationResult?.account ?? null : null,
    clientOperationId: overrides.clientOperationId ?? null,
    accountResolution: accountResultForPayload,
    proposedAccount: accountResultForPayload.proposedAccount ?? null,
    requestedAccountName: overrides.accountName ?? parsed.entities.account ?? null,
    requestedDestinationAccountName: transactionType === 'transfer'
      ? overrides.destinationAccountName ?? parsed.entities.destinationAccount ?? null
      : null,
    category: isAdjustment ? null : categoryResult.category ?? null,
    categoryWasApproximate: isAdjustment ? false : Boolean(categoryResult.approximate),
    proposedCategory: isAdjustment ? null : categoryResult.proposedCategory ?? null,
    proposedCategoryName: isAdjustment ? null : categoryResult.proposedCategoryName ?? null,
    balanceTarget,
    balanceDelta,
    currentBalance,
    issues,
    options: {
      accounts: (Array.isArray(accounts) ? accounts : []).filter((account) => account.is_active !== false),
      accountTypes: (Array.isArray(accountTypes) ? accountTypes : []).filter((type) => type.is_active !== false),
      categories: isAdjustment ? [] : categoryResult.candidates ?? [],
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
