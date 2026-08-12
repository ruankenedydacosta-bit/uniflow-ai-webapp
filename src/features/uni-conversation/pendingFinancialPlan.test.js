import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAN_OPERATION_STATUS,
  PLAN_STATUS,
  applyPlanOperationCorrection,
  cancelEntirePlan,
  cancelPlanOperation,
  createPendingFinancialPlan,
  getActivePlanOperations,
  getPersistablePlanOperations,
  isPlanReadyForFinalConfirmation,
  markPlanOperationConfirmed,
  markPlanOperationFailed,
  summarizePlanForNeuralContext,
} from './pendingFinancialPlan.js';
import { validateFinancialPlanResponse } from '../uni-financial-plan/index.js';
import { parsePlanCorrectionOverrides } from './financialPlanPresenter.js';

const ACCOUNTS = [
  { id: 'account-nubank', name: 'Nubank', is_active: true },
  { id: 'account-caixa', name: 'Caixa', is_active: true },
];
const ACCOUNT_TYPES = [{ code: 'checking', is_active: true }];
const CATEGORIES = [
  { id: 'category-food', name: 'Alimentação', category_type: 'expense', is_active: true },
  { id: 'category-transport', name: 'Transporte', category_type: 'expense', is_active: true },
  { id: 'category-salary', name: 'Salário', category_type: 'income', is_active: true },
  // Categoria global "Transferência" (category_type: 'transfer'), semeada
  // de verdade no banco (ver supabase/migrations/20260711_003) -- toda
  // transferência já tem uma categoria própria por padrão.
  { id: 'category-transfer', name: 'Transferência', category_type: 'transfer', is_active: true },
];
const REFERENCE_DATE = '2026-07-29';

function rawOperation(overrides = {}) {
  return {
    temporaryId: 'op_1',
    operationType: 'expense',
    amount: 80,
    currency: 'BRL',
    description: 'Mercado',
    dateExpression: null,
    sourceAccountReference: 'Nubank',
    destinationAccountReference: null,
    categoryReference: 'Alimentação',
    installments: null,
    recurrence: null,
    confidence: 0.95,
    missingFields: [],
    reason: 'x',
    ...overrides,
  };
}

function validatedPlan(operations, extra = {}) {
  const result = validateFinancialPlanResponse({
    version: '1',
    decision: operations.length > 1 ? 'multiple_operations' : 'single_operation',
    operations: operations.map((op) => ({
      temporary_id: op.temporaryId,
      operation_type: op.operationType,
      amount: op.amount,
      currency: 'BRL',
      description: op.description,
      date_expression: op.dateExpression,
      source_account_reference: op.sourceAccountReference,
      destination_account_reference: op.destinationAccountReference,
      category_reference: op.categoryReference,
      installments: op.installments && {
        count: op.installments.count,
        installment_amount: op.installments.installmentAmount,
        total_amount: op.installments.totalAmount,
      },
      recurrence: op.recurrence && {
        frequency: op.recurrence.frequency,
        interval: op.recurrence.interval,
        day_of_month: op.recurrence.dayOfMonth,
        start_date: op.recurrence.startDate,
        end_date: op.recurrence.endDate,
      },
      confidence: op.confidence,
      missing_fields: op.missingFields,
      reason: op.reason,
    })),
    clarification_question: null,
    global_confidence: 0.9,
    ...extra,
  });
  assert.equal(result.valid, true, `plano de teste deveria ser válido: ${result.reason}`);
  return result.plan;
}

function buildPlan(operations, overrides = {}) {
  return createPendingFinancialPlan({
    plan: validatedPlan(operations),
    phrase: 'frase de teste',
    accounts: ACCOUNTS,
    accountTypes: ACCOUNT_TYPES,
    categories: CATEGORIES,
    referenceDate: REFERENCE_DATE,
    workspaceType: 'personal',
    ...overrides,
  });
}

