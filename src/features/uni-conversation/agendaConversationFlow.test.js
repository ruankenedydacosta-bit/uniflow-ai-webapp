import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyIntent } from '../uni-intents/index.js';
import { createAgendaConversationFlow } from './agendaConversationFlow.js';

const IDENTITY = Object.freeze({
  userId: 'user-a',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  conversationId: 'conversation-a',
});
const REFERENCE_DATE = '2026-08-08';

function createOperationStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function makeHarness(seed = [], {
  createOperationId,
  createResults = [],
  idempotencyEnabled = true,
  operationStorage = createOperationStorage(),
} = {}) {
  const items = seed.map((item) => ({
    status: 'scheduled',
    is_all_day: false,
    updated_at: '2026-08-08T10:00:00.000Z',
    ...item,
  }));
  const calls = [];
  let sequence = items.length;
  const services = {
    async createAgendaItem(workspaceId, payload, options) {
      calls.push({ operation: 'create', workspaceId, payload, options });
      const plannedResult = createResults.shift();
      if (plannedResult) return plannedResult;
      const data = { id: `item-${++sequence}`, workspace_id: workspaceId, status: 'scheduled', ...payload };
      items.push(data);
      return { data, error: null };
    },
    async listAgendaItems(workspaceId, filters) {
      calls.push({ operation: 'list', workspaceId, filters });
      const from = filters.startsFrom ? new Date(filters.startsFrom).getTime() : -Infinity;
      const to = filters.startsTo ? new Date(filters.startsTo).getTime() : Infinity;
      return {
        data: items.filter((item) => {
          const startsAt = new Date(item.starts_at).getTime();
          return item.workspace_id === workspaceId
            && (!filters.status || item.status === filters.status)
            && startsAt >= from
            && startsAt <= to;
        }).map((item) => ({ ...item })),
        error: null,
      };
    },
    async updateAgendaItem(workspaceId, itemId, changes, options = {}) {
      calls.push({ operation: 'update', workspaceId, itemId, changes, options });
      const item = items.find((candidate) => candidate.id === itemId && candidate.workspace_id === workspaceId);
      if (!item) return { data: null, error: { code: 'not_found' } };
      if (options.expectedUpdatedAt && options.expectedUpdatedAt !== item.updated_at) {
        return { data: null, error: { code: 'AGENDA_ITEM_CONFLICT' } };
      }
      Object.assign(item, changes);
      item.updated_at = '2026-08-08T11:00:00.000Z';
      return { data: item, error: null };
    },
    async setAgendaItemStatus(workspaceId, itemId, status, options = {}) {
      calls.push({ operation: 'status', workspaceId, itemId, status, options });
      const item = items.find((candidate) => candidate.id === itemId && candidate.workspace_id === workspaceId);
      if (!item) return { data: null, error: { code: 'not_found' } };
      if (options.expectedUpdatedAt && options.expectedUpdatedAt !== item.updated_at) {
        return { data: null, error: { code: 'AGENDA_ITEM_CONFLICT' } };
      }
      item.status = status;
      item.updated_at = '2026-08-08T11:00:00.000Z';
      return { data: item, error: null };
    },
    async deleteAgendaItem(workspaceId, itemId) {
      calls.push({ operation: 'delete', workspaceId, itemId });
      const index = items.findIndex((candidate) => candidate.id === itemId && candidate.workspace_id === workspaceId);
      if (index < 0) return { data: null, error: { code: 'not_found' } };
      const [data] = items.splice(index, 1);
      return { data: { id: data.id }, error: null };
    },
  };
  return {
    flow: createAgendaConversationFlow({
      services,
      createOperationId,
      idempotencyEnabled,
      operationStorage,
    }),
    calls,
    items,
    operationStorage,
    services,
  };
}

function turn(flow, text, identity = IDENTITY) {
  return flow.handle({ text, identity, referenceDate: REFERENCE_DATE });
}

test('criação relativa preserva assunto e pergunta pelo horário', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Me lembra da reunião daqui 10 dias.');
  assert.equal(result.text, 'Quer colocar um horário ou deixo como compromisso do dia?');
  assert.equal(calls.length, 0);
  assert.equal(flow.hasPending(IDENTITY), true);
});

