import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationEndSound, shouldPlayConversationEndSound } from './conversationEndSound.js';
import { REALTIME_STATUS } from './realtimeSessionModel.js';

const OPEN = { status: REALTIME_STATUS.LISTENING, startedAt: 10 };

test('som de fim toca quando uma conversa aberta termina', () => {
  for (const endReason of ['user', 'idle', 'quota']) {
    assert.equal(shouldPlayConversationEndSound(OPEN, { status: REALTIME_STATUS.ENDED, endReason }), true, endReason);
  }
  assert.equal(shouldPlayConversationEndSound(OPEN, { status: REALTIME_STATUS.ERROR }), true);
});

test('som de fim não toca em segundo plano, antes de conectar nem duas vezes', () => {
  assert.equal(shouldPlayConversationEndSound(OPEN, { status: REALTIME_STATUS.ENDED, endReason: 'lifecycle' }), false);
  assert.equal(
    shouldPlayConversationEndSound({ status: REALTIME_STATUS.CONNECTING, startedAt: null }, { status: REALTIME_STATUS.ERROR }),
    false,
  );
  assert.equal(
    shouldPlayConversationEndSound(
      { status: REALTIME_STATUS.ENDED, startedAt: 10, endReason: 'user' },
      { status: REALTIME_STATUS.ENDED, startedAt: 10, endReason: 'user' },
    ),
    false,
  );
  assert.equal(shouldPlayConversationEndSound(OPEN, { status: REALTIME_STATUS.SPEAKING, startedAt: 10 }), false);
});

function createFakeAudioRuntime() {
  const started = [];
  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
      this.closed = false;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.closed = true; return Promise.resolve(); }
    createOscillator() {
      return {
        frequency: { setValueAtTime: (value) => started.push(value) },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  }
  return { runtime: { AudioContext: FakeAudioContext }, started };
}

test('som de fim só toca depois do prime e toca duas notas descendo', () => {
  const { runtime, started } = createFakeAudioRuntime();
  const sound = createConversationEndSound(runtime);
  sound.play();
  assert.deepEqual(started, []);
  sound.prime();
  sound.play();
  assert.equal(started.length, 2);
  assert.ok(started[0] > started[1]);
});

test('sem Web Audio, o som de fim não quebra', () => {
  const sound = createConversationEndSound({});
  sound.prime();
  sound.play();
  sound.dispose();
});
