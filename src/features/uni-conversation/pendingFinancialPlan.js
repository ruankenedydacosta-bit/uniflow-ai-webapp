import { normalizeFinancialText, resolveRelativeDateExpression } from '../uni-intents/index.js';
import { resolveFinancialAccount } from './accountResolution.js';
import { buildFinancialIntentAction } from './financialIntentAction.js';
import { createClientOperationId } from './accountProvisioning.js';

// BLOCO E: "Pending Financial Plan" -- estende o padrao ja validado do
// Bloco B (uma operacao financeira suspensa/retomada) para MULTIPLAS
// operacoes, sem criar uma arquitetura paralela: cada operacao do plano
// reaproveita EXATAMENTE resolveFinancialAccount/resolveFinancialCategory/
// buildFinancialIntentAction (via financialIntentAction.js), a mesma forma
// ja usada por uma unica transacao. O plano em si NUNCA e persistido no
// banco -- vive so em memoria (estado React), ate a confirmacao final de
// cada operacao passar pelo RPC atomico ja existente
// (execute_confirmed_financial_action), uma operacao por vez.

export const PLAN_OPERATION_STATUS = Object.freeze({
  NEEDS_CLARIFICATION: 'needs_clarification',
  READY: 'ready',
  BLOCKED: 'blocked',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
});

export const PLAN_STATUS = Object.freeze({
  AWAITING_CLARIFICATION: 'awaiting_clarification',
  READY_FOR_CONFIRMATION: 'ready_for_confirmation',
  CONFIRMING: 'confirming',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  CANCELLED: 'cancelled',
});

const OPERATION_TYPE_TO_INTENT = Object.freeze({
  expense: 'register_expense',
  income: 'register_income',
  transfer: 'register_transfer',
  // BLOCO E -- LIMITE DE ESCOPO EXPLICITO (secao 9/11/24 da tarefa): o
  // backend ainda nao tem RPC/tabela para persistir parcelamento nem
  // recorrencia. Estas duas continuam sendo COMPREENDIDAS e apresentadas
  // para confirmacao (capabilityPending=true), mas nunca convertidas em
  // uma transacao real -- nunca "simular" 10 lancamentos ou criar uma
  // automacao silenciosa.
  installment_purchase: null,
  recurring_expense: null,
  recurring_income: null,
});

const CAPABILITY_PENDING_MESSAGES = Object.freeze({
  installment_purchase: 'Ainda não consigo registrar compras parceladas automaticamente nesta versão -- entendi o parcelamento, mas o registro precisa ser feito manualmente.',
  recurring_expense: 'Ainda não consigo criar recorrências automaticamente nesta versão -- entendi a recorrência, mas cada lançamento precisa ser feito manualmente.',
  recurring_income: 'Ainda não consigo criar recorrências automaticamente nesta versão -- entendi a recorrência, mas cada lançamento precisa ser feito manualmente.',
});

function resolveOperationDate(operation, referenceDate) {
  if (!operation.dateExpression) return referenceDate;
  const { resolvedDate } = resolveRelativeDateExpression(operation.dateExpression, referenceDate);
  return resolvedDate ?? referenceDate;
}

function buildParsedDraft(operation, referenceDate) {
  const description = operation.description ?? '';
  // Transferencia sempre tem uma categoria canonica propria (a categoria
  // global "Transferencia", category_type='transfer', ja semeada no banco
  // -- ver supabase/migrations/20260711_003) -- mesma convencao ja usada
  // pelo parser determinístico de uma unica operacao (entityExtractor.js).
  // Nunca exige que a IA ou o usuario informem uma categoria para transferir.
  const category = operation.operationType === 'transfer'
    ? (operation.categoryReference ?? 'Transferência')
    : operation.categoryReference;
  return {
    intent: OPERATION_TYPE_TO_INTENT[operation.operationType] ?? 'question',
    input: description,
    normalizedInput: normalizeFinancialText(description),
    entities: {
      amount: operation.amount,
      category,
      description,
      account: operation.sourceAccountReference,
      date: resolveOperationDate(operation, referenceDate),
    },
  };
}

