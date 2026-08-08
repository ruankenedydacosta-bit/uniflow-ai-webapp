import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildAgendaCreationPayload,
  getAgendaItemFields,
  resolveIdempotentAgendaCreation,
} from './agendaService.js';

const source = () => readFile(new URL('./agendaService.js', import.meta.url), 'utf8');

const WORKSPACE_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_B = '22222222-2222-4222-8222-222222222222';
const OPERATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPERATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function basePayload(operationId = OPERATION_A, overrides = {}) {
  return {
    workspace_id: WORKSPACE_A,
    item_type: 'appointment',
    title: 'Reunião',
    starts_at: '2026-08-10T13:00:00.000Z',
    ends_at: null,
    is_all_day: false,
    client_operation_id: operationId,
    ...overrides,
  };
}

function createIdempotencyHarness({ timeoutAfterFirstInsert = false } = {}) {
  const records = new Map();
  let insertCount = 0;
  let shouldTimeout = timeoutAfterFirstInsert;

  const keyFor = (payload) => `${payload.workspace_id}:${payload.client_operation_id}`;
  async function execute(payload) {
    return resolveIdempotentAgendaCreation({
      payload,
      findExisting: async () => ({ data: records.get(keyFor(payload)) ?? null, error: null }),
      insertItem: async (insertPayload) => {
        insertCount += 1;
        const key = keyFor(insertPayload);
        if (records.has(key)) return { data: null, error: { code: '23505' } };
        const data = {
          id: `item-${records.size + 1}`,
          description: null,
          location: null,
          client_id: null,
          assigned_user_id: null,
          status: 'scheduled',
          created_at: '2026-08-08T10:00:00.000Z',
          updated_at: '2026-08-08T10:00:00.000Z',
          ...insertPayload,
        };
        records.set(key, data);
        if (shouldTimeout) {
          shouldTimeout = false;
          throw new Error('timeout depois do commit');
        }
        return { data, error: null };
      },
    });
  }

  return {
    execute,
    records,
    get insertCount() { return insertCount; },
  };
}

test('idempotência: primeira criação insere e devolve o compromisso', async () => {
  const harness = createIdempotencyHarness();
  const result = await harness.execute(basePayload());

  assert.equal(result.error, null);
  assert.equal(result.data.title, 'Reunião');
  assert.equal(harness.insertCount, 1);
});

test('flag OFF não consulta nem escreve client_operation_id', () => {
  const input = basePayload();
  const payload = buildAgendaCreationPayload(WORKSPACE_A, input, false);

  assert.doesNotMatch(getAgendaItemFields(false), /client_operation_id/);
  assert.equal(payload.client_operation_id, undefined);
  assert.equal(payload.title, 'Reunião');
});

test('flag ON inclui client_operation_id no select e payload B.2', () => {
  const input = basePayload();
  const payload = buildAgendaCreationPayload(WORKSPACE_A, input, true);

  assert.match(getAgendaItemFields(true), /client_operation_id/);
  assert.equal(payload.client_operation_id, OPERATION_A);
});

test('flag ON exige UUID antes de alcançar o caminho idempotente', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function createAgendaItem'),
    content.indexOf('export async function updateAgendaItem'),
  );

  assert.match(body, /idempotencyEnabled\s*&& !isValidUuid\(item\.client_operation_id\)/);
  assert.doesNotMatch(body, /item\.client_operation_id !== undefined/);
});

test('idempotência: retry idêntico retorna o item existente sem novo insert', async () => {
  const harness = createIdempotencyHarness();
  const first = await harness.execute(basePayload());
  const replay = await harness.execute(basePayload());

  assert.equal(replay.error, null);
  assert.equal(replay.data.id, first.data.id);
  assert.equal(harness.insertCount, 1);
});

test('idempotência: retry após timeout recupera o insert já confirmado', async () => {
  const harness = createIdempotencyHarness({ timeoutAfterFirstInsert: true });
  await assert.rejects(harness.execute(basePayload()), /timeout depois do commit/);
  const replay = await harness.execute(basePayload());

  assert.equal(replay.error, null);
  assert.equal(replay.data.id, 'item-1');
  assert.equal(harness.insertCount, 1);
});

