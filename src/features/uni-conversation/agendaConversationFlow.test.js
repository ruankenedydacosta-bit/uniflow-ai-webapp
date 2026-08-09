import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyIntent } from '../uni-intents/index.js';
import {
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

  assert.match(result.text, /Pronto/);
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 10);
  assert.equal(calls[0].payload.title, 'uma reuniao');
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
  'Agenda reunião amanhã dez e quinze.',
  'Agenda reunião amanhã dez e meia.',
]) {
  test(`parser rejeita a expressão temporal inválida inteira: ${text}`, () => {
    assert.equal(extractAgendaTime(text, { allowContextual: true }), null);
  });
}

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

for (const malformed of [
  'Agenda reunião amanhã às 10 e meia.',
  'Agenda reunião amanhã dez e meia.',
  'Agenda reunião amanhã dez e quinze.',
  'Agenda reunião amanhã dez e quarenta.',
  'Agenda reunião amanhã uma e quinze.',
  'Agenda reunião amanhã duas e meia da tarde.',
]) {
  test(`minutos falados não sofrem parse parcial: ${malformed}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, malformed);

    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
  });
}

for (const [text, expectedTitle] of [
  ['Agenda reunião amanhã 10 pessoas.', 'reuniao 10 pessoas'],
  ['Agenda reunião amanhã 5 convidados.', 'reuniao 5 convidados'],
  ['Agenda reunião amanhã 20 clientes.', 'reuniao 20 clientes'],
]) {
  test(`quantidade contextual não vira horário: ${text}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, text);

    assert.match(result.text, /horário/);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
    await turn(flow, 'às 10 horas');
    assert.equal(calls.find((call) => call.operation === 'create').payload.title, expectedTitle);
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
  'Agenda reunião amanhã das 14h às 15h30.',
  'Agenda reunião amanhã entre 9h e 10h.',
]) {
  test(`intervalo não é aceito parcialmente: ${range}`, async () => {
    const { flow, calls } = makeHarness();
    const result = await turn(flow, range);

    assert.match(result.text, /entender o horário/i);
    assert.equal(calls.some((call) => call.operation === 'create'), false);
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
  await turn(flow, 'dia 20');
  assert.equal(calls.find((call) => call.operation === 'create').payload.title, 'reuniao');
});

test('nova consulta de Agenda não é sequestrada por criação pendente', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Me lembra da reunião amanhã.');

  const result = await turn(flow, 'O que tenho sexta?');

  assert.equal(result.handled, true);
  assert.equal(calls.some((call) => call.operation === 'list'), true);
  assert.equal(calls.some((call) => call.operation === 'create'), false);
});

test('nova edição de Agenda não é sequestrada por criação pendente', async () => {
  const { flow, calls } = makeHarness([
    { id: 'consultation', workspace_id: IDENTITY.workspaceId, title: 'Consulta', starts_at: '2026-08-14T15:00:00.000Z' },
  ]);
  await turn(flow, 'Me lembra da reunião amanhã.');

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
  const completed = await turn(flow, 'Reunião do projeto.');
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

  assert.equal(calls[0].payload.title, 'uma reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
  assert.match(calls[0].payload.starts_at, /^2026-08-14T/);
});

test('vocativo Uni é removido somente no início da criação', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Uni, marca uma reunião sexta às quinze horas.');

  assert.equal(calls[0].payload.title, 'uma reuniao');
  assert.equal(new Date(calls[0].payload.starts_at).getHours(), 15);
});

test('Uni permanece no assunto quando não é vocativo inicial', async () => {
  const { flow, calls } = makeHarness();
  await turn(flow, 'Agenda uma reunião com a Uni amanhã às dez horas.');

  assert.equal(calls[0].payload.title, 'uma reuniao com a uni');
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
  ['10', 0], ['10h', 0], ['10:00', 0], ['às 10', 0], ['às 10h', 0], ['às 10:30', 30],
]) {
  test(`resposta numérica de horário continua aceita: ${answer}`, async () => {
    const { flow, calls } = makeHarness();
    await turn(flow, 'Tenho uma reunião amanhã.');
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
  assert.equal(update.options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
});

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
