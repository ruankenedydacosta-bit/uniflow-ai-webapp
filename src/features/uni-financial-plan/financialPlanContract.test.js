import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFinancialPlanResponse } from './financialPlanContract.js';
import { FINANCIAL_PLAN_DECISIONS, FINANCIAL_OPERATION_TYPES } from './financialPlanConfig.js';

function baseOperation(overrides = {}) {
  return {
    temporary_id: 'op_1',
    operation_type: 'expense',
    amount: 80,
    currency: 'BRL',
    description: 'Mercado',
    date_expression: null,
    resolved_date: null,
    source_account_reference: null,
    destination_account_reference: null,
    category_reference: 'Alimentação',
    installments: null,
    recurrence: null,
    confidence: 0.95,
    missing_fields: [],
    reason: 'Compra em supermercado.',
    ...overrides,
  };
}

function basePlan(overrides = {}) {
  return {
    version: '1',
    decision: 'single_operation',
    operations: [baseOperation()],
    clarification_question: null,
    global_confidence: 0.95,
    ...overrides,
  };
}

test('plano válido com uma única operação é aceito e normalizado', () => {
  const result = validateFinancialPlanResponse(basePlan());
  assert.equal(result.valid, true);
  assert.equal(result.plan.decision, FINANCIAL_PLAN_DECISIONS.SINGLE_OPERATION);
  assert.equal(result.plan.operations.length, 1);
  assert.equal(result.plan.operations[0].operationType, FINANCIAL_OPERATION_TYPES.EXPENSE);
  assert.equal(result.plan.operations[0].amount, 80);
});

