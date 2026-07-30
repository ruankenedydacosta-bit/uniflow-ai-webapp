import assert from 'node:assert/strict';
import test from 'node:test';
import { createFinancialPlanService } from './financialPlanService.js';

function createSupabaseStub(accessToken = 'token-123') {
  return {
    auth: {
      getSession: async () => ({ data: { session: accessToken ? { access_token: accessToken } : null } }),
    },
  };
}

function buildInput(overrides = {}) {
  return {
    phrase: 'Gastei R$ 80 no mercado e R$ 50 de gasolina.',
    accounts: [{ id: 'account-nubank', name: 'Nubank' }],
    categories: [{ id: 'category-food', name: 'Alimentação' }],
    referenceDate: '2026-07-29',
    ...overrides,
  };
}

function validPlanResponse() {
  return {
    version: '1',
    decision: 'multiple_operations',
    operations: [
      {
        temporary_id: 'op_1', operation_type: 'expense', amount: 80, currency: 'BRL',
        description: 'Mercado', category_reference: 'Alimentação', confidence: 0.95,
        missing_fields: [], reason: 'Compra em mercado.',
      },
      {
        temporary_id: 'op_2', operation_type: 'expense', amount: 50, currency: 'BRL',
        description: 'Gasolina', category_reference: 'Transporte', confidence: 0.9,
        missing_fields: [], reason: 'Abastecimento.',
      },
    ],
    clarification_question: null,
    global_confidence: 0.92,
  };
}

test('resposta válida retorna plano validado e nenhum error', async () => {
  const service = createFinancialPlanService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ plan: validPlanResponse() }) }),
  });

  const { plan, error } = await service.interpret(buildInput());
  assert.equal(error, null);
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.decision, 'multiple_operations');
});

test('feature flag desativada nunca chama fetch', async () => {
  let called = false;
  const service = createFinancialPlanService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: false,
    fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
  });
  const { plan, error } = await service.interpret(buildInput());
  assert.equal(plan, null);
  assert.equal(error.code, 'UNSUPPORTED');
  assert.equal(called, false);
});

test('frase vazia nunca chama fetch', async () => {
  let called = false;
  const service = createFinancialPlanService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
  });
  const { error } = await service.interpret(buildInput({ phrase: '   ' }));
  assert.equal(error.code, 'INSUFFICIENT_INPUT');
  assert.equal(called, false);
});

test('sessão sem token retorna UNAUTHORIZED sem chamar fetch', async () => {
  let called = false;
  const service = createFinancialPlanService({
    supabase: createSupabaseStub(null),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
  });
  const { error } = await service.interpret(buildInput());
  assert.equal(error.code, 'UNAUTHORIZED');
  assert.equal(called, false);
});

test('401/429/503 do provedor são mapeados corretamente', async () => {
  for (const [status, expectedCode] of [[401, 'UNAUTHORIZED'], [429, 'RATE_LIMIT'], [503, 'NOT_CONFIGURED']]) {
    const service = createFinancialPlanService({
      supabase: createSupabaseStub(),
      supabaseUrl: 'https://demo.supabase.co',
      supabaseAnonKey: 'anon-key',
      enabled: true,
      fetchImpl: async () => ({ ok: false, status }),
    });
    const { error } = await service.interpret(buildInput());
    assert.equal(error.code, expectedCode);
  }
});

test('timeout aborta a requisição e retorna TIMEOUT', async () => {
  const service = createFinancialPlanService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    timeoutMs: 5,
    fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });
  const { plan, error } = await service.interpret(buildInput());
  assert.equal(plan, null);
  assert.equal(error.code, 'TIMEOUT');
});

test('JSON inválido na resposta HTTP retorna PARSE_ERROR', async () => {
  const service = createFinancialPlanService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
  });
  const { error } = await service.interpret(buildInput());
  assert.equal(error.code, 'PARSE_ERROR');
});

test('plano estruturalmente inválido é rejeitado como INVALID_RESPONSE', async () => {
  const service = createFinancialPlanService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ plan: { version: '1', decision: 'invalid_decision_value', operations: [], global_confidence: 0.5 } }),
    }),
  });
  const { plan, error } = await service.interpret(buildInput());
  assert.equal(plan, null);
  assert.equal(error.code, 'INVALID_RESPONSE');
});

test('nunca envia contas/categorias Business no corpo da requisição', async () => {
  let sentBody = null;
  const service = createFinancialPlanService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async (url, options) => {
      sentBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ plan: validPlanResponse() }) };
    },
  });

  await service.interpret(buildInput({
    categories: [
      { id: 'category-food', name: 'Alimentação' },
      { id: 'category-business', name: 'Marketing', applies_to: 'business' },
    ],
  }));

  assert.equal(sentBody.mode, 'financial_plan');
  assert.ok(!sentBody.financialPlan.categories.some((c) => c.id === 'category-business'));
});
