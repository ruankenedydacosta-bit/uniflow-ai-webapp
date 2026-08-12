import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// NOTIF1 -- notificationsService.js. Sem Supabase real configurado em teste
// (isSupabaseConfigured e false), o service retorna cedo antes de qualquer
// chamada de rede -- mesmo padrao de cobertura por leitura de fonte ja usado
// por categoryService.test.js/authService.test.js.
// ============================================================================

test('listNotifications sempre filtra por user_id -- isolamento por usuario', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listNotifications'),
    content.indexOf('export async function markNotificationAsRead'),
  );
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
  assert.match(fnBody, /if \(!userId\) return createMissingUserResult\(\);/);
});

test('listNotifications com workspaceId retorna global (workspace_id nulo) + do workspace -- isolamento por workspace', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listNotifications'),
    content.indexOf('export async function markNotificationAsRead'),
  );
  assert.match(fnBody, /query\.or\(`workspace_id\.is\.null,workspace_id\.eq\.\$\{workspaceId\}`\)/);
});

test('listNotifications ordena por created_at desc e respeita limit', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listNotifications'),
    content.indexOf('export async function markNotificationAsRead'),
  );
  assert.match(fnBody, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(fnBody, /\.limit\(limit\)/);
});

test('deduplicacao de Agenda usa somente usuario, workspace e tipo agenda', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listAgendaNotificationItemIds'),
    content.indexOf('export async function markNotificationAsRead'),
  );
  assert.match(fnBody, /\.select\('metadata'\)/);
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
  assert.match(fnBody, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(fnBody, /\.eq\('type', 'agenda'\)/);
  assert.match(fnBody, /notification\.metadata\?\.agenda_item_id/);
});

test('markNotificationAsRead so atualiza a notificacao do proprio usuario (id + user_id)', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(
    content.indexOf('export async function markNotificationAsRead'),
    content.indexOf('export async function markAllNotificationsAsRead'),
  );
  assert.match(fnBody, /\.update\(\{ read_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(fnBody, /\.eq\('id', notificationId\)/);
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
});

test('markAllNotificationsAsRead so atualiza nao lidas (read_at nulo) do proprio usuario', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(
    content.indexOf('export async function markAllNotificationsAsRead'),
    content.indexOf('export async function createNotification'),
  );
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
  assert.match(fnBody, /\.is\('read_at', null\)/);
});

// NOTIF2: dispensar uma notificação e uma exclusão real, mas restrita ao
// próprio usuário e a UMA linha -- nunca ao compromisso/registro de
// origem (esse nunca é tocado por este service).
test('deleteNotification so exclui a notificacao do proprio usuario (id + user_id), nunca em lote', async () => {
  const content = await source('notificationsService.js');
  const fnStart = content.indexOf('export async function deleteNotification');
  assert.ok(fnStart > -1, 'deleteNotification deve existir');
  const fnBody = content.slice(fnStart, content.indexOf('export async function createNotification'));
  assert.match(fnBody, /\.delete\(\)/);
  assert.match(fnBody, /\.eq\('id', notificationId\)/);
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
});

test('createNotification exige titulo nao-vazio antes de qualquer chamada ao Supabase', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(content.indexOf('export async function createNotification'));
  assert.match(
    fnBody,
    /if \(typeof title !== 'string' \|\| !title\.trim\(\)\) \{\s*\n\s*return createResult\(null, \{\s*\n\s*code: 'INVALID_NOTIFICATION_REQUEST',/,
  );
});

test('createNotification sempre insere com o user_id recebido -- nunca cria notificacao para outro usuario (RLS reforca no banco)', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(content.indexOf('export async function createNotification'));
  assert.match(fnBody, /user_id: userId,/);
});

test('todas as funcoes retornam cedo quando Supabase nao esta configurado, sem lancar excecao', async () => {
  const content = await source('notificationsService.js');
  const occurrences = content.match(/if \(!supabase\) return createUnavailableResult/g) ?? [];
  // NOTIF2: deleteNotification soma mais uma funcao a essa guarda.
  assert.equal(occurrences.length, 6);
});

test('retorna { data, error, isConfigured } -- mesmo contrato dos demais services do repositorio', async () => {
  const content = await source('notificationsService.js');
  assert.match(
    content,
    /function createResult\(data, error = null\) \{\s*\n\s*return \{\s*\n\s*data,\s*\n\s*error,\s*\n\s*isConfigured: isSupabaseConfigured,\s*\n\s*\};/,
  );
});
