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

// NOTIF3: dispensada nunca reaparece na listagem do sino.
test('listNotifications exclui notificacoes dispensadas (dismissed_at nao nulo)', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listNotifications'),
    content.indexOf('export async function markNotificationAsRead'),
  );
  assert.match(fnBody, /\.is\('dismissed_at', null\)/);
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

// NOTIF3: este e o ponto central da correcao do bug de reaparecimento --
// dispensar uma notificacao de agenda NUNCA pode faze-la "sumir" da
// deteccao de idempotencia do sync, senao ele recria a mesma notificacao.
test('deduplicacao de Agenda NAO filtra por dismissed_at -- dispensada continua contando como ja notificada', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listAgendaNotificationItemIds'),
    content.indexOf('export async function markNotificationAsRead'),
  );
  assert.doesNotMatch(fnBody, /dismissed_at/);
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

// NOTIF3: dispensar uma notificação e um soft-delete (dismissed_at), nunca
// uma exclusao fisica -- restrito ao proprio usuario e a UMA linha, nunca ao
// compromisso/registro de origem (esse nunca e tocado por este service).
test('dismissNotification so atualiza dismissed_at da notificacao do proprio usuario (id + user_id), nunca DELETE, nunca em lote', async () => {
  const content = await source('notificationsService.js');
  const fnStart = content.indexOf('export async function dismissNotification');
  assert.ok(fnStart > -1, 'dismissNotification deve existir');
  const fnBody = content.slice(fnStart, content.indexOf('export async function createNotification'));
  assert.match(fnBody, /\.update\(\{ dismissed_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(fnBody, /\.eq\('id', notificationId\)/);
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
  assert.doesNotMatch(fnBody, /\.delete\(\)/);
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
  // NOTIF2/NOTIF3: dismissNotification soma mais uma funcao a essa guarda.
  // UNIUPD1: hasUpdateNotification soma mais uma.
  assert.equal(occurrences.length, 7);
});

// UNIUPD1: dedup da notificacao de nova versao -- nunca recria a mesma
// notificacao a cada mount da Home que detecta a mesma novidade pendente.
test('hasUpdateNotification filtra por usuario, tipo uni e metadata.update_id -- NAO filtra por dismissed_at (mesmo motivo da Agenda)', async () => {
  const content = await source('notificationsService.js');
  const fnBody = content.slice(
    content.indexOf('export async function hasUpdateNotification'),
    content.indexOf('export async function createNotification'),
  );
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
  assert.match(fnBody, /\.eq\('type', 'uni'\)/);
  assert.match(fnBody, /\.eq\('metadata->>update_id', updateId\)/);
  assert.doesNotMatch(fnBody, /dismissed_at/);
});

test('retorna { data, error, isConfigured } -- mesmo contrato dos demais services do repositorio', async () => {
  const content = await source('notificationsService.js');
  assert.match(
    content,
    /function createResult\(data, error = null\) \{\s*\n\s*return \{\s*\n\s*data,\s*\n\s*error,\s*\n\s*isConfigured: isSupabaseConfigured,\s*\n\s*\};/,
  );
});