function buildOperationState({
  operation, accounts, accountTypes, categories, referenceDate, workspaceType, overrides = {},
}) {
  const clientOperationId = overrides.clientOperationId ?? createClientOperationId();

  const context = Object.freeze({
    accounts, accountTypes, categories, referenceDate, workspaceType,
  });

  if (!OPERATION_TYPE_TO_INTENT[operation.operationType]) {
    return Object.freeze({
      temporaryId: operation.temporaryId,
      clientOperationId,
      operationType: operation.operationType,
      capabilityPending: true,
      blockedReason: CAPABILITY_PENDING_MESSAGES[operation.operationType],
      status: PLAN_OPERATION_STATUS.BLOCKED,
      action: null,
      destinationAccountResolution: null,
      rawOperation: operation,
      overrides,
      context,
    });
  }

  const parsed = buildParsedDraft(operation, referenceDate);
  let destinationAccountResolution = null;
  const actionOverrides = { ...overrides, clientOperationId };

  if (operation.operationType === 'transfer') {
    // buildFinancialIntentAction so resolve a conta de ORIGEM
    // automaticamente (parsed.entities.account) -- a conta de DESTINO
    // precisa ser resolvida separadamente com a MESMA funcao
    // determinística (resolveFinancialAccount), nunca inventada.
    destinationAccountResolution = resolveFinancialAccount({
      accounts,
      accountTypes,
      requestedName: overrides.destinationAccountName ?? operation.destinationAccountReference,
      accountId: overrides.destinationAccountId,
      input: operation.destinationAccountReference ?? '',
    });
    if (destinationAccountResolution.status === 'resolved') {
      actionOverrides.destinationAccountId = destinationAccountResolution.account.id;
    }
  }

  const action = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes,
    categories,
    referenceDate,
    workspaceType,
    overrides: actionOverrides,
  });

  const needsDestinationClarification = operation.operationType === 'transfer'
    && destinationAccountResolution?.status !== 'resolved';
  // BLOCO E -- LIMITE DE ESCOPO EXPLICITO: dentro de um plano com multiplas
  // operacoes, buildFinancialIntentAction pode marcar uma conta/categoria
  // desconhecida como "ready" com uma PROPOSTA de criacao (will_create).
  // O app so cria conta/categoria apos uma confirmacao dedicada (ver
  // financialPendingActionFlow.js) -- essa dependencia ainda nao existe
  // para multiplas operacoes num unico plano, entao NUNCA persistimos uma
  // criacao silenciosa aqui: uma operacao com proposta de criacao continua
  // pedindo esclarecimento (o usuario informa uma conta/categoria existente).
  const hasCreationProposal = Boolean(action.proposedAccount || action.proposedCategory);

  const status = action.status === 'ready' && !needsDestinationClarification && !hasCreationProposal
    ? PLAN_OPERATION_STATUS.READY
    : PLAN_OPERATION_STATUS.NEEDS_CLARIFICATION;

  return Object.freeze({
    temporaryId: operation.temporaryId,
    clientOperationId,
    operationType: operation.operationType,
    capabilityPending: false,
    blockedReason: null,
    status,
    action,
    destinationAccountResolution,
    rawOperation: operation,
    overrides: actionOverrides,
    context,
  });
}

function derivePlanStatus(operationStates) {
  const active = operationStates.filter((op) => op.status !== PLAN_OPERATION_STATUS.CANCELLED);
  if (active.length === 0) return PLAN_STATUS.CANCELLED;

  const persistable = active.filter((op) => !op.capabilityPending);
  const anyConfirmed = active.some((op) => op.status === PLAN_OPERATION_STATUS.CONFIRMED);
  const anyFailed = active.some((op) => op.status === PLAN_OPERATION_STATUS.FAILED);
  const allPersistableConfirmed = persistable.length > 0
    && persistable.every((op) => op.status === PLAN_OPERATION_STATUS.CONFIRMED);

  if (allPersistableConfirmed) {
    return anyFailed ? PLAN_STATUS.PARTIAL : PLAN_STATUS.COMPLETED;
  }
  if (anyConfirmed || anyFailed) return PLAN_STATUS.PARTIAL;

  const allReadyOrBlocked = active.every((op) => (
    op.status === PLAN_OPERATION_STATUS.READY || op.capabilityPending
  ));
  return allReadyOrBlocked ? PLAN_STATUS.READY_FOR_CONFIRMATION : PLAN_STATUS.AWAITING_CLARIFICATION;
}

function findCurrentOperationIndex(operationStates) {
  const index = operationStates.findIndex((op) => (
    op.status === PLAN_OPERATION_STATUS.NEEDS_CLARIFICATION
  ));
  return index >= 0 ? index : 0;
}

/**
 * Constroi um Pending Financial Plan a partir de um plano JA VALIDADO
 * (validateFinancialPlanResponse). Cada operacao passa individualmente
 * pelos resolutores deterministicos existentes -- nunca em lote, nunca
 * pulando a resolucao real de conta/categoria.
 */
export function createPendingFinancialPlan({
  plan, phrase, accounts = [], accountTypes = [], categories = [], referenceDate, workspaceType = 'personal', now,
} = {}) {
  const operations = (plan?.operations ?? []).map((operation) => buildOperationState({
    operation, accounts, accountTypes, categories, referenceDate, workspaceType,
  }));
  const clarificationQuestion = plan?.clarificationQuestion ?? null;
  // BUG REAL: uma frase genuinamente ambígua (ex.: "Gastei R$ 50 no
  // mercado e a gasolina eu paguei pelo Banco do Brasil" -- só um valor
  // para duas despesas) não forma nenhuma operação válida ainda (o
  // contrato exige valor > 0 por operação -- ver financialPlanContract.js)
  // -- a IA devolve decision='clarification_required' SEM operações, só a
  // pergunta. Sem esse caso especial, derivePlanStatus([]) tratava "nenhuma
  // operação ainda" como CANCELLED (mesma condição de um plano realmente
  // cancelado), descartando a pergunta de esclarecimento em vez de
  // apresentá-la.
  const status = operations.length === 0 && clarificationQuestion
    ? PLAN_STATUS.AWAITING_CLARIFICATION
    : derivePlanStatus(operations);

  return Object.freeze({
    planId: createClientOperationId(),
    version: 1,
    phrase: typeof phrase === 'string' ? phrase : '',
    contextWorkspaceType: workspaceType,
    createdAt: typeof now === 'string' ? now : new Date().toISOString(),
    clarificationQuestion,
    operations,
    currentOperationIndex: findCurrentOperationIndex(operations),
    status,
  });
}

