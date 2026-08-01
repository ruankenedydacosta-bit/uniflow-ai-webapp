// Motor de Contexto Cognitivo do Uni Engine (Fase 2).
//
// Produz o contexto cognitivo completo da conversa: não apenas histórico,
// mas a síntese do estado atual — última intenção, última ação, última
// pergunta feita, última resposta dada, pendência ativa, executor esperado,
// confirmação pendente, última conta/categoria/valor/transação/consulta,
// assunto atual e detecção de mudança de assunto.
//
// Nada aqui é persistido: o contexto vive apenas na rodada (memória
// operacional injetada + entrada da rodada). Função pura, serializável.
import { NEXT_QUESTION_BY_FIELD } from './createCognitivePlan.js';

function asPendingAwaitedField(pending, pendingAction) {
  return pending?.awaitedField
    ?? pendingAction?.pendingField
    ?? (Array.isArray(pendingAction?.issues) && pendingAction.issues.length > 0
      ? pendingAction.issues[0].field
      : null);
}

function questionTextForField(field) {
  return NEXT_QUESTION_BY_FIELD[field]?.text ?? null;
}

function deriveCurrentSubject({ classification, epistemic, referenceResolution, analyzed }) {
  const safeClassification = classification ?? {};
  const intent = safeClassification.primaryIntent ?? null;
  if (!intent) return null;
  const entity = epistemic?.description?.value
    ?? epistemic?.account?.value
    ?? epistemic?.category?.value
    ?? referenceResolution?.resolution?.description
    ?? null;
  if (entity) return `${intent}:${entity}`;
  if (analyzed?.compatibility?.pendingIntent) {
    return `${analyzed.compatibility.pendingIntent}:pending`;
  }
  return intent;
}

function deriveExecutorExpected({ classification, analyzed }) {
  const messageType = classification?.messageType ?? null;
  const intent = classification?.primaryIntent ?? null;
  if (analyzed?.pending?.awaitingConfirmation) {
    return 'execute_confirmed_financial_action';
  }
  if (messageType === 'query') return 'FinancialQueryEngine';
  if (messageType === 'small_talk') return 'createAssistantResponse';
  if (messageType === 'action') return 'execute_confirmed_financial_action';
  if (messageType === 'confirmation' || intent === 'confirm_pending') {
    return 'execute_confirmed_financial_action';
  }
  return null;
}

export function buildCognitiveContext(input, options = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const context = safeInput.context ?? {};
  const analyzed = options.analyzed ?? {};
  const classification = options.classification ?? null;
  const epistemic = options.epistemic ?? null;
  const referenceResolution = options.referenceResolution ?? null;
  const memory = options.memory ?? null;
  const pending = analyzed.pending ?? {};
  const history = analyzed.history ?? {};

  const pendingAction = context.pendingAction ?? null;
  const lastIntent = memory?.lastIntent ?? history.lastIntent ?? null;
  const lastQuestionAsked = questionTextForField(asPendingAwaitedField(pending, pendingAction))
    ?? memory?.lastQuestion
    ?? null;

  const currentSubject = deriveCurrentSubject({
    classification,
    epistemic,
    referenceResolution,
    analyzed,
  });

  const lastAccount = memory?.lastAccount ?? history.lastAccountReference ?? null;
  const lastCategory = memory?.lastCategory
    ?? history.lastCategoryReference?.name
    ?? null;
  const lastValue = memory?.lastValue ?? null;
  const lastTransaction = memory?.lastEntity
    ?? history.lastTransactionReference?.description
    ?? null;
  const lastQuery = memory?.lastQuery ?? null;

  const subjectChanged = Boolean(
    memory?.lastSubject
    && currentSubject
    && memory.lastSubject !== currentSubject,
  );

  return {
    lastIntent,
    lastAction: memory?.lastAction ?? null,
    lastQuestionAsked,
    lastAnswerGiven: history.lastUniMessage ?? null,
    pendingActive: Boolean(pending.exists),
    pendingIntent: pending.intent ?? null,
    pendingAwaitedField: asPendingAwaitedField(pending, pendingAction),
    confirmationPending: Boolean(pending.awaitingConfirmation),
    executorExpected: deriveExecutorExpected({ classification, analyzed }),
    lastAccount,
    lastCategory,
    lastValue,
    lastTransaction,
    lastQuery,
    currentSubject,
    subjectChanged,
    contextRecovered: Boolean(referenceResolution?.resolved),
    turnCount: memory?.turnCount ?? 0,
  };
}
