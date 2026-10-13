import { normalizeFinancialText, resolveRelativeDateExpression } from '../uni-intents/index.js';
import { resolveFinancialAccount } from './accountResolution.js';
import { buildFinancialIntentAction } from './financialIntentAction.js';
import { createClientOperationId } from './accountProvisioning.js';
import {
  generateInstallmentDates,
  MAX_INSTALLMENTS,
  resolveInstallmentStatus,
  splitInstallmentAmounts,
} from '../../pages/financeiro/installmentUtils.js';
import { RECURRENCE_FREQUENCIES } from '../../pages/financeiro/recurrenceUtils.js';

// BLOCO E: "Pending Financial Plan" -- estende o padrao ja validado do
// Bloco B (uma operacao financeira suspensa/retomada) para MULTIPLAS
// operacoes, sem criar uma arquitetura paralela: cada operacao do plano
// reaproveita EXATAMENTE resolveFinancialAccount/resolveFinancialCategory/
// buildFinancialIntentAction (via financialIntentAction.js), a mesma forma
// ja usada por uma unica transacao. O plano em si NUNCA e persistido no
// banco -- vive so em memoria (estado React), ate a confirmacao final de
// cada operacao passar por uma RPC atomica, uma operacao por vez:
// execute_confirmed_financial_action, registrar_compra_parcelada na
// compra parcelada (#221) ou criar_serie_recorrente na recorrência (#222).

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
  // Compra parcelada é uma saída com o total; a RPC registrar_compra_parcelada
  // grava as parcelas (#221).
  installment_purchase: 'register_expense',
  // Recorrência com frequência vira a série; a RPC criar_serie_recorrente
  // grava os lançamentos dos próximos 3 meses (#222).
  recurring_expense: 'register_expense',
  recurring_income: 'register_income',
});

const CAPABILITY_PENDING_MESSAGES = Object.freeze({
  installment_purchase: 'Não entendi em quantas parcelas foi a compra. Diga de novo com o número de parcelas.',
  recurring_expense: 'Não entendi de quanto em quanto tempo isso se repete. Diga de novo com a frequência, como "todo mês".',
  recurring_income: 'Não entendi de quanto em quanto tempo isso se repete. Diga de novo com a frequência, como "todo mês".',
});

const RECURRING_OPERATION_TYPES = new Set(['recurring_expense', 'recurring_income']);
// Teto do intervalo da RPC criar_serie_recorrente.
export const MAX_RECURRENCE_INTERVAL = 365;

// Regra da série no formato da RPC; null sem frequência válida. A correção
// ("não, é toda semana") vence o que o modelo leu.
function lerRecorrencia(operation, overrides) {
  if (!RECURRING_OPERATION_TYPES.has(operation.operationType)) return null;
  const { frequency, interval } = overrides.recurrence ?? operation.recurrence ?? {};
  if (!RECURRENCE_FREQUENCIES.includes(frequency)) return null;
  return {
    frequency,
    interval: Number.isInteger(interval) && interval >= 1 && interval <= MAX_RECURRENCE_INTERVAL ? interval : 1,
  };
}

// Número de parcelas: a correção ("foram 12x") vence o que o modelo leu.
// null fora de 2 a 360, o limite da RPC.
function contarParcelas(operation, overrides) {
  const count = Number(overrides.installmentCount ?? operation.installments?.count);
  return Number.isInteger(count) && count >= 2 && count <= MAX_INSTALLMENTS ? count : null;
}

// Valores e datas como a RPC grava: centavos, a última parcela absorve a
// diferença, e o dia fica limitado ao fim do mês. futureCount é a previsão
// de quantas nascem previstas pela data do aparelho; o texto final usa a
// contagem que a RPC devolve, no fuso de São Paulo.
function resumirParcelas(total, count, firstDate, referenceDate) {
  const futureCount = typeof firstDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(firstDate)
    ? generateInstallmentDates(firstDate, count)
      .filter((date) => resolveInstallmentStatus(date, referenceDate) === 'pending').length
    : null;
  if (!(Number(total) > 0) || Math.round(Number(total) * 100) < count) {
    return { count, installmentAmount: null, lastAmount: null, futureCount };
  }
  const valores = splitInstallmentAmounts(total, count);
  return { count, installmentAmount: valores[0], lastAmount: valores[count - 1], futureCount };
}

