// FASE ESTADOS DE PROCESSAMENTO (HOTFIX: abandono da revelação progressiva):
// textAudioSync.js é puro (sem React, sem timers, sem DOM) -- coberto
// integralmente com node:test, sem fake timers. A partir desta rodada o
// contrato é binário por mensagem: 'pending' (nada visível) -> 'done'
// (texto completo visível), sem nenhuma etapa intermediária de revelação.
import assert from 'node:assert/strict';
import test from 'node:test';
import { reduceTextAudioSyncState, TEXT_AUDIO_SYNC_PHASES } from './textAudioSync.js';

const STATUS = Object.freeze({ playingStatus: 'playing', stoppedStatus: 'stopped', errorStatus: 'error' });

test('sem mensagem ativa -> fase idle', () => {
  const next = reduceTextAudioSyncState({ id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.DONE }, {
    activeId: null, ttsStatus: 'idle', ...STATUS,
  });
  assert.deepEqual(next, { id: null, phase: TEXT_AUDIO_SYNC_PHASES.IDLE });
});

test('nova mensagem ativa ainda carregando (LOADING) -> fase pending, NUNCA revela texto', () => {
  const next = reduceTextAudioSyncState({ id: null, phase: TEXT_AUDIO_SYNC_PHASES.IDLE }, {
    activeId: 'm1', ttsStatus: 'loading', ...STATUS,
  });
  assert.deepEqual(next, { id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.PENDING });
});

test('reprodução real começa (playing) -> fase done IMEDIATAMENTE (texto completo junto com a voz, sem revelação parcial)', () => {
  const next = reduceTextAudioSyncState({ id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.PENDING }, {
    activeId: 'm1', ttsStatus: 'playing', ...STATUS,
  });
  assert.deepEqual(next, { id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.DONE });
});

test('áudio termina (stopped) -> texto completo imediatamente', () => {
  const next = reduceTextAudioSyncState({ id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.PENDING }, {
    activeId: 'm1', ttsStatus: 'stopped', ...STATUS,
  });
  assert.deepEqual(next, { id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.DONE });
});

test('erro de TTS -> texto completo imediatamente (nunca trava escondido)', () => {
  const next = reduceTextAudioSyncState({ id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.PENDING }, {
    activeId: 'm1', ttsStatus: 'error', ...STATUS,
  });
  assert.deepEqual(next, { id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.DONE });
});

test('repetir a reprodução de uma mensagem já concluída (done) NUNCA volta a esconder o texto', () => {
  const next = reduceTextAudioSyncState({ id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.DONE }, {
    activeId: 'm1', ttsStatus: 'playing', ...STATUS,
  });
  assert.deepEqual(next, { id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.DONE });
});

test('nova mensagem (id diferente) durante playing de outra reinicia corretamente para a nova -- identidade nunca vaza entre mensagens', () => {
  const next = reduceTextAudioSyncState({ id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.DONE }, {
    activeId: 'm2', ttsStatus: 'playing', ...STATUS,
  });
  assert.deepEqual(next, { id: 'm2', phase: TEXT_AUDIO_SYNC_PHASES.DONE });
});

test('nova mensagem (id diferente) ainda carregando -> pending para a nova, mesmo que a anterior estivesse done', () => {
  const next = reduceTextAudioSyncState({ id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.DONE }, {
    activeId: 'm2', ttsStatus: 'loading', ...STATUS,
  });
  assert.deepEqual(next, { id: 'm2', phase: TEXT_AUDIO_SYNC_PHASES.PENDING });
});

test('pausa (status nem playing/stopped/error) no meio do pending preserva o estado -- nunca reinicia', () => {
  const prev = { id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.PENDING };
  const next = reduceTextAudioSyncState(prev, { activeId: 'm1', ttsStatus: 'paused', ...STATUS });
  assert.deepEqual(next, prev);
});

test('autoplay bloqueado / TTS indisponível ainda assim resolve para done via status error (texto completo, nunca preso em pending)', () => {
  const next = reduceTextAudioSyncState({ id: 'm1', phase: TEXT_AUDIO_SYNC_PHASES.PENDING }, {
    activeId: 'm1', ttsStatus: 'error', ...STATUS,
  });
  assert.equal(next.phase, TEXT_AUDIO_SYNC_PHASES.DONE);
});
