import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyIntent } from '../uni-intents/index.js';
import {
  AGENDA_TIME_CLASSIFICATION,
  classifyAgendaTemporalRegion,
  createAgendaConversationFlow,
  extractAgendaTime,
} from './agendaConversationFlow.js';

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
  observationFollowupEnabled = false,
  operationStorage = createOperationStorage(),
  now,
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
    async deleteAgendaItem(workspaceId, itemId, options = {}) {
      calls.push({ operation: 'delete', workspaceId, itemId, options });
      const index = items.findIndex((candidate) => candidate.id === itemId && candidate.workspace_id === workspaceId);
      if (index < 0) return { data: null, error: { code: 'not_found' } };
      if (options.expectedUpdatedAt && options.expectedUpdatedAt !== items[index].updated_at) {
        return { data: null, error: { code: 'AGENDA_ITEM_CONFLICT' } };
      }
      const [data] = items.splice(index, 1);
      return { data: { id: data.id }, error: null };
    },
  };
  return {
    flow: createAgendaConversationFlow({
      services,
      createOperationId,
      idempotencyEnabled,
      observationFollowupEnabled,
      operationStorage,
      now,
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

function normalizeFinancialTextForTest(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

test('criação relativa sem horário cria diretamente sem confundir com dia inteiro', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Me lembra da reunião daqui 10 dias.');
  assert.match(result.text, /sem horário/);
  assert.equal(calls[0].operation, 'create');
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(calls[0].payload.is_all_day, false);
  assert.equal(calls[0].payload.has_explicit_time, false);
  assert.equal(flow.hasPending(IDENTITY), false);
});

test('pending temporal inválido rejeita Sem horário e preserva a operação até correção válida', async () => {
  const operationId = '10101010-1010-4010-8010-101010101010';
  const { flow, calls } = makeHarness([], { createOperationId: () => operationId });
  assert.match(
    (await turn(flow, 'Me lembra da reunião daqui 10 dias às 10h60.')).text,
    /entender o horário/i,
  );
  assert.equal(calls.length, 0);
  const blocked = await turn(flow, 'Pode deixar sem horário.');
  assert.match(blocked.text, /precisa ser corrigido/i);
  assert.equal(calls.length, 0);
  assert.equal(flow.hasPending(IDENTITY), true);

  const result = await turn(flow, 'às 15h');
  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].operation, 'create');
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(calls[0].payload.is_all_day, false);
  assert.equal(calls[0].payload.has_explicit_time, true);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.match(calls[0].payload.starts_at, /^2026-08-18T/);
  assert.equal(calls[0].payload.client_operation_id, operationId);
  assert.equal(flow.hasPending(IDENTITY), false);
});

const TEMPORAL_REPAIR_CASES = [
  ['INVALID_TIME', 'Agenda reunião amanhã às 25h.'],
  ['TIME_RANGE', 'Agenda reunião amanhã 10h até 11h.'],
  ['MULTI_TIME', 'Agenda reunião amanhã às 10h e às 11h.'],
];

const TEMPORAL_REPAIR_REPLIES = [
  ['Sem horário', 'Sem horário.', 'repair'],
  ['Dia inteiro', 'Dia inteiro.', 'repair'],
  ['horário válido', 'às 15h', 'create'],
  ['outro inválido', 'às 26h', 'repair'],
  ['cancelamento', 'Cancela.', 'cancel'],
];

for (const [classification, initialText] of TEMPORAL_REPAIR_CASES) {
  for (const [replyLabel, reply, expected] of TEMPORAL_REPAIR_REPLIES) {
    test(`reparo ${classification} -> ${replyLabel}`, async () => {
      const { flow, calls } = makeHarness();

      assert.match((await turn(flow, initialText)).text, /entender o horário/i);
      assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);

      const result = await turn(flow, reply);
      const writes = calls.filter((call) => ['create', 'update', 'status', 'delete'].includes(call.operation));
      if (expected === 'create') {
        assert.match(result.text, /Pronto/);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].operation, 'create');
        assert.equal(writes[0].payload.title, 'reuniao');
        assert.equal(writes[0].payload.has_explicit_time, true);
        assert.equal(writes[0].payload.is_all_day, false);
        assert.equal(new Date(writes[0].payload.starts_at).getHours(), 15);
        assert.equal(flow.hasPending(IDENTITY), false);
      } else if (expected === 'cancel') {
        assert.match(result.text, /Não alterei/);
        assert.equal(writes.length, 0);
        assert.equal(flow.hasPending(IDENTITY), false);
      } else {
        assert.match(result.text, /(?:precisa ser corrigido|entender o horário)/i);
        assert.equal(writes.length, 0);
        assert.equal(flow.hasPending(IDENTITY), true);
      }
    });
  }
}

test('reparo temporal aceita correção coloquial válida', async () => {
  const { flow, calls } = makeHarness();

  assert.match((await turn(flow, 'Agenda reunião amanhã às 25h.')).text, /entender o horário/i);
  assert.match((await turn(flow, 'três e meia da tarde')).text, /Pronto/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 30);
});

test('não agenda cancela explicitamente o reparo temporal sem write', async () => {
  const { flow, calls } = makeHarness();

  assert.match((await turn(flow, 'Agenda reunião amanhã 10h até 11h.')).text, /entender o horário/i);
  assert.match((await turn(flow, 'Não agenda.')).text, /Não alterei/);
  assert.equal(calls.some((call) => ['create', 'update', 'status', 'delete'].includes(call.operation)), false);
  assert.equal(flow.hasPending(IDENTITY), false);
});

test('quantidade e INVALID_TIME rejeitam Sem horário preservando título, data e UUID até a correção', async () => {
  const operationId = '20202020-2020-4020-8020-202020202020';
  const { flow, calls } = makeHarness([], { createOperationId: () => operationId });

  assert.match(
    (await turn(flow, 'Agenda reunião para 11 alunos amanhã às 25h.')).text,
    /entender o horário/i,
  );
  assert.match((await turn(flow, 'Sem horário.')).text, /precisa ser corrigido/i);
  assert.equal(calls.length, 0);
  assert.equal(flow.hasPending(IDENTITY), true);

  assert.match((await turn(flow, 'às 10h')).text, /Pronto/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.title, 'reuniao para 11 alunos');
  assert.equal(calls[0].payload.client_operation_id, operationId);
  assert.equal(calls[0].payload.has_explicit_time, true);
  assert.equal(calls[0].payload.is_all_day, false);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.match(calls[0].payload.starts_at, /^2026-08-09T/);
});

test('criação com horário salva dentista amanhã às 15h', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Tenho dentista amanhã às 15h.');
  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'dentista');
  assert.equal(calls[0].payload.is_all_day, false);
  assert.equal(calls[0].payload.has_explicit_time, true);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.match(calls[0].payload.starts_at, /^2026-08-09T/);
});

test('contrato semântico: reunião empresarial separa título, data e horário', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião empresarial amanhã às 10 horas.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao empresarial');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(calls[0].payload.has_explicit_time, true);
  assert.equal(calls[0].payload.is_all_day, false);
});

for (const [text, expectedTitle] of [
  ['Agenda reunião empresarial amanhã.', 'reuniao empresarial'],
  ['Agenda consulta amanhã.', 'consulta'],
  ['Agenda dentista sexta.', 'dentista'],
  ['Marca reunião empresarial dia 15.', 'reuniao empresarial'],
  ['Agenda conversa com João amanhã.', 'conversa com joao'],
]) {
  test(`data inequívoca sem horário cria diretamente: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, text);

    assert.match(result.text, /Pronto/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.title, expectedTitle);
    assert.equal(calls[0].payload.has_explicit_time, false);
    assert.equal(calls[0].payload.is_all_day, false);
    assert.equal(flow.hasPending(IDENTITY), false);
  });
}

test('pending por data ausente aceita horário posterior sem reconstruir o título', async () => {
  const { flow, calls } = makeHarness();
  assert.match((await turn(flow, 'Agenda reunião empresarial.')).text, /qual dia/i);
  const result = await turn(flow, 'amanhã às três e meia da tarde');

  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao empresarial');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 30);
  assert.equal(calls[0].payload.has_explicit_time, true);
  assert.equal(calls[0].payload.is_all_day, false);
});

test('meia-noite é 00:00 explícito e não Sem horário', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda manutenção amanhã à meia-noite.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'manutencao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 0);
  assert.equal(calls[0].payload.has_explicit_time, true);
  assert.equal(calls[0].payload.is_all_day, false);
});

test('dia inteiro é distinto de compromisso sem horário', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião empresarial amanhã o dia inteiro.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao empresarial');
  assert.equal(calls[0].payload.has_explicit_time, false);
  assert.equal(calls[0].payload.is_all_day, true);
});

for (const [spokenHour, expectedHour] of [
  ['uma hora', 1], ['duas horas', 2], ['três horas', 3], ['quatro horas', 4],
  ['cinco horas', 5], ['seis horas', 6], ['sete horas', 7], ['oito horas', 8],
  ['nove horas', 9], ['dez horas', 10], ['onze horas', 11], ['doze horas', 12],
  ['treze horas', 13], ['quatorze horas', 14], ['quinze horas', 15],
  ['dezesseis horas', 16], ['dezessete horas', 17], ['dezoito horas', 18],
  ['dezenove horas', 19], ['vinte horas', 20], ['vinte e uma horas', 21],
  ['vinte e duas horas', 22], ['vinte e três horas', 23],
]) {
  test(`criação aceita hora por extenso: ${spokenHour}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, `Tenho uma reunião amanhã às ${spokenHour}.`);

    assert.match(result.text, /Pronto/);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), expectedHour);
    assert.equal(calls[0].payload.title, 'reuniao');
  });
}

test('criação aceita hora por extenso sem a palavra horas', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda uma reunião amanhã às dez.');

  assert.match(result.text, /10 da manhã.*10 da noite/i);
  assert.match((await turn(flow, 'da manhã')).text, /Pronto/);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(calls[0].payload.title, 'reuniao');
});

for (const [text, expected] of [
  ['às três e meia da tarde', '15:30'],
  ['umas três e meia da tarde', '15:30'],
  ['às três e trinta da tarde', '15:30'],
  ['umas três e trinta da tarde', '15:30'],
  ['três e meia', '03:30'],
  ['três e trinta', '03:30'],
  ['beleza, 15h30', '15:30'],
  ['sim, 15:30', '15:30'],
  ['isso, às três e meia', '03:30'],
  ['pode ser três e meia', '03:30'],
  ['coloca às três e meia', '03:30'],
  ['então, 15h30', '15:30'],
  ['certo, 15:30', '15:30'],
]) {
  test(`Preview R1: parser PT-BR reconhece horário coloquial: ${text}`, () => {
    assert.equal(extractAgendaTime(text, { allowContextual: true }), expected);
  });
}

test('NON_TEMPORAL_CONTENT quantitativo não encerra descoberta do relógio posterior', async () => {
  const { flow, calls } = makeHarness();
  const text = 'Agenda avaliação às três e meia pontos amanhã às 10h.';
  const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

  assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME);
  assert.equal(analysis.resolvedTime, '10:00');
  assert.equal(analysis.clockTimes.length, 1);
  assert.match((await turn(flow, text)).text, /Pronto/);
  assert.match(calls[0].payload.title, /tres e meia pontos/);
  assert.doesNotMatch(calls[0].payload.title, /10h|10 horas/);
  assert.equal(calls[0].payload.has_explicit_time, true);
});

for (const text of [
  'Comprei meia dúzia de ovos.',
  'Esperei três horas e meia na fila.',
  'Tenho três e trinta parcelas.',
  'A nota ficou três e meia.',
  'Meia entrada para três pessoas.',
]) {
  test(`Preview R1: meia/trinta fora de horário não vira horário: ${text}`, () => {
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
  });
}

test('Preview R1: criação coloquial com período explícito salva 15:30 sem contaminar título', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Marca uma reunião para sexta-feira às três e meia da tarde.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 30);
});