function resolveOperationDate(operation, referenceDate) {
  // Plano montado a partir do uni-interpret já traz a data resolvida.
  if (operation.date) return operation.date;
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

// Conta, destino e categoria que o uni-interpret escolheu no catálogo vêm
// por id: resolver pelo nome de novo perderia a escolha quando duas contas
// têm a mesma identidade ("Nubank" e "Cartão Nubank").
function idsEscolhidos(operation) {
  const overrides = {};
  if (operation.accountId) overrides.accountId = operation.accountId;
  if (operation.destinationAccountId) overrides.destinationAccountId = operation.destinationAccountId;
  if (operation.categoryId) overrides.categoryId = operation.categoryId;
  return overrides;
}

function buildOperationState({
  operation, accounts, accountTypes, categories, referenceDate, workspaceType, overrides = {},
}) {
  const clientOperationId = overrides.clientOperationId ?? createClientOperationId();

  const context = Object.freeze({
    accounts, accountTypes, categories, referenceDate, workspaceType,
  });

  const installmentCount = operation.operationType === 'installment_purchase' ? contarParcelas(operation, overrides) : null;
  const recurrence = lerRecorrencia(operation, overrides);
  if (
    !OPERATION_TYPE_TO_INTENT[operation.operationType]
    || (operation.operationType === 'installment_purchase' && !installmentCount)
    || (RECURRING_OPERATION_TYPES.has(operation.operationType) && !recurrence)
  ) {
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

  const builtAction = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes,
    categories,
    referenceDate,
    workspaceType,
    overrides: actionOverrides,
  });
  let action = builtAction;
  if (installmentCount) {
    action = { ...builtAction, installments: resumirParcelas(builtAction.amount, installmentCount, builtAction.date, referenceDate) };
  } else if (recurrence) {
    // A série decide o status de cada lançamento pela data: o card não
    // mostra a série inteira como prevista. Com o início antes de hoje, os
    // lançamentos até hoje entram como realizados, e o card avisa.
    action = {
      ...builtAction,
      planned: false,
      recurrence,
      startsBeforeToday: Boolean(builtAction.date && referenceDate && builtAction.date < referenceDate),
    };
  }

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
    overrides: idsEscolhidos(operation),
  }));
  const clarificationQuestion = plan?.clarificationQuestion ?? null;
  // BUG REAL: uma frase genuinamente ambígua (ex.: "Gastei R$ 50 no
  // mercado e a gasolina eu paguei pelo Banco do Brasil" -- só um valor
  // para duas despesas) não formava nenhuma operação válida no antigo modo
  // financial_plan, que devolvia só a pergunta, SEM operações. O
  // uni-interpret (#80) sempre devolve operações, com o valor faltando. Sem esse caso especial, derivePlanStatus([]) tratava "nenhuma
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

// result: o que a RPC devolveu, para a resposta repetir o que foi gravado
// (quantas parcelas ficaram previstas) em vez da previsão do card.
export function markPlanOperationConfirmed(planState, temporaryId, result = null) {
  const operations = planState.operations.map((op) => (
    op.temporaryId === temporaryId
      ? Object.freeze({ ...op, status: PLAN_OPERATION_STATUS.CONFIRMED, result })
      : op
  ));
  return Object.freeze({
    ...planState,
    operations,
    status: derivePlanStatus(operations),
  });
}

// failure: o erro devolvido, para a resposta dar o motivo quando ele é do
// pedido (repetir não resolve) e não da conexão.
export function markPlanOperationFailed(planState, temporaryId, failure = null) {
  const operations = planState.operations.map((op) => (
    op.temporaryId === temporaryId
      ? Object.freeze({ ...op, status: PLAN_OPERATION_STATUS.FAILED, failure })
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

