import assert from 'node:assert/strict';
import test from 'node:test';
import { createBillingService } from './billingService.js';

// ============================================================================
// BILLING2 (Bloco Asaas 2): billingService.js agora e uma fabrica testavel
// (createBillingService), mesmo padrao ja usado por createUniLlmProvider()
// (uni-llm/uniLlmProvider.js) -- fetch mockado, nunca chamada de rede real.
// Contrato mudou do Bloco Asaas 1 (throw NotImplementedError) para
// resolve-sempre { data, error }, seguindo o mesmo precedente de
// uniLlmProvider.generateResponse().
// ============================================================================

function fakeSupabase(token = 'jwt-token') {
  return { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeService({ fetchImpl, token = 'jwt-token', supabase = fakeSupabase(token) } = {}) {
  return createBillingService({
    supabase,
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    fetchImpl,
  });
}

const METHODS_AND_FUNCTIONS = [
  ['createCustomer', 'billing-create-customer', { workspaceId: 'ws-1', cpfCnpj: '12345678900' }],
  ['createSubscription', 'billing-create-subscription', { workspaceId: 'ws-1', planId: 'pro', paymentMethod: 'pix' }],
  ['createCheckout', 'billing-create-checkout', { workspaceId: 'ws-1' }],
  ['cancelSubscription', 'billing-cancel-subscription', { workspaceId: 'ws-1' }],
  ['getSubscription', 'billing-get-subscription', { workspaceId: 'ws-1' }],
  ['syncSubscription', 'billing-sync', { workspaceId: 'ws-1' }],
  ['healthCheck', 'billing-health', undefined],
];

test('billingService expõe exatamente os 8 métodos (6 pedidos + healthCheck + listPayments) -- BLOCO FINAL DO MVP adiciona listPayments (histórico real)', () => {
  const service = makeService({ fetchImpl: async () => jsonResponse(200, {}) });
  assert.deepEqual(Object.keys(service).sort(), [
    'cancelSubscription', 'createCheckout', 'createCustomer', 'createSubscription', 'getSubscription', 'healthCheck', 'listPayments', 'syncSubscription',
  ]);
});

for (const [method, functionName, args] of METHODS_AND_FUNCTIONS) {
  test(`billingService.${method}() chama SOMENTE a Edge Function ${functionName} -- nunca um domínio da Asaas`, async () => {
    let calledUrl = null;
    const service = makeService({
      fetchImpl: async (url) => { calledUrl = url; return jsonResponse(200, { ok: true }); },
    });
    await service[method](args);
    assert.equal(calledUrl, `https://demo.supabase.co/functions/v1/${functionName}`);
    assert.doesNotMatch(calledUrl, /asaas\.com/);
  });

  test(`billingService.${method}() resolve com { data, error: null } em caso de sucesso -- nunca lança`, async () => {
    const service = makeService({ fetchImpl: async () => jsonResponse(200, { ok: true, value: 42 }) });
    const result = await service[method](args);
    assert.deepEqual(result, { data: { ok: true, value: 42 }, error: null });
  });

  test(`billingService.${method}() resolve com { data: null, error } normalizado quando a Edge Function rejeita`, async () => {
    const service = makeService({
      fetchImpl: async () => jsonResponse(422, { error: { code: 'SOME_CODE', message: 'motivo' } }),
    });
    const result = await service[method](args);
    assert.equal(result.data, null);
    assert.deepEqual(result.error, { code: 'SOME_CODE', message: 'motivo' });
  });

  test(`billingService.${method}() nunca vaza para chamada de rede sem sessão -- UNAUTHORIZED sem fetch`, async () => {
    let called = false;
    const service = makeService({
      token: null,
      fetchImpl: async () => { called = true; return jsonResponse(200, {}); },
    });
    const result = await service[method](args);
    assert.equal(called, false);
    assert.deepEqual(result.error, { code: 'UNAUTHORIZED', message: 'billing_auth_required' });
  });
}

test('sem supabase/supabaseUrl configurado, todo método resolve BACKEND_NOT_CONFIGURED sem tentar rede', async () => {
  let called = false;
  const service = createBillingService({
    supabase: null,
    supabaseUrl: '',
    supabaseAnonKey: '',
    fetchImpl: async () => { called = true; return jsonResponse(200, {}); },
  });
  const result = await service.getSubscription({ workspaceId: 'ws-1' });
  assert.equal(called, false);
  assert.deepEqual(result.error, { code: 'BACKEND_NOT_CONFIGURED', message: 'billing_unavailable' });
});

test('falha de rede (fetch lança) normaliza para { code: NETWORK }', async () => {
  const service = makeService({ fetchImpl: async () => { throw new Error('offline'); } });
  const result = await service.getSubscription({ workspaceId: 'ws-1' });
  assert.deepEqual(result.error, { code: 'NETWORK', message: 'billing_request_failed' });
});

test('resposta sem JSON válido normaliza para { code: PARSE_ERROR }', async () => {
  const service = makeService({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } }),
  });
  const result = await service.getSubscription({ workspaceId: 'ws-1' });
  assert.deepEqual(result.error, { code: 'PARSE_ERROR', message: 'billing_bad_response' });
});