test('Preview R1: pending preserva intenção e aguarda período após resposta conversacional ambígua', async () => {
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const { flow, calls } = makeHarness([], { createOperationId: () => operationId });

  const first = await turn(flow, 'Marca uma reunião para sexta-feira umas três e trinta.');
  assert.match(first.text, /manhã|tarde/i);
  const second = await turn(flow, 'Sim, às três e trinta.');
  assert.match(second.text, /manhã|tarde/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);

  const final = await turn(flow, 'da tarde');
  assert.match(final.text, /Pronto/);
  const create = calls.find((call) => call.operation === 'create');
  assert.equal(create.payload.title, 'reuniao');
  assert.equal(create.payload.client_operation_id, operationId);
  assert.match(create.payload.starts_at, /^2026-08-14T/);
  assert.equal(new Date(create.payload.starts_at).getHours(), 15);
  assert.equal(new Date(create.payload.starts_at).getMinutes(), 30);
});

for (const answer of [
  'três e trinta',
  'às três e trinta',
  'pode ser três e meia',
  'isso, 15h30',
  'sim, às três e meia da tarde',
]) {
  test(`Preview R1: resposta humana alimenta a mesma pendência: ${answer}`, async () => {
    const { flow, calls } = makeHarness();
    await turn(flow, 'Marca uma reunião para sexta-feira às 25h.');
    const result = await turn(flow, answer);

    if (/15h30|da tarde/.test(answer)) {
      assert.match(result.text, /Pronto/);
      assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
    } else {
      assert.match(result.text, /manhã|tarde/i);
      assert.equal(calls.some((call) => call.operation === 'create'), false);
    }
  });
}

for (const answer of ['beleza, 15h30', 'coloca 15h30', 'então, 15h30', 'certo, 15:30']) {
  test(`Preview R1: prefixo conversacional não reinicia a pendência: ${answer}`, async () => {
    const operationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { flow, calls } = makeHarness([], { createOperationId: () => operationId });
    await turn(flow, 'Marca uma reunião para sexta-feira às 25h.');
    const result = await turn(flow, answer);

    assert.match(result.text, /Pronto/);
    assert.equal(calls[0].payload.title, 'reuniao');
    assert.equal(calls[0].payload.client_operation_id, operationId);
    assert.match(calls[0].payload.starts_at, /^2026-08-14T/);
  });
}

test('Preview R1: amanhã às 10 pede manhã/noite e preserva a criação até a resposta', async () => {
  const { flow, calls } = makeHarness();
  const first = await turn(flow, 'Agenda reunião amanhã às 10.');

  assert.match(first.text, /10 da manhã.*10 da noite/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
  const final = await turn(flow, 'da noite');
  assert.match(final.text, /Pronto/);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 22);
});

for (const [reply, expectedHour] of [
  ['da manhã', 10],
  ['10 da manhã', 10],
  ['da noite', 22],
  ['10 da noite', 22],
]) {
  test(`Preview R1: resposta de período resolve horário ambíguo: ${reply}`, async () => {
    const { flow, calls } = makeHarness();
    await turn(flow, 'Agenda reunião amanhã às 10.');
    const result = await turn(flow, reply);
    assert.match(result.text, /Pronto/);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), expectedHour);
  });
}

test('Preview R1: hoje antes das 10 pergunta manhã/noite sem criar', async () => {
  const { flow, calls } = makeHarness([], { now: () => new Date(2026, 7, 8, 8, 0, 0) });
  const result = await turn(flow, 'Agenda reunião hoje às 10.');

  assert.match(result.text, /10 da manhã.*10 da noite/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
});

test('Preview R1: hoje depois das 10 oferece 22h e só cria após confirmação', async () => {
  const { flow, calls } = makeHarness([], { now: () => new Date(2026, 7, 8, 14, 0, 0) });
  const first = await turn(flow, 'Agenda reunião hoje às 10.');

  assert.match(first.text, /10 da manhã já passou.*22h/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
  assert.match((await turn(flow, 'sim')).text, /Pronto/);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 22);
});

for (const [time, expectedHour] of [['15h', 15], ['15:30', 15], ['22h', 22]]) {
  test(`Preview R1: formato 24h explícito não pede AM/PM: ${time}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, `Agenda reunião amanhã às ${time}.`);

    assert.match(result.text, /Pronto/);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), expectedHour);
  });
}

test('Preview R1: finalidade explícita vira observação sem inventar descrição', async () => {
  const withDescription = makeHarness();
  await turn(withDescription.flow, 'Reunião com João para falar sobre vendas amanhã às 10h.');
  assert.equal(withDescription.calls[0].payload.title, 'reuniao com joao');
  assert.equal(withDescription.calls[0].payload.description, 'Falar sobre vendas');

  const withoutDescription = makeHarness();
  await turn(withoutDescription.flow, 'Reunião com João amanhã às 10h.');
  assert.equal(withoutDescription.calls[0].payload.description, undefined);
});

test('Preview R1: consulta com instrução explícita preserva observação', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Consulta com Dr. Paulo para levar os exames amanhã às 14h.');

  assert.equal(calls[0].payload.title, 'consulta com dr paulo');
  assert.equal(calls[0].payload.description, 'Levar os exames');
});

for (const [expression, expected] of [
  ['dez e quinze', '10:15'],
  ['dez e quarenta', '10:40'],
  ['três e meia', '03:30'],
  ['três e trinta', '03:30'],
  ['uma e quinze', '01:15'],
  ['duas e quarenta e cinco', '02:45'],
  ['10 e 15', '10:15'],
  ['10 e 59', '10:59'],
  ['10 e 00', '10:00'],
]) {
  test(`P1 parse parcial: minuto falado válido é consumido integralmente: ${expression}`, () => {
    assert.equal(
      extractAgendaTime(`Agenda reunião amanhã às ${expression}.`, { allowContextual: true }),
      expected,
    );
  });
}

test('P1 parse parcial: dez e quinze preserva :15 durante clarificação AM/PM', async () => {
  const { flow, calls } = makeHarness();
  const first = await turn(flow, 'Agenda reunião amanhã às dez e quinze.');
  assert.match(first.text, /10:15 da manhã.*10:15 da noite/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);

  assert.match((await turn(flow, 'da manhã')).text, /Pronto/);
  const createdAt = new Date(calls[0].payload.starts_at);
  assert.equal(createdAt.getHours(), 10);
  assert.equal(createdAt.getMinutes(), 15);
});

test('P1 parse parcial: dez e quarenta preserva :40 ao resolver para noite', async () => {
  const { flow, calls } = makeHarness();
  const first = await turn(flow, 'Agenda reunião amanhã às dez e quarenta.');
  assert.match(first.text, /10:40 da manhã.*10:40 da noite/i);
  assert.match((await turn(flow, 'da noite')).text, /Pronto/);

  const createdAt = new Date(calls[0].payload.starts_at);
  assert.equal(createdAt.getHours(), 22);
  assert.equal(createdAt.getMinutes(), 40);
});

test('P1 parse parcial: resposta conversacional preserva pending, data, título e minutos', async () => {
  const operationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const { flow, calls } = makeHarness([], { createOperationId: () => operationId });
  await turn(flow, 'Agenda reunião amanhã às 25h.');
  assert.match((await turn(flow, 'sim, às três e trinta')).text, /3:30 da madrugada.*3:30 da tarde/i);
  assert.match((await turn(flow, 'da tarde')).text, /Pronto/);

  const create = calls.find((call) => call.operation === 'create');
  assert.equal(create.payload.title, 'reuniao');
  assert.equal(create.payload.client_operation_id, operationId);
  assert.match(create.payload.starts_at, /^2026-08-09T/);
  assert.equal(new Date(create.payload.starts_at).getHours(), 15);
  assert.equal(new Date(create.payload.starts_at).getMinutes(), 30);
});

test('P1 parse parcial: "isso, três e meia da tarde" resolve pending como 15:30', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Agenda reunião amanhã às 25h.');
  assert.match((await turn(flow, 'isso, três e meia da tarde')).text, /Pronto/);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 30);
});

for (const [text, expected] of [
  ['Agenda amanhã dez horas.', '10:00'],
  ['Agenda amanhã dez.', '10:00'],
  ['Agenda sexta quinze horas.', '15:00'],
  ['Agenda terça duas da tarde.', '14:00'],
  ['Agenda terça 2 da tarde.', '14:00'],
  ['Agenda oito da noite.', '20:00'],
  ['Agenda 8 da noite.', '20:00'],
  ['Agenda doze da tarde.', '12:00'],
  ['Agenda doze da noite.', '00:00'],
  ['Agenda hoje dezenove horas.', '19:00'],
  ['Agenda dia 20 quatorze horas.', '14:00'],
  ['Agenda sexta que vem dezesseis horas.', '16:00'],
  ['Agenda amanhã 10.', '10:00'],
  ['Agenda amanhã 10h.', '10:00'],
  ['Agenda amanhã 10:00.', '10:00'],
  ['Agenda amanhã 10h30.', '10:30'],
]) {
  test(`parser direto extrai horário contextual: ${text}`, () => {
    assert.equal(extractAgendaTime(text, { allowContextual: true }), expected);
  });
}

for (const [dateContext, timeExpression, expected] of [
  ['hoje', 'dezenove horas', '19:00'],
  ['hoje', '19h', '19:00'],
  ['amanhã', 'dez', '10:00'],
  ['amanhã', '10h30', '10:30'],
  ['sexta', 'quinze horas', '15:00'],
  ['sexta', '15h', '15:00'],
  ['sexta que vem', 'dezesseis horas', '16:00'],
  ['sexta que vem', '16:00', '16:00'],
  ['dia 20', 'quatorze horas', '14:00'],
  ['dia 20', '14h', '14:00'],
]) {
  test(`matriz contextual ${dateContext} + ${timeExpression}`, () => {
    assert.equal(
      extractAgendaTime(`Agenda ${dateContext} ${timeExpression}`, { allowContextual: true }),
      expected,
    );
  });
}

for (const text of ['Agenda amanhã 24h.', 'Agenda amanhã 10h60.']) {
  test(`parser direto rejeita horário inválido: ${text}`, () => {
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
  });
}

for (const text of [
  'Agenda reunião amanhã dez e sessenta.',
  'Agenda reunião amanhã 10h60.',
  'Agenda reunião amanhã 25 horas.',
  'Agenda reunião amanhã vinte e cinco horas.',
  'Agenda reunião amanhã dez e setenta.',
  'Agenda reunião amanhã duas e sessenta da tarde.',
  'Agenda reunião amanhã 24h30.',
  'Agenda reunião amanhã trinta horas.',
]) {
  test(`parser rejeita a expressão temporal inválida inteira: ${text}`, () => {
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
  });
}

for (const expression of [
  'dez e sessenta',
  'dez e setenta',
  'dez e noventa',
  '10 e 60',
  '10 e 75',
  '10h60',
  '10:60',
  '23h60',
]) {
  test(`P1 parse parcial: minuto inválido é rejeitado como span atômico: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, `Agenda reunião amanhã às ${expression}.`);

    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
    assert.equal(calls.some((call) => call.operation === 'update'), false);
    assert.equal(extractAgendaTime(`Agenda reunião amanhã às ${expression}.`, { allowContextual: true }), null);
    assert.equal(flow.hasPending(IDENTITY), true);
  });
}

test('P1 parse parcial: recuperação inválido -> válido -> AM preserva a mesma criação', async () => {
  const operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const { flow, calls } = makeHarness([], { createOperationId: () => operationId });
  assert.match((await turn(flow, 'Agenda reunião amanhã às dez e sessenta.')).text, /entender o horário/i);
  assert.match((await turn(flow, 'dez e quinze.')).text, /10:15 da manhã.*10:15 da noite/i);
  assert.match((await turn(flow, 'da manhã')).text, /Pronto/);

  const create = calls.find((call) => call.operation === 'create');
  assert.equal(create.payload.title, 'reuniao');
  assert.equal(create.payload.client_operation_id, operationId);
  assert.match(create.payload.starts_at, /^2026-08-09T/);
  assert.equal(new Date(create.payload.starts_at).getHours(), 10);
  assert.equal(new Date(create.payload.starts_at).getMinutes(), 15);
});

