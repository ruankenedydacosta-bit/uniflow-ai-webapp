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
  const sub = { id: 'sub_local', workspace_id: 'workspace_fixture', status: 'suspended', asaas_subscription_id: 'sub_provider', updated_at: '2026-10-01Z' };
  let rpcBody;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('/rest/v1/subscriptions?')) return json([sub]);
    if (String(url).includes('/subscriptions/sub_provider/payments')) return json({ data: [{ id: 'payment_fixture', subscription: 'sub_provider', status: 'CONFIRMED', value: 29.9, paymentDate: new Date().toISOString().slice(0,10) }], hasMore: false });
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