test('multioperação: duas despesas resolvem independentemente e ficam prontas para confirmação', () => {
  const plan = buildPlan([
    rawOperation({ temporaryId: 'op_1', amount: 80, description: 'Mercado', categoryReference: 'Alimentação' }),
    rawOperation({ temporaryId: 'op_2', amount: 50, description: 'Gasolina', categoryReference: 'Transporte' }),
  ]);
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.operations[0].status, PLAN_OPERATION_STATUS.READY);
  assert.equal(plan.operations[1].status, PLAN_OPERATION_STATUS.READY);
  assert.equal(plan.operations[0].action.category.id, 'category-food');
  assert.equal(plan.operations[1].action.category.id, 'category-transport');
  assert.equal(plan.status, PLAN_STATUS.READY_FOR_CONFIRMATION);
  assert.equal(isPlanReadyForFinalConfirmation(plan), true);
});

test('receita e despesa na mesma frase continuam operações independentes, nunca o valor líquido', () => {
  const plan = buildPlan([
    rawOperation({
      temporaryId: 'op_1', operationType: 'income', amount: 3500, description: 'Salário', categoryReference: 'Salário',
    }),
    rawOperation({
      temporaryId: 'op_2', operationType: 'expense', amount: 1200, description: 'Aluguel', categoryReference: null,
    }),
  ]);
  assert.equal(plan.operations[0].action.transactionType, 'income');
  assert.equal(plan.operations[0].action.amount, 3500);
  assert.equal(plan.operations[1].action.transactionType, 'expense');
  assert.equal(plan.operations[1].action.amount, 1200);
});

test('transferência resolve origem e destino via resolveFinancialAccount, nunca inventa conta', () => {
  const plan = buildPlan([
    rawOperation({
      operationType: 'transfer',
      description: 'Transferência',
      categoryReference: null,
      sourceAccountReference: 'Nubank',
      destinationAccountReference: 'Caixa',
    }),
  ]);
  const operation = plan.operations[0];
  assert.equal(operation.status, PLAN_OPERATION_STATUS.READY);
  assert.equal(operation.action.account.id, 'account-nubank');
  assert.equal(operation.action.payload.destination_account_id, 'account-caixa');
});

test('transferência com destino não resolvido pede esclarecimento, nunca assume', () => {
  const plan = buildPlan([
    rawOperation({
      operationType: 'transfer',
      description: 'Transferência',
      categoryReference: null,
      sourceAccountReference: 'Nubank',
      destinationAccountReference: 'Banco Fantasma',
    }),
  ]);
  const operation = plan.operations[0];
  assert.equal(operation.status, PLAN_OPERATION_STATUS.NEEDS_CLARIFICATION);
  assert.notEqual(operation.destinationAccountResolution.status, 'resolved');
});

test('parcelamento é compreendido e apresentado, mas marcado como capacidade pendente (sem persistência)', () => {
  const plan = buildPlan([
    rawOperation({
      operationType: 'installment_purchase',
      description: 'Celular',
      categoryReference: null,
      installments: { count: 10, installmentAmount: 350, totalAmount: 3500 },
    }),
  ]);
  const operation = plan.operations[0];
  assert.equal(operation.capabilityPending, true);
  assert.equal(operation.status, PLAN_OPERATION_STATUS.BLOCKED);
  assert.equal(operation.action, null);
  assert.match(operation.blockedReason, /parceladas automaticamente/);
});

test('recorrência é compreendida e apresentada, mas marcada como capacidade pendente (sem persistência)', () => {
  const plan = buildPlan([
    rawOperation({
      operationType: 'recurring_expense',
      description: 'Aluguel',
      categoryReference: null,
      recurrence: { frequency: 'monthly', interval: 1, dayOfMonth: 5, startDate: null, endDate: null },
    }),
  ]);
  const operation = plan.operations[0];
  assert.equal(operation.capabilityPending, true);
  assert.equal(operation.status, PLAN_OPERATION_STATUS.BLOCKED);
  assert.match(operation.blockedReason, /recorrências automaticamente/);
});