test('P1 parse parcial: recuperação inválido -> inválido -> válido não cria parcialmente', async () => {
  const { flow, calls } = makeHarness();
  assert.match((await turn(flow, 'Agenda reunião amanhã às 10 e 60.')).text, /entender o horário/i);
  assert.match((await turn(flow, '10 e 75')).text, /entender o horário/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
  assert.match((await turn(flow, 'dez e quarenta')).text, /10:40 da manhã.*10:40 da noite/i);
  assert.match((await turn(flow, 'da noite')).text, /Pronto/);
  assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 40);
});

for (const text of [
  'Paguei dez e sessenta reais.',
  'Tenho dez e quinze parcelas.',
  'Trabalhei dez horas e quarenta minutos.',
  'Minha nota foi três e meia.',
  'Comprei meia dúzia.',
  'Tenho reunião com 10 pessoas.',
]) {
  test(`P1 parse parcial: quantidade/dinheiro/duração não vira horário: ${text}`, () => {
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
  });
}

test('P2: "10h até 11 pessoas" mantém 10h como horário único, não como range', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião amanhã 10h até 11 pessoas');

  assert.match(result.text, /Pronto/);
  assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(calls[0].payload.title, 'reuniao ate 11 pessoas');
});

for (const expression of [
  'dez h e sessenta',
  'dez h e 60',
  'dez horas e sessenta',
  'dez horas e 60',
  '10 h e sessenta',
  '10 h e 60',
  '10 horas e sessenta',
  '10 horas e 60',
  '10h e sessenta',
  '10h e 60',
  '10 e sessenta minutos',
  '10 horas e 60 minutos',
  'dez horas e sessenta minutos',
  'dez h e 61',
  'dez h e 70',
  'dez h e 75',
  'dez h e 80',
  'dez h e 90',
  'dez h e 99',
]) {
  test(`P1-A híbrido: rejeita atomicamente ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, `Agenda reunião amanhã às ${expression}.`);

    assert.match(result.text, /entender o horário/i);
    assert.doesNotMatch(result.text, /manhã.*noite/i);
    assert.equal(extractAgendaTime(`Agenda reunião amanhã às ${expression}.`, { allowContextual: true }), null);
    assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  });
}

test('P1-A híbrido: recuperação remove todo resíduo temporal do título e preserva UUID', async () => {
  const operationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const { flow, calls } = makeHarness([], { createOperationId: () => operationId });
  assert.match((await turn(flow, 'Agenda reunião amanhã às dez h e sessenta.')).text, /entender o horário/i);
  assert.match((await turn(flow, 'dez e quinze da manhã')).text, /Pronto/);

  const create = calls.find((call) => call.operation === 'create');
  assert.equal(create.payload.title, 'reuniao');
  assert.equal(create.payload.client_operation_id, operationId);
  assert.equal(new Date(create.payload.starts_at).getHours(), 10);
  assert.equal(new Date(create.payload.starts_at).getMinutes(), 15);
});

for (const [suffix, expectedTitle] of [
  ['para 11 pessoas', 'reuniao para 11 pessoas'],
  ['para 11 clientes', 'reuniao para 11 clientes'],
  ['para 11 convidados', 'reuniao para 11 convidados'],
  ['para 11 participantes', 'reuniao para 11 participantes'],
  ['com 11 pessoas', 'reuniao com 11 pessoas'],
  ['com 11 clientes', 'reuniao com 11 clientes'],
  ['com 11 convidados', 'reuniao com 11 convidados'],
  ['com 11 participantes', 'reuniao com 11 participantes'],
  ['para duas pessoas', 'reuniao para duas pessoas'],
  ['para vinte pessoas', 'reuniao para vinte pessoas'],
  ['com três clientes', 'reuniao com tres clientes'],
  ['com quinze convidados', 'reuniao com quinze convidados'],
  ['até 11 pessoas', 'reuniao ate 11 pessoas'],
  ['até 11 clientes', 'reuniao ate 11 clientes'],
  ['até 11 convidados', 'reuniao ate 11 convidados'],
  ['até 11 participantes', 'reuniao ate 11 participantes'],
]) {
  test(`P1-B quantidade: 10h permanece horário e título preserva "${suffix}"`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, `Agenda reunião amanhã 10h ${suffix}.`);

    assert.match(result.text, /Pronto/);
    assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
    assert.equal(calls[0].payload.title, expectedTitle);
  });
}

for (const [text, expectedTitle] of [
  ['Reunião sobre vendas amanhã às 10h para 5 pessoas.', 'reuniao sobre vendas para 5 pessoas'],
  ['Reunião com João amanhã às 10h.', 'reuniao com joao'],
]) {
  test(`extração de título preserva conectores legítimos: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    assert.match((await turn(flow, text)).text, /Pronto/);
    assert.equal(calls[0].payload.title, expectedTitle);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  });
}

for (const expression of [
  'três e meia parcelas',
  'três e meia pessoas',
  'três e meia avaliações',
  'três e meia unidades',
]) {
  test(`P2 meia: substantivo quantitativo impede promoção a horário: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã às ${expression}.`;
    const result = await turn(flow, text);

    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
    assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
    assert.equal(calls[0].payload.has_explicit_time, false);
    assert.equal(calls[0].payload.is_all_day, false);
    assert.doesNotMatch(result.text, /manhã.*(?:tarde|noite)/i);
  });
}

test('P2 meia: casos temporais válidos continuam preservados', async () => {
  const ambiguous = makeHarness();
  assert.match(
    (await turn(ambiguous.flow, 'Agenda reunião amanhã às três e meia.')).text,
    /3:30 da madrugada.*3:30 da tarde/i,
  );
  assert.match((await turn(ambiguous.flow, 'da tarde')).text, /Pronto/);
  assert.equal(new Date(ambiguous.calls[0].payload.starts_at).getHours(), 15);
  assert.equal(new Date(ambiguous.calls[0].payload.starts_at).getMinutes(), 30);

  const explicit = makeHarness();
  assert.match(
    (await turn(explicit.flow, 'Agenda reunião amanhã às três e meia da tarde.')).text,
    /Pronto/,
  );
  assert.equal(new Date(explicit.calls[0].payload.starts_at).getHours(), 15);
  assert.equal(new Date(explicit.calls[0].payload.starts_at).getMinutes(), 30);
});

test('pending aceita "pode ser dez e quinze da noite" sem perder contexto', async () => {
  const operationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const { flow, calls } = makeHarness([], { createOperationId: () => operationId });
  await turn(flow, 'Agenda reunião amanhã às 25h.');
  assert.match((await turn(flow, 'pode ser dez e quinze da noite')).text, /Pronto/);

  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(calls[0].payload.client_operation_id, operationId);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 22);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 15);
});

for (const text of [
  'Paguei dez e quinze reais.',
  'Paguei dez e sessenta reais.',
  'Tenho quinze parcelas.',
  'Tenho três e meia parcelas.',
  'Minha nota foi três e meia.',
  'Comprei meia dúzia.',
  'Tenho onze clientes.',
  'Tenho reunião com onze pessoas.',
  'Trabalhei dez horas.',
  'Trabalhei dez horas e trinta minutos.',
  'A viagem dura dez horas e meia.',
  'Avaliação três e meia.',
]) {
  test(`matriz final de falso positivo não extrai horário: ${text}`, () => {
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
  });
}

for (const noun of [
  'alunos', 'funcionários', 'fornecedores', 'vendedores', 'sócios',
  'crianças', 'adultos', 'médicos', 'professores', 'empresas',
]) {
  test(`P1-01 estrutural: quantidade genérica preserva 10h e o substantivo ${noun}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã 10h para 11 ${noun}.`;
    const classification = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(classification.kind, AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY);
    assert.equal(classification.time, '10:00');
    assert.match((await turn(flow, text)).text, /Pronto/);
    assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
    assert.equal(calls[0].payload.title, `reuniao para 11 ${normalizeFinancialTextForTest(noun)}`);
  });
}

for (const [suffix, expectedTitle] of [
  ['com 11 alunos', 'reuniao com 11 alunos'],
  ['com onze funcionários', 'reuniao com onze funcionarios'],
  ['para vinte clientes', 'reuniao para vinte clientes'],
  ['com três fornecedores', 'reuniao com tres fornecedores'],
]) {
  test(`P1-01 estrutural: número falado não substitui o horário em "${suffix}"`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã 10h ${suffix}.`;

    assert.equal(
      classifyAgendaTemporalRegion(text, { allowContextual: true }).kind,
      AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY,
    );
    assert.match((await turn(flow, text)).text, /Pronto/);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
    assert.equal(calls[0].payload.title, expectedTitle);
  });
}

for (const noun of [
  'alunos', 'clientes', 'convidados', 'participantes', 'fornecedores', 'vendedores', 'empresas',
]) {
  test(`quantidade com até é conteúdo, não range: ${noun}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã 10h até 11 ${noun}.`;
    const classification = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(classification.kind, AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY);
    assert.equal(classification.time, '10:00');
    assert.match((await turn(flow, text)).text, /Pronto/);
    assert.equal(calls[0].payload.title, `reuniao ate 11 ${noun}`);
  });
}

for (const expression of [
  '10h para 11h',
  '10h para às 11h',
  'dez horas para onze horas',
  '10:30 para 11:30',
  '10h para 11h da manhã',
  '10h para 11h da noite',
  '10h para 11',
  '10h para 11 da manhã',
  'dez horas para onze da noite',
]) {
  test(`P1-02: dois horários com para pedem esclarecimento atomicamente: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã ${expression}.`;
    const classification = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(classification.kind, AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME);
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
    assert.match((await turn(flow, text)).text, /entender o horário/i);
    assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  });
}

for (const expression of [
  '10h e 11h',
  '10h e às 11h',
  'às 10h e às 11h',
  'dez e onze horas',
  'dez horas e onze horas',
  '10:30 e 11:30',
]) {
  test(`P1-03: dois horários com e nunca viram SINGLE_TIME: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã ${expression}.`;
    const classification = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(classification.kind, AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME);
    assert.equal(classification.time, null);
    assert.match((await turn(flow, text)).text, /entender o horário/i);
    assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  });
}

for (const expression of [
  'das 10h às 11h',
  'de 10h a 11h',
  'entre 10h e 11h',
  '10h até 11h',
  '10h até às 11h',
  '10h às 11h',
]) {
  test(`range real recebe decisão estrutural única: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã ${expression}.`;
    const classification = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(classification.kind, AGENDA_TIME_CLASSIFICATION.TIME_RANGE);
    assert.equal(classification.time, null);
    assert.match((await turn(flow, text)).text, /entender o horário/i);
    assert.equal(calls.some((call) => 'create' === call.operation), false);
  });
}

for (const [expression, expected] of [
  ['dez h 15', '10:15'],
  ['dez h e 15', '10:15'],
  ['dez h e quinze', '10:15'],
  ['10 h quinze', '10:15'],
  ['10 horas 15', '10:15'],
  ['10 horas e quinze', '10:15'],
]) {
  test(`híbrido estrutural válido: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã às ${expression}.`;
    const classification = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(classification.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME);
    assert.equal(classification.time, expected);
    assert.match((await turn(flow, text)).text, /Pronto/);
    assert.equal(calls[0].payload.title, 'reuniao');
  });
}

for (const expression of ['dez h 60', 'dez h e sessenta', '10 h 60', '10 horas e 60']) {
  test(`híbrido estrutural inválido é rejeitado integralmente: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã às ${expression}.`;
    const classification = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(classification.kind, AGENDA_TIME_CLASSIFICATION.INVALID_TIME);
    assert.ok(classification.span.end > classification.span.start);
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
    assert.match((await turn(flow, text)).text, /entender o horário/i);
    assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  });
}

for (const noun of ['alunos', 'parcelas', 'avaliações', 'unidades']) {
  test(`meia contextual seguida de substantivo não é horário: ${noun}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã às três e meia ${noun}.`;

    assert.equal(
      classifyAgendaTemporalRegion(text, { allowContextual: true }).kind,
      AGENDA_TIME_CLASSIFICATION.NON_TEMPORAL_CONTENT,
    );
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
    assert.doesNotMatch((await turn(flow, text)).text, /manhã.*(?:tarde|noite)/i);
    assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
    assert.equal(calls[0].payload.has_explicit_time, false);
    assert.equal(calls[0].payload.is_all_day, false);
  });
}

test('meia seguida de unidade de duração não sofre consumo parcial como horário', async () => {
  const { flow, calls } = makeHarness();
  const text = 'Agenda reunião amanhã às três e meia horas.';

  assert.equal(
    classifyAgendaTemporalRegion(text, { allowContextual: true }).kind,
    AGENDA_TIME_CLASSIFICATION.NON_TEMPORAL_CONTENT,
  );
  assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
  const result = await turn(flow, text);
  assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
  assert.equal(calls[0].payload.has_explicit_time, false);
  assert.equal(calls[0].payload.is_all_day, false);
  assert.doesNotMatch(result.text, /manhã.*(?:tarde|noite)/i);
});

for (const [text, expectedTitle] of [
  ['Agenda reunião amanhã 10h para 11 alunos.', 'reuniao para 11 alunos'],
  ['Agenda reunião sobre vendas amanhã 10h para 5 pessoas.', 'reuniao sobre vendas para 5 pessoas'],
  ['Marca ligação para João amanhã às 10h.', 'ligacao para joao'],
  ['Agenda reunião com onze clientes amanhã às 10h.', 'reuniao com onze clientes'],
]) {
  test(`título usa a mesma decisão estrutural do horário: ${text}`, async () => {
    const { flow, calls } = makeHarness();

    assert.match((await turn(flow, text)).text, /Pronto/);
    assert.equal(calls[0].payload.title, expectedTitle);
  });
}

for (const [text, expectedTitle, expectedTime] of [
  ['Agenda reunião para 11 alunos amanhã às 10h.', 'reuniao para 11 alunos', '10:00'],
  ['Agenda reunião para 12 clientes amanhã às 15h.', 'reuniao para 12 clientes', '15:00'],
  ['Agenda reunião para 15 astronautas sexta às 22h.', 'reuniao para 15 astronautas', '22:00'],
  ['Agenda consulta para 3 médicos amanhã às 9h.', 'consulta para 3 medicos', '09:00'],
  ['Agenda manutenção para 4 máquinas dia 20 às 14h.', 'manutencao para 4 maquinas', '14:00'],
  ['Agenda reunião para 30 fornecedores amanhã às dez horas.', 'reuniao para 30 fornecedores', '10:00'],
  ['Agenda treinamento para vinte funcionários amanhã às três da tarde.', 'treinamento para vinte funcionarios', '15:00'],
  ['Agenda inspeção para 7 caminhões amanhã às 10h30.', 'inspecao para 7 caminhoes', '10:30'],
  ['Agenda reunião com 11 pesquisadores amanhã às 10h.', 'reuniao com 11 pesquisadores', '10:00'],
  ['Agenda reunião até 11 participantes amanhã às 10h.', 'reuniao ate 11 participantes', '10:00'],
]) {
  test(`quantidade antes da data não impede horário posterior: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME, text);
    assert.equal(analysis.resolvedTime, expectedTime, text);
    assert.equal(analysis.clockTimes.length, 1, text);
    assert.equal(analysis.blocked, false, text);
    assert.match((await turn(flow, text)).text, /Pronto/, text);
    assert.equal(calls[0].payload.title, expectedTitle, text);
    assert.equal(calls[0].payload.has_explicit_time, true, text);
    assert.equal(calls[0].payload.is_all_day, false, text);
    assert.equal(
      `${String(new Date(calls[0].payload.starts_at).getHours()).padStart(2, '0')}:${String(new Date(calls[0].payload.starts_at).getMinutes()).padStart(2, '0')}`,
      expectedTime,
      text,
    );
  });
}

