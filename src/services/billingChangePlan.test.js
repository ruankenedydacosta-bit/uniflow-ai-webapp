import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildUpgradeChargePayload,
  buildUpgradeReference,
  isPaidCharge,
  parseUpgradeReference,
  resolvePlanChange,
} from '../../supabase/functions/_shared/planChangeRules.ts';

const read = (path) => readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
const CHANGE_PLAN = read('functions/billing-change-plan/index.ts');
const WEBHOOK = read('functions/billing-webhook/index.ts');
const MIGRATION = read('migrations/20261006191032_051_voice_apply_upgrade.sql');
const SUBSCRIPTION_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

// Épico #116 / #114: troca de plano.

test('subir cobra a diferença; descer não cobra nada; o mesmo plano não muda', () => {
  const essencial = { id: 'essencial', priceBrl: 14.9 };
  const uniVoz = { id: 'uni_voz', priceBrl: 29.9 };
  const plus = { id: 'uni_voz_plus', priceBrl: 69.9 };
  assert.deepEqual(resolvePlanChange(uniVoz, plus), { kind: 'upgrade', differenceBrl: 40 });
  assert.deepEqual(resolvePlanChange(essencial, uniVoz), { kind: 'upgrade', differenceBrl: 15 });
  assert.equal(resolvePlanChange(plus, essencial).kind, 'downgrade');
  assert.deepEqual(resolvePlanChange(uniVoz, uniVoz), { kind: 'same', differenceBrl: 0 });
});

test('referência da cobrança da diferença leva assinatura e nível, e só aceita o formato exato', () => {
  const reference = buildUpgradeReference(SUBSCRIPTION_ID, 'uni_voz_plus');
  assert.deepEqual(parseUpgradeReference(reference), { subscriptionId: SUBSCRIPTION_ID, tierId: 'uni_voz_plus' });
  assert.equal(parseUpgradeReference(`${reference}:extra`), null);
  assert.equal(parseUpgradeReference(`upgrade:${SUBSCRIPTION_ID}:pro`), null);
  assert.equal(parseUpgradeReference(`upgrade:nao-e-uuid:uni_voz`), null);
  assert.equal(parseUpgradeReference(SUBSCRIPTION_ID), null);
  assert.equal(parseUpgradeReference(undefined), null);
});

test('cobrança da diferença é Pix, com vencimento hoje e o valor calculado no servidor', () => {
  const payload = buildUpgradeChargePayload({
    asaasCustomerId: 'cus_1',
    subscriptionId: SUBSCRIPTION_ID,
    tier: { id: 'uni_voz_plus', name: 'Uni Voz Plus' },
    differenceBrl: 40,
    today: '2026-10-06',
  });
  assert.deepEqual(payload, {
    customer: 'cus_1',
    billingType: 'PIX',
    value: 40,
    dueDate: '2026-10-06',
    description: 'Troca para o Uni Voz Plus - UniFlow AI',
    externalReference: `upgrade:${SUBSCRIPTION_ID}:uni_voz_plus`,
  });
});

test('só cobrança paga aplica o upgrade', () => {
  assert.equal(isPaidCharge({ status: 'RECEIVED' }), true);
  assert.equal(isPaidCharge({ status: 'confirmed' }), true);
  assert.equal(isPaidCharge({ status: 'PENDING' }), false);
  assert.equal(isPaidCharge(null), false);
});

test('billing-change-plan: preço nunca vem do corpo; nível obrigatório; só assinatura ativa e ligada à Asaas', () => {
  assert.match(CHANGE_PLAN, /FORBIDDEN_CLIENT_FIELDS = \['value', 'price'/);
  assert.match(CHANGE_PLAN, /const targetTierId = payload\?\.tier_id === undefined \? null : resolveRequestedTierId\(payload\.tier_id\);/);
  assert.match(CHANGE_PLAN, /status: 'eq\.active'/);
  assert.match(CHANGE_PLAN, /SUBSCRIPTION_NOT_LINKED/);
  assert.match(CHANGE_PLAN, /SUBSCRIPTION_CANCEL_SCHEDULED/);
});

test('billing-change-plan: as próximas cobranças passam ao preço novo e a troca fica agendada', () => {
  assert.match(CHANGE_PLAN, /client\.updateSubscription\(subscription\.asaas_subscription_id, \{\s*\n\s*value: targetTier\.priceBrl,/);
  assert.match(CHANGE_PLAN, /updatePendingPayments: true,/);
  assert.match(CHANGE_PLAN, /pendingTierId: targetTier\.id/);
});

test('webhook aplica o upgrade só com a cobrança paga, confirmada pela API e do mesmo workspace', () => {
  assert.match(WEBHOOK, /const upgrade = asaasSubscriptionId \? null : parseUpgradeReference\(payment\?\.externalReference\);/);
  assert.match(WEBHOOK, /if \(upgrade && isPaidCharge\(payment\) && isEventConfirmedByRemotePayment\(eventType, payment\?\.status\)\) \{/);
  assert.match(WEBHOOK, /subscription\.workspace_id !== workspaceId/);
  assert.match(WEBHOOK, /\/rest\/v1\/rpc\/voice_apply_upgrade/);
});

test('migration 051: upgrade é atribuição (idempotente) e só o backend chama', () => {
  assert.match(MIGRATION.trim(), /^begin;/);
  assert.match(MIGRATION.trim(), /commit;$/);
  assert.match(MIGRATION, /seconds_granted = greatest\(seconds_granted, v_seconds\)/);
  assert.match(MIGRATION, /revoke execute on function public\.voice_apply_upgrade\(uuid, text, text\) from public, anon, authenticated;/);
  assert.match(MIGRATION, /grant execute on function public\.voice_apply_upgrade\(uuid, text, text\) to service_role;/);
});

test('serviço do front troca de plano mandando só o nível', async () => {
  const { createBillingService } = await import('./billingService.js');
  const calls = [];
  const service = createBillingService({
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } },
    supabaseUrl: 'https://x.supabase.co',
    supabaseAnonKey: 'anon',
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ kind: 'scheduled' }) };
    },
  });
  await service.changePlan({ workspaceId: 'w', tierId: 'essencial' });
  assert.match(calls[0].url, /billing-change-plan$/);
  assert.deepEqual(calls[0].body, { workspace_id: 'w', tier_id: 'essencial' });
});