/**
 * Reaplica a correcao (overrides) de UMA operacao especifica, mantendo as
 * demais intactas -- nunca descarta o plano inteiro por causa de uma
 * correcao pontual (valor, data, conta, categoria).
 */
export function applyPlanOperationCorrection(planState, temporaryId, overrides) {
  const operations = planState.operations.map((op) => {
    if (op.temporaryId !== temporaryId || op.capabilityPending) return op;
    return buildOperationState({
      operation: op.rawOperation,
      accounts: op.context.accounts,
      accountTypes: op.context.accountTypes,
      categories: op.context.categories,
      referenceDate: op.context.referenceDate,
      workspaceType: op.context.workspaceType,
      overrides: { ...op.overrides, ...overrides, clientOperationId: op.clientOperationId },
    });
  });

  return Object.freeze({
    ...planState,
    operations,
    currentOperationIndex: findCurrentOperationIndex(operations),
    status: derivePlanStatus(operations),
  });
}

export function cancelPlanOperation(planState, temporaryId) {
  const operations = planState.operations.map((op) => (
    op.temporaryId === temporaryId
      ? Object.freeze({ ...op, status: PLAN_OPERATION_STATUS.CANCELLED })
      : op
  ));
  return Object.freeze({
    ...planState,
    operations,
    currentOperationIndex: findCurrentOperationIndex(operations),
    status: derivePlanStatus(operations),
  });
}

export function cancelEntirePlan(planState) {
  const operations = planState.operations.map((op) => (
    Object.freeze({ ...op, status: PLAN_OPERATION_STATUS.CANCELLED })
  ));
  return Object.freeze({ ...planState, operations, status: PLAN_STATUS.CANCELLED });
}

export function markPlanOperationConfirmed(planState, temporaryId) {
  const operations = planState.operations.map((op) => (
    op.temporaryId === temporaryId
      ? Object.freeze({ ...op, status: PLAN_OPERATION_STATUS.CONFIRMED })
      : op
  ));
  return Object.freeze({
    ...planState,
    operations,
    status: derivePlanStatus(operations),
  });
}

export function markPlanOperationFailed(planState, temporaryId) {
  const operations = planState.operations.map((op) => (
    op.temporaryId === temporaryId
      ? Object.freeze({ ...op, status: PLAN_OPERATION_STATUS.FAILED })
      : op
  ));
  return Object.freeze({
    ...planState,
    operations,
    status: derivePlanStatus(operations),
  });
}

export function getActivePlanOperations(planState) {
  return planState.operations.filter((op) => op.status !== PLAN_OPERATION_STATUS.CANCELLED);
}

export function getPersistablePlanOperations(planState) {
  return getActivePlanOperations(planState).filter((op) => !op.capabilityPending);
}

// Sem plano em andamento (planState nulo), nada está pronto. Quem cancela ou
// confirma um card sem plano chama isto com `financialPlanRef.current` nulo:
// lançar aqui abortava o handler antes de qualquer efeito.
export function isPlanReadyForFinalConfirmation(planState) {
  return planState?.status === PLAN_STATUS.READY_FOR_CONFIRMATION;
}

/**
 * Resumo curto para reenviar como `pendingPlanSummary` na proxima chamada a
 * camada neural (financial_plan) -- nunca serializa o plano inteiro, nunca
 * inclui dados sensiveis, so o essencial para a IA entender uma correcao.
 */
export function summarizePlanForNeuralContext(planState) {
  const active = getActivePlanOperations(planState);
  if (!active.length) {
    // Plano ainda sem nenhuma operação formada (só a pergunta de
    // esclarecimento, ex.: "qual foi o valor da gasolina?") -- a próxima
    // resposta do usuário precisa desse contexto mínimo para a IA entender
    // o que está sendo respondido, nunca o plano inteiro serializado.
    if (planState.clarificationQuestion) {
      return `Pergunta pendente: "${planState.clarificationQuestion}" (frase original: "${planState.phrase}")`;
    }
    return '';
  }
  return active
    .map((op) => {
      const raw = op.rawOperation;
      const label = op.operationType === 'transfer'
        ? `transferência de R$ ${raw.amount} de ${raw.sourceAccountReference ?? '?'} para ${raw.destinationAccountReference ?? '?'}`
        : `${op.operationType === 'income' ? 'entrada' : 'saída'} de R$ ${raw.amount}${raw.description ? ` (${raw.description})` : ''}`;
      return `${op.temporaryId}: ${label}, status ${op.status}`;
    })
    .join('; ');
}