test('resposta sem horário cria compromisso do dia sem inventar hora', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Me lembra da reunião daqui 10 dias.');
  const result = await turn(flow, 'Pode deixar sem horário.');
  assert.match(result.text, /compromisso do dia/);
  assert.equal(calls[0].operation, 'create');
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(calls[0].payload.is_all_day, true);
  assert.match(calls[0].payload.starts_at, /^2026-08-18T/);
  assert.equal(flow.hasPending(IDENTITY), false);
});

test('criação com horário salva dentista amanhã às 15h', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Tenho dentista amanhã às 15h.');
  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'dentista');
  assert.equal(calls[0].payload.is_all_day, false);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.match(calls[0].payload.starts_at, /^2026-08-09T/);
});

test('criação aceita data absoluta sem depender de interpretação externa', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Marca uma reunião em 20/08/2026 às 14h.');
  assert.match(calls[0].payload.starts_at, /^2026-08-20T/);
});

test('flag OFF preserva criação legada sem storage nem client_operation_id', async () => {
  const { flow, calls } = makeHarness([], {
    idempotencyEnabled: false,
    operationStorage: null,
  });
  const result = await turn(flow, 'Tenho dentista amanhã às 15h.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.client_operation_id, undefined);
  assert.deepEqual(calls[0].options, { idempotencyEnabled: false });
});

test('flag ON exige operação persistida antes de chamar o serviço', async () => {
  const { flow, calls } = makeHarness([], {
    idempotencyEnabled: true,
    operationStorage: null,
  });
  const result = await turn(flow, 'Tenho dentista amanhã às 15h.');

  assert.match(result.text, /armazenamento do navegador/);
  assert.equal(calls.length, 0);
});

test('falha no write do sessionStorage impede qualquer escrita da Agenda', async () => {
  const operationStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('write blocked'); },
  };
  const { flow, calls } = makeHarness([], { operationStorage });
  const result = await turn(flow, 'Tenho dentista amanhã às 15h.');

  assert.match(result.text, /proteger esta criação/);
  assert.equal(calls.length, 0);
});

test('falha no readback do sessionStorage impede qualquer escrita da Agenda', async () => {
  let persisted = null;
  const operationStorage = {
    getItem: () => (persisted ? `${persisted.slice(0, -1)},` : null),
    setItem: (_key, value) => { persisted = value; },
  };
  const { flow, calls } = makeHarness([], { operationStorage });
  const result = await turn(flow, 'Tenho dentista amanhã às 15h.');

  assert.match(result.text, /proteger esta criação/);
  assert.equal(calls.length, 0);
});

test('retry da mesma intenção reutiliza client_operation_id após falha', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const { flow, calls } = makeHarness([], {
    createOperationId: () => operationIds.shift(),
    createResults: [{ data: null, error: { code: 'timeout' } }],
  });

  const first = await turn(flow, 'Tenho dentista amanhã às 15h.');
  assert.match(first.text, /Tente novamente/);
  const retry = await turn(flow, 'Tenho dentista amanhã às 15h.');
  assert.match(retry.text, /Pronto/);

  const creates = calls.filter((call) => call.operation === 'create');
  assert.equal(creates.length, 2);
  assert.equal(creates[0].payload.client_operation_id, creates[1].payload.client_operation_id);
  assert.equal(operationIds.length, 1);
});

test('timeout depois do commit + reload + retry reutiliza client_operation_id persistido', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const operationStorage = createOperationStorage();
  const firstHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
    createResults: [{ data: null, error: { code: 'timeout' } }],
  });
  await turn(firstHarness.flow, 'Tenho dentista amanhã às 15h.');

  const reloadedHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(reloadedHarness.flow, 'Tenho dentista amanhã às 15h.');

  assert.equal(
    firstHarness.calls[0].payload.client_operation_id,
    reloadedHarness.calls[0].payload.client_operation_id,
  );
  assert.equal(operationIds.length, 1);
});