for (const text of [
  'Agenda reunião para 11 alunos amanhã às dez e sessenta.',
  'Agenda reunião para 11 alunos amanhã 10h–11h.',
  'Agenda reunião para 11 alunos amanhã às 10h e às 11h.',
]) {
  test(`quantidade anterior não converte região temporal bloqueada em Sem horário: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(analysis.blocked, true, text);
    assert.equal(analysis.resolvedTime, null, text);
    assert.match((await turn(flow, text)).text, /entender o horário/i, text);
    assert.equal(calls.some((call) => call.operation === 'create'), false, text);
    assert.equal(flow.hasPending(IDENTITY), true, text);
  });
}

test('pending recupera dois horários ambíguos sem perder título, data ou UUID', async () => {
  const operationId = '12121212-1212-4212-8212-121212121212';
  const { flow, calls } = makeHarness([], { createOperationId: () => operationId });

  assert.match((await turn(flow, 'Agenda reunião amanhã 10h e 11h.')).text, /entender o horário/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
  assert.match((await turn(flow, 'às 10h')).text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(calls[0].payload.client_operation_id, operationId);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
});

test('pending mantém zero write ao trocar ambiguidade com para por range real', async () => {
  const { flow, calls } = makeHarness();

  assert.match((await turn(flow, 'Agenda reunião amanhã 10h para 11h.')).text, /entender o horário/i);
  assert.match((await turn(flow, 'das 10h às 11h')).text, /entender o horário/i);
  assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  assert.equal(flow.hasPending(IDENTITY), true);
});

for (const [clock, expected] of [['10h', '10:00'], ['15:30', '15:30'], ['dez horas', '10:00']]) {
  for (const connector of ['para', 'com', 'até']) {
    for (const noun of ['alunos', 'dentistas', 'equipes']) {
      test(`propriedade B/E: ${clock} ${connector} 11 ${noun}`, async () => {
        const { flow, calls } = makeHarness();
        const text = `Agenda reunião amanhã ${clock} ${connector} 11 ${noun}.`;
        const classification = classifyAgendaTemporalRegion(text, { allowContextual: true });

        assert.equal(classification.kind, AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY);
        assert.equal(classification.time, expected);
        assert.match((await turn(flow, text)).text, /Pronto/);
        assert.equal(calls[0].payload.title, `reuniao ${normalizeFinancialTextForTest(connector)} 11 ${noun}`);
      });
    }
  }
}

const PUNCTUATED_MULTI_TIME_CASES = [
  '10h-11h',
  '10h - 11h',
  '10h/11h',
  '10h / 11h',
  '10h,11h',
  '10h, 11h',
  '10h;11h',
  '10h; 11h',
  '10h–11h',
  '10h—11h',
  '10:30-11:30',
  '10h30 / 11h30',
  'dez horas-onze horas',
  'dez horas / onze horas',
];

for (const dateContext of ['hoje', 'amanhã', 'sexta', 'dia 20']) {
  for (const expression of PUNCTUATED_MULTI_TIME_CASES) {
    test(`P1-STR-01: ${dateContext} ${expression} bloqueia ambos endpoints`, async () => {
      const { flow, calls } = makeHarness();
      const text = `Agenda reunião ${dateContext} ${expression}.`;
      const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

      assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME);
      assert.equal(analysis.blocked, true);
      assert.equal(analysis.resolvedTime, null);
      assert.equal(analysis.hasMultipleEndpoints, true);
      assert.equal(analysis.spans.length, 1);
      const result = await turn(flow, text);
      assert.equal(result.handled, true);
      assert.match(result.text, /entender o horário/i);
      assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
    });
  }
}

for (const expression of [
  'dez para onze',
  '10 para 11',
  'dez e onze',
  '10 e 11',
  'dez até onze',
  'dez às onze',
]) {
  test(`P1-STR-02: endpoints falados/nus são bloqueados antes do fallback: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã ${expression}.`;
    const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(analysis.blocked, true);
    assert.equal(analysis.resolvedTime, null);
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
    assert.match((await turn(flow, text)).text, /entender o horário/i);
    assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  });
}

for (const noun of ['pessoas', 'clientes', 'astronautas']) {
  test(`P1-STR-02: dez para onze ${noun} permanece quantidade ligada a 10h`, async () => {
    const operationId = '34343434-3434-4434-8434-343434343434';
    const { flow, calls } = makeHarness([], { createOperationId: () => operationId });
    const text = `Agenda reunião amanhã dez para onze ${noun}.`;
    const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY);
    assert.equal(analysis.resolvedTime, '10:00');
    assert.equal(analysis.hasQuantity, true);
    assert.match((await turn(flow, text)).text, /10 da manhã.*10 da noite/i);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
    assert.match((await turn(flow, 'da manhã')).text, /Pronto/);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
    assert.equal(calls[0].payload.title, `reuniao para onze ${noun}`);
    assert.equal(calls[0].payload.client_operation_id, operationId);
  });
}

for (const reply of [
  '10h-11h da manhã',
  '10h60 da manhã',
  '10h e 11h da manhã',
  'das 10h às 11h da manhã',
]) {
  test(`P1-STR-03: pending reanalisa e bloqueia resposta temporal nova: ${reply}`, async () => {
    const operationId = '56565656-5656-4565-8565-565656565656';
    const { flow, calls } = makeHarness([], { createOperationId: () => operationId });

    assert.match((await turn(flow, 'Agenda reunião amanhã às dez.')).text, /manhã.*noite/i);
    const result = await turn(flow, reply);
    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
    assert.equal(flow.hasPending(IDENTITY), true);

    assert.match((await turn(flow, 'dez e quinze da manhã')).text, /Pronto/);
    assert.equal(calls[0].payload.title, 'reuniao');
    assert.equal(calls[0].payload.client_operation_id, operationId);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
    assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 15);
  });
}

test('P1-STR-03: período puro continua sendo a única resolução direta do AM/PM anterior', async () => {
  const { flow, calls } = makeHarness();

  assert.match((await turn(flow, 'Agenda reunião amanhã às dez.')).text, /manhã.*noite/i);
  assert.match((await turn(flow, 'da manhã')).text, /Pronto/);
  assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
});

test('P1-STR-03: horário novo válido com período substitui explicitamente a ambiguidade anterior', async () => {
  const { flow, calls } = makeHarness();

  await turn(flow, 'Agenda reunião amanhã às dez.');
  assert.match((await turn(flow, 'dez e quinze da manhã')).text, /Pronto/);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 15);
});

test('título pendente usa o span bloqueado inteiro e permanece intacto após reparo', async () => {
  const { flow, calls } = makeHarness();

  assert.match((await turn(flow, 'Agenda reunião amanhã 10h-11h.')).text, /entender o horário/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
  assert.match((await turn(flow, 'às 9h')).text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 9);
});

test('fuzz estrutural de separadores nunca reduz dois endpoints a SINGLE_TIME', async () => {
  const firstEndpoints = ['10h', '10:30', 'dez horas', 'dez'];
  const separators = ['-', '–', '—', '/', ',', ';', 'até', 'às', 'e', 'para'];
  const secondEndpoints = ['11h', '11:30', 'onze horas', 'onze'];
  let combinations = 0;

  for (const first of firstEndpoints) {
    for (const separator of separators) {
      for (const second of secondEndpoints) {
        const { flow, calls } = makeHarness();
        const text = `Agenda reunião amanhã ${first} ${separator} ${second}.`;
        const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

        assert.equal(analysis.blocked, true, text);
        assert.notEqual(analysis.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME, text);
        assert.equal(analysis.resolvedTime, null, text);
        assert.equal(extractAgendaTime(text, { allowContextual: true }), null, text);
        const result = await turn(flow, text);
        assert.equal(result.handled, true, text);
        assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false, text);
        combinations += 1;
      }
    }
  }

  assert.equal(combinations, 160);
});

const FULL_MESSAGE_TEMPORAL_BLOCK_CASES = [
  ['às 10h para 11 alunos às 25h', AGENDA_TIME_CLASSIFICATION.INVALID_TIME],
  ['às 10h para 11 alunos às 10h60', AGENDA_TIME_CLASSIFICATION.INVALID_TIME],
  ['às 10h com 11 médicos às 12h', AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME],
  ['10h para 11 alunos às 25h', AGENDA_TIME_CLASSIFICATION.INVALID_TIME],
  ['10h para 11 alunos às 10h60', AGENDA_TIME_CLASSIFICATION.INVALID_TIME],
  ['10h para 11 alunos às 12h', AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME],
  ['10h com 11 astronautas às 12h', AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME],
  ['10h até 11 médicos às 12h', AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME],
];

for (const [expression, expectedKind] of FULL_MESSAGE_TEMPORAL_BLOCK_CASES) {
  test(`P1 mensagem inteira: criação bloqueia região posterior em ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã ${expression}.`;
    const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(analysis.kind, expectedKind);
    assert.equal(analysis.blocked, true);
    assert.equal(analysis.resolvedTime, null);
    assert.ok(analysis.candidates.length >= 2);
    assert.match((await turn(flow, text)).text, /entender o horário/i);
    assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  });
}

for (const expression of [
  '10h para 11 alunos às 25h',
  '10h com 11 pessoas às 10h60',
]) {
  test(`P1 mensagem inteira: edição não produz update parcial em ${expression}`, async () => {
    const seed = [{
      id: 'edit-full-message',
      workspace_id: IDENTITY.workspaceId,
      title: 'reunião',
      starts_at: '2026-08-09T13:00:00.000Z',
      ends_at: '2026-08-09T14:00:00.000Z',
    }];
    const { flow, calls } = makeHarness(seed);

    const result = await turn(flow, `Muda minha reunião para amanhã ${expression}.`);

    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => call.operation === 'update'), false);
  });
}

test('P1 mensagem inteira: pending AM/PM não resolve quando a resposta contém região posterior inválida', async () => {
  const { flow, calls } = makeHarness();

  assert.match((await turn(flow, 'Agenda reunião amanhã às dez.')).text, /manhã.*noite/i);
  const blocked = await turn(flow, '10h para 11 alunos às 25h da manhã.');

  assert.match(blocked.text, /entender o horário/i);
  assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  assert.equal(flow.hasPending(IDENTITY), true);
  assert.match((await turn(flow, 'dez e quinze da manhã')).text, /Pronto/);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 15);
});

for (const expression of ['10h..11h', '10h:11h', '10h|11h']) {
  test(`P2 candidatos adjacentes não dependem de enumeração do separador: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã ${expression}.`;
    const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME);
    assert.equal(analysis.blocked, true);
    assert.equal(analysis.candidates.filter((candidate) => candidate.time).length, 2);
    assert.match((await turn(flow, text)).text, /entender o horário/i);
    assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  });
}

test('P2 dois-pontos de HH:MM permanece parte de um único relógio', async () => {
  const { flow, calls } = makeHarness();
  const text = 'Agenda reunião amanhã 10:30.';
  const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

  assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME);
  assert.equal(analysis.resolvedTime, '10:30');
  assert.match((await turn(flow, text)).text, /Pronto/);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 30);
});

for (const noun of ['astronautas', 'médicos', 'caminhões', 'fornecedores']) {
  for (const connector of ['para', 'com']) {
    test(`quantidade arbitrária válida permanece título: ${connector} 11 ${noun}`, async () => {
      const { flow, calls } = makeHarness();
      const text = `Agenda reunião amanhã 10h ${connector} 11 ${noun}.`;
      const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

      assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY);
      assert.equal(analysis.resolvedTime, '10:00');
      assert.match((await turn(flow, text)).text, /Pronto/);
      assert.equal(calls[0].payload.title, `reuniao ${connector} 11 ${normalizeFinancialTextForTest(noun)}`);
    });
  }
}

test('propriedades A-D: toda região posterior participa da decisão consolidada', async () => {
  const nouns = ['astronautas', 'oleiros', 'bibliotecários'];
  const matrices = [
    (noun) => `10h para 11 ${noun} às 12h`,
    (noun) => `10h para 11 ${noun} às 25h`,
    (noun) => `10h com 11 ${noun} 12h`,
    (noun) => `10h com 11 ${noun} 10h60`,
    (noun) => `10h para 11 ${noun} às vinte e cinco horas`,
    (noun) => `10h para 11 ${noun} às três e trinta da tarde`,
    (noun) => `10h até 11h com 5 ${noun}`,
    (noun) => `10h para 5 ${noun} 12h até 13h`,
  ];
  let combinations = 0;

  for (const noun of nouns) {
    for (const buildExpression of matrices) {
      const { flow, calls } = makeHarness();
      const text = `Agenda reunião amanhã ${buildExpression(noun)}.`;
      const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

      assert.equal(analysis.blocked, true, text);
      assert.notEqual(analysis.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME, text);
      assert.notEqual(analysis.kind, AGENDA_TIME_CLASSIFICATION.TIME_PLUS_QUANTITY, text);
      assert.equal(analysis.resolvedTime, null, text);
      assert.match((await turn(flow, text)).text, /entender o horário/i, text);
      assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false, text);
      combinations += 1;
    }
  }

  assert.equal(combinations, 24);
});

test('P1-A semântica única: horário e título consomem o mesmo span coloquial completo', async () => {
  const { flow, calls } = makeHarness();
  const text = 'Agenda reunião amanhã às dez e quinze da manhã.';
  const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

  assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME);
  assert.equal(analysis.resolvedTime, '10:15');
  assert.deepEqual(analysis.temporalSpans, analysis.titleRemovalSpans);
  assert.equal(analysis.temporalSpans.length, 1);
  assert.equal(analysis.clockTimes.length, 1);
  assert.match((await turn(flow, text)).text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 15);
});

const SPOKEN_HOURS_1_TO_23 = [
  ['uma', 1], ['duas', 2], ['três', 3], ['quatro', 4], ['cinco', 5],
  ['seis', 6], ['sete', 7], ['oito', 8], ['nove', 9], ['dez', 10],
  ['onze', 11], ['doze', 12], ['treze', 13], ['quatorze', 14],
  ['quinze', 15], ['dezesseis', 16], ['dezessete', 17], ['dezoito', 18],
  ['dezenove', 19], ['vinte', 20], ['vinte e uma', 21],
  ['vinte e duas', 22], ['vinte e três', 23],
];

test('P1-B maximal munch: matriz 1–23 é um único relógio com ou sem às/as', () => {
  let combinations = 0;
  for (const [spoken, hour] of SPOKEN_HOURS_1_TO_23) {
    for (const cue of ['', 'às ', 'as ']) {
      const text = `Agenda reunião amanhã ${cue}${spoken} horas.`;
      const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

      assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME, text);
      assert.equal(analysis.resolvedTime, `${String(hour).padStart(2, '0')}:00`, text);
      assert.equal(analysis.clockTimes.length, 1, text);
      assert.equal(analysis.hasMultipleEndpoints, false, text);
      assert.equal(analysis.temporalSpans.length, 1, text);
      combinations += 1;
    }
  }
  assert.equal(combinations, 69);
});

for (const [text, expectedHour] of [
  ['Agenda reunião amanhã vinte e uma horas.', 21],
  ['Agenda reunião amanhã vinte e duas horas.', 22],
  ['Agenda reunião amanhã vinte e três horas.', 23],
  ['Agenda reunião amanhã às vinte e duas horas.', 22],
  ['Agenda reunião amanhã as vinte e duas horas.', 22],
]) {
  test(`P1-B criação por extenso preserva título sem subspan: ${text}`, async () => {
    const { flow, calls } = makeHarness();

    assert.match((await turn(flow, text)).text, /Pronto/);
    assert.equal(calls[0].payload.title, 'reuniao');
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), expectedHour);
  });
}

const DURATION_CONTENT_CASES = [
  ['para discutir 12 horas de trabalho', 'reuniao', 'Discutir 12 horas de trabalho'],
  ['com duração de 2 horas', 'reuniao com duracao de 2 horas'],
  ['sobre doze horas extras', 'reuniao sobre doze horas extras'],
  ['para discutir meia hora de intervalo', 'reuniao', 'Discutir meia hora de intervalo'],
  ['sobre 8 horas de viagem', 'reuniao sobre 8 horas de viagem'],
  ['para analisar 24 horas de operação', 'reuniao para analisar 24 horas de operacao'],
];

for (const [content, expectedTitle, expectedDescription] of DURATION_CONTENT_CASES) {
  test(`P1-C duração permanece conteúdo e não vira relógio: ${content}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã às 10h ${content}.`;
    const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(analysis.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME);
    assert.equal(analysis.resolvedTime, '10:00');
    assert.equal(analysis.clockTimes.length, 1);
    assert.equal(analysis.invalidRegions.length, 0);
    assert.ok(analysis.durations.length >= 1 || /meia hora/.test(content));
    assert.match((await turn(flow, text)).text, /Pronto/);
    assert.equal(calls[0].payload.title, expectedTitle);
    assert.equal(calls[0].payload.description ?? null, expectedDescription ?? null);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  });
}

for (const [second, expectedKind] of [
  ['às 12h', AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME],
  ['às 25h', AGENDA_TIME_CLASSIFICATION.INVALID_TIME],
  ['às 10h60', AGENDA_TIME_CLASSIFICATION.INVALID_TIME],
]) {
  test(`P1-C/D duração não mascara segundo relógio: ${second}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã às 10h para discutir 2 horas de trabalho ${second}.`;
    const analysis = classifyAgendaTemporalRegion(text, { allowContextual: true });

    assert.equal(analysis.kind, expectedKind);
    assert.equal(analysis.blocked, true);
    assert.equal(analysis.resolvedTime, null);
    assert.match((await turn(flow, text)).text, /entender o horário/i);
    assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  });
}

test('pending reanalisa relógio e duração integralmente sem perder a operação', async () => {
  const operationId = '78787878-7878-4787-8787-787878787878';
  const { flow, calls } = makeHarness([], { createOperationId: () => operationId });

  assert.match((await turn(flow, 'Agenda reunião amanhã às 25h.')).text, /horário/i);
  assert.match((await turn(flow, 'às 10h com duração de 2 horas')).text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(calls[0].payload.client_operation_id, operationId);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
});

test('pending remove todos os spans temporais bloqueados e preserva a quantidade no reparo', async () => {
  const { flow, calls } = makeHarness();

  assert.match(
    (await turn(flow, 'Agenda reunião amanhã às 10h para 11 alunos às 25h.')).text,
    /entender o horário/i,
  );
  assert.equal(calls.some((call) => ['create', 'update'].includes(call.operation)), false);
  assert.match((await turn(flow, 'às 9h')).text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao para 11 alunos');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 9);
});

test('fuzz semântico combina contexto, relógio, duração, quantidade e segunda região', async () => {
  const contexts = ['amanhã', 'sexta'];
  const clocks = [['às 10h', 10], ['às 15:30', 15], ['às dez da manhã', 10]];
  const durations = ['para discutir 2 horas de trabalho', 'sobre 8 horas de viagem'];
  const quantities = ['com 11 alunos', 'para 5 fornecedores'];
  let validCombinations = 0;
  let blockedCombinations = 0;

  for (const context of contexts) {
    for (const [clock, expectedHour] of clocks) {
      for (const duration of durations) {
        for (const quantity of quantities) {
          const validHarness = makeHarness();
          const validText = `Agenda reunião ${context} ${clock} ${duration} ${quantity}.`;
          const validAnalysis = classifyAgendaTemporalRegion(validText, { allowContextual: true });

          assert.equal(validAnalysis.kind, AGENDA_TIME_CLASSIFICATION.SINGLE_TIME, validText);
          assert.equal(validAnalysis.clockTimes.length, 1, validText);
          assert.ok(validAnalysis.durations.length >= 1, validText);
          assert.match((await turn(validHarness.flow, validText)).text, /Pronto/, validText);
          assert.equal(new Date(validHarness.calls[0].payload.starts_at).getHours(), expectedHour, validText);
          validCombinations += 1;

          for (const [suffix, expectedKind] of [
            ['às 12h', AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME],
            ['| 12h', AGENDA_TIME_CLASSIFICATION.AMBIGUOUS_MULTI_TIME],
            ['às 25h', AGENDA_TIME_CLASSIFICATION.INVALID_TIME],
            ['| 10h60', AGENDA_TIME_CLASSIFICATION.INVALID_TIME],
          ]) {
            const blockedHarness = makeHarness();
            const blockedText = `${validText.slice(0, -1)} ${suffix}.`;
            const blockedAnalysis = classifyAgendaTemporalRegion(
              blockedText,
              { allowContextual: true },
            );

            assert.equal(blockedAnalysis.kind, expectedKind, blockedText);
            assert.equal(blockedAnalysis.blocked, true, blockedText);
            assert.match((await turn(blockedHarness.flow, blockedText)).text, /entender o horário/i);
            assert.equal(
              blockedHarness.calls.some((call) => ['create', 'update'].includes(call.operation)),
              false,
              blockedText,
            );
            blockedCombinations += 1;
          }
        }
      }
    }
  }

  assert.equal(validCombinations, 24);
  assert.equal(blockedCombinations, 96);
});

for (const [expression, expected] of [
  ['00:00', '00:00'],
  ['23:59', '23:59'],
  ['24:00', null],
  ['23:60', null],
  ['09:05', '09:05'],
  ['09:60', null],
  ['10:', null],
  ['0h', '00:00'],
  ['23h', '23:00'],
  ['24h', null],
]) {
  test(`fronteira numérica do horário: ${expression}`, () => {
    assert.equal(
      extractAgendaTime(`Agenda amanhã ${expression}`, { allowContextual: true }),
      expected,
    );
  });
}

for (const malformed of [
  'Agenda reunião amanhã dez e sessenta.',
  'Agenda reunião amanhã 10h60.',
  'Agenda reunião amanhã 10:60.',
  'Agenda reunião amanhã 23h60.',
  'Agenda reunião amanhã 25h.',
  'Agenda reunião amanhã 25 horas.',
  'Agenda reunião amanhã vinte e cinco horas.',
  'Agenda reunião amanhã dez e setenta.',
  'Agenda reunião amanhã duas e sessenta da tarde.',
  'Agenda reunião amanhã 24h30.',
]) {
  test(`criação bloqueia horário malformado sem contaminar título: ${malformed}`, async () => {
    const { flow, calls } = makeHarness();

    const rejected = await turn(flow, malformed);

    assert.match(rejected.text, /entender o horário/i);
    assert.equal(rejected.handled, true);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
    assert.equal(flow.hasPending(IDENTITY), true);

    const corrected = await turn(flow, 'dez horas');
    assert.match(corrected.text, /Pronto/);
    const create = calls.find((call) => call.operation === 'create');
    assert.equal(create.payload.title, 'reuniao');
    assert.equal(new Date(create.payload.starts_at).getHours(), 10);
  });
}

for (const [expression, expected] of [
  ['às 10 horas e 30 minutos', '10:30'],
  ['10 horas e 30 minutos', '10:30'],
  ['às 10 horas e 15 minutos', '10:15'],
  ['às 10 horas e 45 minutos', '10:45'],
  ['10h e 30', '10:30'],
  ['10h e 30 minutos', '10:30'],
  ['10 horas e meia', '10:30'],
  ['dez horas e trinta minutos', '10:30'],
  ['dez horas e quinze', '10:15'],
  ['10h e meia', '10:30'],
  ['duas horas e meia da tarde', '14:30'],
  ['uma hora e quinze', '01:15'],
]) {
  test(`híbrido PT-BR válido é aceito como span único: ${expression}`, async () => {
    const { flow, calls } = makeHarness();
    const text = `Agenda reunião amanhã ${expression}.`;
    const result = await turn(flow, text);

    assert.match(result.text, /Pronto/);
    assert.equal(extractAgendaTime(text, { allowContextual: true }), expected);
    assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
    const createdAt = new Date(calls[0].payload.starts_at);
    assert.equal(
      `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`,
      expected,
    );
    assert.equal(calls[0].payload.title, 'reuniao');
  });
}

test('P1-A: conteúdo lexical comum depois de horário válido não é confundido com minuto falado', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião amanhã às dez horas com João.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao com joao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
});

test('P1-A: conjunção com texto comum não transforma horário válido em candidato malformado', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião amanhã às dez horas e banana.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls.some((call) => call.operation === 'create'), true);
});

for (const [text, expectedTitle] of [
  ['Agenda reunião amanhã às 10 horas e falar com João.', 'reuniao e falar com joao'],
  ['Agenda reunião amanhã às 10 horas sobre vendas.', 'reuniao sobre vendas'],
  ['Agenda reunião amanhã às 10h com João e Maria.', 'reuniao com joao e maria'],
  ['Agenda reunião amanhã às 10h até amanhã.', null],
]) {
  test(`P1-A/B: texto não temporal após horário único permanece válido: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, text);

    assert.match(result.text, /Pronto/);
    assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
    assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
    if (expectedTitle) assert.equal(calls[0].payload.title, expectedTitle);
  });
}

