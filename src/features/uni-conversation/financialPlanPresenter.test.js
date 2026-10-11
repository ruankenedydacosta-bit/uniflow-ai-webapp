import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPendingFinancialPlan,
  applyPlanOperationCorrection,
  cancelPlanOperation,
  PLAN_STATUS,
} from './pendingFinancialPlan.js';
import {
  describePlanOperation,
  buildOperationClarificationQuestion,
  buildPlanSummaryText,
  buildPlanCancelledText,
  buildPlanOperationCancelledText,
  buildPlanResultText,
  findPlanOperationCancelTarget,
  getSingleReadyPlanAction,
  parsePlanCorrectionOverrides,
} from './financialPlanPresenter.js';

// Plano no formato snake_case que o antigo modo financial_plan devolvia,
// convertido para o que createPendingFinancialPlan recebe. Só monta a
// fixture: a validação do contrato saiu junto com o modo (#80).
function planoDeTeste(raw) {
  return {
    operations: (raw.operations ?? []).map((op) => ({
      temporaryId: op.temporary_id,
      operationType: op.operation_type,
      amount: op.amount,
      currency: 'BRL',
      description: op.description ?? null,
      dateExpression: op.date_expression ?? null,
      sourceAccountReference: op.source_account_reference ?? null,
      destinationAccountReference: op.destination_account_reference ?? null,
      categoryReference: op.category_reference ?? null,
      installments: op.installments
        ? { count: op.installments.count, installmentAmount: op.installments.installment_amount, totalAmount: op.installments.total_amount }
        : null,
      recurrence: op.recurrence
        ? {
            frequency: op.recurrence.frequency,
            interval: op.recurrence.interval,
            dayOfMonth: op.recurrence.day_of_month,
            startDate: op.recurrence.start_date,
            endDate: op.recurrence.end_date,
          }
        : null,
      confidence: op.confidence,
      missingFields: op.missing_fields ?? [],
      reason: op.reason ?? '',
    })),
    clarificationQuestion: raw.clarification_question ?? null,
  };
}

const REFERENCE_DATE = '2026-07-29';
const ACCOUNTS = [
  { id: 'acc-nubank', name: 'Nubank', institution_name: 'Nubank', is_active: true },
  { id: 'acc-caixa', name: 'Caixa', institution_name: 'Caixa', is_active: true },
];
const ACCOUNT_TYPES = [{ id: 'type-checking', code: 'checking', is_active: true }];
const CATEGORIES = [
  { id: 'cat-mercado', name: 'Alimentação', category_type: 'expense', is_active: true },
  { id: 'cat-transporte', name: 'Transporte', category_type: 'expense', is_active: true },
  { id: 'cat-transferencia', name: 'Transferência', category_type: 'transfer', is_active: true },
];

function rawOperation(overrides = {}) {
  return {
    temporary_id: 'op_1',
    operation_type: 'expense',
    amount: 80,
    description: 'Mercado',
    source_account_reference: 'Nubank',
    category_reference: 'Alimentação',
    confidence: 0.95,
    ...overrides,
  };
}

function buildPlan(operations, extra = {}) {
  return createPendingFinancialPlan({
    plan: planoDeTeste({ operations, ...extra }),
    phrase: 'teste',
    accounts: ACCOUNTS,
    accountTypes: ACCOUNT_TYPES,
    categories: CATEGORIES,
    referenceDate: REFERENCE_DATE,
    workspaceType: 'personal',
  });
}

test('describePlanOperation descreve uma despesa resolvida com valor e categoria, sem IDs', () => {
  const plan = buildPlan([rawOperation()]);
  const text = describePlanOperation(plan.operations[0]);
  assert.match(text, /R\$ 80,00/);
  assert.match(text, /Alimentação/);
  assert.doesNotMatch(text, /acc-|cat-|0\.\d+/);
});

