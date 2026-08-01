// Estado epistêmico mínimo do Uni Engine (Fase 1).
//
// Representação mínima de cada entidade relevante com origem e estado:
//   - confirmed_database / confirmed_user → podem ser usados
//   - inferred_high → pode ser sugerido
//   - inferred_low / ambiguous / missing / stale / conflicting → exigem pergunta
//
// Nesta fase o estado NÃO é persistido, não vira tabela/migration e não
// altera memória. Confiança é derivada de regras claras — nunca de LLM.
import { normalizeSearchText } from '../../utils/searchText.js';
import { extractAmount } from '../uni-intents/entityExtractor.js';
import { resolveCategory } from '../uni-intents/categoryResolver.js';

const STALE_BALANCE_THRESHOLD_DAYS = 7;

function findSnapshotAccount(accountName, snapshot) {
  if (!accountName || !snapshot) return null;
  const normalized = normalizeSearchText(accountName);
  const accounts = snapshot.accounts ?? [];
  return accounts.find((account) => {
    const name = normalizeSearchText(account?.name ?? '');
    return name && (name === normalized || name.includes(normalized) || normalized.includes(name));
  }) ?? null;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && !value.includes('T')) return new Date(`${value}T00:00:00.000Z`);
  return new Date(value);
}

function daysBetween(older, newer) {
  if (!older) return null;
  const olderTime = toDate(older)?.getTime() ?? null;
  const newerTime = newer ? (toDate(newer)?.getTime() ?? null) : Date.now();
  if (olderTime == null || newerTime == null) return null;
  return Math.floor((newerTime - olderTime) / 86400000);
}

// Referência de conta no texto contra o snapshot local ("Gastei 50 no
// Nubank" → conta Nubank do snapshot). Não duplica o parser do pipeline
// (extractAccount) — complementa a evidência com os dados já disponíveis.
function findAccountReferenceInText(text, snapshot) {
  if (!text || !snapshot) return null;
  const normalizedText = normalizeSearchText(text);
  const accounts = snapshot.accounts ?? [];
  return accounts.find((account) => {
    const name = normalizeSearchText(account?.name ?? '');
    return name && normalizedText.includes(name);
  }) ?? null;
}

function accountStatus(accountName, snapshot) {
  if (!accountName) return { value: null, status: 'missing', confidence: 0, source: null };
  const resolved = findSnapshotAccount(accountName, snapshot);
  if (resolved) {
    return {
      value: resolved.name,
      status: 'confirmed_database',
      confidence: 0.95,
      source: 'financial_snapshot',
    };
  }
  return {
    value: accountName,
    status: 'confirmed_user',
    confidence: 0.8,
    source: 'user_message',
  };
}

function findSnapshotCategory(categoryName, snapshot) {
  if (!categoryName || !snapshot) return null;
  const normalized = normalizeSearchText(categoryName);
  const categories = snapshot.categories ?? [];
  return categories.find((category) => {
    const name = normalizeSearchText(category?.name ?? '');
    return name && (name === normalized || name.includes(normalized) || normalized.includes(name));
  }) ?? null;
}

function categoryStatus(categoryName, categoryConfidence, hasExplicitCategoryWord, snapshot) {
  if (hasExplicitCategoryWord && categoryName) {
    return {
      value: categoryName,
      status: 'confirmed_user',
      confidence: 0.85,
      source: 'user_message',
    };
  }
  if (categoryName && categoryConfidence >= 0.9) {
    const inSnapshot = Boolean(findSnapshotCategory(categoryName, snapshot));
    return {
      value: categoryName,
      status: inSnapshot ? 'inferred_high' : 'inferred_low',
      confidence: inSnapshot ? categoryConfidence : 0.4,
      source: 'category_resolver',
    };
  }
  if (categoryName) {
    return {
      value: categoryName,
      status: 'inferred_low',
      confidence: categoryConfidence,
      source: 'category_resolver',
    };
  }
  return { value: null, status: 'missing', confidence: 0, source: null };
}

function dateStatus(dateValue, referenceDate) {
  if (dateValue) {
    return {
      value: dateValue,
      status: 'confirmed_user',
      confidence: 1,
      source: 'user_message',
    };
  }
  if (referenceDate) {
    return {
      value: referenceDate,
      status: 'confirmed_database',
      confidence: 0.9,
      source: 'session_reference_date',
    };
  }
  return { value: null, status: 'missing', confidence: 0, source: null };
}