test('plano com múltiplas operações válidas é aceito', () => {
  const plan = basePlan({
    decision: 'multiple_operations',
    operations: [
      baseOperation({ temporary_id: 'op_1', amount: 80, description: 'Mercado', category_reference: 'Alimentação' }),
      baseOperation({ temporary_id: 'op_2', amount: 50, description: 'Gasolina', category_reference: 'Transporte' }),
    ],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, true);
  assert.equal(result.plan.operations.length, 2);
  assert.equal(result.plan.operations[1].description, 'Gasolina');
});

test('receita e despesa na mesma frase permanecem operações independentes', () => {
  const plan = basePlan({
    decision: 'multiple_operations',
    operations: [
      baseOperation({ temporary_id: 'op_1', operation_type: 'income', amount: 3500, description: 'Salário', category_reference: 'Salário' }),
      baseOperation({ temporary_id: 'op_2', operation_type: 'expense', amount: 1200, description: 'Aluguel', category_reference: 'Moradia' }),
    ],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, true);
  assert.equal(result.plan.operations[0].operationType, 'income');
  assert.equal(result.plan.operations[1].operationType, 'expense');
  assert.equal(result.plan.operations[0].amount, 3500);
  assert.equal(result.plan.operations[1].amount, 1200);
});

test('transferência válida exige origem e destino distintos', () => {
  const plan = basePlan({
    operations: [baseOperation({
      operation_type: 'transfer',
      description: 'Transferência',
      category_reference: null,
      source_account_reference: 'Nubank',
      destination_account_reference: 'Caixa',
    })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, true);
  assert.equal(result.plan.operations[0].sourceAccountReference, 'Nubank');
  assert.equal(result.plan.operations[0].destinationAccountReference, 'Caixa');
});

test('transferência incompleta (sem destino) é rejeitada', () => {
  const plan = basePlan({
    operations: [baseOperation({
      operation_type: 'transfer',
      source_account_reference: 'Nubank',
      destination_account_reference: null,
    })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_operation');
});

test('transferência com origem igual ao destino é rejeitada', () => {
  const plan = basePlan({
    operations: [baseOperation({
      operation_type: 'transfer',
      source_account_reference: 'Nubank',
      destination_account_reference: 'nubank',
    })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, false);
});

test('compra parcelada válida com total e parcela consistentes é aceita', () => {
  const plan = basePlan({
    operations: [baseOperation({
      operation_type: 'installment_purchase',
      amount: 3500,
      description: 'Celular',
      category_reference: null,
      installments: { count: 10, installment_amount: 350, total_amount: 3500 },
    })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, true);
  assert.equal(result.plan.operations[0].installments.count, 10);
  assert.equal(result.plan.operations[0].installments.installmentAmount, 350);
  assert.equal(result.plan.operations[0].installments.totalAmount, 3500);
});

test('compra parcelada sem objeto installments é rejeitada', () => {
  const plan = basePlan({
    operations: [baseOperation({ operation_type: 'installment_purchase', installments: null })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, false);
});

test('divergência entre total e parcelas (fora da tolerância) é rejeitada', () => {
  const plan = basePlan({
    operations: [baseOperation({
      operation_type: 'installment_purchase',
      amount: 3500,
      installments: { count: 10, installment_amount: 350, total_amount: 4000 },
    })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, false);
});

test('parcelas com contagem não inteira ou negativa são rejeitadas', () => {
  const plan = basePlan({
    operations: [baseOperation({
      operation_type: 'installment_purchase',
      installments: { count: -2, installment_amount: 350, total_amount: 700 },
    })],
  });
  assert.equal(validateFinancialPlanResponse(plan).valid, false);
});

test('recorrência válida é aceita', () => {
  const plan = basePlan({
    operations: [baseOperation({
      operation_type: 'recurring_expense',
      amount: 1200,
      description: 'Aluguel',
      category_reference: 'Moradia',
      recurrence: { frequency: 'monthly', interval: 1, day_of_month: 5, start_date: null, end_date: null },
    })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, true);
  assert.equal(result.plan.operations[0].recurrence.frequency, 'monthly');
  assert.equal(result.plan.operations[0].recurrence.dayOfMonth, 5);
});

test('recorrência com frequência inválida é rejeitada', () => {
  const plan = basePlan({
    operations: [baseOperation({
      operation_type: 'recurring_expense',
      recurrence: { frequency: 'hourly', interval: 1 },
    })],
  });
  assert.equal(validateFinancialPlanResponse(plan).valid, false);
});

test('operação recorrente sem objeto recurrence é rejeitada', () => {
  const plan = basePlan({
    operations: [baseOperation({ operation_type: 'recurring_income', recurrence: null })],
  });
  assert.equal(validateFinancialPlanResponse(plan).valid, false);
});

test('temporary_id duplicado invalida o plano inteiro', () => {
  const plan = basePlan({
    decision: 'multiple_operations',
    operations: [
      baseOperation({ temporary_id: 'op_1' }),
      baseOperation({ temporary_id: 'op_1', amount: 50 }),
    ],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_operation');
});

test('amount inválido (zero, negativo ou não numérico) é rejeitado', () => {
  for (const amount of [0, -10, 'muito', null]) {
    const plan = basePlan({ operations: [baseOperation({ amount })] });
    assert.equal(validateFinancialPlanResponse(plan).valid, false, `amount=${amount} deveria ser inválido`);
  }
});

test('confidence inválida (fora de 0-1 ou não numérica) é rejeitada', () => {
  for (const confidence of [-0.1, 1.5, 'alta']) {
    const plan = basePlan({ operations: [baseOperation({ confidence })] });
    assert.equal(validateFinancialPlanResponse(plan).valid, false);
  }
  const planGlobal = basePlan({ global_confidence: 2 });
  assert.equal(validateFinancialPlanResponse(planGlobal).valid, false);
});

test('operation_type fora do enum é rejeitado (tipo incompatível)', () => {
  const plan = basePlan({ operations: [baseOperation({ operation_type: 'donation' })] });
  assert.equal(validateFinancialPlanResponse(plan).valid, false);
});

test('moeda diferente de BRL é rejeitada', () => {
  const plan = basePlan({ operations: [baseOperation({ currency: 'USD' })] });
  assert.equal(validateFinancialPlanResponse(plan).valid, false);
});

test('version desconhecida é rejeitada', () => {
  const plan = basePlan({ version: '2' });
  assert.equal(validateFinancialPlanResponse(plan).valid, false);
  assert.equal(validateFinancialPlanResponse(plan).reason, 'invalid_version');
});

test('decision fora do enum é rejeitada', () => {
  const plan = basePlan({ decision: 'execute_now' });
  assert.equal(validateFinancialPlanResponse(plan).valid, false);
});

test('limite máximo de operações é aplicado', () => {
  const operations = Array.from({ length: 7 }, (_, i) => baseOperation({ temporary_id: `op_${i}`, amount: 10 }));
  const plan = basePlan({ decision: 'multiple_operations', operations });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'too_many_operations');
});

test('single_operation com mais de uma operação é rejeitado (contagem inconsistente)', () => {
  const plan = basePlan({
    decision: 'single_operation',
    operations: [baseOperation({ temporary_id: 'op_1' }), baseOperation({ temporary_id: 'op_2' })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'single_operation_count_mismatch');
});

test('clarification_required exige clarification_question não vazia', () => {
  const plan = basePlan({ decision: 'clarification_required', operations: [], clarification_question: null });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'missing_clarification_question');

  const validPlan = basePlan({
    decision: 'clarification_required',
    operations: [],
    clarification_question: 'R$ 350 é o valor de cada parcela ou o total?',
  });
  const validResult = validateFinancialPlanResponse(validPlan);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.plan.clarificationQuestion, 'R$ 350 é o valor de cada parcela ou o total?');
});

test('unsupported não exige operações', () => {
  const plan = basePlan({ decision: 'unsupported', operations: [] });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, true);
  assert.equal(result.plan.operations.length, 0);
});

test('JSON inválido cai em fallback seguro', () => {
  const result = validateFinancialPlanResponse('{ isso nao e json');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_json');
});

test('aceita string JSON válida além de objeto já parseado', () => {
  const result = validateFinancialPlanResponse(JSON.stringify(basePlan()));
  assert.equal(result.valid, true);
});

test('campos extras/perigosos são ignorados -- nunca account_id/category_id/user_id/RPC sobrevivem à validação', () => {
  const plan = basePlan({
    operations: [baseOperation({
      account_id: 'account-real-do-banco',
      category_id: 'category-real-do-banco',
      user_id: 'user-outro',
      execute: true,
      persist: true,
      rpc: 'execute_confirmed_financial_action',
      context: 'business',
    })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, true);
  const keys = Object.keys(result.plan.operations[0]);
  assert.deepEqual(keys.sort(), [
    'amount', 'categoryReference', 'confidence', 'currency', 'dateExpression',
    'description', 'destinationAccountReference', 'installments', 'missingFields',
    'operationType', 'reason', 'recurrence', 'sourceAccountReference', 'temporaryId',
  ].sort());
});

test('missing_fields desconhecidos (fora da allowlist) são descartados', () => {
  const plan = basePlan({
    operations: [baseOperation({ missing_fields: ['amount', 'account_id', 'sql_injection', 'category'] })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, true);
  assert.deepEqual(result.plan.operations[0].missingFields, ['amount', 'category']);
});

test('resolved_date da IA nunca é confiado -- o contrato não expõe esse campo bruto', () => {
  const plan = basePlan({
    operations: [baseOperation({ date_expression: 'ontem', resolved_date: '2099-01-01' })],
  });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, true);
  assert.equal(result.plan.operations[0].resolvedDate, undefined);
  assert.equal(result.plan.operations[0].dateExpression, 'ontem');
});

test('array vazio de operações é rejeitado quando a decisão exige operações', () => {
  for (const decision of ['single_operation', 'multiple_operations']) {
    const plan = basePlan({ decision, operations: [] });
    assert.equal(validateFinancialPlanResponse(plan).valid, false);
  }
});

test('operações não-array são tratadas como ausentes, nunca lançam', () => {
  const plan = basePlan({ operations: 'não é um array' });
  const result = validateFinancialPlanResponse(plan);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'missing_operations');
});

test('entrada nula, indefinida ou tipo primitivo nunca lança', () => {
  for (const value of [null, undefined, 42, 'texto solto', []]) {
    const result = validateFinancialPlanResponse(value);
    assert.equal(result.valid, false);
  }
});

test('REGRESSÃO: clampText realmente trunca no limite máximo -- description/reason/clarification nunca passam ilimitados', () => {
  const longDescription = 'A'.repeat(500);
  const longReason = 'B'.repeat(500);
  const longClarification = 'C'.repeat(500);
  const result = validateFinancialPlanResponse(basePlan({
    operations: [baseOperation({ description: longDescription, reason: longReason })],
    clarification_question: longClarification,
  }));
  assert.equal(result.valid, true);
  assert.equal(result.plan.operations[0].description.length, 160);
  assert.equal(result.plan.operations[0].reason.length, 140);
  assert.equal(result.plan.clarificationQuestion.length, 140);
});
