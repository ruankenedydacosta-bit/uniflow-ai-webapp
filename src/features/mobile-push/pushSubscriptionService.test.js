import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// PUSH1 -- pushSubscriptionService.js. Sem Supabase real configurado em
// teste, mesmo padrao de cobertura estrutural ja usado por
// notificationsService.test.js.
// ============================================================================

test('upsertPushSubscription usa onConflict endpoint -- reativar no mesmo dispositivo nunca duplica', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function upsertPushSubscription'),
    content.indexOf('export async function revokePushSubscription'),
  );
  assert.match(fnBody, /\.upsert\(/);
  assert.match(fnBody, /onConflict: 'endpoint'/);
  assert.match(fnBody, /user_id: userId,/);
});

test('upsertPushSubscription rejeita subscription incompleta antes de qualquer chamada ao Supabase', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function upsertPushSubscription'),
    content.indexOf('export async function revokePushSubscription'),
  );
  assert.match(fnBody, /if \(!endpoint \|\| !p256dh \|\| !authKey\) \{/);
});

test('upsertPushSubscription reativa (revoked_at: null) -- reautorizar no mesmo dispositivo sempre reativa', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function upsertPushSubscription'),
    content.indexOf('export async function revokePushSubscription'),
  );
  assert.match(fnBody, /revoked_at: null,/);
});

test('revokePushSubscription so atualiza a subscription do proprio usuario (endpoint + user_id), nunca DELETE', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnStart = content.indexOf('export async function revokePushSubscription');
  assert.ok(fnStart > -1, 'revokePushSubscription deve existir');
  const fnBody = content.slice(fnStart);
  assert.match(fnBody, /\.update\(\{ revoked_at: new Date\(\)\.toISOString\(\)/);
  assert.match(fnBody, /\.eq\('endpoint', endpoint\)/);
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
  assert.doesNotMatch(fnBody, /\.delete\(\)/);
});

test('todas as funcoes retornam cedo quando Supabase nao esta configurado ou sem userId, sem lancar excecao', async () => {
  const content = await source('pushSubscriptionService.js');
  const unavailableOccurrences = content.match(/if \(!supabase\) return createUnavailableResult/g) ?? [];
  const missingUserOccurrences = content.match(/if \(!userId\) return createMissingUserResult/g) ?? [];
  assert.equal(unavailableOccurrences.length, 2);
  assert.equal(missingUserOccurrences.length, 2);
});

test('retorna { data, error, isConfigured } -- mesmo contrato dos demais services do repositorio', async () => {
  const content = await source('pushSubscriptionService.js');
  assert.match(
    content,
    /function createResult\(data, error = null\) \{\s*\n\s*return \{\s*\n\s*data,\s*\n\s*error,\s*\n\s*isConfigured: isSupabaseConfigured,\s*\n\s*\};/,
  );
});