test('idempotência: duas abas concorrentes com a mesma chave convergem no mesmo item', async () => {
  const harness = createIdempotencyHarness();
  const [tabA, tabB] = await Promise.all([
    harness.execute(basePayload()),
    harness.execute(basePayload()),
  ]);

  assert.equal(tabA.error, null);
  assert.equal(tabB.error, null);
  assert.equal(tabA.data.id, tabB.data.id);
  assert.equal(harness.records.size, 1);
});

test('idempotência: mesma chave com payload diferente retorna conflito seguro', async () => {
  const harness = createIdempotencyHarness();
  await harness.execute(basePayload());
  const conflict = await harness.execute(basePayload(OPERATION_A, { title: 'Outro compromisso' }));

  assert.equal(conflict.data, null);
  assert.equal(conflict.error.code, 'AGENDA_ITEM_IDEMPOTENCY_CONFLICT');
  assert.equal(harness.records.size, 1);
});

test('idempotência: duas criações iguais com UUIDs diferentes criam dois itens', async () => {
  const harness = createIdempotencyHarness();
  const first = await harness.execute(basePayload(OPERATION_A));
  const second = await harness.execute(basePayload(OPERATION_B));

  assert.notEqual(first.data.id, second.data.id);
  assert.equal(harness.records.size, 2);
});

test('idempotência: a mesma chave permanece isolada por workspace', async () => {
  const harness = createIdempotencyHarness();
  const first = await harness.execute(basePayload(OPERATION_A));
  const second = await harness.execute(basePayload(OPERATION_A, { workspace_id: WORKSPACE_B }));

  assert.notEqual(first.data.id, second.data.id);
  assert.equal(harness.records.size, 2);
});

test('idempotência: replay preserva updated_at porque não executa update', async () => {
  const harness = createIdempotencyHarness();
  const first = await harness.execute(basePayload());
  const originalUpdatedAt = first.data.updated_at;
  const replay = await harness.execute(basePayload());

  assert.equal(replay.data.updated_at, originalUpdatedAt);
  assert.equal(harness.insertCount, 1);
});

test('createAgendaItem consulta a chave sempre dentro do workspace e trata corrida 23505', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function createAgendaItem'),
    content.indexOf('export async function updateAgendaItem'),
  );

  assert.match(body, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(body, /\.eq\('client_operation_id', payload\.client_operation_id\)/);
  assert.match(content, /inserted\.error\.code !== '23505'/);
  assert.match(content, /isCompatibleAgendaCreation\(concurrent\.data, payload\)/);
  assert.match(body, /if \(!idempotencyEnabled\)/);
  assert.match(body, /select\(getAgendaItemFields\(false\)\)/);
});

test('updateAgendaItem aplica updated_at esperado na mesma query do workspace e item', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function updateAgendaItem'),
    content.indexOf('export async function setAgendaItemStatus'),
  );

  assert.match(body, /\{ expectedUpdatedAt \} = \{\}/);
  assert.match(body, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(body, /\.eq\('id', itemId\)/);
  assert.match(body, /query = query\.eq\('updated_at', expectedUpdatedAt\);/);
});

test('updateAgendaItem converte ausencia de linha com precondicao em conflito seguro', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function updateAgendaItem'),
    content.indexOf('export async function setAgendaItemStatus'),
  );

  assert.match(body, /if \(!error && !data && expectedUpdatedAt\)/);
  assert.match(body, /code: 'AGENDA_ITEM_CONFLICT'/);
  assert.doesNotMatch(body, /throw /);
});

test('setAgendaItemStatus exige e aplica updated_at na mesma operação', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function setAgendaItemStatus'),
    content.indexOf('export async function deleteAgendaItem'),
  );

  assert.match(body, /\{ expectedUpdatedAt \} = \{\}/);
  assert.match(body, /if \(!expectedUpdatedAt \|\| Number\.isNaN/);
  assert.match(body, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(body, /\.eq\('id', itemId\)/);
  assert.match(body, /\.eq\('updated_at', expectedUpdatedAt\)/);
});

test('setAgendaItemStatus retorna conflito seguro quando a versão não existe mais', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function setAgendaItemStatus'),
    content.indexOf('export async function deleteAgendaItem'),
  );

  assert.match(body, /if \(!error && !data\)/);
  assert.match(body, /code: 'AGENDA_ITEM_CONFLICT'/);
  assert.doesNotMatch(body, /throw /);
});