test('operação com capacidade pendente não bloqueia as demais operações prontas do mesmo plano', () => {
  const plan = buildPlan([
    rawOperation({ temporaryId: 'op_1', amount: 80, description: 'Mercado' }),
    rawOperation({
      temporaryId: 'op_2',
      operationType: 'installment_purchase',
      description: 'Celular',
      categoryReference: null,
      installments: { count: 10, installmentAmount: 350, totalAmount: 3500 },
    }),
  ]);
  assert.equal(plan.operations[0].status, PLAN_OPERATION_STATUS.READY);
  assert.equal(plan.operations[1].capabilityPending, true);
  // O plano como um todo ainda fica pronto para confirmar a parte
  // persistível -- a operação bloqueada não descarta o plano inteiro.
  assert.equal(plan.status, PLAN_STATUS.READY_FOR_CONFIRMATION);
});

test('correção de uma operação (valor) preserva as demais intactas', () => {
  const plan = buildPlan([
    rawOperation({ temporaryId: 'op_1', amount: 80, description: 'Mercado' }),
    rawOperation({ temporaryId: 'op_2', amount: 50, description: 'Gasolina', categoryReference: 'Transporte' }),
  ]);
  const corrected = applyPlanOperationCorrection(plan, 'op_2', { amount: 60 });
  assert.equal(corrected.operations[0].action.amount, 80);
  assert.equal(corrected.operations[1].action.amount, 60);
  // client_operation_id da operação corrigida é preservado.
  assert.equal(corrected.operations[1].clientOperationId, plan.operations[1].clientOperationId);
});

test('correção de conta ("não foi Nubank, foi Caixa") reflete apenas na operação indicada', () => {
  const plan = buildPlan([
    rawOperation({ temporaryId: 'op_1', sourceAccountReference: 'Nubank' }),
  ]);
  const corrected = applyPlanOperationCorrection(plan, 'op_1', { accountName: 'Caixa', accountId: 'account-caixa' });
  assert.equal(corrected.operations[0].action.account.id, 'account-caixa');
});

test('cancelar uma única operação preserva as demais e atualiza o status do plano', () => {
  const plan = buildPlan([
    rawOperation({ temporaryId: 'op_1', amount: 80, description: 'Mercado' }),
    rawOperation({ temporaryId: 'op_2', amount: 50, description: 'Gasolina', categoryReference: 'Transporte' }),
  ]);
  const cancelled = cancelPlanOperation(plan, 'op_2');
  assert.equal(cancelled.operations[1].status, PLAN_OPERATION_STATUS.CANCELLED);
  assert.equal(cancelled.operations[0].status, PLAN_OPERATION_STATUS.READY);
  assert.equal(getActivePlanOperations(cancelled).length, 1);
  assert.equal(cancelled.status, PLAN_STATUS.READY_FOR_CONFIRMATION);
});

test('cancelar tudo marca todas as operações como canceladas e o plano como cancelado', () => {
  const plan = buildPlan([
    rawOperation({ temporaryId: 'op_1' }),
    rawOperation({ temporaryId: 'op_2', amount: 50 }),
  ]);
  const cancelled = cancelEntirePlan(plan);
  assert.ok(cancelled.operations.every((op) => op.status === PLAN_OPERATION_STATUS.CANCELLED));
  assert.equal(cancelled.status, PLAN_STATUS.CANCELLED);
  assert.equal(getActivePlanOperations(cancelled).length, 0);
});

test('confirmação individual de operações avança o status do plano para completed quando todas persistíveis são confirmadas', () => {
  let plan = buildPlan([
    rawOperation({ temporaryId: 'op_1', amount: 80 }),
    rawOperation({ temporaryId: 'op_2', amount: 50, categoryReference: 'Transporte' }),
  ]);
  plan = markPlanOperationConfirmed(plan, 'op_1');
  assert.equal(plan.status, PLAN_STATUS.PARTIAL);
  plan = markPlanOperationConfirmed(plan, 'op_2');
  assert.equal(plan.status, PLAN_STATUS.COMPLETED);
});

