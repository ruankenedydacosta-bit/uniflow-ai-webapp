import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classifyIntent } from '../uni-intents/index.js';
import { createAgendaConversationFlow } from './agendaConversationFlow.js';

const IDENTITY = Object.freeze({
  userId: 'qa-user',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  conversationId: 'qa-conversation',
});
const UNI_CHAT_SOURCE = readFileSync(new URL('../uni-chat/UniChatPage.jsx', import.meta.url), 'utf8');

function createFlow(seed = []) {
  const calls = [];
  const items = seed.map((item) => ({
    status: 'scheduled',
    is_all_day: false,
    updated_at: '2026-08-08T10:00:00.000Z',
    workspace_id: IDENTITY.workspaceId,
    ...item,
  }));
  const services = {
    async createAgendaItem(workspaceId, payload) {
      calls.push({ operation: 'create', workspaceId, payload });
      const data = { id: `agenda-${items.length + 1}`, workspace_id: workspaceId, status: 'scheduled', ...payload };
      items.push(data);
      return { data, error: null };
    },
    async listAgendaItems(workspaceId, filters) {
      calls.push({ operation: 'list', workspaceId, filters });
      return {
        data: items
          .filter((item) => item.workspace_id === workspaceId && item.status === (filters.status ?? item.status))
          .map((item) => ({ ...item })),
        error: null,
      };
    },
    async updateAgendaItem(workspaceId, itemId, changes, options = {}) {
      calls.push({ operation: 'update', workspaceId, itemId, changes, options });
      const item = items.find((candidate) => candidate.id === itemId && candidate.workspace_id === workspaceId);
      if (!item) return { data: null, error: { code: 'not_found' } };
      if (options.expectedUpdatedAt !== item.updated_at) {
        return { data: null, error: { code: 'AGENDA_ITEM_CONFLICT' } };
      }
      Object.assign(item, changes);
      return { data: item, error: null };
    },
    async setAgendaItemStatus(workspaceId, itemId, status, options = {}) {
      calls.push({ operation: 'status', workspaceId, itemId, status, options });
      const item = items.find((candidate) => candidate.id === itemId && candidate.workspace_id === workspaceId);
      if (!item) return { data: null, error: { code: 'not_found' } };
      if (options.expectedUpdatedAt !== item.updated_at) {
        return { data: null, error: { code: 'AGENDA_ITEM_CONFLICT' } };
      }
      item.status = status;
      return { data: item, error: null };
    },
    async deleteAgendaItem() { return { data: null, error: null }; },
  };
  return { calls, flow: createAgendaConversationFlow({ services }), items };
}

test('adversarial: pedido vago de marcação é Agenda e pede o assunto, nunca cai silenciosamente no chat genérico', async () => {
  const { flow, calls } = createFlow();
  assert.equal(classifyIntent('Marca aquele negócio pra sexta').intent, 'agenda_schedule_create');

  const result = await flow.handle({
    text: 'Marca aquele negócio pra sexta', identity: IDENTITY, referenceDate: '2026-08-08',
  });

  assert.match(result.text, /O que você quer que eu coloque na agenda/);
  assert.equal(calls.length, 0);
});

test('adversarial: edição sem alvo ou novo valor entra em esclarecimento, sem ser ignorada', async () => {
  const { flow, calls } = createFlow();
  assert.equal(classifyIntent('Muda meu compromisso').intent, 'agenda_edit');

  const result = await flow.handle({
    text: 'Muda meu compromisso', identity: IDENTITY, referenceDate: '2026-08-08',
  });

  assert.match(result.text, /Qual compromisso.*qual alteração/i);
  assert.equal(flow.hasPending(IDENTITY), true);
  assert.equal(calls.length, 0);
});

test('adversarial: sexta que vem usa a sexta da semana seguinte e não mantém data no título', async () => {
  const { flow, calls } = createFlow();
  await flow.handle({
    text: 'Tenho reunião sexta que vem às 10h', identity: IDENTITY, referenceDate: '2026-08-08',
  });

  assert.equal(calls[0].operation, 'create');
  assert.match(calls[0].payload.starts_at, /^2026-08-21T/);
  assert.equal(calls[0].payload.title, 'reuniao');
});

test('adversarial: obrigação futura com valor preserva conflito e não grava antes da escolha', async () => {
  const { flow, calls } = createFlow();
  assert.equal(
    classifyIntent('Amanhã tenho que pagar 300 reais').intent,
    'agenda_financial_conflict',
  );

  const result = await flow.handle({
    text: 'Amanhã tenho que pagar 300 reais', identity: IDENTITY, referenceDate: '2026-08-08',
  });

  assert.match(result.text, /lembrete.*operação financeira/i);
  assert.equal(flow.hasPending(IDENTITY), true);
  assert.equal(calls.length, 0);
});

