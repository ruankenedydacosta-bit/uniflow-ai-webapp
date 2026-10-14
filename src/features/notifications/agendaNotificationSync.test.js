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

test('compromisso vencido cria notificacao so com titulo, dia e hora, sem a descricao', async () => {
  const harness = createHarness([agendaItem()]);
  const result = await syncDueAgendaNotificationsOnce(USER_ID, WORKSPACE_ID, {
    now: NOW,
    timeZone: 'America/Sao_Paulo',
    ...harness.dependencies,
  });

  assert.equal(result.error, null);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].title, 'Reunião');
  assert.equal(harness.notifications[0].message, 'Ter, 11 ago às 12:21');
  assert.equal(harness.notifications[0].actionUrl, '/app/agenda');
});

test('descricao longa do Google Agenda nao entra na notificacao', async () => {
  const convite = 'Microsoft Teams meeting Join: https://teams.microsoft.com/l/meetup-join/19%3ameeting Passcode: fZ77';
  const harness = createHarness([agendaItem({ description: convite })]);
  await syncDueAgendaNotificationsOnce(USER_ID, WORKSPACE_ID, {
    now: NOW,
    ...harness.dependencies,
  });
  assert.doesNotMatch(harness.notifications[0].message, /Teams|https:/);
  assert.match(harness.notifications[0].message, /^[A-Z][a-zá]{2}, \d{2} [a-z]{3} às \d{2}:\d{2}$/);
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

// NOTIF3: prova do bug real de reaparecimento e da correção. listNotifiedItemIds
// (aqui injetado) e o unico sinal que o sync usa para saber "ja notifiquei este
// compromisso" -- ele nao sabe nem precisa saber se a notificacao encontrada
// esta dispensada ou nao. A correcao real esta em
// notificationsService.js/listAgendaNotificationItemIds nunca filtrar por
// dismissed_at (ver notificationsService.test.js) -- o que garante que o
// agenda_item_id de uma notificacao ja dispensada continua chegando aqui,
// exatamente como neste teste simula.
test('compromisso cujo agenda_item_id ja retornou de uma notificacao dispensada NAO gera uma segunda notificacao', async () => {
  const item = agendaItem();
  // Simula o retorno real de listAgendaNotificationItemIds apos o usuario ja
  // ter dispensado a notificacao anterior deste compromisso -- o id continua
  // presente porque a funcao real nunca filtra por dismissed_at.
  const harness = createHarness([item], [item.id]);
  const result = await syncDueAgendaNotificationsOnce(USER_ID, WORKSPACE_ID, {
    now: NOW,
    ...harness.dependencies,
  });
  assert.equal(result.error, null);
  assert.equal(harness.notifications.length, 0, 'nao pode recriar (N2) uma notificacao ja dispensada');
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
