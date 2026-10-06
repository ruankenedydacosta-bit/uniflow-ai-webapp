import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSilenceMonitor,
  createVoiceEndpointer,
  VOICE_ENDPOINT_DEFAULTS,
  VOICE_ENDPOINT_EVENTS,
} from './voiceEndpointing.js';

const STEP_MS = 50;
const QUIET = 0.005;
const VOICE = 0.15;

// Alimenta o endpointer com trechos { rms, ms } e devolve o primeiro evento
// com o instante em que ele ocorreu.
function runScript(endpointer, segments) {
  let now = 0;
  for (const { rms, ms } of segments) {
    for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
      const event = endpointer.push(rms, now);
      if (event) return { event, at: now };
      now += STEP_MS;
    }
  }
  return { event: null, at: now };
}

test('fala seguida de silêncio encerra só depois de silenceMs', () => {
  const { event, at } = runScript(createVoiceEndpointer(), [
    { rms: QUIET, ms: 400 },
    { rms: VOICE, ms: 800 },
    { rms: QUIET, ms: 3000 },
  ]);
  assert.equal(event, VOICE_ENDPOINT_EVENTS.END_OF_SPEECH);
  const lastVoiceAt = 400 + 800 - STEP_MS;
  assert.ok(at - lastVoiceAt >= VOICE_ENDPOINT_DEFAULTS.silenceMs, `encerrou cedo demais: ${at - lastVoiceAt} ms`);
  assert.ok(at - lastVoiceAt < VOICE_ENDPOINT_DEFAULTS.silenceMs + 2 * STEP_MS);
});

test('pausa de pensar no meio da frase (1 s) não envia', () => {
  const { event } = runScript(createVoiceEndpointer(), [
    { rms: QUIET, ms: 400 },
    { rms: VOICE, ms: 500 },
    { rms: QUIET, ms: 1000 },
    { rms: VOICE, ms: 500 },
  ]);
  assert.equal(event, null);
});

test('nada dito no prazo devolve NO_SPEECH, nunca END_OF_SPEECH', () => {
  const { event, at } = runScript(createVoiceEndpointer(), [{ rms: QUIET, ms: 9000 }]);
  assert.equal(event, VOICE_ENDPOINT_EVENTS.NO_SPEECH);
  assert.equal(at, VOICE_ENDPOINT_DEFAULTS.noSpeechTimeoutMs);
});

test('estalo curto no microfone não abre a fala', () => {
  const endpointer = createVoiceEndpointer();
  const { event } = runScript(endpointer, [
    { rms: QUIET, ms: 400 },
    { rms: VOICE, ms: 100 },
    { rms: QUIET, ms: 9000 },
  ]);
  assert.equal(event, VOICE_ENDPOINT_EVENTS.NO_SPEECH);
  assert.equal(endpointer.hasSpeech(), false);
});

test('ambiente barulhento sobe o limiar: ruído constante não vira fala', () => {
  const { event } = runScript(createVoiceEndpointer(), [{ rms: 0.04, ms: 9000 }]);
  assert.equal(event, VOICE_ENDPOINT_EVENTS.NO_SPEECH);
});

test('falar logo no início não sobe o limiar (piso usa o menor volume da calibração)', () => {
  const { event } = runScript(createVoiceEndpointer(), [
    { rms: QUIET, ms: 100 },
    { rms: VOICE, ms: 900 },
    { rms: QUIET, ms: 2000 },
  ]);
  assert.equal(event, VOICE_ENDPOINT_EVENTS.END_OF_SPEECH);
});

test('depois do evento o endpointer não dispara de novo', () => {
  const endpointer = createVoiceEndpointer();
  runScript(endpointer, [{ rms: QUIET, ms: 9000 }]);
  assert.equal(endpointer.push(QUIET, 20000), null);
  assert.equal(endpointer.push(VOICE, 20050), null);
});

function createFakeRuntime({ contextState = 'running' } = {}) {
  const runtime = {
    clock: 0,
    level: QUIET,
    tick: null,
    closed: 0,
    cleared: 0,
    performance: { now: () => runtime.clock },
    setInterval(callback) {
      runtime.tick = callback;
      return 1;
    },
    clearInterval() {
      runtime.cleared += 1;
    },
    AudioContext: class {
      constructor() {
        this.state = contextState;
      }

      createAnalyser() {
        return {
          fftSize: 0,
          getByteTimeDomainData(buffer) {
            const amplitude = Math.round(runtime.level * 128);
            for (let i = 0; i < buffer.length; i += 1) {
              buffer[i] = i % 2 === 0 ? 128 + amplitude : 128 - amplitude;
            }
          },
        };
      }

      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }

      resume() {
        return Promise.resolve();
      }

      close() {
        runtime.closed += 1;
        this.state = 'closed';
        return Promise.resolve();
      }
    },
  };
  return runtime;
}

function advance(runtime, level, ms) {
  runtime.level = level;
  for (let elapsed = 0; elapsed < ms && runtime.tick; elapsed += STEP_MS) {
    runtime.tick();
    runtime.clock += STEP_MS;
  }
}

test('monitor chama onEndOfSpeech uma vez e libera o AudioContext', () => {
  const runtime = createFakeRuntime();
  let ended = 0;
  let noSpeech = 0;
  const monitor = createSilenceMonitor({
    stream: {},
    runtime,
    onEndOfSpeech: () => { ended += 1; },
    onNoSpeech: () => { noSpeech += 1; },
  });
  assert.equal(monitor.supported, true);
  advance(runtime, QUIET, 400);
  advance(runtime, VOICE, 800);
  advance(runtime, QUIET, 3000);
  assert.equal(ended, 1);
  assert.equal(noSpeech, 0);
  assert.equal(runtime.closed, 1);
  assert.equal(runtime.cleared, 1);
  monitor.dispose();
  assert.equal(runtime.closed, 1, 'dispose repetido não fecha de novo');
});

test('AudioContext suspenso (iOS) nunca decide "não ouvi": o envio volta a depender do toque', () => {
  const runtime = createFakeRuntime({ contextState: 'suspended' });
  let noSpeech = 0;
  createSilenceMonitor({ stream: {}, runtime, onNoSpeech: () => { noSpeech += 1; } });
  advance(runtime, QUIET, 15000);
  assert.equal(noSpeech, 0);
});

test('sem AudioContext ou sem stream o monitor fica inerte', () => {
  assert.equal(createSilenceMonitor({ stream: {}, runtime: { setInterval() {} } }).supported, false);
  assert.equal(createSilenceMonitor({ stream: null, runtime: createFakeRuntime() }).supported, false);
});
