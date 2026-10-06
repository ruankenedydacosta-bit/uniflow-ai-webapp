import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealtimeSessionState,
  estimateCostUsd,
  isRealtimeSessionIdle,
  percentile,
  REALTIME_STATUS,
  reduceRealtimeEvent,
  summarizeRealtimeSession,
} from './realtimeSessionModel.js';

function play(events) {
  return events.reduce(
    (state, [type, at, extra = {}]) => reduceRealtimeEvent(state, { type, ...extra }, at),
    createRealtimeSessionState(),
  );
}

test('latência vai do fim da fala detectado até a primeira palavra da Uni', () => {
  const state = play([
    ['local.connecting', 0],
    ['local.connected', 100],
    ['input_audio_buffer.speech_started', 1000],
    ['input_audio_buffer.speech_stopped', 3000],
    ['output_audio_buffer.started', 3800],
    ['output_audio_buffer.stopped', 6000],
  ]);
  assert.deepEqual(state.latenciesMs, [800]);
  assert.equal(state.status, REALTIME_STATUS.LISTENING);
  assert.equal(state.uniSpeaking, false);
});

test('fala da pessoa enquanto a Uni fala conta como interrupção; fora disso, não', () => {
  const state = play([
    ['local.connected', 0],
    ['input_audio_buffer.speech_started', 100],
    ['input_audio_buffer.speech_stopped', 900],
    ['output_audio_buffer.started', 1500],
    ['input_audio_buffer.speech_started', 2000],
    ['output_audio_buffer.cleared', 2050],
  ]);
  assert.equal(state.interruptions, 1);
  assert.equal(state.status, REALTIME_STATUS.USER_SPEAKING);
});

test('interrupção marcada como falsa nunca passa do total de interrupções', () => {
  let state = play([['local.connected', 0]]);
  state = reduceRealtimeEvent(state, { type: 'local.mark_false_interruption' }, 10);
  assert.equal(state.falseInterruptions, 0);

  state = play([
    ['local.connected', 0],
    ['output_audio_buffer.started', 100],
    ['input_audio_buffer.speech_started', 200],
    ['local.mark_false_interruption', 300],
    ['local.mark_false_interruption', 400],
  ]);
  assert.equal(state.falseInterruptions, 1);
});

test('resposta iniciada sem fala detectada antes não gera latência', () => {
  const state = play([
    ['local.connected', 0],
    ['output_audio_buffer.started', 500],
  ]);
  assert.deepEqual(state.latenciesMs, []);
});

test('transcrição guarda as falas em ordem e ignora texto vazio', () => {
  const state = play([
    ['conversation.item.input_audio_transcription.completed', 1, { item_id: 'a', transcript: ' Gastei cinquenta no mercado ' }],
    ['response.output_audio_transcript.done', 2, { item_id: 'b', transcript: 'Anotado!' }],
    ['response.output_audio_transcript.done', 3, { item_id: 'c', transcript: '   ' }],
  ]);
  assert.deepEqual(state.transcript, [
    { role: 'user', itemId: 'a', text: 'Gastei cinquenta no mercado' },
    { role: 'uni', itemId: 'b', text: 'Anotado!' },
  ]);
});

test('uso de tokens soma entre respostas e vira custo pelo preço do mini', () => {
  const usage = {
    input_token_details: { audio_tokens: 600, text_tokens: 400, cached_tokens: 200 },
    output_token_details: { audio_tokens: 1200, text_tokens: 50 },
  };
  const state = play([
    ['response.done', 1, { response: { usage } }],
    ['response.done', 2, { response: { usage } }],
  ]);
  assert.deepEqual(state.usage, { audioIn: 1200, textIn: 800, cachedIn: 400, audioOut: 2400, textOut: 100 });
  // 1200×10 + 800×0,6 + 2400×20 + 100×2,4 = 60.720 por 1M
  assert.equal(estimateCostUsd(state.usage).toFixed(5), '0.06072');
});

test('resumo calcula duração, percentis e custo por minuto', () => {
  let state = play([
    ['local.connected', 0],
    ['input_audio_buffer.speech_stopped', 1000],
    ['output_audio_buffer.started', 1500],
    ['input_audio_buffer.speech_stopped', 5000],
    ['output_audio_buffer.started', 6000],
    ['response.done', 7000, { response: { usage: { output_token_details: { audio_tokens: 1_000_000 } } } }],
  ]);
  state = reduceRealtimeEvent(state, { type: 'local.ended', reason: 'user' }, 120000);
  const summary = summarizeRealtimeSession(state, 999999);
  assert.equal(summary.sessionMs, 120000);
  assert.equal(summary.turns, 2);
  assert.equal(summary.latencyP50Ms, 500);
  assert.equal(summary.latencyP95Ms, 1000);
  assert.equal(summary.costUsd, 20);
  assert.equal(summary.costBrl, 110);
  assert.equal(summary.costBrlPerMinute, 55);
});

test('percentil de lista vazia é nulo', () => {
  assert.equal(percentile([], 95), null);
});

test('sessão parada além do limite é ociosa, mas nunca enquanto a Uni fala ou a pessoa fala', () => {
  const listening = play([['local.connected', 0]]);
  assert.equal(isRealtimeSessionIdle(listening, 59999, 60000), false);
  assert.equal(isRealtimeSessionIdle(listening, 60000, 60000), true);

  const speaking = play([['local.connected', 0], ['output_audio_buffer.started', 10]]);
  assert.equal(isRealtimeSessionIdle(speaking, 999999, 60000), false);

  const userSpeaking = play([['local.connected', 0], ['input_audio_buffer.speech_started', 10]]);
  assert.equal(isRealtimeSessionIdle(userSpeaking, 999999, 60000), false);
});

test('fim registrado uma vez só e erro não é sobrescrito por fim', () => {
  let state = play([['local.connected', 0], ['local.ended', 100, { reason: 'idle' }]]);
  state = reduceRealtimeEvent(state, { type: 'local.ended', reason: 'user' }, 200);
  assert.equal(state.endReason, 'idle');
  assert.equal(state.endedAt, 100);

  state = play([['local.connected', 0], ['local.failed', 50, { message: 'caiu', code: 'NOT_ALLOWED' }], ['local.ended', 60]]);
  assert.equal(state.status, REALTIME_STATUS.ERROR);
  assert.equal(state.error, 'caiu');
  assert.equal(state.errorCode, 'NOT_ALLOWED');
});

test('ferramenta em execução deixa a Uni pensando e impede o encerramento por inatividade', () => {
  let state = play([['local.connected', 0], ['local.tool_started', 100]]);
  assert.equal(state.status, REALTIME_STATUS.THINKING);
  assert.equal(isRealtimeSessionIdle(state, 999999, 60000), false);

  state = reduceRealtimeEvent(state, { type: 'local.tool_finished' }, 5000);
  assert.equal(state.toolCallsPending, 0);
  assert.equal(isRealtimeSessionIdle(state, 64999, 60000), false);
  assert.equal(isRealtimeSessionIdle(state, 65000, 60000), true);
});

test('fim de ferramenta sem início não deixa contador negativo', () => {
  const state = play([['local.connected', 0], ['local.tool_finished', 10]]);
  assert.equal(state.toolCallsPending, 0);
});