test('idempotência: se a terceira de quatro operações falhar, o plano fica parcial -- nunca promete tudo registrado', () => {
  let plan = buildPlan([
    rawOperation({ temporaryId: 'op_1', amount: 10 }),
    rawOperation({ temporaryId: 'op_2', amount: 20, categoryReference: 'Transporte' }),
    rawOperation({ temporaryId: 'op_3', amount: 30 }),
    rawOperation({ temporaryId: 'op_4', amount: 40, categoryReference: 'Transporte' }),
  ]);
  plan = markPlanOperationConfirmed(plan, 'op_1');
  plan = markPlanOperationConfirmed(plan, 'op_2');
  plan = markPlanOperationFailed(plan, 'op_3');
  assert.equal(plan.status, PLAN_STATUS.PARTIAL);
  assert.notEqual(plan.status, PLAN_STATUS.COMPLETED);
});

test('cada operação preserva um client_operation_id próprio e único', () => {
  const plan = buildPlan([
    rawOperation({ temporaryId: 'op_1' }),
    rawOperation({ temporaryId: 'op_2', amount: 50, categoryReference: 'Transporte' }),
  ]);
  assert.notEqual(plan.operations[0].clientOperationId, plan.operations[1].clientOperationId);
  assert.ok(plan.operations[0].clientOperationId);
  assert.ok(plan.operations[1].clientOperationId);
});

test('summarizePlanForNeuralContext produz um resumo curto sem serializar o plano inteiro', () => {
  const plan = buildPlan([
    rawOperation({ temporaryId: 'op_1', amount: 80, description: 'Mercado' }),
    rawOperation({ temporaryId: 'op_2', amount: 50, description: 'Gasolina', categoryReference: 'Transporte' }),
  ]);
  const summary = summarizePlanForNeuralContext(plan);
  assert.match(summary, /op_1/);
  assert.match(summary, /op_2/);
  assert.ok(summary.length < 300);
});

test('getPersistablePlanOperations exclui operações com capacidade pendente (parcelamento/recorrência)', () => {
  const plan = buildPlan([
    rawOperation({ temporaryId: 'op_1', amount: 80 }),
    rawOperation({
      temporaryId: 'op_2',
      operationType: 'installment_purchase',
      categoryReference: null,
      installments: { count: 2, installmentAmount: 50, totalAmount: 100 },
    }),
  ]);
  const persistable = getPersistablePlanOperations(plan);
  assert.equal(persistable.length, 1);
  assert.equal(persistable[0].temporaryId, 'op_1');
});

test('REGRESSÃO: plano com uma única operação simples continua funcionando (equivalente ao Bloco B)', () => {
  const plan = buildPlan([rawOperation()]);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].action.status, 'ready');
  assert.equal(plan.operations[0].action.payload.category_id, 'category-food');
});

// ============================================================================
// NORMALIZAÇÃO DE INSTITUIÇÕES FINANCEIRAS no financial_plan (Bloco E):
// source_account_reference e destination_account_reference passam pela
// mesma normalização determinística/offline (src/features/financial-
// institutions/) antes de resolveFinancialAccount, herdada automaticamente
// por já reaproveitar accountResolution.js -- nunca uma segunda lógica.
// ============================================================================

test('source_account_reference "No Bank" resolve a conta real Nubank dentro do plano', () => {
  const plan = buildPlan([
    rawOperation({ sourceAccountReference: 'No Bank' }),
  ]);
  const operation = plan.operations[0];
  assert.equal(operation.status, PLAN_OPERATION_STATUS.READY);
  assert.equal(operation.action.account.id, 'account-nubank');
  assert.equal(operation.action.account.name, 'Nubank');
});

test('destination_account_reference "No Bank" resolve a conta real Nubank numa transferência do plano', () => {
  const plan = buildPlan([
    rawOperation({
      operationType: 'transfer',
      description: 'Transferência',
      categoryReference: null,
      sourceAccountReference: 'Caixa',
      destinationAccountReference: 'No Bank',
    }),
  ]);
  const operation = plan.operations[0];
  assert.equal(operation.status, PLAN_OPERATION_STATUS.READY);
  assert.equal(operation.action.account.id, 'account-caixa');
  assert.equal(operation.action.payload.destination_account_id, 'account-nubank');
});

test('correção "não foi Nubank, foi No Bank" (variação garbled) ainda resolve a conta real Nubank', () => {
  const plan = buildPlan([rawOperation({ sourceAccountReference: 'Caixa' })]);
  const updated = applyPlanOperationCorrection(plan, plan.operations[0].temporaryId, {
    accountName: 'No Bank',
  });
  assert.equal(updated.operations[0].status, PLAN_OPERATION_STATUS.READY);
  assert.equal(updated.operations[0].action.account.id, 'account-nubank');
});

