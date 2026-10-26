import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BILLING_PLAN_ID,
  PLAN_CAPABILITY,
  PLAN_IDS,
  PLANS,
  getDemoPlanCapabilities,
  hasPlanAccess,
  normalizePlanCapabilities,
} from '../../supabase/functions/_shared/planCatalog.js';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025130000_048_plan_capabilities.sql', import.meta.url),
  'utf8',
);

test('IDs de plano são compartilhados e pro continua sendo o ID técnico do Plano Pessoal', () => {
  assert.deepEqual(PLAN_IDS, ['free', 'pro', 'business', 'enterprise']);
  assert.equal(BILLING_PLAN_ID, PLANS.PRO);
});

test('capabilities normalizadas vêm das linhas recebidas do catálogo persistido', () => {
  assert.deepEqual(normalizePlanCapabilities([
    { capability_id: PLAN_CAPABILITY.REPORTS },
    { capability_id: PLAN_CAPABILITY.BUSINESS_FEATURES },
    { capability_id: 'unknown' },
  ]), {
    reports: true,
    business_features: true,
  });
  assert.deepEqual(normalizePlanCapabilities(null), {
    reports: false,
    business_features: false,
  });
});

test('seed de capacidades preserva exatamente a matriz anterior sem modificar assinaturas', () => {
  const expected = [
    [PLANS.PRO, PLAN_CAPABILITY.REPORTS],
    [PLANS.BUSINESS, PLAN_CAPABILITY.REPORTS],
    [PLANS.BUSINESS, PLAN_CAPABILITY.BUSINESS_FEATURES],
    [PLANS.ENTERPRISE, PLAN_CAPABILITY.REPORTS],
    [PLANS.ENTERPRISE, PLAN_CAPABILITY.BUSINESS_FEATURES],
  ];
  const seedBlock = migration.split('insert into public.plan_capabilities')[1].split('on conflict')[0];
  const seeded = [...seedBlock.matchAll(/\('([^']+)', '([^']+)'\)/g)]
    .map(([, planId, capabilityId]) => [planId, capabilityId]);
  assert.deepEqual(seeded, expected);
  assert.doesNotMatch(migration, /update\s+public\.subscriptions|delete\s+from\s+public\.subscriptions|drop\s+constraint/i);
});

test('assinatura ativa, trial, atraso e cancelamento durante período pago preservam acesso', () => {
  for (const status of ['trialing', 'active', 'past_due']) {
    assert.equal(hasPlanAccess({ status }), true, status);
  }
  assert.equal(hasPlanAccess({ status: 'canceled', current_period_ends_at: '2099-01-01T00:00:00Z' }), true);
  assert.equal(hasPlanAccess({ status: 'canceled', current_period_ends_at: '2000-01-01T00:00:00Z' }), false);
  for (const status of ['pending', 'suspended', 'expired', 'unknown']) {
    assert.equal(hasPlanAccess({ status }), false, status);
  }
});

test('RLS consulta o catálogo e exige capacidade Business nas quatro tabelas empresariais', async () => {
  assert.match(migration, /create table public\.plan_capabilities/);
  assert.match(migration, /revoke all on table public\.plan_capabilities from public, anon, authenticated/);
  assert.match(migration, /create or replace function public\.workspace_has_plan_capability/);
  for (const table of ['clients', 'crm_pipeline_stages', 'crm_opportunities', 'projects']) {
    assert.match(migration, new RegExp(`on public\\.${table}[\\s\\S]*?as restrictive[\\s\\S]*?workspace_has_plan_capability\\(workspace_id, 'business_features'\\)`));
  }
  assert.match(migration, /subscription\.status = 'canceled'[\s\S]*?current_period_ends_at > statement_timestamp\(\)/);
  assert.match(migration, /order by subscription\.created_at desc, subscription\.id desc\s+limit 1/i);
  const workspaceService = await readFile(new URL('./workspaceService.js', import.meta.url), 'utf8');
  assert.equal((workspaceService.match(/\.order\('id', \{ ascending: false \}\)/g) ?? []).length, 2);
});

test('clientes e Edge Functions importam o mesmo ID de plano', async () => {
  const [billingTypes, access, navigation, workspaceService, createSubscription, createCheckout, getSubscription] = await Promise.all([
    readFile(new URL('./billingTypes.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/access.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('./workspaceService.js', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/functions/billing-create-subscription/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/functions/billing-create-checkout/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/functions/billing-get-subscription/index.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(billingTypes, /from '\.\.\/\.\.\/supabase\/functions\/_shared\/planCatalog\.js'/);
  assert.match(createSubscription, /from '\.\.\/_shared\/planCatalog\.js'/);
  assert.match(createCheckout, /from '\.\.\/_shared\/planCatalog\.js'/);
  assert.match(getSubscription, /from '\.\.\/_shared\/planCatalog\.js'/);
  assert.match(access, /from '\.\.\/\.\.\/supabase\/functions\/_shared\/planCatalog\.js'/);
  assert.match(workspaceService, /plan:plans!subscriptions_plan_id_fkey\(plan_capabilities\(capability_id\)\)/);
  assert.doesNotMatch(workspaceService, /\.in\('status'/);
  const selection = migration.split('with latest_subscription as (')[1].split('limit 1')[0];
  assert.doesNotMatch(selection, /subscription\.status\s+in/);
  assert.doesNotMatch(createSubscription, /plan_id:\s*'pro'/);
  assert.doesNotMatch(createCheckout, /plan_id:\s*'pro'/);
  for (const source of [billingTypes, access, navigation, createSubscription, createCheckout, getSubscription]) {
    assert.doesNotMatch(source, /(?:===|!==|includes\()\s*['"](?:pro|personal)['"]/);
  }
});

test('fixtures demo preservam o comportamento de navegação para os planos legados', () => {
  assert.deepEqual(getDemoPlanCapabilities(PLANS.FREE), { reports: false, business_features: false });
  assert.deepEqual(getDemoPlanCapabilities(PLANS.PRO), { reports: true, business_features: false });
  assert.deepEqual(getDemoPlanCapabilities(PLANS.BUSINESS), { reports: true, business_features: true });
  assert.deepEqual(getDemoPlanCapabilities(PLANS.ENTERPRISE), { reports: true, business_features: true });
});
