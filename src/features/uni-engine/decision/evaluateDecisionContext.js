// Avaliação do Contexto de Decisão (Fase 5 — Shadow Mode).
//
// evaluateDecisionContext(input) transforma TODAS as entradas da camada
// (Intent, Plano Cognitivo, Modelo Epistêmico, Memória, Financial Snapshot,
// Pending Action, Conversation Context) em UM contexto de decisão único:
//   {
//     sufficiency, consistency, missingFields, conflicts, pending,
//     intent, dependencies, evidence, need*, diagnostics
//   }
//
// Regras absolutas:
//   - puro, síncrono, sem rede, sem LLM;
//   - memória é apoio, nunca verdade absoluta (prioridade: banco > snapshot
//     > confirmação > correção > memória persistente > memória operacional
//     > inferência > hipótese);
//   - a camada NUNCA executa — apenas avalia.
import {
  DECISION_CONTEXT_SUFFICIENCY,
  DECISION_CONSISTENCY_STATES,
  DECISION_DIAGNOSTICS,
  isValidDecisionDiagnostic,
} from './decisionTypes.js';
import { DECISION_POLICY } from './decisionPolicy.js';
import { createDecisionContext } from './decisionContracts.js';

const UNKNOWN_SUFFICIENCY = 'UNKNOWN';
const KNOWN_SUFFICIENCY = 'SUFFICIENT';
const PARTIAL_SUFFICIENCY = 'PARTIAL';
const INSUFFICIENT_SUFFICIENCY = 'INSUFFICIENT';

const CONSISTENT = 'CONSISTENT';
const PARTIAL_CONSISTENCY = 'PARTIAL';
const CONFLICTING_CONSISTENCY = 'CONFLICTING';
const UNKNOWN_CONSISTENCY = 'UNKNOWN';

const CONFIRMATION_INTENT_TYPES = new Set([
  'confirmation',
  'confirm',
  'confirm_pending',
]);

function isConfirmationIntent(intentType) {
  return CONFIRMATION_INTENT_TYPES.has(String(intentType ?? ''));
}

function isCorrectionIntent(intentType) {
  return String(intentType ?? '') === 'correction';
}

function isExplicitConfirmationIntent(intentType) {
  return isConfirmationIntent(intentType) || isCorrectionIntent(intentType);
}

// Estados de memória que a camada IGNORA como apoio (espelha a Fase 3/4:
// memória superseded/expirada/contestada nunca é verdade).
const EXCLUDED_MEMORY_STATUSES = new Set([
  'contested',
  'superseded',
  'expired',
  'deleted',
  'rejected',
]);

const MISSING_FIELD_ALIASES = Object.freeze({
  source_account: 'sourceAccount',
  destination_account: 'destinationAccount',
  dest_account: 'destinationAccount',
  account_id: 'account',
  category_id: 'category',
  amount_value: 'amount',
  transaction_date: 'date',
  value: 'amount',
  merchant: 'description',
});

