import assert from 'node:assert/strict';
import test from 'node:test';
const env = { SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', SUPABASE_URL: 'https://supabase.invalid',
  UNIFLOW_BILLING_LIFECYCLE_ENABLED: 'true', ASAAS_API_KEY: 'fixture-api', ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3' };
globalThis.Deno = { env: { get: (key) => env[key] }, serve: () => {} };
const { handleBillingLifecycle } = await import('../../supabase/functions/billing-lifecycle/index.ts');
const req = (key = 'fixture-service') => new Request('https://worker.invalid', { method: 'POST', headers: { apikey: key } });
const json = (body) => new Response(JSON.stringify(body), { status: 200 });

test('worker rejeita sessão de usuário antes de qualquer I/O', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected I/O'); });
  assert.equal((await handleBillingLifecycle(req('user-jwt'))).status, 401);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
test('worker fica desligado por padrão e não consulta o provedor', async (t) => {
  env.UNIFLOW_BILLING_LIFECYCLE_ENABLED = 'false';
  t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected I/O'); });
  try { assert.equal((await handleBillingLifecycle(req())).status, 503); assert.equal(globalThis.fetch.mock.callCount(), 0); }
  finally { env.UNIFLOW_BILLING_LIFECYCLE_ENABLED = 'true'; }
});
test('worker reconcilia pagamento canônico e envia uma única transação de ativação, espelho e aviso', async (t) => {
  const sub = { id: 'sub_local', workspace_id: 'workspace_fixture', status: 'suspended', payment_method: 'pix', asaas_customer_id: 'cus_fixture', asaas_subscription_id: 'sub_provider', updated_at: '2026-10-01Z' };
  let rpcBody;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('/rest/v1/subscriptions?')) return json([sub]);
    if (String(url).endsWith('/subscriptions/sub_provider')) return json({ id: 'sub_provider', customer: 'cus_fixture', value: 29.9, cycle: 'MONTHLY', status: 'ACTIVE', billingType: 'PIX' });
    if (String(url).includes('/subscriptions/sub_provider/payments')) return json({ data: [{ id: 'payment_fixture', customer: 'cus_fixture', subscription: 'sub_provider', status: 'CONFIRMED', value: 29.9, paymentDate: new Date().toISOString().slice(0,10) }], hasMore: false });
    if (String(url).endsWith('/rpc/apply_billing_lifecycle')) { rpcBody = JSON.parse(options.body); return json(true); }
    throw new Error('unexpected URL');
  });
  const response = await handleBillingLifecycle(req());
  assert.equal(response.status, 200);
  assert.equal(rpcBody.p_patch.status, 'active');
  assert.equal(rpcBody.p_expected_updated_at, sub.updated_at);
  assert.equal(rpcBody.p_payments[0].workspace_id, sub.workspace_id);
  assert.equal(rpcBody.p_notices[0].stage, 'reactivated');
});
test('falha de rede não suspende usuário nem escreve sucesso financeiro', async (t) => {
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/rest/v1/subscriptions?')) return json([{ asaas_subscription_id: 'sub_provider' }]);
    if (String(url).includes('/rpc/')) writes += 1;
    throw new Error('network unavailable');
  });
  const response = await handleBillingLifecycle(req());
  assert.equal(response.status, 503);
  assert.equal(writes, 0);
});

test('worker concilia consentimento sem subscriptionId e encerra somente o período já pago', async (t) => {
  env.UNIFLOW_PIX_AUTOMATIC_PROCESSING_ENABLED = 'true';
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const sub = { id: 'local_subscription', workspace_id: 'workspace_fixture', status: 'active', payment_method: 'pix_automatico', asaas_subscription_id: null, current_period_ends_at: past, updated_at: 'before' };
  const refreshed = { ...sub, updated_at: 'after', cancel_at_period_end: true, cancel_effective_at: past };
  const authorization = { id: 'local_authorization', contract_id: 'a'.repeat(32), asaas_customer_id: 'cus_fixture', asaas_authorization_id: 'authorization_fixture', status: 'CREATED' };
  let patch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = String(url);
    if (target.includes('/rest/v1/subscriptions?')) return json(target.includes('select=') && target.includes('id=eq.') ? [refreshed] : [sub]);
    if (target.includes('/billing_pix_authorizations?')) return json([authorization]);
    if (target.endsWith('/pix/automatic/authorizations/authorization_fixture')) return json({ id: authorization.asaas_authorization_id, contractId: authorization.contract_id, customerId: authorization.asaas_customer_id, value: 29.9, frequency: 'MONTHLY', paymentCreationMode: 'SUBSCRIPTION', status: 'REFUSED' });
    if (target.endsWith('/rpc/apply_pix_authorization')) return json(true);
    if (target.endsWith('/rpc/apply_billing_lifecycle')) { patch = JSON.parse(options.body); return json(true); }
    throw new Error('unexpected request');
  });
  try {
    assert.equal((await handleBillingLifecycle(req())).status, 200);
    assert.equal(patch.p_patch.status, 'canceled');
    assert.equal(patch.p_expected_updated_at, 'after');
    assert.deepEqual(patch.p_payments, []);
  } finally { delete env.UNIFLOW_PIX_AUTOMATIC_PROCESSING_ENABLED; }
});

test('worker mirrors provider termination with paid cutoff and no provider mutation', async (t) => {
  let patch;
  const sub = { id: 'sub_local', workspace_id: 'workspace_fixture', status: 'active', payment_method: 'pix', asaas_customer_id: 'cus_fixture', asaas_subscription_id: 'sub_provider', current_period_ends_at: '2099-11-01T03:00:00Z', updated_at: '2026-10-01Z' };
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = String(input);
    if (url.includes('/rest/v1/subscriptions?')) return json([sub]);
    if (url.endsWith('/subscriptions/sub_provider')) { assert.equal(options.method, 'GET'); return json({ id: 'sub_provider', customer: 'cus_fixture', value: 29.9, cycle: 'MONTHLY', status: 'INACTIVE', billingType: 'PIX' }); }
    if (url.includes('/subscriptions/sub_provider/payments')) return json({ data: [], hasMore: false });
    if (url.endsWith('/rpc/apply_billing_lifecycle')) { patch = JSON.parse(options.body).p_patch; return json(true); }
    throw new Error('unexpected request');
  });
  assert.equal((await handleBillingLifecycle(req())).status, 200);
  assert.equal(patch.cancel_at_period_end, true);
  assert.equal(patch.cancel_effective_at, '2099-11-01T03:00:00.000Z');
  assert.equal(patch.status, undefined);
});
