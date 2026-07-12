import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createSpeechRecognitionAdapter,
  getSpeechRecognitionConstructor,
  mapSpeechRecognitionError,
  sanitizeVoiceTranscript,
} from './speechRecognitionAdapter.js';
import {
  initialVoiceCaptureState,
  voiceCaptureReducer,
  VOICE_CAPTURE_STATES,
} from './voiceCaptureReducer.js';
import { getVoiceInputMessage } from './voiceInputMessages.js';

class FakeRecognition {
  static lastInstance = null;

  constructor() {
    FakeRecognition.lastInstance = this;
    this.startCalls = 0;
    this.stopCalls = 0;
    this.abortCalls = 0;
  }

  start() {
    this.startCalls += 1;
  }

  stop() {
    this.stopCalls += 1;
  }

  abort() {
    this.abortCalls += 1;
  }

  emitStart() {
    this.onstart?.();
  }

  emitResult(transcript, isFinal) {
    const alternative = [{ transcript }];
    alternative.isFinal = isFinal;
    this.onresult?.({ results: [alternative] });
  }

  emitError(error) {
    this.onerror?.({ error });
  }

  emitEnd() {
    this.onend?.();
  }
}

function setupAdapter(callbacks = {}) {
  const adapter = createSpeechRecognitionAdapter({
    runtime: { SpeechRecognition: FakeRecognition },
    ...callbacks,
  });
  return { adapter, recognition: FakeRecognition.lastInstance };
}

test('navegador compatível inicia reconhecimento', () => {
  const { adapter, recognition } = setupAdapter();
  assert.equal(adapter.start(), true);
  assert.equal(recognition.startCalls, 1);
});

test('webkitSpeechRecognition também é detectado', () => {
  assert.equal(getSpeechRecognitionConstructor({ webkitSpeechRecognition: FakeRecognition }), FakeRecognition);
});

test('idioma pt-BR e captura não contínua são configurados', () => {
  const { recognition } = setupAdapter();
  assert.equal(recognition.lang, 'pt-BR');
  assert.equal(recognition.interimResults, true);
  assert.equal(recognition.continuous, false);
});

test('transcrição parcial serve apenas para feedback visual', () => {
  const partials = [];
  const finals = [];
  const { adapter, recognition } = setupAdapter({
    onInterim: (value) => partials.push(value),
    onFinal: (value) => finals.push(value),
  });
  adapter.start();
  recognition.emitStart();
  recognition.emitResult('paguei oitenta', false);
  assert.deepEqual(partials, ['paguei oitenta']);
  assert.deepEqual(finals, []);
});

test('transcrição final sanitizada é enviada uma única vez', () => {
  const finals = [];
  const { adapter, recognition } = setupAdapter({ onFinal: (value) => finals.push(value) });
  adapter.start();
  recognition.emitStart();
  recognition.emitResult('  paguei   85 reais\nno mercado  ', true);
  recognition.emitEnd();
  recognition.emitEnd();
  assert.deepEqual(finals, ['paguei 85 reais no mercado']);
});

test('captura duplicada é bloqueada', () => {
  const { adapter, recognition } = setupAdapter();
  assert.equal(adapter.start(), true);
  assert.equal(adapter.start(), false);
  assert.equal(recognition.startCalls, 1);
});

test('cancelamento não envia transcrição', () => {
  const finals = [];
  const { adapter, recognition } = setupAdapter({ onFinal: (value) => finals.push(value) });
  adapter.start();
  recognition.emitStart();
  recognition.emitResult('paguei 80', true);
  assert.equal(adapter.cancel(), true);
  recognition.emitEnd();
  assert.deepEqual(finals, []);
});

test('permissão negada é classificada e recebe mensagem humana', () => {
  assert.equal(mapSpeechRecognitionError('not-allowed'), VOICE_CAPTURE_STATES.PERMISSION_DENIED);
  assert.match(
    getVoiceInputMessage({ status: VOICE_CAPTURE_STATES.PERMISSION_DENIED }),
    /microfone|permissão/i,
  );
});

test('navegador sem suporte preserva fallback textual', () => {
  const adapter = createSpeechRecognitionAdapter({ runtime: {} });
  assert.equal(adapter.supported, false);
  assert.match(getVoiceInputMessage({ status: VOICE_CAPTURE_STATES.UNSUPPORTED }), /escrevendo/i);
});

test('ausência de fala é tratada sem enviar conteúdo', () => {
  const errors = [];
  const finals = [];
  const { adapter, recognition } = setupAdapter({
    onError: (error) => errors.push(error),
    onFinal: (value) => finals.push(value),
  });
  adapter.start();
  recognition.emitStart();
  recognition.emitEnd();
  assert.equal(errors[0].status, VOICE_CAPTURE_STATES.NO_SPEECH);
  assert.deepEqual(finals, []);
});

test('erro genérico não é tratado como permissão negada', () => {
  assert.equal(mapSpeechRecognitionError('network'), VOICE_CAPTURE_STATES.ERROR);
});

test('dispose limpa listeners e interrompe a captura', () => {
  const { adapter, recognition } = setupAdapter();
  adapter.start();
  recognition.emitStart();
  adapter.dispose();
  assert.equal(recognition.abortCalls, 1);
  assert.equal(recognition.onresult, null);
  assert.equal(recognition.onend, null);
});

test('adaptador não persiste nem envia áudio', () => {
  const source = readFileSync(new URL('./speechRecognitionAdapter.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /supabase|fetch\(|localStorage|sessionStorage|getUserMedia/i);
});

test('reducer representa processamento, conclusão e cancelamento', () => {
  const processing = voiceCaptureReducer(initialVoiceCaptureState, { type: 'PROCESS' });
  const completed = voiceCaptureReducer(processing, { type: 'COMPLETE' });
  const canceled = voiceCaptureReducer(completed, { type: 'CANCEL' });
  assert.equal(processing.status, VOICE_CAPTURE_STATES.PROCESSING);
  assert.equal(completed.status, VOICE_CAPTURE_STATES.COMPLETED);
  assert.equal(canceled.status, VOICE_CAPTURE_STATES.CANCELED);
});

test('voz e texto usam a mesma função de envio e confirmação financeira', () => {
  const page = readFileSync(new URL('../../pages/UniAIPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /sendMessage\(draftMessage, \{ allowFinancialAction: true \}\)/);
  assert.match(page, /sendMessage\(transcript, \{ allowFinancialAction: true \}\)/);
  assert.match(page, /onConfirmFinancialAction=\{handleConfirmFinancialAction\}/);
});

test('memória continua sendo resolvida depois do parser', () => {
  const source = readFileSync(new URL('../uni-conversation/useUniConversation.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf('parseFinancialText(content') < source.indexOf('resolveParsedMemory(parsed'));
});

test('personalidade altera mensagem, não o estado de segurança', () => {
  const direct = getVoiceInputMessage({ status: VOICE_CAPTURE_STATES.ERROR, profileId: 'direct' });
  const warm = getVoiceInputMessage({ status: VOICE_CAPTURE_STATES.ERROR, profileId: 'warm' });
  assert.notEqual(direct, warm);
  assert.equal(mapSpeechRecognitionError('network'), VOICE_CAPTURE_STATES.ERROR);
});

test('sanitização limita conteúdo e remove caracteres de controle', () => {
  assert.equal(sanitizeVoiceTranscript('  oi\u0000   Uni  ', 6), 'oi Uni');
});