// ============================================================================
// BUG REAL: "Gastei R$ 50 no mercado e a gasolina eu paguei pelo Banco do
// Brasil." -- duas despesas, um valor só. O contrato do plano exige
// amount > 0 por operação (financialPlanContract.js), então a resposta
// correta da IA para esse caso é decision='clarification_required' SEM
// operações ainda, só a pergunta -- nunca uma operação inventando/
// duplicando valor. Sem o fix, derivePlanStatus([]) tratava "zero
// operações" como CANCELLED, descartando a pergunta de esclarecimento.
// ============================================================================

test('BUG REAL: plano de esclarecimento sem operações (valor ambíguo entre duas despesas) fica AWAITING_CLARIFICATION, nunca CANCELLED', () => {
  const plan = createPendingFinancialPlan({
    plan: {
      version: '1',
      decision: 'clarification_required',
      operations: [],
      clarificationQuestion: 'Entendi duas despesas: uma de R$ 50 no mercado e outra de gasolina paga pelo Banco do Brasil. Qual foi o valor da gasolina?',
      globalConfidence: 0.6,
    },
    phrase: 'Gastei 50 reais no mercado e a gasolina eu paguei pelo Banco do Brasil.',
    accounts: ACCOUNTS,
    accountTypes: ACCOUNT_TYPES,
    categories: CATEGORIES,
    referenceDate: REFERENCE_DATE,
  });
  assert.equal(plan.status, PLAN_STATUS.AWAITING_CLARIFICATION);
  assert.equal(plan.operations.length, 0);
  assert.match(plan.clarificationQuestion, /gasolina/);
});

test('summarizePlanForNeuralContext inclui a pergunta pendente quando ainda não há nenhuma operação formada', () => {
  const plan = createPendingFinancialPlan({
    plan: {
      version: '1',
      decision: 'clarification_required',
      operations: [],
      clarificationQuestion: 'Qual foi o valor da gasolina?',
      globalConfidence: 0.6,
    },
    phrase: 'Gastei 50 reais no mercado e a gasolina eu paguei pelo Banco do Brasil.',
    accounts: ACCOUNTS,
    accountTypes: ACCOUNT_TYPES,
    categories: CATEGORIES,
    referenceDate: REFERENCE_DATE,
  });
  const summary = summarizePlanForNeuralContext(plan);
  assert.match(summary, /Qual foi o valor da gasolina\?/);
  assert.match(summary, /Gastei 50 reais no mercado/);
});

test('BUG REAL: quando a IA já devolve as duas operações separadas (após a resposta do usuário), mercado e gasolina nunca se misturam', () => {
  // Simula a SEGUNDA chamada à camada neural, já com o valor da gasolina
  // esclarecido -- cada operação preserva seu próprio valor, categoria e
  // conta, nunca duplicando os R$ 50 do mercado nem perdendo o Banco do
  // Brasil da gasolina.
  const plan = buildPlan([
    rawOperation({
      temporaryId: 'op_mercado',
      amount: 50,
      description: 'Mercado',
      categoryReference: 'Alimentação',
      sourceAccountReference: null,
    }),
    rawOperation({
      temporaryId: 'op_gasolina',
      amount: 200,
      description: 'Gasolina',
      categoryReference: 'Transporte',
      sourceAccountReference: 'Banco do Brasil',
    }),
  ]);
  const [mercado, gasolina] = plan.operations;
  assert.equal(mercado.rawOperation.amount, 50);
  assert.equal(gasolina.rawOperation.amount, 200);
  assert.notEqual(mercado.rawOperation.amount, gasolina.rawOperation.amount === 50);
  // Banco do Brasil não existe na lista de contas do teste -- despesa nunca
  // mais bloqueia nem pergunta por conta (BLOCO CONTA-OPCIONAL), então a
  // operação da gasolina fica pronta mesmo assim, mas SEM inventar a conta
  // "Banco do Brasil" (account fica null, nunca WILL_CREATE) e sem emprestar
  // silenciosamente a conta de outra operação; o mercado, que também não
  // recebeu conta nenhuma, segue igualmente com account null -- nenhuma das
  // duas operações herda campo da outra.
  assert.equal(mercado.action.proposedAccount, null);
  assert.equal(mercado.action.account, null);
  assert.equal(gasolina.status, PLAN_OPERATION_STATUS.READY);
  assert.equal(gasolina.action.proposedAccount, null);
  assert.equal(gasolina.action.account, null);
  assert.equal(gasolina.action.payload.account_id, null);
});

