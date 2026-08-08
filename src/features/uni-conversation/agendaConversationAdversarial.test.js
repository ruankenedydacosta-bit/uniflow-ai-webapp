import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyIntent } from '../uni-intents/index.js';
import { createAgendaConversationFlow } from './agendaConversationFlow.js';

const IDENTITY = Object.freeze({
  userId: 'qa-user',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  conversationId: 'qa-conversation',
});

function createFlow() {
  const calls = [];
  const services = {
    async createAgendaItem(workspaceId, payload) {
      calls.push({ operation: 'create', workspaceId, payload });
      return { data: { id: 'agenda-1', ...payload }, error: null };
    },
    async listAgendaItems(workspaceId, filters) {
      calls.push({ operation: 'list', workspaceId, filters });
      return { data: [], error: null };
    },
    async updateAgendaItem() { return { data: null, error: null }; },
    async setAgendaItemStatus() { return { data: null, error: null }; },
    async deleteAgendaItem() { return { data: null, error: null }; },
  };
  return { calls, flow: createAgendaConversationFlow({ services }) };
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