test('híbrido numérico explícito é aceito atomicamente como 10:30', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião amanhã às 10 horas e 30 minutos.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 30);
});

test('edição com horário malformado não aplica alteração parcial', async () => {
  const { flow, calls } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
  ]);

  const result = await turn(flow, 'Muda minha reunião para amanhã dez e sessenta.');

  assert.match(result.text, /entender o horário/i);
  assert.equal(calls.some((call) => call.operation === 'update'), false);
});

test('AGENDA-PENDING-001 preserva título e data ao reparar horário com pontuação', async () => {
  const { flow, calls } = makeHarness();

  const invalid = await turn(flow, 'Agenda reunião amanhã dez e sessenta.');
  assert.match(invalid.text, /entender o horário/i);

  const repaired = await turn(flow, 'dez horas.');
  assert.match(repaired.text, /Pronto/);
  const create = calls.find((call) => call.operation === 'create');
  assert.equal(create.payload.title, 'reuniao');
  assert.match(create.payload.starts_at, /^2026-08-09T/);
  assert.equal(new Date(create.payload.starts_at).getHours(), 10);
});

test('AGENDA-PENDING-001 continua recuperável após duas correções inválidas', async () => {
  const { flow, calls } = makeHarness();

  await turn(flow, 'Agenda reunião amanhã dez e sessenta.');
  assert.match((await turn(flow, 'dez e setenta.')).text, /entender o horário/i);
  assert.match((await turn(flow, 'dez horas.')).text, /Pronto/);
  assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
});

