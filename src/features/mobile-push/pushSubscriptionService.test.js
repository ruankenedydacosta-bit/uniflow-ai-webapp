import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// PUSH1 (correção 403) -- pushSubscriptionService.js. Sem Supabase real
// configurado em teste, mesmo padrao de cobertura estrutural ja usado por
// notificationsService.test.js.
//
// Causa raiz do bug real visto em Production: upsert(..., { onConflict })
// vira `ON CONFLICT (endpoint) DO UPDATE SET <toda coluna do payload>` no
// Postgres -- e o Postgres exige privilegio de UPDATE em TODAS essas
// colunas em tempo de PLANEJAMENTO, mesmo numa linha nova onde o ramo
// ON CONFLICT nunca roda de verdade. user_id/workspace_id nunca foram
// concedidos por UPDATE (de proposito), entao TODO upsert falhava com
// "permission denied for table push_subscriptions" -- inclusive a
// PRIMEIRA ativacao. Estes testes cobrem o fluxo novo: SELECT (RLS-scoped)
// -> INSERT ou UPDATE, nunca upsert/on_conflict.
// ============================================================================

test('nunca usa upsert/on_conflict -- essa era a causa raiz do 403 em Production', async () => {
  const content = await source('pushSubscriptionService.js');
  assert.doesNotMatch(content, /\.upsert\(/);
  assert.doesNotMatch(content, /onConflict/);
});

test('upsertPushSubscription rejeita subscription incompleta antes de qualquer chamada ao Supabase', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function upsertPushSubscription'),
    content.length,
  );
  assert.match(fnBody, /if \(!endpoint \|\| !p256dh \|\| !authKey\) \{/);
});

// 1. primeira ativação → INSERT funciona
test('sem linha existente, faz INSERT com todas as colunas (privilegio de INSERT cobre a tabela inteira)', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function upsertPushSubscription'),
    content.length,
  );
  const insertBody = fnBody.slice(fnBody.indexOf('.insert({'), fnBody.indexOf('.select(\'id, endpoint, revoked_at\')'));
  for (const column of ['user_id: userId,', 'workspace_id: workspaceId,', 'endpoint,', 'p256dh,', 'auth: authKey,', 'platform,']) {
    assert.match(insertBody, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `coluna ${column} ausente do INSERT`);
  }
});

// 2. reativação → UPDATE funciona; 4. endpoint repetido não duplica
test('com linha existente (mesmo endpoint, mesmo usuario), atualiza em vez de inserir -- nunca duplica', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function upsertPushSubscription'),
    content.length,
  );
  assert.match(fnBody, /const existing = await findOwnSubscriptionByEndpoint\(userId, endpoint\);/);
  assert.match(fnBody, /if \(existing\) \{\s*\n\s*const \{ data, error \} = await updateOwnSubscription\(/);
});

// 5. revoked_at volta para null na reativação
test('updateOwnSubscription sempre reativa (revoked_at: null)', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnBody = content.slice(
    content.indexOf('async function updateOwnSubscription'),
    content.indexOf('/**'),
  );
  assert.match(fnBody, /revoked_at: null,/);
});

// 6/7/8. user_id, workspace_id e endpoint NUNCA fazem parte do UPDATE
test('UPDATE de reativação nunca reescreve user_id, workspace_id ou endpoint -- só as colunas concedidas pela migration 042', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnBody = content.slice(
    content.indexOf('async function updateOwnSubscription'),
    content.indexOf('/**'),
  );
  const updateObjectBody = fnBody.slice(fnBody.indexOf('.update({'), fnBody.indexOf('})\n    .eq'));
  assert.doesNotMatch(updateObjectBody, /user_id/);
  assert.doesNotMatch(updateObjectBody, /workspace_id/);
  assert.doesNotMatch(updateObjectBody, /\bendpoint\b/);
  for (const column of ['p256dh', 'auth: authKey', 'platform', 'updated_at: nowIso', 'last_seen_at: nowIso', 'revoked_at: null']) {
    assert.match(updateObjectBody, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `coluna ${column} ausente do UPDATE`);
  }
});

// 9. usuário A não modifica/lê subscription B
test('busca e atualização são sempre escopadas por user_id (RLS-scoped e defesa em profundidade na aplicação)', async () => {
  const content = await source('pushSubscriptionService.js');
  const findBody = content.slice(
    content.indexOf('async function findOwnSubscriptionByEndpoint'),
    content.indexOf('// PUSH1 (correcao 403): so reescreve'),
  );
  assert.match(findBody, /\.eq\('user_id', userId\)/);
  const updateBody = content.slice(
    content.indexOf('async function updateOwnSubscription'),
    content.indexOf('/**'),
  );
  assert.match(updateBody, /\.eq\('user_id', userId\)/);
});

// Corrida rara: duas abas do MESMO usuário inserindo o mesmo endpoint ao
// mesmo tempo -- o INSERT perdedor vira UPDATE, nunca duplicata nem erro
// vazado ao usuário.
test('unique_violation (23505) no INSERT busca a própria linha de novo e converte em UPDATE -- nunca propaga erro nem duplica', async () => {
  const content = await source('pushSubscriptionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function upsertPushSubscription'),
    content.length,
  );
  assert.match(content, /const UNIQUE_VIOLATION_CODE = '23505';/);
  assert.match(fnBody, /if \(error\?\.code === UNIQUE_VIOLATION_CODE\) \{/);
  assert.match(fnBody, /const retryExisting = await findOwnSubscriptionByEndpoint\(userId, endpoint\);/);
  assert.match(fnBody, /const retry = await updateOwnSubscription\(userId, retryExisting\.id,/);
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

// 10. enviar notificação de teste encontra a subscription ativa: a
// condicao usada pela Edge Function (revoked_at is.null) e exatamente o
// que a reativacao produz (revoked_at: null) -- cruza os dois arquivos
// para provar que ficam em sincronia.
test('revoked_at: null na reativação é exatamente o que push-send-test-notification usa para achar subscriptions ativas', async () => {
  const serviceContent = await source('pushSubscriptionService.js');
  const functionContent = await source('../../../supabase/functions/push-send-test-notification/index.ts');
  assert.match(serviceContent, /revoked_at: null,/);
  assert.match(functionContent, /revoked_at: 'is\.null'/);
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