test('contrato: lançamento financeiro novo é desviado pelo gateway antes do fluxo de Agenda', () => {
  assert.equal(classifyIntent('Gastei R$ 50 no almoço').intent, 'register_expense');
  const abandonIndex = UNI_CHAT_SOURCE.indexOf(
    'void agendaConversationRef.current.abandonPending(agendaIdentity).catch(() => {});',
  );
  const agendaHandleIndex = UNI_CHAT_SOURCE.indexOf('agendaConversationRef.current.handle({');
  assert.ok(abandonIndex >= 0 && agendaHandleIndex > abandonIndex);
  assert.match(UNI_CHAT_SOURCE, /const shouldAbandonAgendaForFinancial = hasPendingAgendaConversation/);
});

test('adversarial: duas reuniões semelhantes e resposta vaga não selecionam a primeira', async () => {
  const { flow, calls } = createFlow([
    { id: 'a', title: 'Reunião cliente', starts_at: '2026-08-14T12:00:00.000Z' },
    { id: 'b', title: 'Reunião projeto', starts_at: '2026-08-14T15:00:00.000Z' },
  ]);
  await flow.handle({
    text: 'Cancela minha reunião de sexta', identity: IDENTITY, referenceDate: '2026-08-08',
  });
  const result = await flow.handle({
    text: 'Reunião', identity: IDENTITY, referenceDate: '2026-08-08',
  });

  assert.match(result.text, /Qual deles você quer/);
  assert.equal(calls.filter((call) => call.operation === 'status').length, 0);
});

test('adversarial: edição isolada de título atualiza somente title', async () => {
  const { flow, calls } = createFlow([
    { id: 'a', title: 'Reunião', starts_at: '2026-08-09T12:00:00.000Z' },
  ]);
  await flow.handle({
    text: 'Muda minha reunião para alinhamento', identity: IDENTITY, referenceDate: '2026-08-08',
  });

  assert.deepEqual(calls.find((call) => call.operation === 'update')?.changes, {
    title: 'alinhamento',
  });
});

test('adversarial: edição isolada de data não altera título', async () => {
  const { flow, calls } = createFlow([
    { id: 'a', title: 'Reunião', starts_at: '2026-08-09T12:00:00.000Z' },
  ]);
  await flow.handle({
    text: 'Muda minha reunião para sexta que vem', identity: IDENTITY, referenceDate: '2026-08-08',
  });

  const changes = calls.find((call) => call.operation === 'update')?.changes;
  assert.match(changes?.starts_at ?? '', /^2026-08-21T/);
  assert.equal(Object.hasOwn(changes ?? {}, 'title'), false);
});

test('regressão B.1.2: amanhã não deixa preposição residual como novo título', async () => {
  const { flow, calls } = createFlow([
    { id: 'a', title: 'Reunião', starts_at: '2026-08-12T12:00:00.000Z' },
  ]);
  await flow.handle({
    text: 'Muda minha reunião para amanhã', identity: IDENTITY, referenceDate: '2026-08-08',
  });

  const changes = calls.find((call) => call.operation === 'update')?.changes;
  assert.match(changes?.starts_at ?? '', /^2026-08-09T/);
  assert.equal(Object.hasOwn(changes ?? {}, 'title'), false);
  assert.notEqual(changes?.title, 'para');
});

test('adversarial: edição isolada de horário não altera título', async () => {
  const { flow, calls } = createFlow([
    { id: 'a', title: 'Reunião', starts_at: '2026-08-09T12:00:00.000Z' },
  ]);
  await flow.handle({
    text: 'Muda minha reunião para 16h', identity: IDENTITY, referenceDate: '2026-08-08',
  });

  const changes = calls.find((call) => call.operation === 'update')?.changes;
  assert.equal(new Date(changes?.starts_at).getHours(), 16);
  assert.equal(Object.hasOwn(changes ?? {}, 'title'), false);
});

test('adversarial: cancelamento confirmado usa versão esperada e bloqueia versão obsoleta', async () => {
  const { flow, calls, items } = createFlow([
    { id: 'a', title: 'Reunião', starts_at: '2026-08-14T12:00:00.000Z' },
  ]);
  await flow.handle({
    text: 'Cancela minha reunião de sexta', identity: IDENTITY, referenceDate: '2026-08-08',
  });
  items[0].updated_at = '2026-08-08T10:30:00.000Z';
  const result = await flow.handle({ text: 'Sim', identity: IDENTITY, referenceDate: '2026-08-08' });

  assert.match(result.text, /mudou desde que você o consultou/);
  assert.equal(items[0].status, 'scheduled');
  assert.equal(calls.at(-1).options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
});

test('adversarial: conclusão envia updated_at esperado ao serviço', async () => {
  const { flow, calls } = createFlow([
    { id: 'a', title: 'Reunião', starts_at: '2026-08-08T12:00:00.000Z' },
  ]);
  await flow.handle({
    text: 'Já fiz a reunião. Pode marcar como concluída.',
    identity: IDENTITY,
    referenceDate: '2026-08-08',
  });

  assert.equal(calls.at(-1).operation, 'status');
  assert.equal(calls.at(-1).options.expectedUpdatedAt, '2026-08-08T10:00:00.000Z');
});