test('createCustomer envia workspace_id/cpf_cnpj/email/mobile_phone no corpo, nunca asaas_customer_id ou status', async () => {
  let sentBody = null;
  const service = makeService({
    fetchImpl: async (_url, init) => { sentBody = JSON.parse(init.body); return jsonResponse(201, {}); },
  });
  await service.createCustomer({ workspaceId: 'ws-1', cpfCnpj: '12345678900', email: 'a@b.com', mobilePhone: '11999999999' });
  assert.deepEqual(sentBody, {
    workspace_id: 'ws-1', cpf_cnpj: '12345678900', email: 'a@b.com', mobile_phone: '11999999999',
  });
  assert.ok(!('asaas_customer_id' in sentBody));
  assert.ok(!('status' in sentBody));
});

test('createSubscription nunca envia valor/preço/ciclo -- só workspace_id, plan_id, payment_method e credit_card_token', async () => {
  let sentBody = null;
  const service = makeService({
    fetchImpl: async (_url, init) => { sentBody = JSON.parse(init.body); return jsonResponse(201, {}); },
  });
  await service.createSubscription({ workspaceId: 'ws-1', planId: 'pro', paymentMethod: 'credit_card', creditCardToken: 'tok_123' });
  assert.deepEqual(sentBody, {
    workspace_id: 'ws-1', plan_id: 'pro', payment_method: 'credit_card', credit_card_token: 'tok_123',
  });
  for (const forbidden of ['value', 'price', 'cycle', 'discount', 'status']) {
    assert.ok(!(forbidden in sentBody), `${forbidden} nunca deve ser enviado pelo frontend`);
  }
});

test('healthCheck() chama billing-health sem exigir workspace_id', async () => {
  let sentBody = null;
  const service = makeService({
    fetchImpl: async (_url, init) => { sentBody = JSON.parse(init.body); return jsonResponse(200, { ok: true }); },
  });
  const result = await service.healthCheck();
  assert.deepEqual(sentBody, {});
  assert.equal(result.error, null);
});

test('Authorization enviado é sempre "Bearer <token da sessão>", nunca a API key da Asaas', async () => {
  let sentHeaders = null;
  const service = makeService({
    token: 'meu-jwt-de-sessao',
    fetchImpl: async (_url, init) => { sentHeaders = init.headers; return jsonResponse(200, {}); },
  });
  await service.getSubscription({ workspaceId: 'ws-1' });
  assert.equal(sentHeaders.Authorization, 'Bearer meu-jwt-de-sessao');
  assert.doesNotMatch(JSON.stringify(sentHeaders), /aact_/);
});

