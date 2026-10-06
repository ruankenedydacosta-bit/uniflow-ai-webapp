import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BILLING_PLAN_ID,
  DEFAULT_SUBSCRIPTION_TIER_ID,
  findSubscriptionTier,
  SUBSCRIPTION_TIERS,
} from './billingTypes.js';

const migration = () => readFile(
  new URL('../../supabase/migrations/20261006184323_049_subscription_tiers.sql', import.meta.url),
  'utf8',
);

// Épico #116 / #114: três níveis do Plano Pessoal com cota de voz.

test('migration é atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('constantes do front batem com a carga do catálogo no SQL', async () => {
  const sql = await migration();
  for (const tier of SUBSCRIPTION_TIERS) {
    const price = tier.priceBrl.toFixed(2);
    const seconds = tier.voiceMinutes * 60;
    assert.match(sql, new RegExp(`\\('${tier.id}', '${tier.name}', ${price.replace('.', '\\.')}, ${seconds}, \\d+\\)`), tier.id);
  }
  assert.match(sql, /constraint subscription_tiers_id_check check \(id in \('essencial', 'uni_voz', 'uni_voz_plus'\)\)/);
});

test('plan_id continua pro: o nível não mexe em plans nem no acesso', async () => {
  const sql = await migration();
  assert.equal(BILLING_PLAN_ID, 'pro');
  assert.doesNotMatch(sql, /public\.plans\b/);
  assert.doesNotMatch(sql, /plans_id_check/);
});

test('quem já assina vira Uni Voz, e o banco usa o mesmo padrão do front', async () => {
  const sql = await migration();
  assert.equal(DEFAULT_SUBSCRIPTION_TIER_ID, 'uni_voz');
  assert.match(sql, /set tier_id = 'uni_voz'\s*\n\s*where tier_id is null;/);
  assert.match(sql, /alter column tier_id set default 'uni_voz',\s*\n\s*alter column tier_id set not null;/);
});

test('catálogo é leitura pública e sem escrita pelo app', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.subscription_tiers enable row level security;/);
  assert.match(sql, /revoke all on table public\.subscription_tiers from anon, authenticated;/);
  assert.match(sql, /grant select on table public\.subscription_tiers to anon, authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)/i);
});

test('nível desconhecido não existe', () => {
  assert.equal(findSubscriptionTier('uni_voz').voiceMinutes, 60);
  assert.equal(findSubscriptionTier('pro'), null);
});

// ---------------------------------------------------------------------------
// Edge Functions: o nível escolhido define o preço, sempre lido do banco.
// ---------------------------------------------------------------------------

test('nível pedido: ausente vira Uni Voz (app antigo); desconhecido é recusado', async () => {
  const { resolveRequestedTierId } = await import('../../supabase/functions/_shared/subscriptionTiers.ts');
  assert.equal(resolveRequestedTierId(undefined), 'uni_voz');
  assert.equal(resolveRequestedTierId(null), 'uni_voz');
  assert.equal(resolveRequestedTierId('uni_voz_plus'), 'uni_voz_plus');
  assert.equal(resolveRequestedTierId('pro'), null);
  assert.equal(resolveRequestedTierId(29.9), null);
});

test('linha do catálogo só vale com preço positivo e cota numérica', async () => {
  const { parseSubscriptionTierRow } = await import('../../supabase/functions/_shared/subscriptionTiers.ts');
  assert.deepEqual(
    parseSubscriptionTierRow({ id: 'essencial', name: 'Essencial', price_brl: '14.90', voice_seconds_per_cycle: 1200 }),
    { id: 'essencial', name: 'Essencial', priceBrl: 14.9, voiceSecondsPerCycle: 1200 },
  );
  assert.equal(parseSubscriptionTierRow({ id: 'x', name: 'X', price_brl: 0, voice_seconds_per_cycle: 1 }), null);
  assert.equal(parseSubscriptionTierRow(null), null);
});

test('checkout de cartão cobra o preço do nível; sem nível, o Plano Pessoal de sempre', async () => {
  const { buildCheckoutPayload } = await import('../../supabase/functions/_shared/billingSubscriptionRules.ts');
  const base = { workspaceId: 'w', successUrl: 'https://a/s', cancelUrl: 'https://a/c', now: '2026-10-06T12:00:00Z' };
  const plus = buildCheckoutPayload({ ...base, tier: { name: 'Uni Voz Plus', priceBrl: 69.9 } });
  assert.equal(plus.items[0].value, 69.9);
  assert.equal(plus.items[0].name, 'Uni Voz Plus');
  const legacy = buildCheckoutPayload(base);
  assert.equal(legacy.items[0].value, 29.9);
  assert.equal(legacy.items[0].name, 'Plano Pessoal');
});

test('serviço do front envia só o nível, nunca o preço', async () => {
  const { createBillingService } = await import('./billingService.js');
  const calls = [];
  const service = createBillingService({
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } },
    supabaseUrl: 'https://x.supabase.co',
    supabaseAnonKey: 'anon',
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });
  await service.createCheckout({ workspaceId: 'w', tierId: 'essencial' });
  await service.createSubscription({ workspaceId: 'w', planId: 'pro', tierId: 'uni_voz_plus', paymentMethod: 'pix' });
  assert.equal(calls[0].body.tier_id, 'essencial');
  assert.equal(calls[1].body.tier_id, 'uni_voz_plus');
  for (const call of calls) {
    assert.equal('value' in call.body, false);
    assert.equal('price' in call.body, false);
  }
});
