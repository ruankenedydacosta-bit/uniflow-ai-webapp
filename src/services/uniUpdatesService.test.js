import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = () => readFile(new URL('uniUpdatesService.js', import.meta.url), 'utf8');

// ============================================================================
// UNIUPD1 -- uniUpdatesService.js. Sem Supabase real configurado em teste
// (isSupabaseConfigured e false), o service retorna cedo antes de qualquer
// chamada de rede -- mesmo padrao de cobertura por leitura de fonte ja usado
// por notificationsService.test.js/profileService.test.js.
// ============================================================================

function slice(content, start, end) {
  return content.slice(content.indexOf(start), end ? content.indexOf(end) : undefined);
}

test('listActiveUpdates ordena por created_at desc e so aplica limit quando informado', async () => {
  const content = await source();
  const fnBody = slice(content, 'export async function listActiveUpdates', 'export async function listSeenUpdateIds');
  assert.match(fnBody, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(fnBody, /if \(limit\) query = query\.limit\(limit\);/);
});

test('listActiveUpdates nao exige userId -- changelog e o mesmo para todos', async () => {
  const content = await source();
  const fnBody = slice(content, 'export async function listActiveUpdates', 'export async function listSeenUpdateIds');
  assert.doesNotMatch(fnBody, /createMissingUserResult/);
});

test('listSeenUpdateIds sempre filtra por user_id -- isolamento por usuario', async () => {
  const content = await source();
  const fnBody = slice(content, 'export async function listSeenUpdateIds', 'export async function markUpdateAsSeen');
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
  assert.match(fnBody, /if \(!userId\) return createMissingUserResult\(\);/);
});

test('markUpdateAsSeen faz upsert idempotente na chave composta (user_id, update_id)', async () => {
  const content = await source();
  const fnBody = slice(content, 'export async function markUpdateAsSeen');
  assert.match(fnBody, /\.upsert\(\{ user_id: userId, update_id: updateId \}, \{ onConflict: 'user_id,update_id', ignoreDuplicates: true \}\)/);
});

test('markUpdateAsSeen exige userId e updateId', async () => {
  const content = await source();
  const fnBody = slice(content, 'export async function markUpdateAsSeen');
  assert.match(fnBody, /if \(!userId\) return createMissingUserResult\(\);/);
  assert.match(fnBody, /if \(!updateId\)/);
});

test('sem Supabase configurado, todas as funcoes retornam resultado seguro (isConfigured: false)', async () => {
  const content = await source();
  assert.match(content, /if \(!supabase\) return createUnavailableResult/g);
  const occurrences = content.match(/if \(!supabase\) return createUnavailableResult/g) ?? [];
  assert.equal(occurrences.length, 3);
});
