import assert from 'node:assert/strict';
import test from 'node:test';
import { recordVoicePipelineDiagnostic } from './voicePipelineDiagnostics.js';

test('fora de DEV, sem opt-in de localStorage, nunca loga nada (retorna null, logger nunca chamado)', () => {
  const logs = [];
  const event = recordVoicePipelineDiagnostic(
    'MIC_REQUEST_STARTED',
    {},
    {
      env: { DEV: false },
      runtime: { localStorage: { getItem: () => null } },
      logger: (...args) => logs.push(args),
    },
  );
  assert.equal(event, null);
  assert.equal(logs.length, 0);
});

test('OPT-IN: fora de DEV (build de Preview/Production), com localStorage.uniVoiceDebug="1", loga normalmente -- só assim um teste físico real num Preview consegue capturar o diagnóstico', () => {
  const logs = [];
  const event = recordVoicePipelineDiagnostic(
    'MIC_REQUEST_STARTED',
    {},
    {
      env: { DEV: false },
      runtime: { localStorage: { getItem: (key) => (key === 'uniVoiceDebug' ? '1' : null) } },
      logger: (...args) => logs.push(args),
    },
  );
  assert.ok(event);
  assert.equal(logs.length, 1);
});

test('fora de DEV, com localStorage.uniVoiceDebug em qualquer valor diferente de "1", nunca loga (opt-in explícito, não ambíguo)', () => {
  const logs = [];
  const event = recordVoicePipelineDiagnostic(
    'MIC_REQUEST_STARTED',
    {},
    {
      env: { DEV: false },
      runtime: { localStorage: { getItem: () => 'true' } },
      logger: (...args) => logs.push(args),
    },
  );
  assert.equal(event, null);
  assert.equal(logs.length, 0);
});

test('acesso a localStorage que lança (ex.: modo privado/SSR) nunca quebra o app -- só desativa o diagnóstico com segurança', () => {
  const logs = [];
  const event = recordVoicePipelineDiagnostic(
    'MIC_REQUEST_STARTED',
    {},
    {
      env: { DEV: false },
      runtime: { get localStorage() { throw new Error('acesso negado'); } },
      logger: (...args) => logs.push(args),
    },
  );
  assert.equal(event, null);
  assert.equal(logs.length, 0);
});

test('em DEV, registra o estágio e metadados técnicos sanitizados', () => {
  const logs = [];
  const event = recordVoicePipelineDiagnostic(
    'AUDIO_BLOB_CREATED',
    { blobSizeBytes: 954.6, mimeType: 'audio/webm;codecs=opus', durationMs: 3012.4 },
    { env: { DEV: true }, logger: (...args) => logs.push(args) },
  );
  assert.equal(event.stage, 'AUDIO_BLOB_CREATED');
  assert.equal(event.detail.blobSizeBytes, 955);
  assert.equal(event.detail.mimeType, 'audio/webm;codecs=opus');
  assert.equal(event.detail.durationMs, 3012);
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], ['[Uni Voice Pipeline DEV] AUDIO_BLOB_CREATED', event.detail]);
});

test('estágio fora da allowlist vira UNKNOWN_STAGE -- nunca repassa string arbitrária', () => {
  const event = recordVoicePipelineDiagnostic(
    'algo-nao-catalogado',
    {},
    { env: { DEV: true }, logger: () => {} },
  );
  assert.equal(event.stage, 'UNKNOWN_STAGE');
});

test('nunca inclui conteúdo de áudio/texto -- só os campos técnicos da allowlist de detalhe', () => {
  const event = recordVoicePipelineDiagnostic(
    'TRANSCRIPT_NON_EMPTY',
    { transcriptLength: 42, text: 'texto que NUNCA pode aparecer', audio: 'blob que NUNCA pode aparecer' },
    { env: { DEV: true }, logger: () => {} },
  );
  assert.deepEqual(Object.keys(event.detail), [
    'blobSizeBytes', 'mimeType', 'durationMs', 'trackReadyState', 'trackMuted', 'streamActive', 'transcriptLength',
  ]);
  assert.equal(event.detail.transcriptLength, 42);
});

test('campos ausentes/inválidos nunca lançam -- viram null em vez de NaN/undefined vazando', () => {
  const event = recordVoicePipelineDiagnostic(
    'MIC_STREAM_RECEIVED',
    {},
    { env: { DEV: true }, logger: () => {} },
  );
  assert.equal(event.detail.blobSizeBytes, null);
  assert.equal(event.detail.mimeType, null);
  assert.equal(event.detail.durationMs, null);
  assert.equal(event.detail.trackReadyState, null);
  assert.equal(event.detail.trackMuted, null);
  assert.equal(event.detail.streamActive, null);
  assert.equal(event.detail.transcriptLength, null);
});

test('booleans válidos (streamActive/trackMuted) são preservados', () => {
  const event = recordVoicePipelineDiagnostic(
    'MIC_AUDIO_TRACK_LIVE',
    { streamActive: true, trackMuted: false, trackReadyState: 'live' },
    { env: { DEV: true }, logger: () => {} },
  );
  assert.equal(event.detail.streamActive, true);
  assert.equal(event.detail.trackMuted, false);
  assert.equal(event.detail.trackReadyState, 'live');
});
