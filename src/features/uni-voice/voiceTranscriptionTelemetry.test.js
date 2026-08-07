// HOTFIX FINAL P4: diagnóstico de 422/falhas de transcrição, sanitizado e
// gated por DEV -- mesmo padrão de uni-voice-tts/voiceTtsTelemetry.js.
import assert from 'node:assert/strict';
import test from 'node:test';
import { recordVoiceTranscriptionTelemetry } from './voiceTranscriptionTelemetry.js';

test('fora de DEV, nunca loga nada (retorna null, logger nunca chamado)', () => {
  const logs = [];
  const event = recordVoiceTranscriptionTelemetry(
    { responseStatus: 422, errorKind: 'EMPTY_TRANSCRIPT', durationMs: 300, blobSizeBytes: 900, mimeType: 'audio/webm' },
    { env: { DEV: false }, logger: (...args) => logs.push(args) },
  );
  assert.equal(event, null);
  assert.equal(logs.length, 0);
});

test('em DEV, registra só metadados técnicos sanitizados -- nunca conteúdo de áudio/texto transcrito', () => {
  const logs = [];
  const event = recordVoiceTranscriptionTelemetry(
    {
      responseStatus: 422,
      errorKind: 'EMPTY_TRANSCRIPT',
      durationMs: 312.7,
      blobSizeBytes: 954,
      mimeType: 'audio/webm;codecs=opus',
      text: 'texto que NUNCA pode aparecer',
      audio: 'blob que NUNCA pode aparecer',
    },
    { env: { DEV: true }, logger: (...args) => logs.push(args) },
  );
  assert.deepEqual(Object.keys(event), [
    'responseStatus', 'errorKind', 'durationMs', 'blobSizeBytes', 'mimeType',
  ]);
  assert.equal(event.responseStatus, 422);
  assert.equal(event.errorKind, 'EMPTY_TRANSCRIPT');
  assert.equal(event.durationMs, 313, 'arredonda duração');
  assert.equal(event.blobSizeBytes, 954);
  assert.equal(event.mimeType, 'audio/webm;codecs=opus');
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], ['[Uni Voice Transcription DEV]', event]);
});

test('errorKind desconhecido/fora da allowlist vira "UNKNOWN" -- nunca repassa string arbitrária', () => {
  const event = recordVoiceTranscriptionTelemetry(
    { responseStatus: 500, errorKind: 'algo-nao-catalogado', durationMs: 100, blobSizeBytes: 10, mimeType: 'audio/webm' },
    { env: { DEV: true }, logger: () => {} },
  );
  assert.equal(event.errorKind, 'UNKNOWN');
});

test('campos ausentes/inválidos nunca lançam -- viram null em vez de NaN/undefined vazando', () => {
  const event = recordVoiceTranscriptionTelemetry(
    {},
    { env: { DEV: true }, logger: () => {} },
  );
  assert.equal(event.responseStatus, null);
  assert.equal(event.errorKind, 'UNKNOWN');
  assert.equal(event.durationMs, null);
  assert.equal(event.blobSizeBytes, null);
  assert.equal(event.mimeType, null);
});