function normalizeFieldName(field) {
  if (typeof field !== 'string') return null;
  const lower = field.trim().toLowerCase();
  if (MISSING_FIELD_ALIASES[lower]) return MISSING_FIELD_ALIASES[lower];
  return lower;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function intentOf(intent) {
  if (typeof intent === 'string') {
    return { type: intent, known: Boolean(intent && intent !== 'unsupported') };
  }
  if (isPlainObject(intent)) {
    const type = intent.type ?? intent.primaryIntent ?? intent.value ?? intent.name ?? null;
    return {
      type,
      known: Boolean(intent.known ?? (type && type !== 'unsupported')),
      confidence: typeof intent.confidence === 'number' ? intent.confidence : null,
    };
  }
  return { type: null, known: false, confidence: null };
}

function memoryList(persistentMemory) {
  if (Array.isArray(persistentMemory)) return persistentMemory;
  if (isPlainObject(persistentMemory)) {
    const retrieved = persistentMemory.retrieved;
    if (Array.isArray(retrieved)) return retrieved;
  }
  return [];
}

function usableMemoryCount(persistentMemory) {
  return memoryList(persistentMemory)
    .filter((memory) => memory && !EXCLUDED_MEMORY_STATUSES.has(memory.status))
    .length;
}

function planMissingFields(cognitivePlan) {
  const plan = cognitivePlan ?? {};
  const fields = new Set();
  for (const field of Array.isArray(plan.missingFields) ? plan.missingFields : []) {
    const normalized = normalizeFieldName(field);
    if (normalized) fields.add(normalized);
  }
  for (const entry of Array.isArray(plan.missingData) ? plan.missingData : []) {
    const normalized = normalizeFieldName(entry?.field);
    if (normalized) fields.add(normalized);
  }
  return [...fields];
}

function pendingIssues(pendingAction) {
  const action = pendingAction ?? null;
  const issues = Array.isArray(action?.issues) ? action.issues : [];
  return issues
    .map((issue) => normalizeFieldName(isPlainObject(issue) ? issue.field : issue))
    .filter(Boolean);
}

function pendingStatusOf(pendingAction) {
  if (!isPlainObject(pendingAction)) return null;
  return typeof pendingAction.status === 'string' ? pendingAction.status : null;
}

function epistemicItems(epistemicModel) {
  const model = epistemicModel ?? null;
  if (Array.isArray(model?.items)) return model.items;
  return [];
}

function epistemicConflicts(epistemicModel) {
  const model = epistemicModel ?? null;
  if (Array.isArray(model?.conflicts)) return model.conflicts;
  return [];
}

function epistemicStaleCount(epistemicModel) {
  const model = epistemicModel ?? null;
  if (Array.isArray(model?.staleItems)) return model.staleItems.length;
  return 0;
}

function epistemicSummary(epistemicModel) {
  const model = epistemicModel ?? {};
  const items = epistemicItems(model);
  const mean = Number(model.confidenceSummary?.mean);
  const recommendations = Array.isArray(model.recommendations) ? model.recommendations : [];
  const usableItems = items.filter((item) => {
    const capabilities = item?.usableFor;
    return Boolean(
      capabilities?.display
      || capabilities?.suggestion
      || capabilities?.question
      || capabilities?.confirmation,
    );
  });

  return {
    confidence: Number.isFinite(mean) && mean >= 0 && mean <= 1 ? mean : null,
    evidenceCount: Number(model.evidenceSummary?.totalDeduped) || 0,
    recommendationCount: recommendations.length,
    usableCount: usableItems.length,
    refreshRecommended: recommendations.some((entry) => String(entry).startsWith('refresh_data:')),
    askRecommended: recommendations.some((entry) => String(entry).startsWith('ask_user:')),
  };
}

// -----------------------------------------------
// Suficiência de contexto
// -----------------------------------------------
export function evaluateContextSufficiency({ intent, cognitivePlan, epistemicModel, operationalMemory, persistentMemory, financialSnapshot, pendingAction, conversationContext, now, consistency } = {}) {
  const safeIntent = intentOf(intent);
  const snapshot = financialSnapshot ?? null;
  const operational = isPlainObject(operationalMemory) ? operationalMemory : null;
  const memoryAvailable = usableMemoryCount(persistentMemory) > 0 || Object.keys(operational ?? {}).length > 0;
  const snapshotAvailable = Boolean(snapshot && snapshot.hasData);
  const missingFields = [
    ...planMissingFields(cognitivePlan),
    ...pendingIssues(pendingAction),
  ];
  const conflicts = epistemicConflicts(epistemicModel);
  const pendingStatus = pendingStatusOf(pendingAction);
  const pendingActive = Boolean(pendingStatus);
  const pendingReady = pendingStatus === 'ready';
  const hasConflicts = conflicts.length > 0 || consistency === CONFLICTING_CONSISTENCY;
  const snapshotFresh = snapshotFreshness(snapshot, now) !== 'stale';

  if (!safeIntent.known && !pendingActive && missingFields.length === 0) {
    return UNKNOWN_SUFFICIENCY;
  }

  let needed = 0;
  let satisfied = 0;

  needed += 1;
  if (safeIntent.known) satisfied += 1;

  needed += 1;
  if (conversationContext !== null && conversationContext !== undefined) satisfied += 1;

  needed += 1;
  if (memoryAvailable || missingFields.length === 0) satisfied += 1;

  needed += 1;
  if (missingFields.length === 0 || pendingReady) satisfied += 1;

  if (needsSnapshotData(safeIntent.type, snapshot)) {
    needed += 1;
    if (snapshotAvailable && snapshotFresh) satisfied += 1;
  }

  needed += 1;
  if (!hasConflicts) satisfied += 1;

  if (pendingReady || isExplicitConfirmationIntent(safeIntent.type)) {
    needed += 1;
    if (pendingReady || isCorrectionIntent(safeIntent.type)) satisfied += 1;
  }

  if (needed === 0) return UNKNOWN_SUFFICIENCY;

  const ratio = satisfied / needed;
  if (ratio >= 1) return KNOWN_SUFFICIENCY;
  if (ratio >= 0.5) return PARTIAL_SUFFICIENCY;
  return INSUFFICIENT_SUFFICIENCY;
}

function needsSnapshotData(intentType, snapshot) {
  const intent = String(intentType ?? '');
  const balanceLike = [
    'check_balance',
    'set_balance',
    'ambiguous_balance_or_income',
  ].includes(intent);
  const queryLike = ['check_balance', 'forecast', 'question'].includes(intent);
  const actionLike = [
    'register_income',
    'register_expense',
    'register_transfer',
    'create_goal',
  ].includes(intent);
  if (balanceLike) return true;
  if (queryLike) return Boolean(snapshot && !snapshot.hasData);
  if (actionLike && snapshot) return true;
  return false;
}

function snapshotFreshness(snapshot, now) {
  const snapshotNow = typeof now === 'number' ? now : Date.now();
  const reference = snapshot ? parseTimestamp(snapshot.referenceDate) : null;
  if (reference == null) return 'unknown';
  const ageMs = snapshotNow - reference;
  if (ageMs <= DECISION_POLICY.recency.snapshotFreshMs) return 'fresh';
  return 'stale';
}

// -----------------------------------------------
// Informação faltante (nunca preenchida automaticamente)
// -----------------------------------------------
export function buildMissingInformation({ cognitivePlan, pendingAction, epistemicModel, intent } = {}) {
  const missing = new Set();

  const planFields = planMissingFields(cognitivePlan);
  for (const field of planFields) missing.add(field);

  for (const field of pendingIssues(pendingAction)) missing.add(field);

  const missingItems = Array.isArray(epistemicModel?.missingItems)
    ? epistemicModel.missingItems
    : [];
  for (const entry of missingItems) {
    const field = normalizeFieldName(entry?.field);
    if (field) missing.add(field);
  }

  const missingItemsBySubject = epistemicItems(epistemicModel)
    .filter((item) => item?.claimType === 'absence' || item?.epistemicStatus === 'missing')
    .map((item) => item?.subject ?? '')
    .map((subject) => (subject.startsWith('field:') ? subject.slice(6) : null))
    .filter(Boolean)
    .map(normalizeFieldName)
    .filter(Boolean);
  for (const field of missingItemsBySubject) missing.add(field);

  const pendingStatus = pendingStatusOf(pendingAction);
  if (pendingStatus === 'ready') {
    const confirmation = isExplicitConfirmationIntent(intent);
    if (!confirmation) missing.add('confirmation');
  }

  const priority = [
    'amount',
    'account',
    'destinationAccount',
    'sourceAccount',
    'category',
    'date',
    'description',
    'confirmation',
    'workspace',
    'goal',
    'transaction',
  ];
  const sorted = [...missing].sort((a, b) => {
    const indexA = priority.indexOf(a);
    const indexB = priority.indexOf(b);
    return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
  });

  const max = DECISION_POLICY.limits.maxMissingInformation;
  return sorted.slice(0, max);
}

// -----------------------------------------------
// Dependências de decisão
// -----------------------------------------------
export function evaluateDecisionDependencies({ intent, cognitivePlan, epistemicModel, financialSnapshot, pendingAction, conversationContext } = {}) {
  const safeIntent = intentOf(intent);
  const plan = cognitivePlan ?? {};
  const snapshot = financialSnapshot ?? null;
  const pendingStatus = pendingStatusOf(pendingAction);
  const missingFields = [
    ...planMissingFields(cognitivePlan),
    ...pendingIssues(pendingAction),
  ];
  const actionIntents = DECISION_POLICY.risk.executorRequiredIntents;
  const isAction = actionIntents.includes(safeIntent.type);
  const isQuery = ['check_balance', 'forecast', 'question'].includes(safeIntent.type);
  const needsSnapshot = needsSnapshotData(safeIntent.type, snapshot);
  const snapshotMissing = needsSnapshot && !(snapshot && snapshot.hasData);
  const referenceUnresolved = Boolean(
    conversationContext?.referenceResolution
    && conversationContext.referenceResolution.hasReference
    && !conversationContext.referenceResolution.resolved,
  );
  const memoryNeeded = referenceUnresolved
    || safeIntent.type === 'continuation'
    || (isAction && missingFields.length > 0 && !conversationContext?.memoryAvailable);

  return {
    requiresMemory: memoryNeeded,
    requiresDatabase: isQuery && (snapshotMissing || missingFields.length > 0),
    requiresConfirmation: pendingStatus === 'ready'
      || Boolean(plan.requiresConfirmation)
      || (isAction && (epistemicConflicts(epistemicModel).length > 0)),
    requiresConversation: safeIntent.type === 'continuation'
      || safeIntent.type === 'clarification'
      || Boolean(conversationContext?.contextSwitch),
    requiresSnapshot: needsSnapshot,
    requiresHistory: safeIntent.type === 'continuation'
      || (referenceUnresolved && !memoryNeeded),
    requiresExecutor: isAction,
    requiresUser: missingFields.length > 0 || pendingStatus === 'needs_clarification',
  };
}

// -----------------------------------------------
// Consistência de decisão
// -----------------------------------------------
export function evaluateDecisionConsistency({ intent, cognitivePlan, epistemicModel, persistentMemory, financialSnapshot, conversationContext, now } = {}) {
  const safeIntent = intentOf(intent);
  const snapshot = financialSnapshot ?? null;
  const plan = cognitivePlan ?? {};
  const conflicts = epistemicConflicts(epistemicModel);
  const staleCount = epistemicStaleCount(epistemicModel);
  const snapshotStale = snapshotFreshness(snapshot, now) === 'stale';
  const memories = memoryList(persistentMemory);
  const lastIntent = conversationContext?.lastIntent ?? null;
  const mismatchScores = [];

  // memória x banco
  if (memories.length > 0 && snapshot && snapshot.hasData) {
    const memoryBalance = memories.find((memory) => (
      String(memory?.subjectKey ?? '').includes('balance')
      || String(memory?.subjectKey ?? '').includes('saldo')
    ));
    if (memoryBalance && typeof snapshot.totalBalance === 'number') {
      const memoryValue = memoryBalance.value?.totalBalance
        ?? memoryBalance.value?.balance
        ?? null;
      if (typeof memoryValue === 'number' && Math.abs(memoryValue - snapshot.totalBalance) > 1e-6) {
        mismatchScores.push({ type: 'memory_database', weight: 2 });
      }
    }
  }

  // banco x usuário (reivindicação de saldo)
  const userBalanceClaim = epistemicItems(epistemicModel).find((item) => (
    item?.subject?.startsWith('balance:')
    && item?.claimType === 'user_claim'
  ));
  if (userBalanceClaim && Array.isArray(userBalanceClaim.contradictions) && userBalanceClaim.contradictions.length > 0) {
    mismatchScores.push({ type: 'database_user', weight: 2 });
  }

  // contexto x intenção
  if (lastIntent && safeIntent.type && lastIntent !== safeIntent.type) {
    mismatchScores.push({ type: 'context_intent', weight: 1 });
  }

  // executor x plano
  if (plan.theoreticalExecutor && plan.executorExpected && plan.theoreticalExecutor !== plan.executorExpected) {
    mismatchScores.push({ type: 'executor_plan', weight: 2 });
  }

  // snapshot x contexto
  if (snapshotStale && snapshot && snapshot.hasData) {
    mismatchScores.push({ type: 'snapshot_context', weight: 1 });
  }

  // epistêmico x memória
  if (conflicts.some((conflict) => String(conflict?.type ?? '').includes('memory'))) {
    mismatchScores.push({ type: 'epistemic_memory', weight: 2 });
  }

  const hardConflicts = mismatchScores.filter((entry) => entry.weight === 2);
  if (hardConflicts.length > 0 || conflicts.length > 0) {
    return CONFLICTING_CONSISTENCY;
  }
  if (mismatchScores.length > 0 || staleCount > 0) {
    return PARTIAL_CONSISTENCY;
  }
  if (mismatchScores.length === 0 && (snapshot || memories.length > 0 || plan.missingFields)) {
    return CONSISTENT;
  }
  return UNKNOWN_CONSISTENCY;
}

// Divergência direta memória × snapshot (banco vence memória).
function hasMemorySnapshotMismatch(persistentMemory, snapshot) {
  if (!snapshot || !snapshot.hasData || typeof snapshot.totalBalance !== 'number') return false;
  for (const memory of memoryList(persistentMemory)) {
    const key = String(memory?.subjectKey ?? '');
    if (!key.includes('balance') && !key.includes('saldo')) continue;
    const value = memory?.value?.totalBalance ?? memory?.value?.balance ?? null;
    if (typeof value === 'number' && Math.abs(value - snapshot.totalBalance) > 1e-6) return true;
  }
  return false;
}

// -----------------------------------------------
// Avaliador principal
// -----------------------------------------------
export function evaluateDecisionContext(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const now = typeof safe.now === 'number' ? safe.now : Date.now();
  const intent = intentOf(safe.intent ?? safe.conversationContext?.lastIntent ?? null);
  const cognitivePlan = safe.cognitivePlan ?? null;
  const epistemicModel = safe.epistemicModel ?? null;
  const operationalMemory = safe.operationalMemory ?? null;
  const persistentMemory = safe.persistentMemory ?? null;
  const financialSnapshot = safe.financialSnapshot ?? null;
  const pendingAction = safe.pendingAction ?? null;
  const conversationContext = safe.conversationContext ?? null;
  const expectedExecutor = safe.expectedExecutor ?? null;

  const missingFields = buildMissingInformation({
    cognitivePlan,
    pendingAction,
    epistemicModel,
    intent: intent.type,
  });

  const consistency = evaluateDecisionConsistency({
    intent,
    cognitivePlan,
    epistemicModel,
    operationalMemory,
    persistentMemory,
    financialSnapshot,
    conversationContext,
    now,
  });

  const sufficiency = evaluateContextSufficiency({
    intent,
    cognitivePlan,
    epistemicModel,
    operationalMemory,
    persistentMemory,
    financialSnapshot,
    pendingAction,
    conversationContext,
    now,
    consistency,
  });

  const dependencies = evaluateDecisionDependencies({
    intent,
    cognitivePlan,
    epistemicModel,
    financialSnapshot,
    pendingAction,
    conversationContext,
    operationalMemory,
    persistentMemory,
    expectedExecutor,
  });

  const conflicts = epistemicConflicts(epistemicModel)
    .map((conflict) => (isPlainObject(conflict) ? { ...conflict } : conflict))
    .slice(0, DECISION_POLICY.limits.maxConflicts);

  const pendingStatus = pendingStatusOf(pendingAction);
  const pending = pendingStatus ? {
    active: true,
    status: pendingStatus,
    intent: pendingAction?.intent ?? null,
    issues: pendingIssues(pendingAction),
    ready: pendingStatus === 'ready',
    executing: pendingStatus === 'executing',
    needsClarification: pendingStatus === 'needs_clarification',
  } : null;

  const accountCount = Array.isArray(financialSnapshot?.accounts) ? financialSnapshot.accounts.length : 0;
  const categoryCount = Array.isArray(financialSnapshot?.categories) ? financialSnapshot.categories.length : 0;
  const snapshotFresh = snapshotFreshness(financialSnapshot, now);
  const memories = memoryList(persistentMemory);
  const usableMemories = memories.filter((memory) => (
    memory && !EXCLUDED_MEMORY_STATUSES.has(memory.status)
  ));
  const memoryConfirmed = usableMemories.some((memory) => (
    memory.status === 'confirmed' || memory.status === 'active'
  ));
  const memoryConflict = hasMemorySnapshotMismatch(persistentMemory, financialSnapshot)
    || Boolean(epistemicModel?.conflicts?.some((conflict) => (
      String(conflict?.type ?? '').includes('memory')
    )));
  const balanceConflict = Boolean(epistemicItems(epistemicModel).some((item) => (
    item?.claimType === 'user_claim' && Array.isArray(item.contradictions) && item.contradictions.length > 0
  )));
  const ambiguousAmount = intent.type === 'ambiguous_balance_or_income'
    || missingFields.includes('amount');
  const referenceAmbiguous = Boolean(
    conversationContext?.referenceResolution
    && conversationContext.referenceResolution.hasReference
    && !conversationContext.referenceResolution.resolved,
  );
  const contextSwitch = Boolean(conversationContext?.contextSwitch);
  const historyAvailable = Boolean(
    conversationContext?.history
    && (conversationContext.history.turns ?? conversationContext.history.messages ?? 0) > 0,
  );
  const executorExpected = expectedExecutor ?? cognitivePlan?.executorExpected ?? cognitivePlan?.theoreticalExecutor ?? null;
  const executorAvailable = Boolean(executorExpected)
    || !DECISION_POLICY.risk.executorRequiredIntents.includes(intent.type);
  const epistemic = epistemicSummary(epistemicModel);

  const evidence = {
    intentKnown: intent.known,
    intentConfirmed: isExplicitConfirmationIntent(intent.type),
    intentType: intent.type,
    memoryAvailable: usableMemories.length > 0 || Object.keys(operationalMemory ?? {}).length > 0,
    memoryCount: usableMemories.length,
    memoryConfirmed,
    memoryConflict,
    snapshotAvailable: Boolean(financialSnapshot && financialSnapshot.hasData),
    snapshotFresh: snapshotFresh !== 'stale',
    snapshotFreshness: snapshotFresh,
    snapshotHasAccounts: accountCount > 0,
    snapshotHasCategories: categoryCount > 0,
    accountCount,
    categoryCount,
    historyAvailable,
    hasConflict: conflicts.length > 0,
    balanceConflict,
    referenceAmbiguous,
    contextSwitch,
    conversationSwitched: contextSwitch,
    pendingActive: Boolean(pending),
    pendingReady: Boolean(pending?.ready),
    pendingExecuting: Boolean(pending?.executing),
    pendingNeedsClarification: Boolean(pending?.needsClarification),
    requiresConfirmation: Boolean(pending?.ready) || Boolean(cognitivePlan?.requiresConfirmation),
    executorAvailable,
    executorExpected,
    staleItemsCount: epistemicStaleCount(epistemicModel),
    epistemicConfidence: epistemic.confidence,
    epistemicEvidenceCount: epistemic.evidenceCount,
    epistemicRecommendationCount: epistemic.recommendationCount,
    epistemicUsableCount: epistemic.usableCount,
    epistemicRefreshRecommended: epistemic.refreshRecommended,
    epistemicAskRecommended: epistemic.askRecommended,
    missingFieldsCount: missingFields.length,
    consistency,
  };

  // Diagnósticos estruturados (enums — nunca texto livre).
  const diagnostics = [];
  const push = (code) => {
    if (isValidDecisionDiagnostic(code) && !diagnostics.includes(code)) {
      diagnostics.push(code);
    }
  };
  if (sufficiency === KNOWN_SUFFICIENCY) push('CONTEXT_SUFFICIENT');
  if (sufficiency === INSUFFICIENT_SUFFICIENCY) push('CONTEXT_INSUFFICIENT');
  if (memoryConflict) push('MEMORY_CONFLICT');
  if (memoryConflict === false && usableMemories.length > 0) push('MEMORY_CONSISTENT');
  if (snapshotFresh === 'stale' && snapshotFresh !== 'unknown') push('SNAPSHOT_OUTDATED');
  if (!(financialSnapshot && financialSnapshot.hasData) && needsSnapshotData(intent.type, financialSnapshot)) push('SNAPSHOT_MISSING');
  if (dependencies.requiresDatabase) push('DATABASE_REQUIRED');
  if (dependencies.requiresMemory) push('MEMORY_REQUIRED');
  if (dependencies.requiresConfirmation) push('USER_CONFIRMATION_REQUIRED');
  if (pending) push('PENDING_ACTION_ACTIVE');
  if (pending?.ready) push('PENDING_READY');
  if (pending?.executing) push('PENDING_EXECUTING');
  if (contextSwitch) push('CONVERSATION_SWITCHED');
  if (accountCount > 1) push('MULTIPLE_ACCOUNTS');
  if (evidence.snapshotHasCategories && categoryCount === 0) push('CATEGORY_INFERRED');
  if (ambiguousAmount) push('AMBIGUOUS_AMOUNT');
  if (balanceConflict) push('BALANCE_CONFLICT');
  if (referenceAmbiguous) push('REFERENCE_AMBIGUOUS');
  if (intent.known && sufficiency !== UNKNOWN_SUFFICIENCY) push('INTENT_CONFIRMED');
  if (!intent.known) push('INTENT_AMBIGUOUS');
  if (evidence.staleItemsCount > 0) push('STALE_INFORMATION');
  if (!historyAvailable && dependencies.requiresHistory) push('HISTORY_EMPTY');

  return createDecisionContext({
    sufficiency,
    consistency,
    missingFields,
    conflicts,
    pending,
    intent: {
      type: intent.type,
      known: intent.known,
      confidence: typeof intent.confidence === 'number' ? intent.confidence : null,
    },
    dependencies,
    evidence,
    needDatabase: dependencies.requiresDatabase,
    needMemory: dependencies.requiresMemory,
    needConfirmation: dependencies.requiresConfirmation,
    needUser: dependencies.requiresUser,
    needSnapshot: dependencies.requiresSnapshot,
    needHistory: dependencies.requiresHistory,
    needContext: dependencies.requiresConversation,
    diagnostics,
  });
}

// Exportação auxiliar para testes e diagnóstico.
export function isKnownSufficiency(value) {
  return DECISION_CONTEXT_SUFFICIENCY.includes(value);
}

export function isKnownConsistency(value) {
  return DECISION_CONSISTENCY_STATES.includes(value);
}

export { DECISION_DIAGNOSTICS };
