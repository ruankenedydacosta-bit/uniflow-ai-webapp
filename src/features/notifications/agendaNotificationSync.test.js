import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getNextAgendaNotificationDelay,
  syncDueAgendaNotificationsOnce,
} from './agendaNotificationSync.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
const WORKSPACE_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_WORKSPACE_ID = '20000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-08-11T15:21:00.500Z');

function agendaItem(overrides = {}) {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    workspace_id: WORKSPACE_ID,
    title: 'Reunião',
    description: 'Alinhar próximos passos',
    starts_at: '2026-08-11T15:21:00.000Z',
    status: 'scheduled',
    assigned_user_id: null,
    created_by: USER_ID,
    ...overrides,
  };
}

function createHarness(items = [], alreadyNotified = []) {
  const notifiedIds = new Set(alreadyNotified);
  const notifications = [];
  return {
    notifications,
    dependencies: {
      listDueItems: async () => ({ data: items, error: null }),
      listNotifiedItemIds: async () => ({ data: [...notifiedIds], error: null }),
      create: async (userId, notification) => {
        const record = { id: `notification-${notifications.length + 1}`, user_id: userId, ...notification };
        notifications.push(record);
        notifiedIds.add(notification.metadata.agenda_item_id);
        return { data: record, error: null };
      },
    },
  };
}

test('relogio agenda a proxima virada de minuto com pequena margem', () => {
  assert.equal(getNextAgendaNotificationDelay(Date.parse('2026-08-11T15:20:30.000Z')), 30_250);
  assert.equal(getNextAgendaNotificationDelay(Date.parse('2026-08-11T15:20:59.900Z')), 350);
});

test('compromisso vencido cria notificacao com titulo e observacao reais', async () => {
  const harness = createHarness([agendaItem()]);
  const result = await syncDueAgendaNotificationsOnce(USER_ID, WORKSPACE_ID, {
    now: NOW,
    ...harness.dependencies,
  });

  assert.equal(result.error, null);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].title, 'Reunião');
  assert.equal(harness.notifications[0].message, 'Alinhar próximos passos');
  assert.equal(harness.notifications[0].actionUrl, '/app/agenda');
});

test('sem observacao usa mensagem curta e segura', async () => {
  const harness = createHarness([agendaItem({ description: '   ' })]);
  await syncDueAgendaNotificationsOnce(USER_ID, WORKSPACE_ID, {
    now: NOW,
    ...harness.dependencies,
  });
  assert.equal(harness.notifications[0].message, 'Este compromisso chegou ao horário marcado.');
});

test('futuro, concluido, outro usuario e outro workspace nao notificam', async () => {
  const harness = createHarness([
    agendaItem({ starts_at: '2026-08-11T15:22:00.000Z' }),
    agendaItem({ id: '30000000-0000-4000-8000-000000000002', status: 'completed' }),
    agendaItem({ id: '30000000-0000-4000-8000-000000000003', created_by: OTHER_USER_ID }),
    agendaItem({ id: '30000000-0000-4000-8000-000000000004', workspace_id: OTHER_WORKSPACE_ID }),
  ]);
  await syncDueAgendaNotificationsOnce(USER_ID, WORKSPACE_ID, {
    now: NOW,
    ...harness.dependencies,
  });
  assert.equal(harness.notifications.length, 0);
});

test('metadata agenda_item_id impede notificacao duplicada', async () => {
  const item = agendaItem();
  const harness = createHarness([item], [item.id]);
  await syncDueAgendaNotificationsOnce(USER_ID, WORKSPACE_ID, {
    now: NOW,
    ...harness.dependencies,
  });
  assert.equal(harness.notifications.length, 0);
});

test('consulta real filtra workspace, usuario, scheduled e starts_at vencido', async () => {
  const content = await readFile(new URL('../../services/agendaService.js', import.meta.url), 'utf8');
  const fnBody = content.slice(
    content.indexOf('export async function listDueAgendaItemsForUser'),
    content.indexOf('export async function getAgendaItem'),
  );
  assert.match(fnBody, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(fnBody, /\.eq\('status', 'scheduled'\)/);
  assert.match(fnBody, /\.lte\('starts_at', dueAtDate\.toISOString\(\)\)/);
  assert.match(fnBody, /assigned_user_id\.eq\.\$\{userId\}/);
  assert.match(fnBody, /created_by\.eq\.\$\{userId\}/);
});

test('falha inesperada e fail-safe e nao derruba o sino', async () => {
  const result = await syncDueAgendaNotificationsOnce(USER_ID, WORKSPACE_ID, {
    now: NOW,
    listDueItems: async () => { throw new Error('offline'); },
  });
  assert.equal(result.error.code, 'AGENDA_NOTIFICATION_SYNC_FAILED');
  assert.deepEqual(result.data.created, []);
});
