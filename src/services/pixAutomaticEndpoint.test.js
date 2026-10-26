import assert from 'node:assert/strict';
import test from 'node:test';
const env = { SUPABASE_URL: 'https://supabase.invalid', SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', ASAAS_API_KEY: 'fixture-api', ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3', ASAAS_ACCOUNT_ID: 'account_fixture', APP_ALLOWED_ORIGINS: 'https://app.invalid', UNIFLOW_PIX_AUTOMATIC_ENABLED: 'true', UNIFLOW_PIX_AUTOMATIC_PROCESSING_ENABLED: 'true' };
globalThis.Deno = { env: { get: (name) => env[name] }, serve: () => {} };
const { handlePixAutomatic } = await import('../../supabase/functions/billing-pix-automatic/index.ts');
const { processPixAutomaticEvent, processPixAutomaticPayment } = await import('../../supabase/functions/_shared/pixAutomaticService.ts');
let cancelSubscriptionHandler;
globalThis.Deno.serve = (handler) => { cancelSubscriptionHandler = handler; };
await import('../../supabase/functions/billing-cancel-subscription/index.ts');
globalThis.Deno.serve = () => {};
const workspace = '10000000-0000-4000-8000-000000000001';
const contract = 'a'.repeat(32);
const local = { id: 'local_authorization', workspace_id: workspace, subscription_id: 'local_subscription', contract_id: contract, asaas_customer_id: 'cus_fixture', expected_value: 29.9, status: 'CREATING', asaas_authorization_id: null };
const remote = { id: 'provider_authorization', customerId: 'cus_fixture', contractId: contract, value: 29.9, frequency: 'MONTHLY', paymentCreationMode: 'SUBSCRIPTION', status: 'CREATED', payload: 'QR_PROVIDER', encodedImage: 'YWJj', immediateQrCode: { expirationDate: '2099-01-01 12:00:00' } };
const saved = { ...local, asaas_authorization_id: remote.id, status: remote.status, qr_payload: remote.payload };
const json = (value) => new Response(JSON.stringify(value), { status: 200 });
const request = (action = 'create') => new Request('https://edge.invalid', { method: 'POST', headers: { Origin: 'https://app.invalid', Authorization: 'Bearer fixture-user' }, body: JSON.stringify({ workspace_id: workspace, action }) });
function stub(t, overrides = {}) {
  const counts = { creates: 0, lists: 0, cancels: 0, writes: 0, cancelRequested: false };
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/auth/v1/user')) return json({ id: 'fixture-user' });
    if (target.includes('/workspace_members?')) return json(overrides.notMember ? [] : [{ workspace_id: workspace }]);
    if (target.includes('/billing_pix_automatic_account?')) return json([{ eligibility_status: 'ELIGIBLE' }]);
    if (target.includes('/rest/v1/subscriptions?')) return json([{ id: local.subscription_id, workspace_id: workspace, payment_method: 'pix_automatico', status: 'active', cancel_at_period_end: true, asaas_subscription_id: null }]);
    if (target.includes('/billing_pix_authorizations?')) {
      if (options.method === 'PATCH') counts.cancelRequested = JSON.parse(options.body).cancel_requested === true;
      return json(target.includes('workspace_id=') ? (overrides.existing ? [local] : []) : [overrides.cancelPending ? { ...saved, cancel_requested: true } : saved]);
    }
    if (target.endsWith('/rpc/reserve_pix_automatic')) return json({ claimed: !overrides.recover, authorization: local });
    if (target.includes('/rpc/apply_')) { counts.writes += 1; return json(true); }
    if (target.includes('/pix/automatic/authorizations?')) { counts.lists += 1; return json({ data: overrides.noMatch ? [] : [remote], hasMore: false }); }
    if (target.endsWith('/pix/automatic/authorizations') && options.method === 'POST') {
      counts.creates += 1;
      assert.equal(JSON.parse(options.body).paymentCreationMode, 'SUBSCRIPTION');
      if (overrides.lostResponse) throw new Error('response lost');
      return json(remote);
    }
    if (target.endsWith(`/pix/automatic/authorizations/${remote.id}`)) {
      if (options.method === 'DELETE') counts.cancels += 1;
      return json(remote);
    }
    throw new Error(`unexpected request ${target}`);
  });
  return counts;
}
test('autenticação e membership impedem acesso a outra assinatura antes de qualquer POST Asaas', async (t) => {
  const counts = stub(t, { notMember: true });
  assert.equal((await handlePixAutomatic(request())).status, 403);
  assert.equal(counts.creates, 0);
});
test('flag desligada mantém oferta indisponível mesmo para membro válido', async (t) => {
  const counts = stub(t);
  env.UNIFLOW_PIX_AUTOMATIC_ENABLED = 'false'; env.UNIFLOW_PIX_AUTOMATIC_PROCESSING_ENABLED = 'false';
  try { assert.equal((await handlePixAutomatic(request())).status, 409); assert.equal(counts.creates, 0); }
  finally { env.UNIFLOW_PIX_AUTOMATIC_ENABLED = 'true'; env.UNIFLOW_PIX_AUTOMATIC_PROCESSING_ENABLED = 'true'; }
});
test('criação confirma contrato canônico e emite exatamente um POST de autorização', async (t) => {
  const counts = stub(t);
  const response = await handlePixAutomatic(request());
  assert.equal(response.status, 200);
  assert.equal(counts.creates, 1);
  assert.equal((await response.json()).authorization.recurring_active, false);
});
test('configuração de produção não disponibiliza nova autorização mesmo com as flags ligadas', async (t) => {
  const counts = stub(t);
  env.ASAAS_BASE_URL = 'https://api.asaas.com/v3';
  try { assert.equal((await handlePixAutomatic(request())).status, 409); assert.equal(counts.creates, 0); }
  finally { env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3'; }
});
test('resposta perdida não é repetida: recuperação usa listagem GET pelo contrato', async (t) => {
  const counts = stub(t, { recover: true });
  assert.equal((await handlePixAutomatic(request())).status, 200);
  assert.equal(counts.creates, 0);
  assert.equal(counts.lists, 1);
});
test('resposta ambígua com zero correspondências continua bloqueada, sem novo POST', async (t) => {
  const counts = stub(t, { recover: true, noMatch: true });
  assert.equal((await handlePixAutomatic(request())).status, 409);
  assert.equal(counts.creates, 0);
});
test('falha na resposta do POST mantém a tentativa incerta e nunca anuncia consentimento ativo', async (t) => {
  const counts = stub(t, { lostResponse: true });
  assert.equal((await handlePixAutomatic(request())).status, 503);
  assert.equal(counts.creates, 1);
  assert.equal(counts.writes, 0);
});
test('status de polling é leitura local e não consulta a Asaas', async (t) => {
  const counts = stub(t, { existing: true });
  assert.equal((await handlePixAutomatic(request('status'))).status, 200);
  assert.equal(counts.creates + counts.lists + counts.cancels, 0);
});
test('cancelamento de consentimento CREATED fica pendente; não se declara CANCELLED', async (t) => {
  const counts = stub(t, { existing: true, cancelPending: true });
  const response = await handlePixAutomatic(request('cancel'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(counts.cancels, 0);
  assert.equal(data.authorization.status, 'CREATED');
  assert.equal(data.authorization.cancellation_requested, true);
});
test('endpoint de cancelamento não confunde o prazo provisório do primeiro pagamento com cancelamento já solicitado', async (t) => {
  const counts = stub(t, { cancelPending: true });
  const response = await cancelSubscriptionHandler(request('cancel'));
  assert.equal(response.status, 200);
  assert.equal(counts.cancelRequested, true);
  assert.equal((await response.json()).cancellation_pending, true);
  assert.equal(counts.cancels, 0);
});
test('evento de elegibilidade de outra conta não habilita a funcionalidade', async (t) => {
  stub(t);
  await assert.rejects(processPixAutomaticEvent({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY, eventType: 'PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED', payload: { account: { id: 'other' }, eligibility: { status: 'ELIGIBLE' } } }), /UNVERIFIED/);
});
test('pedido pendente é cumprido quando o banco ativa a autorização depois', async (t) => {
  let cancelled = false;
  let deactivated = false;
  let persisted;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/billing_pix_authorizations?')) return json([{ ...saved, cancel_requested: true, status: cancelled ? 'CANCELLED' : 'CREATED' }]);
    if (target.endsWith(`/pix/automatic/authorizations/${remote.id}`)) {
      if (options.method === 'DELETE') cancelled = true;
      return json({ ...remote, status: cancelled ? 'CANCELLED' : 'ACTIVE', subscriptionId: 'sub_provider' });
    }
    if (target.endsWith('/rpc/apply_pix_authorization')) { persisted = JSON.parse(options.body).p_remote; return json(true); }
    if (target.endsWith('/subscriptions/sub_provider') && options.method === 'PUT') { deactivated = JSON.parse(options.body).status === 'INACTIVE'; return json({ status: 'INACTIVE' }); }
    throw new Error('unexpected request');
  });
  await processPixAutomaticEvent({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: 'fixture-service', eventType: 'PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED', payload: { authorization: { id: remote.id } } });
  assert.equal(cancelled, true);
  assert.equal(deactivated, true);
  assert.equal(persisted.status, 'CANCELLED');
});
test('cliente e valor sozinhos não correlacionam o pagamento inicial a uma autorização', async (t) => {
  t.mock.method(globalThis, 'fetch', () => json([]));
  assert.equal(await processPixAutomaticPayment({ url: env.SUPABASE_URL, key: 'fixture-service' }, { customer: 'cus_fixture', value: 29.9, status: 'RECEIVED' }), false);
});

test('pagamento sem correlação segura fica retido para retry, sem liberação inferida por cliente e valor', async (t) => {
  t.mock.method(globalThis, 'fetch', () => json([local]));
  await assert.rejects(processPixAutomaticPayment({ url: env.SUPABASE_URL, key: 'fixture-service' }, { customer: 'cus_fixture', value: 29.9, status: 'RECEIVED' }), /CORRELATION_REQUIRED/);
});
