// Testes do registro determinístico de IDs de mensagens (messageIdRegistry).
//
// Cobre a causa raiz do BUG 2: nextId() antigo recomeçava a cada reload e
// podia gerar o MESMO id de uma mensagem restaurada (ex.: msg-7). Como o
// autoplay marca mensagens restauradas como já narradas, a mensagem NOVA com
// o id colidido era considerada já narrada e nunca falava.
//
// Regras verificadas:
// - ids novos são msg-N monotônicos e únicos;
// - ids RESTAURADOS (reserveMessageIds) nunca são reutilizados;
// - reserva eleva o piso do contador (restaurar msg-7 impede msg-7 de novo);
// - reload simulado (reset + reserva) nunca repete o histórico;
// - mensagens restauradas marcadas como já narradas NUNCA bloqueiam uma
//   mensagem nova (hasSpoken não trava o pipeline por colisão de id);
// - uniChatAdapter usa exclusivamente o registro (nunca nextId de mockData).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  nextMessageId,
  reserveMessageIds,
  resetMessageIdRegistry,
} from './messageIdRegistry.js';
import {
  hasAutoSpokenMessage,
  markRestoredMessagesAsSpoken,
  resetAutoSpokenMessages,
} from '../uni-voice-tts/spokenMessageSession.js';
import { runAssistantResponsePipeline } from './useUniResponsePipeline.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

beforeEach(() => {
  resetMessageIdRegistry();
  resetAutoSpokenMessages();
});

test('sem histórico restaurado, ids são msg-N sequenciais e únicos', () => {
  assert.equal(nextMessageId(), 'msg-1');
  assert.equal(nextMessageId(), 'msg-2');
  assert.equal(nextMessageId(), 'msg-3');
});

test('ids restaurados nunca colidem com ids novos (msg-7 restaurada nunca se repete)', () => {
  reserveMessageIds([
    { id: 'msg-7', from: 'uni', text: 'resposta antiga' },
    { id: 'msg-2', from: 'user', text: 'pergunta antiga' },
  ]);
  const generated = Array.from({ length: 10 }, () => nextMessageId());
  assert.ok(!generated.includes('msg-7'), 'msg-7 restaurada não pode ser gerada de novo');
  assert.ok(!generated.includes('msg-2'), 'msg-2 restaurada não pode ser gerada de novo');
  assert.equal(new Set(generated).size, generated.length, 'ids gerados são únicos entre si');
});

test('reserva eleva o piso do contador -- após restaurar msg-7, o próximo id é msg-8', () => {
  reserveMessageIds([{ id: 'msg-7', from: 'uni', text: 'x' }]);
  assert.equal(nextMessageId(), 'msg-8');
});

test('reserva é idempotente e ignora formatos externos (uuid do banco, objetos sem id, listas vazias)', () => {
  reserveMessageIds([]);
  reserveMessageIds(null);
  reserveMessageIds([{ id: '00000000-0000-4000-8000-000000000000', from: 'uni' }]);
  reserveMessageIds([{ from: 'uni', text: 'sem id' }]);
  reserveMessageIds([{ id: 'msg-4', from: 'uni' }]);
  reserveMessageIds([{ id: 'msg-4', from: 'uni' }]);
  // msg-4 foi reservada (e elevou o piso para 5); formatos externos/sem id
  // foram ignorados -- o primeiro id novo é msg-5 e msg-4 nunca se repete.
  assert.equal(nextMessageId(), 'msg-5', 'msg-4 reservada eleva o piso; ids anteriores ficam livres no vazio');
  const generated = [nextMessageId(), nextMessageId(), nextMessageId()];
  assert.ok(!generated.includes('msg-4'), 'msg-4 nunca é reutilizada');
});

test('reload de página simulado: reset + reserva do histórico restaurado -- ids novos são disjuntos dos restaurados', () => {
  // Sessão anterior gerou msg-1..msg-9 e persistiu o histórico.
  const restoredHistory = Array.from({ length: 9 }, (_, i) => ({
    id: `msg-${i + 1}`,
    from: 'uni',
    text: `resposta ${i + 1}`,
  }));
  // Reload: módulo reiniciado (reset) + histórico restaurado reservado.
  resetMessageIdRegistry();
  reserveMessageIds(restoredHistory);
  const newIds = Array.from({ length: 5 }, () => nextMessageId());
  assert.deepEqual(newIds, ['msg-10', 'msg-11', 'msg-12', 'msg-13', 'msg-14']);
  assert.equal(
    newIds.every((id) => !restoredHistory.some((m) => m.id === id)),
    true,
    'nenhum id novo coincide com o histórico restaurado',
  );
});

test('regressão autoplay: mensagem restaurada marcada como já narrada NUNCA bloqueia mensagem nova por colisão de id', () => {
  // Cenário real do bug: histórico restaurado com msg-7 (já narrada).
  const restored = [{ id: 'msg-7', from: 'uni', text: 'resposta antiga' }];
  markRestoredMessagesAsSpoken('user-1', restored);
  assert.equal(hasAutoSpokenMessage('user-1', 'msg-7'), true);

  // Nova resposta chega com um id NOVO (registro nunca devolve msg-7).
  reserveMessageIds(restored);
  const msg = { id: nextMessageId(), from: 'uni', text: 'resposta nova' };
  assert.notEqual(msg.id, 'msg-7', 'a mensagem nova nunca colide com a restaurada');
  assert.equal(hasAutoSpokenMessage('user-1', msg.id), false, 'mensagem nova não é considerada já narrada');

  // O pipeline fala normalmente (gates abertos + id novo não bloqueado).
  const spoken = [];
  runAssistantResponsePipeline({
    text: 'resposta nova',
    options: {},
    buildMessage: () => msg,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: (userId, messageId) => {
      // usa o mesmo registro por sessão
      assert.equal(userId, 'user-1');
      assert.equal(messageId, msg.id);
    },
    speakMessage: (m) => spoken.push(m.id),
    userId: 'user-1',
  });
  assert.deepEqual(spoken, [msg.id], 'speakMessage executa para a mensagem nova');
});

test('uniChatAdapter usa exclusivamente o messageIdRegistry (nextMessageId) -- nunca nextId de mockData', async () => {
  const adapter = await source('uniChatAdapter.js');
  assert.match(adapter, /import \{ nextMessageId \} from '\.\/messageIdRegistry\.js';/);
  assert.doesNotMatch(adapter, /nextId/);
});