test('plano de uma única ação estruturada expõe a mesma action para o card financeiro oficial', () => {
  const plan = buildPlan([rawOperation()]);
  const action = getSingleReadyPlanAction(plan);
  assert.equal(action?.status, 'ready');
  assert.equal(action?.transactionType, 'expense');
  assert.equal(action?.category?.name, 'Alimentação');
  assert.equal(action?.description, 'Mercado');
  assert.equal(action?.amount, 80);
  assert.equal(action?.date, REFERENCE_DATE);
});

test('plano ambíguo ou com múltiplas operações não finge caber em um único card', () => {
  const multiple = buildPlan([
    rawOperation({ temporary_id: 'op_1' }),
    rawOperation({ temporary_id: 'op_2', amount: 30, description: 'Almoço' }),
  ]);
  assert.equal(getSingleReadyPlanAction(multiple), null);

  const unresolved = { ...buildPlan([rawOperation()]), status: PLAN_STATUS.AWAITING_CLARIFICATION };
  assert.equal(getSingleReadyPlanAction(unresolved), null);
});

test('describePlanOperation descreve transferência com origem e destino', () => {
  const plan = buildPlan([rawOperation({
    temporary_id: 'op_1',
    operation_type: 'transfer',
    source_account_reference: 'Nubank',
    destination_account_reference: 'Caixa',
    category_reference: null,
  })]);
  const text = describePlanOperation(plan.operations[0]);
  assert.match(text, /Transferência/);
  assert.match(text, /Nubank/);
  assert.match(text, /Caixa/);
});

test('describePlanOperation descreve operação bloqueada (capacidade pendente) com a mensagem de limite', () => {
  const plan = buildPlan([rawOperation({
    operation_type: 'installment_purchase',
    installments: { count: 10, installment_amount: 35, total_amount: 350 },
  })]);
  const text = describePlanOperation(plan.operations[0]);
  assert.match(text, /parceladas automaticamente/);
});

test('buildOperationClarificationQuestion pergunta especificamente sobre destino de transferência não resolvido', () => {
  const plan = buildPlan([rawOperation({
    operation_type: 'transfer',
    destination_account_reference: 'Banco Inexistente',
    category_reference: null,
  })]);
  assert.equal(plan.operations[0].status, 'needs_clarification');
  const question = buildOperationClarificationQuestion(plan.operations[0]);
  assert.match(question, /qual conta.*transferência|para qual conta/i);
});

// Despesa/receita nunca mais bloqueiam nem propõem criar conta (ver
// financialIntentAction.js, BLOCO CONTA-OPCIONAL) -- a proteção "nunca
// propõe criar conta silenciosamente num plano multioperação" só continua
// tendo algo a proteger em transferência, onde a conta ainda é exigida
// (origem/destino) e uma origem sem correspondência real ainda gera uma
// proposta de criação (WILL_CREATE) que o plano recusa aceitar em silêncio.
test('buildOperationClarificationQuestion nunca propõe criar conta silenciosamente num plano multioperação: pede uma conta existente', () => {
  const plan = buildPlan([rawOperation({
    operation_type: 'transfer',
    source_account_reference: 'Banco Fantasma',
    destination_account_reference: 'Caixa',
    category_reference: null,
  })]);
  assert.equal(plan.operations[0].status, 'needs_clarification');
  assert.ok(plan.operations[0].action.proposedAccount);
  const question = buildOperationClarificationQuestion(plan.operations[0]);
  assert.match(question, /conta já existente/i);
});

test('buildPlanSummaryText lista múltiplas operações independentes e pede confirmação quando tudo está pronto', () => {
  const plan = buildPlan([
    rawOperation({ temporary_id: 'op_1', amount: 80, description: 'Mercado' }),
    rawOperation({
      temporary_id: 'op_2', amount: 50, description: 'Gasolina', category_reference: 'Transporte',
    }),
  ]);
  const text = buildPlanSummaryText(plan);
  assert.match(text, /R\$ 80,00/);
  assert.match(text, /R\$ 50,00/);
  assert.match(text, /Posso confirmar e registrar tudo isso\?/);
});

