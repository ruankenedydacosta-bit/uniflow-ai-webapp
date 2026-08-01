// Analisador de contexto do Uni Engine (Fase 1).
//
// Função pura: recebe APENAS dados já disponíveis no componente/módulos
// atuais (contrato de entrada). Nunca consulta banco, nunca gera efeitos
// colaterais e nunca modifica os objetos recebidos. Reutiliza o
// classificador determinístico atual (classifyIntent) como evidência.
import { normalizeSearchText } from '../../utils/searchText.js';
import { extractAccount } from '../uni-intents/entityExtractor.js';
import { classifyIntent } from '../uni-intents/intentClassifier.js';

const PENDING_STATUS_AWAITING_CONFIRMATION = 'awaiting_confirmation';

const ACTION_INTENT_SET = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
  'set_balance',
  'create_goal',
]);

function asMessages(history) {
  return Array.isArray(history) ? history : [];
}

function lastMessageFrom(history, from) {
  const messages = asMessages(history);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.from === from || messages[index]?.role === from) {
      return messages[index]?.text ?? null;
    }
  }
  return null;
}

function findAccountReference(text, snapshot) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const extracted = extractAccount(text, 'register_transfer')
    ?? extractAccount(text, 'register_expense');
  if (extracted) return extracted;
  // Referência contra o snapshot local ("Gastei 50 no Nubank" → Nubank)
  // complementa o parser do pipeline sem duplicá-lo.
  const normalizedText = normalize(text);
  const accounts = snapshot?.accounts ?? [];
  const referenced = accounts.find((account) => {
    const name = normalize(account?.name);
    return name && normalizedText.includes(name);
  });
  return referenced?.name ?? null;
}

function normalize(value) {
  return typeof value === 'string' ? normalizeSearchText(value) : '';
}

function findTransactionReference(text, snapshot) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalized = normalize(text);
  const transactions = snapshot?.recentTransactions ?? [];
  for (const tx of transactions) {
    if (!tx?.description) continue;
    const description = normalize(tx.description);
    if (!description) continue;
    if (description === normalized || normalized.includes(description)) {
      return tx;
    }
  }
  return null;
}

function findCategoryReference(text, snapshot) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalized = normalize(text);
  const categories = snapshot?.categories ?? [];
  for (const category of categories) {
    if (!category?.name) continue;
    const name = normalize(category.name);
    if (name && (name === normalized || normalized.includes(name))) {
      return category;
    }
  }
  return null;
}

function readPendingIntent(pendingAction) {
  return pendingAction?.intent ?? pendingAction?.type ?? null;
}

function readPendingAwaitedField(pendingAction) {
  const issues = pendingAction?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues[0]?.field ?? null;
  }
  if (pendingAction?.pendingField) return pendingAction.pendingField;
  return null;
}

function readPendingCollectedFields(pendingAction) {
  const collected = {};
  const amount = pendingAction?.amount ?? pendingAction?.fields?.amount;
  if (amount != null && Number(amount) > 0) collected.amount = amount;
  const account = pendingAction?.account?.name
    ?? pendingAction?.fields?.account?.name
    ?? pendingAction?.fields?.accountName;
  if (account) collected.account = account;
  const category = pendingAction?.category?.name ?? pendingAction?.fields?.category;
  if (category) collected.category = category;
  const description = pendingAction?.description ?? pendingAction?.fields?.description;
  if (description) collected.description = description;
  return collected;
}

function isPendingAwaitingConfirmation(pendingAction) {
  if (!pendingAction) return false;
  // No pipeline atual, ação com status 'ready' JÁ é exibida como card de
  // confirmação esperando a resposta do usuário (publishConversationResult).
  if (
    pendingAction.status === PENDING_STATUS_AWAITING_CONFIRMATION
    || pendingAction.status === 'ready'
  ) {
    return true;
  }
  if (
    pendingAction.status === 'completed'
    || pendingAction.status === 'canceled'
    || pendingAction.status === 'failed'
  ) {
    return false;
  }
  return Boolean(pendingAction.awaitingConfirmation);
}

