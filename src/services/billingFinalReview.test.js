import assert from 'node:assert/strict';
import test from 'node:test';
import { safeAsaasUrl } from '../utils/asaasUrls.js';
import { createAsaasClient } from '../../supabase/functions/_shared/asaasClient.ts';
import { recoverConventionalSubscription } from '../../supabase/functions/_shared/subscriptionRecovery.ts';
const env = { ASAAS_API_KEY: 'fixture', ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3' };
globalThis.Deno = { env: { get: (key) => env[key] }, serve: () => {} };
const { processPaymentEvent } = await import('../../supabase/functions/billing-webhook/index.ts');
const json = (body) => new Response(JSON.stringify(body));
const payment = { id: 'pay_fixture', customer: 'cus_fixture', subscription: 'sub_fixture', value: 29.9, status: 'RECEIVED', paymentDate: '2099-01-01', dueDate: '2099-01-01' };
const subscription = { id: 'local_sub', workspace_id: 'workspace', plan_id: 'pro', asaas_customer_id: 'cus_fixture', asaas_subscription_id: 'sub_fixture', payment_method: 'credit_card', status: 'pending', current_period_ends_at: null };
function webhookStub(t, overrides = {}) {
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? 'GET';
    if (method !== 'GET') writes.push({ path: url.pathname, body: JSON.parse(options.body) });
    if (url.pathname === '/v3/payments/pay_fixture') return json({ ...payment, ...overrides.payment });
    if (url.pathname === '/v3/subscriptions/sub_fixture') {
      if (overrides.providerFailure) return new Response('{}', { status: 503 });
      return json({ id: 'sub_fixture', customer: 'cus_fixture', checkoutSession: 'checkout_fixture', value: 29.9, cycle: 'MONTHLY', billingType: 'CREDIT_CARD', ...overrides.remote });
    }
    if (url.pathname.endsWith('/billing_customers')) return json([{ id: 'local_customer', workspace_id: 'workspace' }]);
    if (url.pathname.endsWith('/subscriptions')) {
      if (method === 'PATCH') return json([{ ...subscription }]);
      if (overrides.checkout && url.searchParams.has('asaas_subscription_id')) return json([]);
      return json([{ ...subscription, ...(overrides.checkout ? { asaas_subscription_id: null } : {}), ...overrides.subscription }]);
    }
    if (url.pathname.endsWith('/billing_payments')) return json([]);
    throw new Error(`Unexpected request: ${input}`);
  });
  return writes;
}
const process = () => processPaymentEvent({ supabaseUrl: 'https://db.invalid', serviceRoleKey: 'service_fixture', eventType: 'PAYMENT_RECEIVED', payload: { payment } });
for (const [label, override] of [
  ['underpayment', { payment: { value: 1 } }],
  ['foreign workspace', { subscription: { workspace_id: 'foreign' } }],
  ['foreign customer', { subscription: { asaas_customer_id: 'cus_foreign' } }],
  ['wrong plan', { subscription: { plan_id: 'business' } }],
]) test(`${label} never grants access, while retaining the financial mirror`, async (t) => {
  const writes = webhookStub(t, override);
  await assert.rejects(process(), /ENTITLEMENT_MISMATCH/);
  assert.equal(writes.filter((row) => row.path.endsWith('/subscriptions')).length, 0);
  assert.equal(writes.filter((row) => row.path.endsWith('/billing_payments')).length, 1);
});
test('canonical paid subscription activates once with expected status guard', async (t) => {
  const writes = webhookStub(t);
  assert.deepEqual(await process(), { subscription_transition_applied: true });
  assert.equal(writes.find((row) => row.path.endsWith('/subscriptions')).body.status, 'active');
});
test('Checkout with known customer binds its new provider subscription and activates', async (t) => {
  const writes = webhookStub(t, { checkout: true });
  await process();
  assert.equal(writes.filter((row) => row.path.endsWith('/subscriptions')).length, 2);
  assert.equal(writes.at(-1).body.status, 'active');
});
test('Checkout provider failure remains retryable', async (t) => {
  const writes = webhookStub(t, { checkout: true, providerFailure: true });
  await assert.rejects(process());
  assert.equal(writes.length, 0);
});
test('Checkout cannot bind across known workspaces or mismatched provider price', async (t) => {
  for (const overrides of [{ subscription: { workspace_id: 'foreign' } }, { remote: { value: 1 } }]) {
    const writes = webhookStub(t, { checkout: true, ...overrides });
    await assert.rejects(process(), /CORRELATION_MISMATCH/);
    assert.equal(writes.length, 0);
    t.mock.restoreAll();
  }
});
for (const url of ['javascript:alert(1)', 'data:text/html,x', 'http://asaas.com/a', 'https://asaas.com.evil/a', 'https://asaas.com@evil.com', 'https://user:password@asaas.com/a', 'https://asaas.com:444/a', 'invalid']) {
  test(`receipt/checkout URL rejects ${url}`, () => assert.equal(safeAsaasUrl(url), null));
}
for (const url of ['https://www.asaas.com/i/receipt', 'https://sandbox.asaas.com/checkoutSession/show?id=fixture']) {
  test(`receipt/checkout URL accepts provider ${url}`, () => assert.equal(safeAsaasUrl(url), url));
}
const remote = { id: 'sub_fixture', customer: 'cus_fixture', externalReference: 'workspace', value: 29.9, cycle: 'MONTHLY', status: 'ACTIVE', billingType: 'PIX' };
for (const [label, data, expected] of [
  ['unique', [remote], 'sub_fixture'], ['missing', [], null], ['ambiguous', [remote, { ...remote, id: 'other' }], null],
  ['wrong customer', [{ ...remote, customer: 'foreign' }], null], ['wrong price', [{ ...remote, value: 1 }], null],
  ['inactive', [{ ...remote, status: 'INACTIVE' }], null], ['different payment method', [{ ...remote, billingType: 'CREDIT_CARD' }], null],
]) test(`GET recovery ${label} never sends another POST`, async (t) => {
  const methods = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => { methods.push(options.method); assert.equal(new URL(input).searchParams.get('externalReference'), 'workspace'); return json({ data, hasMore: false }); });
  const result = await recoverConventionalSubscription({ client: createAsaasClient({ apiKey: 'fixture', baseUrl: env.ASAAS_BASE_URL }), customerId: 'cus_fixture', workspaceId: 'workspace', paymentMethod: 'pix' });
  assert.equal(result, expected);
  assert.deepEqual(methods, ['GET']);
});
test('completed recovery revalidates the known resource', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input, options) => { assert.ok(String(input).endsWith('/subscriptions/sub_fixture')); assert.equal(options.method, 'GET'); return json({ ...remote, customer: 'foreign' }); });
  assert.equal(await recoverConventionalSubscription({ client: createAsaasClient({ apiKey: 'fixture', baseUrl: env.ASAAS_BASE_URL }), customerId: 'cus_fixture', workspaceId: 'workspace', paymentMethod: 'pix', resourceId: 'sub_fixture' }), null);
});