test('reload antes da confirmação restaura UUID ao repetir a intenção pendente', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const operationStorage = createOperationStorage();
  const firstHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(firstHarness.flow, 'Me lembra da reunião amanhã.');

  const reloadedHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(reloadedHarness.flow, 'Me lembra da reunião amanhã.');
  await turn(reloadedHarness.flow, 'Sem horário.');

  assert.equal(
    reloadedHarness.calls[0].payload.client_operation_id,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  assert.equal(operationIds.length, 1);
});

test('cancelamento explícito da intenção pendente limpa UUID restaurável', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const operationStorage = createOperationStorage();
  const firstHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(firstHarness.flow, 'Me lembra da reunião amanhã.');
  const canceled = await turn(firstHarness.flow, 'Cancelar.');
  assert.match(canceled.text, /Não alterei/);

  const nextHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(nextHarness.flow, 'Me lembra da reunião amanhã.');
  await turn(nextHarness.flow, 'Sem horário.');

  assert.equal(
    nextHarness.calls[0].payload.client_operation_id,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );
});

test('conflito idempotente explícito limpa a operação antes de nova intenção', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const operationStorage = createOperationStorage();
  const conflictHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
    createResults: [{ data: null, error: { code: 'AGENDA_ITEM_IDEMPOTENCY_CONFLICT' } }],
  });
  const conflict = await turn(conflictHarness.flow, 'Tenho dentista amanhã às 15h.');
  assert.match(conflict.text, /conflita/);

  const nextHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(nextHarness.flow, 'Tenho dentista amanhã às 15h.');

  assert.equal(
    nextHarness.calls[0].payload.client_operation_id,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );
});

test('duas intenções legítimas iguais após sucesso recebem UUIDs diferentes', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const { flow, calls } = makeHarness([], {
    createOperationId: () => operationIds.shift(),
  });

  await turn(flow, 'Tenho dentista amanhã às 15h.');
  await turn(flow, 'Tenho dentista amanhã às 15h.');

  const creates = calls.filter((call) => call.operation === 'create');
  assert.notEqual(
    creates[0].payload.client_operation_id,
    creates[1].payload.client_operation_id,
  );
});

test('intenção pendente mantém client_operation_id ao repetir a confirmação após falha', async () => {
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const { flow, calls } = makeHarness([], {
    createOperationId: () => operationId,
    createResults: [{ data: null, error: { code: 'timeout' } }],
  });

  await turn(flow, 'Me lembra da reunião amanhã.');
  await turn(flow, 'Sem horário.');
  await turn(flow, 'Sem horário.');

  const creates = calls.filter((call) => call.operation === 'create');
  assert.equal(creates.length, 2);
  assert.ok(creates.every((call) => call.payload.client_operation_id === operationId));
});

test('objeto vago pergunta o assunto e preserva a data já informada', async () => {
  const { flow, calls } = makeHarness();
  const first = await turn(flow, 'Bota aquele negócio pra sexta.');
  assert.match(first.text, /O que você quer/);
  const second = await turn(flow, 'Reunião do projeto.');
  assert.match(second.text, /horário/);
  await turn(flow, 'Sem horário.');
  assert.equal(calls.at(-1).payload.title, 'reuniao do projeto');
  assert.match(calls.at(-1).payload.starts_at, /^2026-08-14T/);
});

test('consulta vazia de amanhã responde sem inventar compromissos', async () => {
  const { flow } = makeHarness();
  const result = await turn(flow, 'O que tenho amanhã?');
  assert.equal(result.text, 'Você não tem compromissos nesse período.');
});

test('consulta de semana lista múltiplos compromissos reais', async () => {
  const { flow } = makeHarness([
    { id: 'a', workspace_id: IDENTITY.workspaceId, title: 'Dentista', starts_at: '2026-08-08T15:00:00.000Z' },
    { id: 'b', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-09T12:00:00.000Z' },
  ]);
  const result = await turn(flow, 'O que tenho esta semana?');
  assert.match(result.text, /Dentista/);
  assert.match(result.text, /Reunião/);
});

test('consulta de sexta usa a próxima sexta, não uma data passada', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'O que tenho na sexta?');
  assert.match(calls[0].filters.startsFrom, /^2026-08-14T/);
});