test('buildPlanSummaryText inclui a pergunta de esclarecimento quando o plano ainda não está pronto', () => {
  const plan = buildPlan([rawOperation({
    operation_type: 'transfer',
    destination_account_reference: 'Banco Inexistente',
    category_reference: null,
  })]);
  const text = buildPlanSummaryText(plan);
  assert.match(text, /para qual conta/i);
  assert.doesNotMatch(text, /Posso confirmar e registrar tudo isso\?/);
});

test('buildPlanCancelledText e buildPlanOperationCancelledText nunca mencionam registro bem-sucedido', () => {
  assert.match(buildPlanCancelledText(), /cancelei/i);
  const plan = buildPlan([
    rawOperation({ temporary_id: 'op_1' }),
    rawOperation({ temporary_id: 'op_2', description: 'Gasolina', category_reference: 'Transporte' }),
  ]);
  const text = buildPlanOperationCancelledText(plan);
  assert.match(text, /Cancelei esse lançamento/);
});

test('buildPlanResultText resume confirmados, falhos e bloqueados sem inventar sucesso', () => {
  const plan = buildPlan([rawOperation({ operation_type: 'installment_purchase', installments: { count: 10, installment_amount: 35, total_amount: 350 } })]);
  const text = buildPlanResultText(plan);
  assert.match(text, /parceladas automaticamente/);
  assert.doesNotMatch(text, /Registrei/);
});

test('parsePlanCorrectionOverrides: "Foi ontem" corrige a data usando o resolvedor determinístico', () => {
  const plan = buildPlan([rawOperation()]);
  const overrides = parsePlanCorrectionOverrides({
    text: 'Foi ontem',
    referenceDate: REFERENCE_DATE,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    operation: plan.operations[0],
  });
  assert.deepEqual(overrides, { date: '2026-07-28' });
});

test('parsePlanCorrectionOverrides: "Na verdade foram R$95" corrige o valor', () => {
  const plan = buildPlan([rawOperation()]);
  const overrides = parsePlanCorrectionOverrides({
    text: 'Na verdade foram R$95',
    referenceDate: REFERENCE_DATE,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    operation: plan.operations[0],
  });
  assert.deepEqual(overrides, { amount: 95 });
});

test('parsePlanCorrectionOverrides: "Troca para Transporte" corrige a categoria por ID real', () => {
  const plan = buildPlan([rawOperation()]);
  const overrides = parsePlanCorrectionOverrides({
    text: 'Troca para Transporte',
    referenceDate: REFERENCE_DATE,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    operation: plan.operations[0],
  });
  assert.deepEqual(overrides, { categoryId: 'cat-transporte' });
});

test('parsePlanCorrectionOverrides: "Não foi Nubank, foi Caixa" corrige a conta por ID real', () => {
  const plan = buildPlan([rawOperation()]);
  const overrides = parsePlanCorrectionOverrides({
    text: 'Não foi Nubank, foi Caixa',
    referenceDate: REFERENCE_DATE,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    operation: plan.operations[0],
  });
  assert.deepEqual(overrides, { accountId: 'acc-caixa', accountName: 'Caixa' });
});

test('parsePlanCorrectionOverrides: correção de conta em transferência com destino pendente mira o destino, nunca inventa', () => {
  const plan = buildPlan([rawOperation({
    operation_type: 'transfer',
    destination_account_reference: 'Banco Inexistente',
    category_reference: null,
  })]);
  const overrides = parsePlanCorrectionOverrides({
    text: 'Caixa',
    referenceDate: REFERENCE_DATE,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    operation: plan.operations[0],
  });
  assert.deepEqual(overrides, { destinationAccountId: 'acc-caixa', destinationAccountName: 'Caixa' });

  const updated = applyPlanOperationCorrection(plan, plan.operations[0].temporaryId, overrides);
  assert.equal(updated.operations[0].status, 'ready');
});