test('cancelar reparo temporal limpa pendência sem escrita', async () => {
  const { flow, calls } = makeHarness();

  await turn(flow, 'Agenda reunião amanhã dez e sessenta.');
  assert.match((await turn(flow, 'Cancela.')).text, /Não alterei/);
  assert.equal(flow.hasPending(IDENTITY), false);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
});

for (const [text, expectedTitle] of [
  ['Agenda reunião amanhã 10 pessoas.', 'reuniao 10 pessoas'],
  ['Agenda reunião amanhã 5 convidados.', 'reuniao 5 convidados'],
  ['Agenda reunião amanhã 20 clientes.', 'reuniao 20 clientes'],
]) {
  test(`quantidade contextual não vira horário: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, text);

    assert.match(result.text, /Pronto/);
    assert.equal(calls.filter((call) => call.operation === 'create').length, 1);
    assert.equal(calls[0].payload.title, expectedTitle);
    assert.equal(calls[0].payload.has_explicit_time, false);
  });
}

test('quantidade antes de horário explícito preserva título e usa o horário inequívoco', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião amanhã 3 pessoas às 10 horas.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao 3 pessoas');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
});

test('período temporal numérico é removido integralmente do título', async () => {
  const { flow, calls } = makeHarness();
  assert.match((await turn(flow, 'Agenda reunião às 8 da manhã.')).text, /dia/);
  await turn(flow, 'amanhã');

  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 8);
});

for (const range of [
  'Agenda reunião amanhã de 10h às 11h.',
  'Agenda reunião amanhã de 10h até 11h.',
  'Agenda reunião amanhã de 10h até às 11h.',
  'Agenda reunião amanhã de 10h até as 11h.',
  'Agenda reunião amanhã das 14h às 15h30.',
  'Agenda reunião amanhã das 10 até às 11.',
  'Agenda reunião amanhã das 10 até as 11.',
  'Agenda reunião amanhã das 10h30 às 11h30.',
  'Agenda reunião amanhã entre 9h e 10h.',
]) {
  test(`intervalo não é aceito parcialmente: ${range}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, range);

    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
  });
}

test('P1-B Reviewer: intervalo com até às é rejeitado sem consumir o segundo endpoint', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião amanhã de 10h30 até às 11h.');

  assert.match(result.text, /entender o horário/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
  assert.equal(flow.hasPending(IDENTITY), true);
});

for (const range of [
  'Agenda reunião amanhã 10h às 11h.',
  'Agenda reunião amanhã 10h até 11h.',
  'Agenda reunião amanhã 10h até às 11h.',
  'Agenda reunião amanhã dez horas até onze horas.',
  'Agenda reunião amanhã duas da tarde às três da tarde.',
]) {
  test(`P1-B Reviewer: intervalo sem introdução é rejeitado integralmente: ${range}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, range);

    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
    assert.equal(flow.hasPending(IDENTITY), true);
  });
}

for (const range of [
  'Agenda reunião amanhã 10h até as 11h.',
  'Agenda reunião sexta 10h às 11h.',
  'Agenda reunião sexta 10h até 11h.',
  'Agenda reunião dia 20 10h até às 11h.',
  'Agenda reunião 10h às 11h.',
  'Agenda reunião 10h até 11h.',
  'Agenda reunião 10h até às 11h.',
  'Agenda reunião dez horas às onze horas.',
  'Agenda reunião oito da manhã às nove da manhã.',
  'Agenda reunião duas da tarde até às três da tarde.',
  'Agenda reunião 10:00 às 11:00.',
  'Agenda reunião 10h30 às 11h30.',
  'Agenda reunião 10h30 até 11h.',
  'Agenda reunião 10h30 até às 11h.',
]) {
  test(`P1-B: matriz de intervalo sem introdução não sofre parse parcial: ${range}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, range);

    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
    assert.equal(flow.hasPending(IDENTITY), true);
  });
}

for (const range of [
  'Agenda reunião amanhã 10h60 até 11h.',
  'Agenda reunião amanhã 10h até 25h.',
  'Agenda reunião amanhã dez e sessenta até onze horas.',
]) {
  test(`P1-B: endpoint inválido impede qualquer criação parcial do range: ${range}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, range);

    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
  });
}

for (const range of [
  'Agenda reunião amanhã das 10 às 11.',
  'Agenda reunião amanhã de dez horas até onze horas.',
  'Agenda reunião amanhã de dez horas até às onze horas.',
  'Agenda reunião amanhã das dez horas às onze horas.',
  'Agenda reunião amanhã entre nove e dez horas.',
  'Agenda reunião amanhã das duas da tarde às três da tarde.',
]) {
  test(`P1-B: intervalo por extenso/até é rejeitado integralmente: ${range}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, range);

    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
    assert.equal(flow.hasPending(IDENTITY), true);
  });
}

test('data relativa válida com horário explícito é consumida integralmente', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião daqui a dois dias às 10h.');

  assert.match(result.text, /Pronto/);
  assert.match(calls[0].payload.starts_at, /^2026-08-10T/);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(calls[0].payload.title, 'reuniao');
});

test('duração relativa em horas não é reinterpretada parcialmente como data ou horário', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião daqui a duas horas.');

  assert.match(result.text, /dia/);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
});

test('semana que vem com horário inválido pede reparo sem parse parcial', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião semana que vem 10h60.');

  assert.match(result.text, /entender o horário/i);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
});

test('mês que vem permanece sem data inventada e não contamina o título', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Agenda reunião mês que vem às dez.');

  assert.match(result.text, /dia/);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
  assert.match((await turn(flow, 'dia 20')).text, /manhã|noite/i);
  await turn(flow, 'da manhã');
  assert.equal(calls.find((call) => call.operation === 'create').payload.title, 'reuniao');
});

test('nova consulta de Agenda não é sequestrada por criação pendente', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Me lembra da reunião amanhã às dez.');

  const result = await turn(flow, 'O que tenho sexta?');

  assert.equal(result.handled, true);
  assert.equal(calls.some((call) => call.operation === 'list'), true);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
});

test('nova edição de Agenda não é sequestrada por criação pendente', async () => {
  const { flow, calls } = makeHarness([
    { id: 'consultation', workspace_id: IDENTITY.workspaceId, title: 'Consulta', starts_at: '2026-08-14T15:00:00.000Z' },
  ]);
  await turn(flow, 'Me lembra da reunião amanhã às dez.');

  const result = await turn(flow, 'Muda minha consulta para sexta às 16h.');

  assert.match(result.text, /Atualizei/);
  assert.equal(calls.some((call) => call.operation === 'update'), true);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
});