// BLOCO ASAAS CHECKOUT: nunca envia CPF/nome/endereço -- o Checkout
// hospedado da Asaas coleta os dados do pagador na própria página dele
// (Asaas rejeita customerData parcial sem endereço, que a UniFlow nunca
// coletou -- confirmado em teste real no Sandbox).
test('createCheckout envia só workspace_id -- nunca CPF, nunca dado de cartão (número/CVV)', async () => {
  let sentBody = null;
  const service = makeService({
    fetchImpl: async (_url, init) => { sentBody = JSON.parse(init.body); return jsonResponse(201, {}); },
  });
  await service.createCheckout({ workspaceId: 'ws-1' });
  assert.deepEqual(sentBody, { workspace_id: 'ws-1' });
  for (const forbidden of ['cpf_cnpj', 'card_number', 'cvv', 'credit_card', 'value', 'price']) {
    assert.ok(!(forbidden in sentBody), `${forbidden} nunca deve ser enviado pelo frontend`);
  }
});

test('billingService.js nunca importa/referencia a Asaas diretamente, nem chama fetch fora de invokeBillingFunction', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./billingService.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /api\.asaas\.com/);
  assert.doesNotMatch(source, /sandbox\.asaas\.com/);
  assert.doesNotMatch(source, /ASAAS_API_KEY/);
});

// ============================================================================
// BLOCO FINAL DO MVP (Histórico de pagamentos): listPayments() -- leitura
// direta (RLS) de billing_payments, nunca uma Edge Function nova, nunca a
// Asaas diretamente.
// ============================================================================

function fakeSupabaseWithTable({ token = 'jwt-token', tableRows = [], tableError = null, capture } = {}) {
  const base = fakeSupabase(token);
  return {
    ...base,
    from(table) {
      const query = {
        table,
        filters: {},
        orders: [],
        select(fields) { query.fields = fields; return query; },
        eq(column, value) { query.filters[column] = value; return query; },
        order(column, opts) { query.orders.push([column, opts]); return query; },
        limit(n) { query.limitValue = n; return query; },
        then(resolve) {
          capture?.(query);
          return resolve({ data: tableError ? null : tableRows, error: tableError });
        },
      };
      return query;
    },
  };
}

test('listPayments consulta diretamente billing_payments (RLS), nunca uma Edge Function nova', async () => {
  let calledFunction = false;
  const captured = [];
  const supabase = fakeSupabaseWithTable({ tableRows: [], capture: (q) => captured.push(q) });
  const service = makeService({
    supabase,
    fetchImpl: async () => { calledFunction = true; return jsonResponse(200, {}); },
  });
  const result = await service.listPayments({ workspaceId: 'ws-1' });
  assert.equal(calledFunction, false);
  assert.equal(result.error, null);
  assert.deepEqual(result.data, []);
  assert.equal(captured[0].table, 'billing_payments');
  assert.equal(captured[0].filters.workspace_id, 'ws-1');
});

test('listPayments ordena por due_date desc (nulls por último) e depois created_at desc -- mais recente primeiro', async () => {
  const captured = [];
  const supabase = fakeSupabaseWithTable({ tableRows: [], capture: (q) => captured.push(q) });
  const service = makeService({ supabase });
  await service.listPayments({ workspaceId: 'ws-1' });
  assert.deepEqual(captured[0].orders, [
    ['due_date', { ascending: false, nullsFirst: false }],
    ['created_at', { ascending: false }],
  ]);
});

test('listPayments sem workspaceId resolve lista vazia sem consultar nada', async () => {
  let queried = false;
  const supabase = fakeSupabaseWithTable({ tableRows: [{ id: 'p1' }], capture: () => { queried = true; } });
  const service = makeService({ supabase });
  const result = await service.listPayments({});
  assert.deepEqual(result.data, []);
  assert.equal(result.error, null);
  assert.equal(queried, false);
});

test('listPayments erro de consulta normaliza para { data: null, error } -- nunca lança', async () => {
  const supabase = fakeSupabaseWithTable({ tableError: { message: 'boom' } });
  const service = makeService({ supabase });
  const result = await service.listPayments({ workspaceId: 'ws-1' });
  assert.equal(result.data, null);
  assert.equal(result.error.code, 'PAYMENTS_QUERY_FAILED');
});

test('listPayments sem Supabase configurado resolve SUPABASE_NOT_CONFIGURED, nunca lança', async () => {
  const service = createBillingService({});
  const result = await service.listPayments({ workspaceId: 'ws-1' });
  assert.equal(result.data, null);
  assert.equal(result.error.code, 'SUPABASE_NOT_CONFIGURED');
});