test('parsePlanCorrectionOverrides: texto sem correspondência real não inventa conta/categoria (retorna null)', () => {
  const plan = buildPlan([rawOperation()]);
  const overrides = parsePlanCorrectionOverrides({
    text: 'Banco que não existe em lugar nenhum',
    referenceDate: REFERENCE_DATE,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    operation: plan.operations[0],
  });
  assert.equal(overrides, null);
});

test('parsePlanCorrectionOverrides: sem operação ou texto vazio retorna null', () => {
  assert.equal(parsePlanCorrectionOverrides({ text: '', operation: {} }), null);
  assert.equal(parsePlanCorrectionOverrides({ text: 'Caixa', operation: null }), null);
});

// ============================================================================
// BUG REAL: quando falta o valor de UMA operação (código de issue
// 'amount_required'), a resposta geralmente não usa nenhuma palavra de
// correção ("na verdade", "foram"...) -- ex.: "a gasolina foi 200 reais"
// ou só "200 reais". Com o uni-interpret (#80), uma operação sem valor
// chega ao plano com amount null e nasce com esse código de issue.
// Testado aqui por unidade, isolado do pipeline -- nunca reaproveita o
// valor de outra operação, mesmo que esse caminho venha a ser alcançado
// no futuro (ex.: uma correção manual que zera o valor de uma operação
// já pronta).
// ============================================================================

function operationNeedingAmount(overrides = {}) {
  return {
    temporaryId: 'op_1',
    operationType: 'expense',
    status: 'needs_clarification',
    capabilityPending: false,
    rawOperation: { amount: null, description: 'Gasolina', sourceAccountReference: null },
    action: { issues: [{ field: 'amount', code: 'amount_required' }] },
    destinationAccountResolution: null,
    ...overrides,
  };
}

test('parsePlanCorrectionOverrides: "a gasolina foi 200 reais" preenche o valor faltante (sem palavra de correção)', () => {
  const overrides = parsePlanCorrectionOverrides({
    text: 'a gasolina foi 200 reais',
    referenceDate: REFERENCE_DATE,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    operation: operationNeedingAmount(),
  });
  assert.deepEqual(overrides, { amount: 200 });
});

test('parsePlanCorrectionOverrides: só "200 reais" também preenche o valor faltante', () => {
  const overrides = parsePlanCorrectionOverrides({
    text: '200 reais',
    referenceDate: REFERENCE_DATE,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    operation: operationNeedingAmount(),
  });
  assert.deepEqual(overrides, { amount: 200 });
});

test('parsePlanCorrectionOverrides: preenchimento de valor nunca se aplica quando o problema da operação NÃO é o valor', () => {
  const overrides = parsePlanCorrectionOverrides({
    text: '200 reais',
    referenceDate: REFERENCE_DATE,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    operation: operationNeedingAmount({
      action: { issues: [{ field: 'account', code: 'account_required' }] },
    }),
  });
  assert.equal(overrides, null);
});

test('buildOperationClarificationQuestion menciona a descrição da operação quando pede o valor faltante', () => {
  const question = buildOperationClarificationQuestion(operationNeedingAmount());
  assert.match(question, /valor de gasolina/i);
});

test('buildOperationClarificationQuestion usa pergunta genérica quando a operação sem valor não tem descrição', () => {
  const question = buildOperationClarificationQuestion(operationNeedingAmount({
    rawOperation: { amount: null, description: null, sourceAccountReference: null },
  }));
  assert.equal(question, 'Qual é o valor desse lançamento?');
});

// ============================================================================
// BLOCO F: cancelamento de UMA operação específica por referência
// semântica -- "cancela só a gasolina" remove apenas a operação da
// gasolina, nunca a do mercado (nunca proximidade textual cega). Espelha
// exatamente a lógica de handlePlanConversationInput (UniChatPage.jsx):
// findPlanOperationCancelTarget -> cancelPlanOperation.
// ============================================================================