test('nova criação de Agenda não é sequestrada por edição pendente', async () => {
  const { flow, calls } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
  ]);
  await turn(flow, 'Muda minha reunião.');

  const result = await turn(flow, 'Agenda consulta sexta às 15h.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls.some((call) => call.operation === 'create'), true);
  assert.equal(calls.some((call) => call.operation === 'update'), false);
});

test('parser contextual permanece explicitamente desligado fora do contexto de Agenda', () => {
  assert.equal(extractAgendaTime('Agenda amanhã dez horas.'), null);
  assert.equal(extractAgendaTime('amanhã 10h'), null);
  assert.equal(extractAgendaTime('às dez horas'), '10:00');
  assert.equal(extractAgendaTime('às 8 da noite'), '20:00');
});

for (const text of [
  'Trabalhei dez horas extras.',
  'Fiquei dez horas dirigindo.',
  'Dormi oito horas.',
  'Paguei dez reais.',
  'Tenho dez parcelas.',
  'Esperei duas horas.',
  'Passei três horas na reunião.',
  'Tenho dez reuniões.',
]) {
  test(`parser direto rejeita duração, dinheiro ou quantidade: ${text}`, () => {
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
  });
}

async function completeVagueCreation(flow, calls, text, expectedDate, expectedHour) {
  const first = await turn(flow, text);
  assert.match(first.text, /O que você quer/);
  let completed = await turn(flow, 'Reunião do projeto.');
  if (/manhã|tarde|noite/i.test(completed.text)) completed = await turn(flow, 'da manhã');
  assert.match(completed.text, /Pronto/);
  const create = calls.find((call) => call.operation === 'create');
  assert.match(create.payload.starts_at, new RegExp(`^${expectedDate}T`));
  assert.equal(new Date(create.payload.starts_at).getHours(), expectedHour);
  assert.equal(create.payload.title, 'reuniao do projeto');
}

for (const [text, expectedDate, expectedHour] of [
  ['Agenda amanhã dez horas.', '2026-08-09', 10],
  ['Agenda amanhã dez.', '2026-08-09', 10],
  ['Marca amanhã nove horas.', '2026-08-09', 9],
  ['Marca amanhã oito da manhã.', '2026-08-09', 8],
  ['Fala Uni, agenda amanhã dez horas.', '2026-08-09', 10],
  ['Ei Uni, marca sexta quinze horas.', '2026-08-14', 15],
]) {
  test(`criação elíptica preserva data e horário até receber assunto: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    await completeVagueCreation(flow, calls, text, expectedDate, expectedHour);
  });
}

for (const [text, expectedDate, expectedHour, expectedTitle] of [
  ['Agenda reunião amanhã nove horas.', '2026-08-09', 9, 'reuniao'],
  ['Marca reunião sexta quinze horas.', '2026-08-14', 15, 'reuniao'],
  ['Marca reunião sexta 15h.', '2026-08-14', 15, 'reuniao'],
  ['Reunião segunda oito da manhã.', '2026-08-10', 8, 'reuniao'],
  ['Reunião terça duas da tarde.', '2026-08-11', 14, 'reuniao'],
  ['Reunião sobre a Uni amanhã dez horas.', '2026-08-09', 10, 'reuniao sobre a uni'],
]) {
  test(`criação natural completa usa data, horário e título corretos: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, text);

    assert.match(result.text, /Pronto/);
    const create = calls.find((call) => call.operation === 'create');
    assert.match(create.payload.starts_at, new RegExp(`^${expectedDate}T`));
    assert.equal(new Date(create.payload.starts_at).getHours(), expectedHour);
    assert.equal(create.payload.title, expectedTitle);
  });
}

test('períodos naturais manhã e tarde ajustam a hora sem ambiguidade', async () => {
  const morning = makeHarness();
  await turn(morning.flow, 'Tenho uma reunião amanhã às oito da manhã.');
  assert.equal(new Date(morning.calls[0].payload.starts_at).getHours(), 8);

  const afternoon = makeHarness();
  await turn(afternoon.flow, 'Tenho uma reunião amanhã às duas da tarde.');
  assert.equal(new Date(afternoon.calls[0].payload.starts_at).getHours(), 14);
});

test('vocativo Fala Uni não contamina intent, título, data ou hora', async () => {
  const { flow, calls } = makeHarness();
  const result = await turn(flow, 'Fala Uni, tenho uma reunião amanhã às dez horas.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.match(calls[0].payload.starts_at, /^2026-08-09T/);
});

test('vocativo Ei Uni é removido somente no início da criação', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Ei Uni, agenda uma reunião sexta às quinze horas.');

  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.match(calls[0].payload.starts_at, /^2026-08-14T/);
});

test('vocativo Uni é removido somente no início da criação', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Uni, marca uma reunião sexta às quinze horas.');

  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
});

test('Uni permanece no assunto quando não é vocativo inicial', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Agenda uma reunião com a Uni amanhã às dez horas.');

  assert.equal(calls[0].payload.title, 'reuniao com a uni');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
});

test('objeto vago preserva a hora por extenso durante a desambiguação', async () => {
  const { flow, calls } = makeHarness();
  const first = await turn(flow, 'Marca aquele negócio pra sexta às quatorze horas.');
  assert.match(first.text, /O que você quer/);

  await turn(flow, 'Reunião do projeto.');
  assert.equal(calls.at(-1).payload.title, 'reuniao do projeto');
  assert.equal(new Date(calls.at(-1).payload.starts_at).getHours(), 14);
});

test('edição aceita hora por extenso sem transformar o horário em título', async () => {
  const { flow, calls } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
  ]);

  const result = await turn(flow, 'Muda minha reunião para sexta às dezesseis horas.');
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.equal(new Date(update.changes.starts_at).getHours(), 16);
  assert.equal(Object.hasOwn(update.changes, 'title'), false);
});

test('horários numéricos existentes continuam preservados', async () => {
  const withHours = makeHarness();
  await turn(withHours.flow, 'Tenho uma reunião amanhã às 10 horas.');
  assert.equal(new Date(withHours.calls[0].payload.starts_at).getHours(), 10);
  assert.equal(withHours.calls[0].payload.title, 'reuniao');

  const withMinutes = makeHarness();
  await turn(withMinutes.flow, 'Tenho uma reunião amanhã às 10:30.');
  const startsAt = new Date(withMinutes.calls[0].payload.starts_at);
  assert.equal(startsAt.getHours(), 10);
  assert.equal(startsAt.getMinutes(), 30);
});

for (const [answer, expectedMinutes] of [
  ['10h', 0], ['10:00', 0], ['às 10h', 0], ['às 10:30', 30],
]) {
  test(`resposta numérica de horário continua aceita: ${answer}`, async () => {
    const { flow, calls } = makeHarness();
    await turn(flow, 'Tenho uma reunião amanhã às 25h.');
    const result = await turn(flow, answer);

    assert.match(result.text, /Pronto/);
    const startsAt = new Date(calls[0].payload.starts_at);
    assert.equal(startsAt.getHours(), 10);
    assert.equal(startsAt.getMinutes(), expectedMinutes);
  });
}

for (const text of ['dez reais', 'paguei dez horas extras']) {
  test(`expressão não temporal não vira criação de Agenda: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, text);

    assert.equal(result.handled, false);
    assert.equal(calls.length, 0);
  });
}

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
  await turn(firstHarness.flow, 'Me lembra da reunião amanhã às dez.');

  const reloadedHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(reloadedHarness.flow, 'Me lembra da reunião amanhã às dez.');
  await turn(reloadedHarness.flow, 'da manhã');

  assert.equal(
    reloadedHarness.calls[0].payload.client_operation_id,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  assert.equal(operationIds.length, 1);
});

test('P1-C: nova Agenda divergente após reload não é bloqueada pela operação órfã', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const operationStorage = createOperationStorage();
  const firstHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(firstHarness.flow, 'Me lembra da reunião amanhã às dez.');

  const reloadedHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  const result = await turn(reloadedHarness.flow, 'Agenda consulta sexta às 15h.');

  assert.match(result.text, /Pronto/);
  assert.equal(reloadedHarness.calls[0].payload.client_operation_id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
});

test('P1-C: Financeiro após reload não apaga retry antigo nem bloqueia nova Agenda', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const operationStorage = createOperationStorage();
  const firstHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(firstHarness.flow, 'Me lembra da reunião amanhã às dez.');

  const reloadedHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  assert.equal((await turn(reloadedHarness.flow, 'Gastei R$ 50 no almoço.')).handled, false);
  const result = await turn(reloadedHarness.flow, 'Agenda consulta sexta às 15h.');

  assert.match(result.text, /Pronto/);
  assert.equal(reloadedHarness.calls[0].payload.client_operation_id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
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
  await turn(firstHarness.flow, 'Me lembra da reunião amanhã às dez.');
  const canceled = await turn(firstHarness.flow, 'Cancelar.');
  assert.match(canceled.text, /Não alterei/);

  const nextHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(nextHarness.flow, 'Me lembra da reunião amanhã.');

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

test('intenção sem horário mantém client_operation_id ao repetir após falha', async () => {
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const { flow, calls } = makeHarness([], {
    createOperationId: () => operationId,
    createResults: [{ data: null, error: { code: 'timeout' } }],
  });

  await turn(flow, 'Me lembra da reunião amanhã.');
  await turn(flow, 'Me lembra da reunião amanhã.');

  const creates = calls.filter((call) => call.operation === 'create');
  assert.equal(creates.length, 2);
  assert.ok(creates.every((call) => call.payload.client_operation_id === operationId));
});

test('objeto vago pergunta o assunto e preserva a data já informada', async () => {
  const { flow, calls } = makeHarness();
  const first = await turn(flow, 'Bota aquele negócio pra sexta.');
  assert.match(first.text, /O que você quer/);
  const second = await turn(flow, 'Reunião do projeto.');
  assert.match(second.text, /Pronto/);
  assert.equal(calls.length, 1);
  assert.equal(calls.at(-1).payload.title, 'reuniao do projeto');
  assert.match(calls.at(-1).payload.starts_at, /^2026-08-14T/);
  assert.equal(calls.at(-1).payload.has_explicit_time, false);
  assert.equal(calls.at(-1).payload.is_all_day, false);
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

for (const text of [
  'Agenda de amanhã.',
  'Agenda de sexta.',
  'Minha agenda amanhã.',
  'Quais meus compromissos amanhã?',
  'Quais meus compromissos amanhã às dez?',
  'O que tenho sexta às quinze horas?',
]) {
  test(`horário não transforma consulta em criação: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, text);

    assert.equal(result.handled, true);
    assert.equal(calls.some((call) => call.operation === 'list'), true);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
  });
}

