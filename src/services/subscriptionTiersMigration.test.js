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