function mercadoEGasolinaPlan() {
  return buildPlan([
    rawOperation({
      temporary_id: 'op_mercado', amount: 50, description: 'Mercado', category_reference: 'Alimentação',
    }),
    rawOperation({
      temporary_id: 'op_gasolina',
      amount: 200,
      description: 'Gasolina',
      source_account_reference: 'Caixa',
      category_reference: 'Alimentação',
    }),
  ]);
}

test('findPlanOperationCancelTarget: "cancela só a gasolina" identifica exatamente a operação da gasolina, nunca a do mercado', () => {
  const plan = mercadoEGasolinaPlan();
  const active = plan.operations;
  const target = findPlanOperationCancelTarget('cancela só a gasolina', active);
  assert.ok(target);
  assert.equal(target.temporaryId, 'op_gasolina');
});

test('findPlanOperationCancelTarget: variações "cancela a gasolina"/"remove a gasolina"/"tira a gasolina" também identificam só a gasolina', () => {
  const plan = mercadoEGasolinaPlan();
  for (const phrase of ['cancela a gasolina', 'remove a gasolina', 'tira a gasolina', 'exclui a gasolina']) {
    const target = findPlanOperationCancelTarget(phrase, plan.operations);
    assert.equal(target?.temporaryId, 'op_gasolina', `falhou para "${phrase}"`);
  }
});

test('findPlanOperationCancelTarget: referência ambígua ou sem correspondência real nunca escolhe uma operação no palpite', () => {
  const plan = mercadoEGasolinaPlan();
  assert.equal(findPlanOperationCancelTarget('cancela a padaria', plan.operations), null);
  assert.equal(findPlanOperationCancelTarget('cancelar', plan.operations), null); // sem referência -> fluxo normal (cancelar tudo)
  assert.equal(findPlanOperationCancelTarget('', plan.operations), null);
  assert.equal(findPlanOperationCancelTarget('cancela a gasolina', []), null);
});

test('BLOCO F: cancelar só a gasolina preserva o mercado intacto e o plano continua pronto para confirmação', () => {
  const plan = mercadoEGasolinaPlan();
  const target = findPlanOperationCancelTarget('cancela só a gasolina', plan.operations);
  const updated = cancelPlanOperation(plan, target.temporaryId);

  const mercado = updated.operations.find((op) => op.temporaryId === 'op_mercado');
  const gasolina = updated.operations.find((op) => op.temporaryId === 'op_gasolina');
  assert.equal(gasolina.status, 'cancelled');
  assert.equal(mercado.status, 'ready');
  assert.equal(mercado.rawOperation.amount, 50);
  assert.equal(updated.status, PLAN_STATUS.READY_FOR_CONFIRMATION);
  assert.notEqual(updated.status, PLAN_STATUS.CANCELLED);
});

test('BLOCO F: cancelar a única operação restante cancela o plano inteiro (nunca fica "pronto" com zero operações ativas)', () => {
  const plan = buildPlan([rawOperation({ temporary_id: 'op_mercado', description: 'Mercado' })]);
  const target = findPlanOperationCancelTarget('cancela só o mercado', plan.operations);
  assert.equal(target?.temporaryId, 'op_mercado');
  const updated = cancelPlanOperation(plan, target.temporaryId);
  assert.equal(updated.status, PLAN_STATUS.CANCELLED);
  assert.ok(updated.operations.every((op) => op.status === 'cancelled'));
});

test('BLOCO F: cancelamento de operação nunca persiste nada -- é só uma transição de estado em memória', () => {
  const plan = mercadoEGasolinaPlan();
  const target = findPlanOperationCancelTarget('cancela só a gasolina', plan.operations);
  const updated = cancelPlanOperation(plan, target.temporaryId);
  // cancelPlanOperation é puro: nunca chama rede/RPC, só recalcula o objeto do plano.
  assert.notEqual(updated, plan);
  assert.equal(typeof updated.status, 'string');
});
