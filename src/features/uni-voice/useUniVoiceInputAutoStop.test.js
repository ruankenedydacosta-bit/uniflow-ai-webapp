import assert from 'node:assert/strict';
import React from 'react';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { act, create } from 'react-test-renderer';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { VOICE_CAPTURE_STATES } from './voiceCaptureReducer.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STEP_MS = 50;

class FakeMediaRecorder {
  static isTypeSupported(type) {
    return type.startsWith('audio/webm');
  }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || 'audio/webm';
    this.state = 'inactive';
  }

  start() {
    this.state = 'recording';
    this.onstart?.();
  }

  stop() {
    if (this.state !== 'recording') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

// Navegador falso: microfone, MediaRecorder e um AudioContext cujo volume o
// teste controla. setInterval guarda o tick para o teste avançar o relógio.
function createRuntime() {
  const track = { stop() {} };
  const stream = { getTracks: () => [track] };
  const runtime = {
    clock: 0,
    level: 0.005,
    tick: null,
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    MediaRecorder: FakeMediaRecorder,
    setTimeout,
    clearTimeout,
    performance: { now: () => runtime.clock },
    setInterval(callback) {
      runtime.tick = callback;
      return 1;
    },
    clearInterval() {
      runtime.tick = null;
    },
    AudioContext: class {
      constructor() { this.state = 'running'; }

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

      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }

      close() { this.state = 'closed'; return Promise.resolve(); }
    },
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' },
  };
  return runtime;
}

async function advance(runtime, level, ms) {
  runtime.level = level;
  for (let elapsed = 0; elapsed < ms && runtime.tick; elapsed += STEP_MS) {
    await act(async () => { runtime.tick?.(); });
    runtime.clock += STEP_MS;
  }
}

let viteServer;
let useUniVoiceInput;

async function loadHook() {
  if (useUniVoiceInput) return useUniVoiceInput;
  viteServer = await createServer({
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    server: { middlewareMode: true },
    ssr: { external: ['react', 'react-dom'] },
    appType: 'custom',
  });
  ({ useUniVoiceInput } = await viteServer.ssrLoadModule('/src/features/uni-voice/useUniVoiceInput.js'));
  return useUniVoiceInput;
}

test.after(async () => { await viteServer?.close(); });

async function mountHook(options) {
  const hook = await loadHook();
  const holder = {};
  function Probe() {
    holder.current = hook(options);
    return null;
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  return { holder, renderer };
}

test('ENVIO-AUTO: parar de falar envia o áudio sozinho e entrega a transcrição', async () => {
  const runtime = createRuntime();
  const transcribed = [];
  const finals = [];
  const { holder, renderer } = await mountHook({
    runtime,
    workspaceId: 'ws-1',
    onFinalTranscript: (text) => finals.push(text),
    transcriptionProvider: {
      transcribe: async (request) => {
        transcribed.push(request);
        return { text: 'gastei quarenta e cinco no mercado' };
      },
    },
  });

  await act(async () => { await holder.current.start(); });
  assert.equal(holder.current.status, VOICE_CAPTURE_STATES.LISTENING);

  await advance(runtime, 0.005, 400);
  await advance(runtime, 0.15, 800);
  await advance(runtime, 0.005, 1000);
  assert.equal(transcribed.length, 0, 'não envia antes do silêncio completo');

  await advance(runtime, 0.005, 600);
  assert.equal(transcribed.length, 1);
  assert.deepEqual(finals, ['gastei quarenta e cinco no mercado']);
  assert.equal(holder.current.status, VOICE_CAPTURE_STATES.COMPLETED);
  await act(async () => { renderer.unmount(); });
});

test('ENVIO-AUTO: nada dito encerra como "não ouvi" sem mandar áudio para transcrição', async () => {
  const runtime = createRuntime();
  let transcribeCalls = 0;
  const { holder, renderer } = await mountHook({
    runtime,
    workspaceId: 'ws-1',
    transcriptionProvider: {
      transcribe: async () => { transcribeCalls += 1; return { text: 'x' }; },
    },
  });

  await act(async () => { await holder.current.start(); });
  await advance(runtime, 0.005, 8000);

  assert.equal(transcribeCalls, 0);
  assert.equal(holder.current.status, VOICE_CAPTURE_STATES.NO_SPEECH);
  await act(async () => { renderer.unmount(); });
});

test('ENVIO-AUTO desligado: só o toque em "Enviar" encerra a captura', async () => {
  const runtime = createRuntime();
  let transcribeCalls = 0;
  const { holder, renderer } = await mountHook({
    runtime,
    workspaceId: 'ws-1',
    autoStopOnSilence: false,
    transcriptionProvider: {
      transcribe: async () => { transcribeCalls += 1; return { text: 'ok' }; },
    },
  });

  await act(async () => { await holder.current.start(); });
  assert.equal(runtime.tick, null, 'nenhum monitor de silêncio criado');
  assert.equal(holder.current.status, VOICE_CAPTURE_STATES.LISTENING);

  await act(async () => { holder.current.stop(); });
  assert.equal(transcribeCalls, 1);
  await act(async () => { renderer.unmount(); });
});
