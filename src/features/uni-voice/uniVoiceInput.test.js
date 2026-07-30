import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createMediaRecorderAdapter,
  getSupportedVoiceMimeType,
  isMediaRecorderSupported,
  VOICE_AUDIO_MAX_BYTES,
  VOICE_AUDIO_MAX_DURATION_MS,
} from './mediaRecorderAdapter.js';
import {
  createUniVoiceTranscriptionProvider,
  validateVoiceTranscriptionRequest,
} from './uniVoiceTranscriptionProvider.js';
import { sanitizeVoiceTranscript } from './speechRecognitionAdapter.js';
import {
  initialVoiceCaptureState,
  voiceCaptureReducer,
  VOICE_CAPTURE_STATES,
} from './voiceCaptureReducer.js';
import { getVoiceInputMessage } from './voiceInputMessages.js';

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

function createRuntime({ getUserMedia } = {}) {
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track] };
  return {
    runtime: {
      navigator: {
        mediaDevices: {
          getUserMedia: getUserMedia ?? (async () => stream),
        },
      },
      MediaRecorder: FakeMediaRecorder,
      setTimeout,
      clearTimeout,
    },
    stream,
    track,
  };
}

test('captura real usa getUserMedia e MediaRecorder nativos', async () => {
  const { runtime } = createRuntime();
  let started = 0;
  const adapter = createMediaRecorderAdapter({ runtime, onStart: () => { started += 1; } });
  assert.equal(isMediaRecorderSupported(runtime), true);
  assert.equal(await adapter.start(), true);
  assert.equal(started, 1);
  adapter.dispose();
});

test('BUG 3: onStreamReady expõe o MESMO stream já capturado (sem um segundo getUserMedia)', async () => {
  const { runtime, stream } = createRuntime();
  let exposedStream = null;
  const adapter = createMediaRecorderAdapter({
    runtime,
    onStreamReady: (value) => { exposedStream = value; },
  });
  await adapter.start();
  assert.equal(exposedStream, stream);
  adapter.dispose();
});

test('parada explícita produz áudio e libera todas as tracks', async () => {
  const { runtime, track } = createRuntime();
  let capture = null;
  const adapter = createMediaRecorderAdapter({
    runtime,
    onAudio: (value) => { capture = value; },
  });
  await adapter.start();
  assert.equal(adapter.stop(), true);
  assert.ok(capture.audio instanceof Blob);
  assert.equal(capture.mimeType, 'audio/webm;codecs=opus');
  assert.equal(track.stopped, true);
});

test('cancelamento não envia áudio e libera microfone', async () => {
  const { runtime, track } = createRuntime();
  let sent = false;
  const adapter = createMediaRecorderAdapter({
    runtime,
    onAudio: () => { sent = true; },
  });
  await adapter.start();
  assert.equal(adapter.cancel(), true);
  assert.equal(sent, false);
  assert.equal(track.stopped, true);
});

test('permissão negada é classificada sem manter stream', async () => {
  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const { runtime } = createRuntime({ getUserMedia: async () => { throw denied; } });
  let code = null;
  const adapter = createMediaRecorderAdapter({
    runtime,
    onError: (error) => { code = error.code; },
  });
  assert.equal(await adapter.start(), false);
  assert.equal(code, 'permission_denied');
});

test('navegador incompatível mantém fallback textual', () => {
  assert.equal(isMediaRecorderSupported({ navigator: {} }), false);
  assert.match(getVoiceInputMessage({ status: VOICE_CAPTURE_STATES.UNSUPPORTED }), /escrevendo/i);
});

test('MIME é escolhido por allowlist fechada', () => {
  assert.equal(getSupportedVoiceMimeType(FakeMediaRecorder), 'audio/webm;codecs=opus');
});

test('validação cliente bloqueia áudio vazio, grande, longo e workspace ausente', () => {
  const valid = new Blob(['voice'], { type: 'audio/webm' });
  assert.equal(validateVoiceTranscriptionRequest({ audio: valid, durationMs: 1000, workspaceId: 'ws' }), null);
  assert.equal(validateVoiceTranscriptionRequest({ audio: new Blob([], { type: 'audio/webm' }), durationMs: 1000, workspaceId: 'ws' }), 'EMPTY_AUDIO');
  assert.equal(validateVoiceTranscriptionRequest({ audio: new Blob(['x'], { type: 'text/plain' }), durationMs: 1000, workspaceId: 'ws' }), 'UNSUPPORTED_AUDIO_TYPE');
  assert.equal(validateVoiceTranscriptionRequest({ audio: valid, durationMs: VOICE_AUDIO_MAX_DURATION_MS + 1, workspaceId: 'ws' }), 'AUDIO_DURATION_INVALID');
  assert.equal(validateVoiceTranscriptionRequest({ audio: valid, durationMs: 1000 }), 'WORKSPACE_REQUIRED');
  const large = new Blob([new Uint8Array(VOICE_AUDIO_MAX_BYTES + 1)], { type: 'audio/webm' });
  assert.equal(validateVoiceTranscriptionRequest({ audio: large, durationMs: 1000, workspaceId: 'ws' }), 'AUDIO_TOO_LARGE');
});