test('consulta do fim do mês usa o último dia do mês', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'O que tenho no fim do mês?');
  assert.match(calls[0].filters.startsFrom, /^2026-08-31T/);
});

test('edição encontra um item e altera somente o horário', async () => {
  const { flow, calls } = makeHarness([
    { id: 'dentista', workspace_id: IDENTITY.workspaceId, title: 'Dentista', starts_at: '2026-08-09T15:00:00.000Z' },
  ]);
  const result = await turn(flow, 'Muda meu dentista de amanhã para 16h.');
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.equal(new Date(update.changes.starts_at).getHours(), 16);
  assert.equal(update.options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
});

test('edição altera o título explicitamente sem perder o restante do item', async () => {
  const { flow, calls } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
  ]);

  const result = await turn(flow, 'Muda o título da reunião para Alinhamento semanal.');
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.equal(update.changes.title, 'alinhamento semanal');
  assert.equal(update.changes.starts_at, undefined);
});

test('edição altera somente o título sem exigir as palavras título ou nome', async () => {
  const { flow, calls } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
  ]);

  const result = await turn(flow, 'Muda minha reunião para alinhamento.');
  assert.match(result.text, /Atualizei/);
  assert.deepEqual(calls.find((call) => call.operation === 'update').changes, {
    title: 'alinhamento',
  });
});

test('edição combina título, data e horário numa única atualização', async () => {
  const { flow, calls } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
  ]);

  const result = await turn(
    flow,
    'Muda o título da reunião para alinhamento e a data para sexta que vem às 16h.',
  );
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.equal(update.changes.title, 'alinhamento');
  assert.match(update.changes.starts_at, /^2026-08-21T/);
  assert.equal(new Date(update.changes.starts_at).getHours(), 16);
});

test('edição implícita combina título, data e horário sem contaminar o título', async () => {
  const { flow, calls } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
  ]);

  const result = await turn(flow, 'Muda minha reunião para alinhamento sexta que vem às 16h.');
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.equal(update.changes.title, 'alinhamento');
  assert.match(update.changes.starts_at, /^2026-08-21T/);
  assert.equal(new Date(update.changes.starts_at).getHours(), 16);
});

for (const [text, expectedDate] of [
  ['Muda minha reunião para amanhã.', '2026-08-09'],
  ['Adia minha reunião para sexta.', '2026-08-14'],
  ['Passa minha consulta para segunda.', '2026-08-10'],
]) {
  test(`edição temporal preserva o título existente: ${text}`, async () => {
    const title = text.includes('consulta') ? 'Consulta' : 'Reunião';
    const { flow, calls } = makeHarness([
      { id: 'item', workspace_id: IDENTITY.workspaceId, title, starts_at: '2026-08-12T15:00:00.000Z' },
    ]);

    const result = await turn(flow, text);
    assert.match(result.text, /Atualizei/);
    const changes = calls.find((call) => call.operation === 'update').changes;
    assert.match(changes.starts_at, new RegExp(`^${expectedDate}T`));
    assert.equal(Object.hasOwn(changes, 'title'), false);
  });
}

test('edição altera a data e preserva o horário existente', async () => {
  const originalStartsAt = '2026-08-12T15:00:00.000Z';
  const { flow, calls } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: originalStartsAt },
  ]);

  const result = await turn(flow, 'Muda minha reunião para sexta que vem.');
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.match(update.changes.starts_at, /^2026-08-21T/);
  assert.equal(
    new Date(update.changes.starts_at).getHours(),
    new Date(originalStartsAt).getHours(),
  );
});

test('edição ambígua lista opções e aguarda escolha', async () => {
  const { flow } = makeHarness([
    { id: 'a', workspace_id: IDENTITY.workspaceId, title: 'Dentista A', starts_at: '2026-08-09T15:00:00.000Z' },
    { id: 'b', workspace_id: IDENTITY.workspaceId, title: 'Dentista B', starts_at: '2026-08-09T18:00:00.000Z' },
  ]);
  const result = await turn(flow, 'Muda meu dentista de amanhã para 16h.');
  assert.match(result.text, /Encontrei mais de um/);
  assert.equal(flow.hasPending(IDENTITY), true);
});