// ============================================================================
// BLOCO F: CASO REAL COMPLETO end-to-end -- "Gastei R$ 50 no mercado e a
// gasolina eu paguei pelo Banco do Brasil." -> "A gasolina foi R$ 200." ->
// "O mercado foi no Nubank." Reproduz exatamente o fluxo executor do
// Bloco F usando os módulos reais (só a resposta da IA é simulada, pois
// este teste não faz chamada de rede) -- prova que nenhuma etapa
// reinterpreta a frase original, nenhum campo é compartilhado
// indevidamente, e o plano final tem exatamente duas operações prontas
// com valor/conta/categoria próprios.
// ============================================================================

test('BLOCO F CASO REAL: mercado (R$ 50, Alimentação, Nubank) e gasolina (R$ 200, Transporte, Banco do Brasil) chegam separados e corretos, prontos para confirmação', () => {
  const accountsWithBB = [...ACCOUNTS, { id: 'account-bb', name: 'Banco do Brasil', is_active: true }];
  const phrase = 'Gastei R$ 50 no mercado e a gasolina eu paguei pelo Banco do Brasil.';

  // 1) Primeira chamada: valor da gasolina é ambíguo -- decision
  // clarification_required, SEM operações (o contrato exige amount > 0 em
  // toda operação incluída), só a pergunta.
  const step1 = validateFinancialPlanResponse({
    version: '1',
    decision: 'clarification_required',
    operations: [],
    clarification_question: 'Entendi R$ 50 no mercado e uma despesa de gasolina paga pelo Banco do Brasil. Qual foi o valor da gasolina?',
    global_confidence: 0.9,
  });
  assert.equal(step1.valid, true);
  let plan = createPendingFinancialPlan({
    plan: step1.plan,
    phrase,
    accounts: accountsWithBB,
    accountTypes: ACCOUNT_TYPES,
    categories: CATEGORIES,
    referenceDate: REFERENCE_DATE,
    workspaceType: 'personal',
  });
  assert.equal(plan.status, PLAN_STATUS.AWAITING_CLARIFICATION);
  assert.equal(plan.operations.length, 0);

  // 2) "A gasolina foi R$ 200." -- a IA (com o resumo/pergunta pendente
  // como contexto) devolve AS DUAS operações completas e separadas.
  const step2 = validateFinancialPlanResponse({
    version: '1',
    decision: 'multiple_operations',
    operations: [
      {
        temporary_id: 'op_mercado', operation_type: 'expense', amount: 50, currency: 'BRL',
        description: 'Mercado', date_expression: null, source_account_reference: null,
        destination_account_reference: null, category_reference: 'Alimentação',
        installments: null, recurrence: null, confidence: 0.97, missing_fields: [], reason: 'ok',
      },
      {
        temporary_id: 'op_gasolina', operation_type: 'expense', amount: 200, currency: 'BRL',
        description: 'Gasolina', date_expression: null, source_account_reference: 'Banco do Brasil',
        destination_account_reference: null, category_reference: 'Transporte',
        installments: null, recurrence: null, confidence: 0.98, missing_fields: [], reason: 'ok',
      },
    ],
    clarification_question: null,
    global_confidence: 0.95,
  });
  assert.equal(step2.valid, true, step2.reason);
  plan = createPendingFinancialPlan({
    plan: step2.plan,
    phrase: 'A gasolina foi R$ 200.',
    accounts: accountsWithBB,
    accountTypes: ACCOUNT_TYPES,
    categories: CATEGORIES,
    referenceDate: REFERENCE_DATE,
    workspaceType: 'personal',
  });

  const mercadoAfterStep2 = plan.operations.find((op) => op.temporaryId === 'op_mercado');
  const gasolinaAfterStep2 = plan.operations.find((op) => op.temporaryId === 'op_gasolina');
  // Gasolina já está completa (valor + conta + categoria próprios).
  assert.equal(gasolinaAfterStep2.status, PLAN_OPERATION_STATUS.READY);
  assert.equal(gasolinaAfterStep2.rawOperation.amount, 200);
  assert.equal(gasolinaAfterStep2.action.account?.name, 'Banco do Brasil');
  assert.equal(gasolinaAfterStep2.action.category?.name, 'Transporte');
  // Mercado não tem conta mencionada -- despesa nunca mais bloqueia nem
  // pergunta por conta (BLOCO CONTA-OPCIONAL), então já fica pronta com
  // account null, NUNCA herdando o Banco do Brasil da gasolina.
  assert.equal(mercadoAfterStep2.status, PLAN_OPERATION_STATUS.READY);
  assert.equal(mercadoAfterStep2.rawOperation.amount, 50);
  assert.equal(mercadoAfterStep2.action.account, null);

  // 3) "Não foi outro banco, foi Nubank." -- uma correção explícita e
  // voluntária (o mercado já está pronto, não é resposta a uma pergunta
  // pendente) que afeta SOMENTE a operação do mercado, aplicada por
  // temporaryId explícito -- nunca proximidade textual cega sobre o plano
  // inteiro nem vazamento para a operação da gasolina.
  const overrides = parsePlanCorrectionOverrides({
    text: 'Não foi outro banco, foi Nubank',
    referenceDate: REFERENCE_DATE,
    accounts: accountsWithBB,
    categories: CATEGORIES,
    operation: mercadoAfterStep2,
  });
  assert.deepEqual(overrides, { accountId: 'account-nubank', accountName: 'Nubank' });
  plan = applyPlanOperationCorrection(plan, 'op_mercado', overrides);

  const mercadoFinal = plan.operations.find((op) => op.temporaryId === 'op_mercado');
  const gasolinaFinal = plan.operations.find((op) => op.temporaryId === 'op_gasolina');

  // Resultado final: duas operações prontas, cada uma com seus próprios
  // valor/conta/categoria/descrição -- nenhuma mistura, nenhuma duplicação,
  // plano pronto para confirmação sem reinterpretar a frase original.
  assert.equal(plan.status, PLAN_STATUS.READY_FOR_CONFIRMATION);
  assert.equal(isPlanReadyForFinalConfirmation(plan), true);

  assert.equal(mercadoFinal.status, PLAN_OPERATION_STATUS.READY);
  assert.equal(mercadoFinal.rawOperation.amount, 50);
  assert.equal(mercadoFinal.action.account?.name, 'Nubank');
  assert.equal(mercadoFinal.action.category?.name, 'Alimentação');
  assert.equal(mercadoFinal.rawOperation.description, 'Mercado');

  assert.equal(gasolinaFinal.status, PLAN_OPERATION_STATUS.READY);
  assert.equal(gasolinaFinal.rawOperation.amount, 200);
  assert.equal(gasolinaFinal.action.account?.name, 'Banco do Brasil');
  assert.equal(gasolinaFinal.action.category?.name, 'Transporte');
  assert.equal(gasolinaFinal.rawOperation.description, 'Gasolina');

  // Nenhum campo compartilhado indevidamente entre as duas operações.
  assert.notEqual(mercadoFinal.rawOperation.amount, gasolinaFinal.rawOperation.amount);
  assert.notEqual(mercadoFinal.action.account?.id, gasolinaFinal.action.account?.id);
  assert.notEqual(mercadoFinal.action.category?.id, gasolinaFinal.action.category?.id);

  const persistable = getPersistablePlanOperations(plan).filter((op) => op.status === PLAN_OPERATION_STATUS.READY);
  assert.equal(persistable.length, 2);
  // client_operation_id (idempotency key por operação) distintos.
  assert.notEqual(mercadoFinal.clientOperationId, gasolinaFinal.clientOperationId);
});