const { recoverPendingSubscription } = await import('../features/personal-plan/pendingSubscriptionRecovery.js');
const { isValidPixPayload } = await import('../features/personal-plan/personalPlanPixAttempt.js');
test('reload of pending Pix reconciles once and reads activation locally', async () => {
  const calls = [];
  const result = await recoverPendingSubscription({ data: { exists: true, internal_status: 'pending', payment_method: 'pix' } }, {
    workspaceId: 'workspace', sync: async (args) => { calls.push(['sync', args]); return { data: { synced: true } }; },
    read: async (args) => { calls.push(['read', args]); return { data: { internal_status: 'active' } }; },
  });
  assert.equal(result.data.internal_status, 'active');
  assert.deepEqual(calls, [['sync', { workspaceId: 'workspace' }], ['read', { workspaceId: 'workspace', localOnly: true }]]);
});
test('reload of active plan never calls the provider', async () => {
  const original = { data: { exists: true, internal_status: 'active' } };
  assert.equal(await recoverPendingSubscription(original, { sync: () => assert.fail('unexpected sync') }), original);
});
test('failed reconciliation retains the last known pending state', async () => {
  const original = { data: { exists: true, internal_status: 'pending' } };
  assert.equal(await recoverPendingSubscription(original, { sync: () => { throw new Error('network'); } }), original);
});
test('expired Pix QR cannot be restored or displayed as payable', () => {
  const pix = { payload: 'real_payload', encoded_image: 'real_image' };
  const now = Date.parse('2026-10-26T15:00:00Z');
  assert.equal(isValidPixPayload({ ...pix, expiration_date: '2026-10-26 12:00:00' }, now), false);
  assert.equal(isValidPixPayload({ ...pix, expiration_date: '2026-10-26 12:00:01' }, now), true);
  assert.equal(isValidPixPayload({ ...pix, expiration_date: 'invalid' }, now), false);
});