test('seleção parcial que ainda corresponde a dois itens não escolhe silenciosamente o primeiro', async () => {
  const { flow, calls } = makeHarness([
    { id: 'alpha', workspace_id: IDENTITY.workspaceId, title: 'Reunião projeto Alfa', starts_at: '2026-08-14T15:00:00.000Z' },
    { id: 'beta', workspace_id: IDENTITY.workspaceId, title: 'Reunião projeto Beta', starts_at: '2026-08-14T18:00:00.000Z' },
  ]);

  await turn(flow, 'Muda minha reunião de sexta para 16h.');
  const ambiguous = await turn(flow, 'Reunião projeto.');
  assert.match(ambiguous.text, /Ainda há mais de uma opção/);
  assert.equal(calls.filter((call) => call.operation === 'update').length, 0);

  const selected = await turn(flow, 'Reunião projeto Beta.');
  assert.match(selected.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.equal(update.itemId, 'beta');
});

test('conflito por updated_at impede confirmação antiga de sobrescrever edição recente', async () => {
  const { flow, calls, items } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
  ]);

  const first = await turn(flow, 'Muda minha reunião.');
  assert.match(first.text, /O que você quer alterar/);
  items[0].updated_at = '2026-08-08T10:30:00.000Z';

  const result = await turn(flow, 'Muda o título para Revisão final.');
  assert.match(result.text, /mudou desde que você o consultou/);
  assert.equal(items[0].title, 'Reunião');
  assert.equal(calls.at(-1).options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
});

test('conflito temporal-financeiro preserva escolha sem escrita e encaminha rascunho financeiro explícito', async () => {
  const { flow, calls } = makeHarness();
  const first = await turn(flow, 'Amanhã tenho que pagar 300 reais.');
  assert.match(first.text, /lembrete.*operação financeira/i);
  assert.equal(calls.length, 0);

  const choice = await turn(flow, 'Operação financeira.');
  assert.equal(choice.route, 'financial');
  assert.equal(choice.handled, true);
  assert.match(choice.financialText, /^Registre uma despesa:/);
  assert.equal(classifyIntent(choice.financialText).intent, 'register_expense');
  assert.equal(calls.length, 0);
});

test('escolha por lembrete continua pedindo horário e só grava depois da resposta', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Amanhã tenho que pagar 300 reais.');
  const choice = await turn(flow, 'Quero um lembrete na Agenda.');
  assert.match(choice.text, /horário/);
  assert.equal(calls.length, 0);

  await turn(flow, 'Sem horário.');
  assert.equal(calls.at(-1).operation, 'create');
  assert.equal(calls.at(-1).payload.item_type, 'reminder');
  assert.equal(calls.at(-1).payload.title, 'pagar 300 reais');
});

test('pendência de Agenda pode ser abandonada antes de uma nova declaração financeira', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Me lembra da reunião amanhã.');
  assert.equal(flow.hasPending(IDENTITY), true);
  assert.equal(flow.abandonPending(IDENTITY), true);

  const financial = await turn(flow, 'Gastei R$ 50 no almoço.');
  assert.equal(financial.handled, false);
  assert.equal(flow.hasPending(IDENTITY), false);
  assert.equal(calls.length, 0);
});

test('abandono automático por nova fala não apaga operação; apenas cancelamento explícito limpa', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const operationStorage = createOperationStorage();
  const firstHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(firstHarness.flow, 'Me lembra da reunião amanhã.');
  assert.equal(firstHarness.flow.abandonPending(IDENTITY), true);

  const restoredHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(restoredHarness.flow, 'Me lembra da reunião amanhã.');
  await turn(restoredHarness.flow, 'Sem horário.');

  assert.equal(
    restoredHarness.calls[0].payload.client_operation_id,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
});