test('provider envia áudio somente à Edge autenticada e retorna texto sanitizado', async () => {
  let request = null;
  const provider = createUniVoiceTranscriptionProvider({
    client: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
    url: 'https://project.supabase.co',
    anonKey: 'anon',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ text: '  gastei   50  ' }) };
    },
  });
  const result = await provider.transcribe({
    audio: new Blob(['voice'], { type: 'audio/webm' }),
    durationMs: 1200,
    workspaceId: 'workspace',
  });
  assert.equal(result.text, 'gastei 50');
  assert.match(request.url, /\/functions\/v1\/uni-voice-transcribe$/);
  assert.equal(request.options.headers.Authorization, 'Bearer token');
  assert.ok(request.options.body instanceof FormData);
});

test('falha de transcrição não retorna texto e nunca expõe token no corpo', async () => {
  let body = null;
  const provider = createUniVoiceTranscriptionProvider({
    client: { auth: { getSession: async () => ({ data: { session: { access_token: 'secret-token' } } }) } },
    url: 'https://project.supabase.co',
    anonKey: 'anon',
    fetchImpl: async (_url, options) => {
      body = options.body;
      return { ok: false, status: 403 };
    },
  });
  const result = await provider.transcribe({
    audio: new Blob(['voice'], { type: 'audio/webm' }),
    durationMs: 1200,
    workspaceId: 'workspace',
  });
  assert.equal(result.error.code, 'WORKSPACE_FORBIDDEN');
  assert.doesNotMatch(String(body), /secret-token/);
});

test('transcrição vazia é rejeitada sem enviar mensagem ao chat', async () => {
  const provider = createUniVoiceTranscriptionProvider({
    client: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
    url: 'https://project.supabase.co',
    anonKey: 'anon',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: '   ' }),
    }),
  });
  const result = await provider.transcribe({
    audio: new Blob(['voice'], { type: 'audio/webm' }),
    durationMs: 1200,
    workspaceId: 'workspace',
  });
  assert.equal(result.text, null);
  assert.equal(result.error.code, 'EMPTY_TRANSCRIPT');
});

test('timeout de transcrição falha de forma controlada', async () => {
  const provider = createUniVoiceTranscriptionProvider({
    client: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
    url: 'https://project.supabase.co',
    anonKey: 'anon',
    timeoutMs: 1,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('timeout')));
    }),
  });
  const result = await provider.transcribe({
    audio: new Blob(['voice'], { type: 'audio/webm' }),
    durationMs: 1200,
    workspaceId: 'workspace',
  });
  assert.equal(result.text, null);
  assert.equal(result.error.code, 'TIMEOUT');
});

test('reducer representa permissão, escuta, processamento, conclusão e cancelamento', () => {
  const requesting = voiceCaptureReducer(initialVoiceCaptureState, { type: 'REQUEST_PERMISSION' });
  const listening = voiceCaptureReducer(requesting, { type: 'START_LISTENING' });
  const processing = voiceCaptureReducer(listening, { type: 'PROCESS' });
  const completed = voiceCaptureReducer(processing, { type: 'COMPLETE' });
  const canceled = voiceCaptureReducer(completed, { type: 'CANCEL' });
  assert.equal(requesting.status, VOICE_CAPTURE_STATES.REQUESTING_PERMISSION);
  assert.equal(listening.status, VOICE_CAPTURE_STATES.LISTENING);
  assert.equal(processing.status, VOICE_CAPTURE_STATES.PROCESSING);
  assert.equal(completed.status, VOICE_CAPTURE_STATES.COMPLETED);
  assert.equal(canceled.status, VOICE_CAPTURE_STATES.CANCELED);
});

test('Edge Function valida origem, sessão, workspace, MIME, tamanho e duração', () => {
  const edge = readFileSync(
    new URL('../../../supabase/functions/uni-voice-transcribe/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(edge, /APP_ALLOWED_ORIGINS/);
  assert.match(edge, /getAuthenticatedUserId/);
  assert.match(edge, /hasWorkspaceMembership/);
  assert.match(edge, /MAX_AUDIO_BYTES/);
  assert.match(edge, /MAX_DURATION_MS/);
  assert.match(edge, /ALLOWED_MIME_TYPES/);
  assert.match(edge, /OPENAI_API_KEY/);
  assert.doesNotMatch(edge, /service_role|SERVICE_ROLE/);
});

test('logs server-side contêm somente métricas, nunca transcrição ou identidade', () => {
  const edge = readFileSync(
    new URL('../../../supabase/functions/uni-voice-transcribe/index.ts', import.meta.url),
    'utf8',
  );
  const logBlock = edge.slice(edge.indexOf('console.log'), edge.indexOf('return jsonResponse(200'));
  assert.doesNotMatch(logBlock, /userId|workspaceId|text|authorization/i);
});

test('sanitização limita conteúdo e remove caracteres de controle', () => {
  assert.equal(sanitizeVoiceTranscript('  oi\u0000   Uni  ', 6), 'oi Uni');
});
