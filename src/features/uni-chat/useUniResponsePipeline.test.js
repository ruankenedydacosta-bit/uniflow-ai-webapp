// Testes do Pipeline Oficial de Resposta da Uni.
//
// Verifica o contrato do pipeline: toda resposta da Uni passa por
// runAssistantResponsePipeline na ordem criação → persistência → render. O
// chat não fala as respostas: a voz da Uni é só a conversa em tempo real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runAssistantResponsePipeline } from './useUniResponsePipeline.js';

function setup({ persist = true, messageOptions = {} } = {}) {
  const calls = { build: [], persist: [], push: [], order: [] };
  let nextId = 1;
  const buildMessage = (text, options) => {
    const msg = { id: `msg-${nextId++}`, from: 'uni', text, ...options };
    calls.build.push({ text, options });
    calls.order.push(`build:${msg.id}`);
    return msg;
  };
  const persistMessage = (msg) => {
    calls.persist.push(msg);
    calls.order.push(`persist:${msg.id}`);
  };
  const pushMessage = (msg) => {
    calls.push.push(msg);
    calls.order.push(`push:${msg.id}`);
  };
  const result = runAssistantResponsePipeline({
    text: 'Olá!',
    options: { persist, ...messageOptions },
    buildMessage,
    pushMessage,
    persistMessage,
  });
  return { result, calls };
}

test('pipeline cria, persiste e renderiza na ordem oficial (build → persist → push)', () => {
  const { calls } = setup();
  const id = calls.order[0].split(':')[1];
  assert.deepEqual(calls.order, [`build:${id}`, `persist:${id}`, `push:${id}`]);
});

test('a mensagem retornada tem o texto e as opções repassadas ao buildMessage', () => {
  const { result, calls } = setup({ messageOptions: { type: 'confirmation', highlight: ['saldo'] } });
  assert.equal(result.text, 'Olá!');
  assert.equal(calls.build[0].options.type, 'confirmation');
  assert.equal(calls.build[0].options.highlight[0], 'saldo');
});

test('persist=false não persiste, mas ainda renderiza', () => {
  const { calls } = setup({ persist: false });
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.push.length, 1);
});

test('opções da antiga narração (autoplay, deduplicateNarration) nunca entram na mensagem', () => {
  const { result, calls } = setup({ messageOptions: { autoplay: false, deduplicateNarration: false, type: 'text' } });
  assert.deepEqual(Object.keys(calls.build[0].options), ['type']);
  assert.equal('autoplay' in result, false);
  assert.equal('deduplicateNarration' in result, false);
});

test('buildMessage retornando null aborta o pipeline sem side effects', () => {
  const calls = { persist: 0, push: 0 };
  const result = runAssistantResponsePipeline({
    text: 'Olá!',
    options: {},
    buildMessage: () => null,
    pushMessage: () => { calls.push += 1; },
    persistMessage: () => { calls.persist += 1; },
  });
  assert.equal(result, null);
  assert.equal(calls.persist, 0);
  assert.equal(calls.push, 0);
});

test('o pipeline não fala: nenhuma referência a voz ou narração', async () => {
  const code = await readFile(new URL('./useUniResponsePipeline.js', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /speakMessage|shouldAutoSpeak|markSpoken|uni-voice-tts/);
});