test('edição encontra um item e altera somente o horário', async () => {
  const { flow, calls } = makeHarness([
    { id: 'dentista', workspace_id: IDENTITY.workspaceId, title: 'Dentista', starts_at: '2026-08-09T15:00:00.000Z' },
  ]);
  const result = await turn(flow, 'Muda meu dentista de amanhã para 16h.');
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.equal(new Date(update.changes.starts_at).getHours(), 16);
  assert.equal(update.changes.has_explicit_time, true);
  assert.equal(update.changes.is_all_day, false);
  assert.equal(update.options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
});

test('edição remove horário sem transformar o item em dia inteiro', async () => {
  const { flow, calls } = makeHarness([
    {
      id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião',
      starts_at: '2026-08-12T15:00:00.000Z', has_explicit_time: true, is_all_day: false,
    },
  ]);
  const first = await turn(flow, 'Muda o horário para sem horário.');
  assert.match(first.text, /Qual compromisso/);
  const result = await turn(flow, 'Reunião.');
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.equal(update.changes.has_explicit_time, false);
  assert.equal(update.changes.is_all_day, false);
  assert.equal(update.changes.ends_at, null);
});

test('edição transforma horário normal em dia inteiro', async () => {
  const { flow, calls } = makeHarness([
    {
      id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião',
      starts_at: '2026-08-12T15:00:00.000Z', has_explicit_time: true, is_all_day: false,
    },
  ]);
  const result = await turn(flow, 'Muda minha reunião para o dia inteiro.');
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.equal(update.changes.has_explicit_time, false);
  assert.equal(update.changes.is_all_day, true);
});

for (const [label, item] of [
  ['sem horário', { has_explicit_time: false, is_all_day: false }],
  ['dia inteiro', { has_explicit_time: false, is_all_day: true }],
]) {
  test(`edição adiciona horário real a item ${label}`, async () => {
    const { flow, calls } = makeHarness([
      {
        id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião',
        starts_at: '2026-08-12T00:00:00.000Z', ...item,
      },
    ]);
    const result = await turn(flow, 'Muda minha reunião para 16h.');
    assert.match(result.text, /Atualizei/);
    const update = calls.find((call) => call.operation === 'update');
    assert.equal(new Date(update.changes.starts_at).getHours(), 16);
    assert.equal(update.changes.has_explicit_time, true);
    assert.equal(update.changes.is_all_day, false);
  });
}

for (const [label, item, instruction, expected] of [
  [
    'Sem horário -> Dia inteiro',
    { starts_at: '2026-08-12T00:00:00.000Z', has_explicit_time: false, is_all_day: false },
    'Muda minha reunião para o dia inteiro.',
    { hasExplicitTime: false, allDay: true },
  ],
  [
    'Dia inteiro -> Sem horário',
    { starts_at: '2026-08-12T00:00:00.000Z', has_explicit_time: false, is_all_day: true },
    'Muda minha reunião para sem horário.',
    { hasExplicitTime: false, allDay: false },
  ],
  [
    '00:00 explícito -> Sem horário',
    { starts_at: '2026-08-12T00:00:00.000Z', has_explicit_time: true, is_all_day: false },
    'Muda minha reunião para sem horário.',
    { hasExplicitTime: false, allDay: false },
  ],
  [
    'Sem horário -> 00:00 explícito',
    { starts_at: '2026-08-12T00:00:00.000Z', has_explicit_time: false, is_all_day: false },
    'Muda minha reunião para meia-noite.',
    { hasExplicitTime: true, allDay: false },
  ],
]) {
  test(`transição semântica: ${label}`, async () => {
    const { flow, calls } = makeHarness([{
      id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', ...item,
    }]);

    assert.match((await turn(flow, instruction)).text, /Atualizei/);
    const update = calls.find((call) => call.operation === 'update');
    assert.equal(update.changes.has_explicit_time, expected.hasExplicitTime);
    assert.equal(update.changes.is_all_day, expected.allDay);
    assert.equal(new Date(update.changes.starts_at).getHours(), 0);
  });
}

for (const [text, expectedDate, expectedHour] of [
  ['Muda minha reunião para sexta dezesseis horas.', '2026-08-14', 16],
  ['Adia minha reunião para amanhã dez horas.', '2026-08-09', 10],
  ['Muda minha reunião amanhã onze horas.', '2026-08-09', 11],
]) {
  test(`edição contextual altera data e horário sem corromper título: ${text}`, async () => {
    const { flow, calls } = makeHarness([
      { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
    ]);

    const result = await turn(flow, text);
    assert.match(result.text, /Atualizei/);
    const update = calls.find((call) => call.operation === 'update');
    assert.match(update.changes.starts_at, new RegExp(`^${expectedDate}T`));
    assert.equal(new Date(update.changes.starts_at).getHours(), expectedHour);
    assert.equal(Object.hasOwn(update.changes, 'title'), false);
  });
}

test('edição elíptica preserva mudanças enquanto pergunta qual compromisso', async () => {
  const { flow, calls } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
  ]);

  const first = await turn(flow, 'Remarca para segunda duas da tarde.');
  assert.match(first.text, /Qual compromisso/);
  const result = await turn(flow, 'Reunião.');
  assert.match(result.text, /Atualizei/);
  const update = calls.find((call) => call.operation === 'update');
  assert.match(update.changes.starts_at, /^2026-08-10T/);
  assert.equal(new Date(update.changes.starts_at).getHours(), 14);
  assert.equal(Object.hasOwn(update.changes, 'title'), false);
});

for (const [command, expectedChanges] of [
  ['Muda só o horário para onze horas.', { hour: 11 }],
  ['Muda só a data para amanhã.', { date: '2026-08-09' }],
  ['Muda o título para alinhamento.', { title: 'alinhamento' }],
]) {
  test(`edição somente de campo pergunta o alvo e preserva a alteração: ${command}`, async () => {
    const { flow, calls } = makeHarness([
      { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-12T15:00:00.000Z' },
    ]);

    const first = await turn(flow, command);
    assert.match(first.text, /Qual compromisso/);
    const result = await turn(flow, 'Reunião.');
    assert.match(result.text, /Atualizei/);
    const update = calls.find((call) => call.operation === 'update');
    if (expectedChanges.hour != null) {
      assert.equal(new Date(update.changes.starts_at).getHours(), expectedChanges.hour);
    }
    if (expectedChanges.date) assert.match(update.changes.starts_at, new RegExp(`^${expectedChanges.date}T`));
    if (expectedChanges.title) assert.equal(update.changes.title, expectedChanges.title);
  });
}

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

test('escolha por lembrete cria diretamente Sem horário após resolver o conflito', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Amanhã tenho que pagar 300 reais.');
  const choice = await turn(flow, 'Quero um lembrete na Agenda.');
  assert.match(choice.text, /sem horário/i);
  assert.equal(calls.length, 1);
  assert.equal(calls.at(-1).operation, 'create');
  assert.equal(calls.at(-1).payload.item_type, 'reminder');
  assert.equal(calls.at(-1).payload.title, 'pagar 300 reais');
  assert.equal(calls.at(-1).payload.has_explicit_time, false);
  assert.equal(calls.at(-1).payload.is_all_day, false);
});

test('pendência de Agenda pode ser abandonada antes de uma nova declaração financeira', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Me lembra da reunião amanhã às dez.');
  assert.equal(flow.hasPending(IDENTITY), true);
  assert.equal(await flow.abandonPending(IDENTITY), true);

  const financial = await turn(flow, 'Gastei R$ 50 no almoço.');
  assert.equal(financial.handled, false);
  assert.equal(flow.hasPending(IDENTITY), false);
  assert.equal(calls.length, 0);
});

test('abandono explícito limpa somente a operação pendente antes de nova intenção', async () => {
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const operationStorage = createOperationStorage();
  const firstHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(firstHarness.flow, 'Me lembra da reunião amanhã às dez.');
  assert.equal(await firstHarness.flow.abandonPending(IDENTITY), true);

  const restoredHarness = makeHarness([], {
    operationStorage,
    createOperationId: () => operationIds.shift(),
  });
  await turn(restoredHarness.flow, 'Me lembra da reunião amanhã.');

  assert.equal(
    restoredHarness.calls[0].payload.client_operation_id,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
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
  assert.equal(calls.at(-1).options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
});

test('exclusão stale não remove versão alterada em outra aba', async () => {
  const { flow, calls, items } = makeHarness([
    { id: 'meeting', workspace_id: IDENTITY.workspaceId, title: 'Reunião', starts_at: '2026-08-08T12:00:00.000Z' },
  ]);

  assert.match((await turn(flow, 'Excluir minha reunião.')).text, /Quer mesmo excluir/);
  items[0].updated_at = '2026-08-08T11:00:00.000Z';
  const result = await turn(flow, 'sim');

  assert.match(result.text, /mudou desde que você o consultou/);
  assert.equal(items.length, 1);
  assert.equal(calls.at(-1).options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
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

test('contextual: limpa título e só persiste após recusar observação', async () => {
  const { flow, calls } = makeHarness([], { observationFollowupEnabled: true });

  const first = await turn(flow, 'Agende uma reunião para mim amanhã às 10 horas.');
  assert.match(first.text, /observação/i);
  assert.equal(calls.length, 0);

  const final = await turn(flow, 'Não.');
  assert.match(final.text, /Pronto/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
});

test('contextual: 3h45 permanece Agenda, esclarece período e preserva o draft', async () => {
  const { flow, calls } = makeHarness([], { observationFollowupEnabled: true });

  const ambiguous = await turn(flow, 'Agendo uma reunião amanhã às 3h45.');
  assert.match(ambiguous.text, /3:45 da madrugada.*3:45 da tarde/i);
  assert.equal(calls.length, 0);

  const period = await turn(flow, 'Da tarde.');
  assert.match(period.text, /observação/i);
  assert.equal(calls.length, 0);

  const final = await turn(flow, 'Não.');
  assert.match(final.text, /Pronto/);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 45);
});

test('contextual: compromisso sem horário é persistido como dia inteiro', async () => {
  const { flow, calls } = makeHarness([], { observationFollowupEnabled: true });

  assert.match((await turn(flow, 'Agende uma reunião para amanhã.')).text, /observação/i);
  assert.equal(calls.length, 0);
  assert.match((await turn(flow, 'Sem observação.')).text, /Pronto/);

  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(calls[0].payload.is_all_day, true);
  assert.equal(calls[0].payload.has_explicit_time, false);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 0);
});

test('contextual: meia-noite continua horário explícito', async () => {
  const { flow, calls } = makeHarness([], { observationFollowupEnabled: true });

  assert.match(
    (await turn(flow, 'Agende um compromisso pra mim amanhã à meia-noite.')).text,
    /observação/i,
  );
  assert.match((await turn(flow, 'Não.')).text, /Pronto/);

  assert.equal(calls[0].payload.title, 'compromisso');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 0);
  assert.equal(calls[0].payload.has_explicit_time, true);
  assert.equal(calls[0].payload.is_all_day, false);
});

test('contextual: horário 24h inequívoco vai direto ao follow-up', async () => {
  const { flow, calls } = makeHarness([], { observationFollowupEnabled: true });

  const result = await turn(flow, 'Agende uma reunião amanhã às 15:45.');
  assert.match(result.text, /observação/i);
  assert.doesNotMatch(result.text, /madrugada|manhã|tarde ou/i);
  assert.equal(calls.length, 0);

  await turn(flow, 'Não.');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.equal(new Date(calls[0].payload.starts_at).getMinutes(), 45);
});

test('contextual: horário inválido e múltiplos horários nunca persistem', async () => {
  for (const text of [
    'Agende uma reunião amanhã às 25 horas.',
    'Agende uma reunião amanhã às 10 ou às 15 horas.',
  ]) {
    const { flow, calls } = makeHarness([], { observationFollowupEnabled: true });
    assert.match((await turn(flow, text)).text, /horário/i);
    assert.equal(calls.length, 0);
    assert.equal(flow.hasPending(IDENTITY), true);
  }
});

test('contextual: descrição inline é preservada sem pergunta redundante', async () => {
  const { flow, calls } = makeHarness([], { observationFollowupEnabled: true });

  const first = await turn(
    flow,
    'Agende uma reunião amanhã às 10 para discutir o contrato com João.',
  );
  assert.match(first.text, /10 da manhã.*10 da noite/i);
  assert.equal(calls.length, 0);

  const result = await turn(flow, 'Da manhã.');

  assert.match(result.text, /Pronto/);
  assert.doesNotMatch(result.text, /observação/i);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.title, 'reuniao');
  assert.equal(calls[0].payload.description, 'Discutir o contrato com joao');
});

test('contextual: observação em segundo turno é persistida no mesmo draft', async () => {
  const { flow, calls } = makeHarness([], { observationFollowupEnabled: true });

  assert.match((await turn(flow, 'Agende uma reunião amanhã às 15:45.')).text, /observação/i);
  const result = await turn(flow, 'Sim, renovação do contrato.');

  assert.match(result.text, /Pronto/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.description, 'Renovacao do contrato');
});

test('contextual: falha de persistência nunca responde Pronto', async () => {
  const { flow, calls } = makeHarness([], {
    observationFollowupEnabled: true,
    createResults: [{ data: null, error: { code: 'offline' } }],
  });

  assert.match((await turn(flow, 'Agende uma reunião amanhã às 15:45.')).text, /observação/i);
  const result = await turn(flow, 'Não.');

  assert.doesNotMatch(result.text, /Pronto/);
  assert.match(result.text, /Tente novamente/);
  assert.equal(calls.length, 1);
});