test('conclusão marca o compromisso com a versão esperada', async () => {
  const { flow, calls, items } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-08T12:00:00.000Z' },
  ]);
  const result = await turn(flow, 'Já fiz aquela reunião. Pode marcar como concluída.');
  assert.match(result.text, /concluído/);
  assert.equal(items[0].status, 'completed');
  assert.equal(calls.at(-1).options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
});

test('cancelamento exige confirmação antes de alterar o status', async () => {
  const { flow, items } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-14T12:00:00.000Z' },
  ]);
  const first = await turn(flow, 'Cancela minha reunião de sexta.');
  assert.match(first.text, /Quer mesmo cancelar/);
  assert.equal(items[0].status, 'scheduled');
  const second = await turn(flow, 'Sim.');
  assert.match(second.text, /Cancelei/);
  assert.equal(items[0].status, 'cancelled');
});

test('confirmação antiga de cancelamento não sobrescreve alteração recente', async () => {
  const { flow, calls, items } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-14T12:00:00.000Z' },
  ]);
  await turn(flow, 'Cancela minha reunião de sexta.');
  items[0].updated_at = '2026-08-08T10:30:00.000Z';

  const result = await turn(flow, 'Sim.');
  assert.match(result.text, /mudou desde que você o consultou/);
  assert.equal(items[0].status, 'scheduled');
  assert.equal(calls.at(-1).options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
});

test('negação preserva o compromisso e encerra a confirmação', async () => {
  const { flow, items } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-14T12:00:00.000Z' },
  ]);
  await turn(flow, 'Cancela minha reunião de sexta.');
  const result = await turn(flow, 'Não.');
  assert.match(result.text, /Mantive/);
  assert.equal(items[0].status, 'scheduled');
  assert.equal(flow.hasPending(IDENTITY), false);
});

test('cancelamento ambíguo lista opções sem cancelar nenhuma', async () => {
  const { flow, items } = makeHarness([
    { id: 'a', workspace_id: IDENTITY.workspaceId, title: 'Reunião A', starts_at: '2026-08-14T12:00:00.000Z' },
    { id: 'b', workspace_id: IDENTITY.workspaceId, title: 'Reunião B', starts_at: '2026-08-14T18:00:00.000Z' },
  ]);
  const result = await turn(flow, 'Cancela minha reunião de sexta.');
  assert.match(result.text, /Encontrei mais de um/);
  assert.ok(items.every((item) => item.status === 'scheduled'));
});

test('exclusão exige confirmação e usa a operação real de delete', async () => {
  const { flow, calls, items } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-14T12:00:00.000Z' },
  ]);
  const first = await turn(flow, 'Excluir minha reunião de sexta.');
  assert.match(first.text, /Quer mesmo excluir/);
  assert.equal(items.length, 1);
  const second = await turn(flow, 'Confirmar.');
  assert.match(second.text, /Excluí/);
  assert.equal(items.length, 0);
  assert.equal(calls.at(-1).operation, 'delete');
});

test('isolamento de workspace impede encontrar item de outro espaço', async () => {
  const { flow } = makeHarness([
    { id: 'foreign', workspace_id: '22222222-2222-4222-8222-222222222222', title: 'Reunião', starts_at: '2026-08-14T12:00:00.000Z' },
  ]);
  const result = await turn(flow, 'Cancela minha reunião de sexta.');
  assert.match(result.text, /Não encontrei/);
});

test('frase financeira não é capturada pelo fluxo de Agenda', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Gastei R$ 50 no almoço.');
  assert.equal(result.handled, false);
  assert.equal(calls.length, 0);
});

test('falha do serviço vira resposta segura e curta', async () => {
  const services = {
    createAgendaItem: async () => ({ data: null, error: { code: 'offline' } }),
    listAgendaItems: async () => ({ data: [], error: { code: 'offline' } }),
    updateAgendaItem: async () => ({ data: null, error: { code: 'offline' } }),
    setAgendaItemStatus: async () => ({ data: null, error: { code: 'offline' } }),
    deleteAgendaItem: async () => ({ data: null, error: { code: 'offline' } }),
  };
  const flow = createAgendaConversationFlow({ services });
  const result = await turn(flow, 'Tenho dentista amanhã às 15h.');
  assert.match(result.text, /Tente novamente/);
});