function isIntentCompatibleWithPending({
  newIntent,
  pendingIntent,
  pendingAction,
  normalizedText,
  snapshot,
}) {
  if (!pendingIntent) return false;
  if (pendingIntent === newIntent) return true;
  if (pendingIntent === 'ambiguous_balance_or_income') {
    if (newIntent === 'register_income' || newIntent === 'set_balance') return true;
  }
  const awaitedField = readPendingAwaitedField(pendingAction);
  if (!awaitedField) return false;
  if (awaitedField === 'amount') {
    return /(?:r\$\s*)?\d[\d.,]/.test(normalizedText)
      || /\b(?:cinquenta|cem|mil|duzentos|trezentos|quinhentos|vinte|trinta)\b/.test(normalizedText);
  }
  if (awaitedField === 'account' || awaitedField === 'destinationAccount') {
    const accounts = snapshot?.accounts ?? [];
    return accounts.some((account) => {
      const name = normalize(account?.name);
      return name && (name === normalizedText || normalizedText.includes(name));
    });
  }
  if (awaitedField === 'category') {
    const categories = snapshot?.categories ?? [];
    return categories.some((category) => {
      const name = normalize(category?.name);
      return name && (name === normalizedText || normalizedText.includes(name));
    });
  }
  if (awaitedField === 'date') {
    return /\b(?:hoje|ontem|amanha|dia\s+\d+)/i.test(normalizedText);
  }
  if (awaitedField === 'description') return true;
  return false;
}

export function analyzeConversationContext(input) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const message = safeInput.message ?? {};
  const context = safeInput.context ?? {};
  const pendingAction = context.pendingAction ?? null;
  const history = asMessages(context.conversationHistory);
  const snapshot = context.financialSnapshot ?? null;
  const preferences = context.userPreferences ?? {};
  const pendingIntent = readPendingIntent(pendingAction);
  const hasPending = Boolean(pendingAction);
  const text = typeof message.text === 'string' ? message.text : '';
  const normalizedText = normalize(text);
  const lastUserMessage = lastMessageFrom(history, 'user');
  const lastUniMessage = lastMessageFrom(history, 'uni');
  const lastIntent = lastUserMessage ? classifyIntent(lastUserMessage).intent : null;
  const newIntent = classifyIntent(text).intent;
  const lastAccountReference = findAccountReference(lastUserMessage, snapshot) ?? null;
  const lastCategoryReference = findCategoryReference(lastUserMessage, snapshot);
  const lastTransactionReference = findTransactionReference(lastUserMessage, snapshot);

  const isNewExplicitAction =
    ACTION_INTENT_SET.has(newIntent)
    && (
      normalizedText.includes('r$')
      || /\d[\d.,]/.test(normalizedText)
      || /\b(?:mil|cem|cento|um|uma|dois|duas|tres|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|duzentos|trezentos|quinhentos)\b/.test(normalizedText)
    );

  const isCompatible = isIntentCompatibleWithPending({
    newIntent,
    pendingIntent,
    pendingAction,
    normalizedText,
    snapshot,
  });

  return {
    pending: {
      exists: hasPending,
      intent: pendingIntent,
      awaitedField: readPendingAwaitedField(pendingAction),
      collectedFields: readPendingCollectedFields(pendingAction),
      awaitingConfirmation: isPendingAwaitingConfirmation(pendingAction),
      status: pendingAction?.status ?? null,
    },
    history: {
      hasConversationHistory: history.length > 0,
      lastUserMessage,
      lastUniMessage,
      lastIntent,
      lastAccountReference,
      lastCategoryReference,
      lastTransactionReference,
    },
    workspace: {
      personal: preferences.workspaceType !== 'business',
      accountCount: Array.isArray(snapshot?.accounts) ? snapshot.accounts.length : 0,
      workspaceType: preferences.workspaceType ?? null,
      currentRoute: context.currentRoute ?? null,
    },
    financial: {
      hasSnapshot: Boolean(snapshot),
      hasData: Boolean(snapshot?.hasData),
      totalBalance:
        typeof snapshot?.totalBalance === 'number' ? snapshot.totalBalance : null,
      referenceDate: snapshot?.referenceDate ?? null,
    },
    compatibility: {
      pendingIntent,
      newIntent,
      isCompatible,
      startsNewExplicitAction: isNewExplicitAction,
      reason:
        hasPending && pendingIntent === newIntent
          ? 'same_intent'
          : hasPending && isCompatible
            ? 'answer_to_pending'
            : hasPending
              ? 'incompatible_with_pending'
              : 'no_pending',
    },
  };
}