export function buildEpistemicState(input, options = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const message = safeInput.message ?? {};
  const context = safeInput.context ?? {};
  const normalized = options.normalized ?? null;
  const classification = options.classification ?? null;
  const text = typeof message.text === 'string' ? message.text : '';
  const hints = normalized?.extractedHints ?? {};
  const snapshot = context.financialSnapshot ?? null;
  const pendingAction = context.pendingAction ?? null;
  const pending = options.analyzed?.pending ?? {};
  const intent = classification?.primaryIntent
    ?? normalized?.classificationEvidence?.intent
    ?? null;

  // Valor: extraído do texto (confirmed_user) ou herdado da pendência
  // (confirmado pelo pipeline na rodada anterior).
  const userAmount = extractAmount(text);
  const pendingAmount = pending.collectedFields?.amount ?? pendingAction?.amount;
  let amount;
  if (userAmount != null && Number(userAmount) > 0) {
    amount = {
      value: userAmount,
      status: 'confirmed_user',
      confidence: 1,
      source: 'user_message',
    };
  } else if (pendingAmount != null && Number(pendingAmount) > 0) {
    amount = {
      value: Number(pendingAmount),
      status: 'confirmed_user',
      confidence: 0.95,
      source: 'pending_action',
    };
  } else {
    amount = { value: null, status: 'missing', confidence: 0, source: null };
  }

  // Conta: nome no texto resolve contra o snapshot local (nunca banco).
  const userAccountName = hints.account
    ?? findAccountReferenceInText(text, snapshot)?.name
    ?? null;
  const pendingAccountName = pending.collectedFields?.account
    ?? pendingAction?.account?.name
    ?? null;
  let account;
  if (userAccountName) {
    account = accountStatus(userAccountName, snapshot);
  } else if (pendingAccountName) {
    account = accountStatus(pendingAccountName, snapshot);
  } else {
    account = { value: null, status: 'missing', confidence: 0, source: null };
  }

  // Conta de destino (transferência).
  const destinationName = hints.destinationAccount ?? null;
  let destinationAccount;
  if (destinationName) {
    destinationAccount = accountStatus(destinationName, snapshot);
  } else {
    destinationAccount = { value: null, status: 'missing', confidence: 0, source: null };
  }

  // Categoria: reutiliza o resolvedor determinístico atual como evidência.
  const categoryResult = resolveCategory(text, intent);
  let category;
  if (hints.category) {
    category = categoryStatus(
      hints.category,
      hints.categoryConfidence,
      hints.hasExplicitCategoryWord,
      snapshot,
    );
  } else if (pending.collectedFields?.category) {
    category = {
      value: pending.collectedFields.category,
      status: 'confirmed_user',
      confidence: 0.9,
      source: 'pending_action',
    };
  } else if (categoryResult.category) {
    category = categoryStatus(
      categoryResult.category,
      categoryResult.confidence,
      false,
      snapshot,
    );
  } else {
    category = { value: null, status: 'missing', confidence: 0, source: null };
  }

  // Descrição.
  let description;
  if (hints.description) {
    description = {
      value: hints.description,
      status: 'confirmed_user',
      confidence: 1,
      source: 'user_message',
    };
  } else if (pending.collectedFields?.description) {
    description = {
      value: pending.collectedFields.description,
      status: 'confirmed_user',
      confidence: 0.9,
      source: 'pending_action',
    };
  } else {
    description = { value: null, status: 'missing', confidence: 0, source: null };
  }

  // Data.
  const date = dateStatus(hints.date, snapshot?.referenceDate ?? null);

  // Conflito: pendência com conta definida e mensagem referenciando outra
  // conta explicitamente.
  const conflict = Boolean(
    pendingAccountName
    && userAccountName
    && normalizeSearchText(pendingAccountName) !== normalizeSearchText(userAccountName),
  );
  if (conflict) {
    account.status = 'conflicting';
    account.confidence = Math.min(account.confidence, 0.4);
  }

  // Stale: saldo derivado do snapshot mais antigo que o limite.
  const daysSinceReference = daysBetween(snapshot?.referenceDate ?? null, message.createdAt ?? null);
  const totalBalance = {
    value: snapshot?.totalBalance ?? null,
    status:
      daysSinceReference != null && daysSinceReference > STALE_BALANCE_THRESHOLD_DAYS
        ? 'stale'
        : snapshot?.totalBalance != null
          ? 'confirmed_database'
          : 'missing',
    confidence:
      daysSinceReference != null && daysSinceReference > STALE_BALANCE_THRESHOLD_DAYS
        ? 0.5
        : snapshot?.totalBalance != null
          ? 0.95
          : 0,
    source: 'financial_snapshot',
  };

  // Ambiguidade de intenção (receita vs saldo).
  const intentAmbiguous = intent === 'ambiguous_balance_or_income';
  const state = {
    amount,
    account,
    destinationAccount,
    category,
    description,
    date,
    totalBalance,
    intent: {
      value: intent,
      status: intentAmbiguous ? 'ambiguous' : 'confirmed_user',
      confidence:
        classification?.confidence ?? normalized?.classificationEvidence?.confidence ?? 0,
      source: 'cognitive_classifier',
    },
  };

  if (conflict) {
    state.conflict = {
      entity: 'account',
      pendingValue: pendingAccountName,
      messageValue: userAccountName,
    };
  }

  return state;
}
