import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildRealtimeToolErrorOutput,
  buildRealtimeToolOutput,
  findUniReplyAfter,
  parseRealtimeToolArguments,
  resolveRealtimeToolOutcome,
  snapshotRealtimeToolTurn,
  readRealtimeToolPhrase,
  REALTIME_TOOL_NAMES,
} from './realtimeToolBridge.js';

const EDGE_SOURCE = readFileSync(
  new URL('../../../supabase/functions/uni-voice-realtime-session/index.ts', import.meta.url),
  'utf8',
);

test('argumentos da ferramenta: JSON de objeto vale; resto vira nulo', () => {
  assert.deepEqual(parseRealtimeToolArguments('{"frase":"gastei 50"}'), { frase: 'gastei 50' });
  assert.equal(parseRealtimeToolArguments('[1]'), null);
  assert.equal(parseRealtimeToolArguments('não é json'), null);
  assert.equal(parseRealtimeToolArguments(''), null);
  assert.equal(parseRealtimeToolArguments(undefined), null);
});

test('frase da ferramenta sai sem espaços e só quando é texto', () => {
  assert.equal(readRealtimeToolPhrase({ frase: '  gastei 50 no mercado ' }), 'gastei 50 no mercado');
  assert.equal(readRealtimeToolPhrase({ frase: 50 }), '');
  assert.equal(readRealtimeToolPhrase(null), '');
});

test('resposta só conta depois da mensagem da pessoa enviada neste turno', () => {
  const messages = [
    { id: 'u1', from: 'user', text: 'oi' },
    { id: 'a1', from: 'uni', text: 'Olá!' },
  ];
  assert.equal(findUniReplyAfter(messages, 'a1'), null);

  const withTurn = [
    ...messages,
    { id: 'u2', from: 'user', text: 'gastei 50' },
    { id: 'a2', from: 'uni', text: 'Confere o rascunho?', confirmation: { status: 'pending' } },
  ];
  assert.equal(findUniReplyAfter(withTurn, 'a1').id, 'a2');
});

test('sem mensagem de referência, vale a primeira conversa', () => {
  const messages = [
    { id: 'u1', from: 'user', text: 'gastei 50' },
    { id: 'a1', from: 'uni', text: 'Anotado.' },
  ];
  assert.equal(findUniReplyAfter(messages, null).id, 'a1');
});

test('entre várias respostas do mesmo turno, vale a última com texto', () => {
  const messages = [
    { id: 'u1', from: 'user', text: 'gastei 50' },
    { id: 'a1', from: 'uni', text: 'Entendendo…' },
    { id: 'a2', from: 'uni', text: '   ' },
    { id: 'a3', from: 'uni', text: 'Confere o rascunho?' },
  ];
  assert.equal(findUniReplyAfter(messages, null).id, 'a3');
});

test('saída da ferramenta diz se há rascunho esperando confirmação', () => {
  assert.deepEqual(
    JSON.parse(buildRealtimeToolOutput({ text: ' Confere? ', confirmation: { status: 'pending' } })),
    { resposta: 'Confere?', aguardando_confirmacao: true },
  );
  assert.deepEqual(
    JSON.parse(buildRealtimeToolOutput({ text: 'Lançado.' })),
    { resposta: 'Lançado.', aguardando_confirmacao: false },
  );
  assert.deepEqual(JSON.parse(buildRealtimeToolErrorOutput('demorou')), { erro: 'demorou' });
});

test('a sessão criada no servidor declara a mesma ferramenta', () => {
  assert.match(EDGE_SOURCE, new RegExp(`name: '${REALTIME_TOOL_NAMES.SEND_TO_UNI}'`));
  assert.match(EDGE_SOURCE, /required: \['frase'\]/);
});

const DRAFT = { id: 'a1', from: 'uni', text: 'Confere?', confirmation: { status: 'pending' } };

test('foto do turno guarda a última mensagem e o rascunho pendente', () => {
  const turn = snapshotRealtimeToolTurn([{ id: 'u1', from: 'user', text: 'gastei 50' }, DRAFT]);
  assert.deepEqual({ ...turn }, { baselineId: 'a1', confirmationId: 'a1', confirmationError: null });
  assert.deepEqual({ ...snapshotRealtimeToolTurn([]) }, { baselineId: null, confirmationId: null, confirmationError: null });
});

test('turno só termina com resposta nova ou mudança no rascunho', () => {
  const before = [{ id: 'u1', from: 'user', text: 'gastei 50' }, DRAFT];
  const turn = snapshotRealtimeToolTurn(before);
  const sent = [...before, { id: 'u2', from: 'user', text: 'pode lançar' }];
  assert.equal(resolveRealtimeToolOutcome(sent, turn), null);

  const confirmedWithoutReply = [
    { id: 'u1', from: 'user', text: 'gastei 50' },
    { ...DRAFT, confirmation: { status: 'confirmed' } },
    { id: 'u2', from: 'user', text: 'pode lançar' },
  ];
  assert.equal(resolveRealtimeToolOutcome(confirmedWithoutReply, turn), null);

  const replied = [...confirmedWithoutReply, { id: 'a2', from: 'uni', text: 'Lançado!' }];
  assert.deepEqual(JSON.parse(resolveRealtimeToolOutcome(replied, turn)), { resposta: 'Lançado!', aguardando_confirmacao: false });
});

test('cancelar ou erro ao confirmar terminam o turno sem resposta nova', () => {
  const before = [{ id: 'u1', from: 'user', text: 'gastei 50' }, DRAFT];
  const turn = snapshotRealtimeToolTurn(before);

  const canceled = [before[0], { ...DRAFT, confirmation: { status: 'canceled' } }, { id: 'u2', from: 'user', text: 'cancela' }];
  assert.equal(JSON.parse(resolveRealtimeToolOutcome(canceled, turn)).aguardando_confirmacao, false);
  assert.match(JSON.parse(resolveRealtimeToolOutcome(canceled, turn)).resposta, /cancelado/);

  const failed = [before[0], { ...DRAFT, confirmation: { status: 'pending', confirmationError: 'Conta removida.' } }];
  assert.deepEqual(JSON.parse(resolveRealtimeToolOutcome(failed, turn)), { erro: 'Conta removida.' });
});

test('erro que já estava no card antes do envio não encerra o turno', () => {
  const card = { ...DRAFT, confirmation: { status: 'pending', confirmationError: 'Erro antigo.' } };
  const turn = snapshotRealtimeToolTurn([card]);
  assert.equal(resolveRealtimeToolOutcome([card, { id: 'u2', from: 'user', text: 'pode lançar' }], turn), null);
});