let createSubscriptionHandler;
Object.assign(env, { SUPABASE_URL: 'https://db.invalid', SUPABASE_ANON_KEY: 'anon_fixture', SUPABASE_SERVICE_ROLE_KEY: 'service_fixture', APP_ALLOWED_ORIGINS: 'https://app.invalid' });
globalThis.Deno.serve = (handler) => { createSubscriptionHandler = handler; };
await import('../../supabase/functions/billing-create-subscription/index.ts');
globalThis.Deno.serve = () => {};
for (const [label, resources, expected] of [
  ['unique orphan subscription', [remote], 200], ['no canonical match', [], 409],
  ['ambiguous match', [remote, { ...remote, id: 'sub_other' }], 409],
]) test(`creation endpoint recovers ${label} without repeating provider POST`, async (t) => {
  const workspaceId = '10000000-0000-4000-8000-000000000001';
  let providerPosts = 0;
  let persisted = 0;
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'api-sandbox.asaas.com') {
      if (options.method === 'POST') providerPosts += 1;
      if (url.pathname.endsWith('/payments')) return json({ data: [], hasMore: false });
      assert.equal(options.method, 'GET');
      return json({ data: resources.map((row) => ({ ...row, externalReference: workspaceId })), hasMore: false });
    }
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: 'fixture_user' });
    if (url.pathname.endsWith('/workspace_members')) return json([{ workspace_id: workspaceId }]);
    if (url.pathname.endsWith('/billing_customers')) return json([{ asaas_customer_id: 'cus_fixture' }]);
    if (url.pathname.endsWith('/subscriptions')) {
      if (options.method === 'POST') { persisted += 1; return json([{ id: 'local_sub' }]); }
      return json([]);
    }
    if (url.pathname.endsWith('/billing_operation_attempts')) {
      if (options.method === 'POST') return new Response('{}', { status: 409 });
      if (options.method === 'PATCH') return json([]);
      return json([{ id: 'attempt_fixture', status: 'uncertain' }]);
    }
    throw new Error(`Unexpected request ${input}`);
  });
  const response = await createSubscriptionHandler(new Request('https://edge.invalid', { method: 'POST', headers: { Origin: 'https://app.invalid', Authorization: 'Bearer user_fixture' }, body: JSON.stringify({ workspace_id: workspaceId, plan_id: 'pro', payment_method: 'pix' }) }));
  assert.equal(response.status, expected);
  assert.equal(providerPosts, 0);
  assert.equal(persisted, expected === 200 ? 1 : 0);
});

test('subscription-less initial payment does not erase a later verified subscription binding', async (t) => {
  const writes = webhookStub(t, { payment: { subscription: null } });
  await processPaymentEvent({ supabaseUrl: 'https://db.invalid', serviceRoleKey: 'service_fixture', eventType: 'PAYMENT_RECEIVED', payload: { payment: { ...payment, subscription: null } } });
  const mirrored = writes.find((row) => row.path.endsWith('/billing_payments')).body;
  assert.equal(Object.hasOwn(mirrored, 'asaas_subscription_id'), false);
  assert.equal(mirrored.asaas_payment_id, payment.id);
});
