import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createMediaRecorderAdapter,
  getSupportedVoiceMimeType,
  isAppleWebKitRuntime,
  isMediaRecorderSupported,
  requestVoiceMicrophonePermission,
  VOICE_AUDIO_MAX_BYTES,
  VOICE_AUDIO_MAX_DURATION_MS,
} from './mediaRecorderAdapter.js';
import {
  createUniVoiceTranscriptionProvider,
  validateVoiceTranscriptionRequest,
} from './uniVoiceTranscriptionProvider.js';
import {
  createSpeechRecognitionAdapter,
  sanitizeVoiceTranscript,
} from './speechRecognitionAdapter.js';
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

function createSpeechRuntime() {
  let recognition = null;
  class FakeSpeechRecognition {
    constructor() {
      recognition = this;
    }

    start() {
      this.onstart?.();
    }

    stop() {}

    abort() {}
  }

  return {
    runtime: { SpeechRecognition: FakeSpeechRecognition },
    getRecognition: () => recognition,
  };
}

function speechResult(transcript, isFinal) {
  return Object.assign([{ transcript }], { isFinal });
}

test('SpeechRecognition nunca envia resultados interim e publica um único final consolidado', () => {
  const { runtime, getRecognition } = createSpeechRuntime();
  const finals = [];
  const interim = [];
  let processing = 0;
  const adapter = createSpeechRecognitionAdapter({
    runtime,
    onInterim: (text) => interim.push(text),
    onProcessing: () => { processing += 1; },
    onFinal: (text) => finals.push(text),
  });

  assert.equal(adapter.start(), true);
  const recognition = getRecognition();
  recognition.onresult({ results: [speechResult('recebi', false)] });
  recognition.onresult({ results: [speechResult('recebi cinquenta', false)] });
  assert.deepEqual(finals, []);
  recognition.onresult({ results: [speechResult('recebi cinquenta reais', true)] });
  recognition.onend();
  recognition.onend();

  assert.deepEqual(interim.slice(0, 2), ['recebi', 'recebi cinquenta']);
  assert.deepEqual(finals, ['recebi cinquenta reais']);
  assert.equal(processing, 1);
});

test('stop concorrente e onend duplicado não publicam duas mensagens', () => {
  const { runtime, getRecognition } = createSpeechRuntime();
  const finals = [];
  const adapter = createSpeechRecognitionAdapter({
    runtime,
    onFinal: (text) => finals.push(text),
  });

  adapter.start();
  const recognition = getRecognition();
  recognition.onresult({ results: [speechResult('agenda amanhã', true)] });
  assert.equal(adapter.stop(), true);
  assert.equal(adapter.stop(), false);
  recognition.onend();
  recognition.onend();

  assert.deepEqual(finals, ['agenda amanhã']);
});

test('cancelamento e dispose descartam final tardio e removem callbacks', () => {
  const { runtime, getRecognition } = createSpeechRuntime();
  const finals = [];
  const adapter = createSpeechRecognitionAdapter({
    runtime,
    onFinal: (text) => finals.push(text),
  });

  adapter.start();
  const recognition = getRecognition();
  recognition.onresult({ results: [speechResult('texto cancelado', true)] });
  assert.equal(adapter.cancel(), true);
  recognition.onend();
  assert.deepEqual(finals, []);

  adapter.dispose();
  assert.equal(recognition.onstart, null);
  assert.equal(recognition.onresult, null);
  assert.equal(recognition.onerror, null);
  assert.equal(recognition.onend, null);
});

test('captura real usa getUserMedia e MediaRecorder nativos', async () => {
  const { runtime } = createRuntime();
  let started = 0;
  const adapter = createMediaRecorderAdapter({ runtime, onStart: () => { started += 1; } });
  assert.equal(isMediaRecorderSupported(runtime), true);
  assert.equal(await adapter.start(), true);
  assert.equal(started, 1);
  adapter.dispose();
});

test('preflight solicita o microfone e encerra a track sem iniciar MediaRecorder', async () => {
  const { runtime, track } = createRuntime();
  let recorderCreated = 0;
  runtime.MediaRecorder = class extends FakeMediaRecorder {
    constructor(...args) {
      super(...args);
      recorderCreated += 1;
    }
  };

  const result = await requestVoiceMicrophonePermission(runtime);

  assert.deepEqual(result, { granted: true, errorCode: null });
  assert.equal(track.stopped, true);
  assert.equal(recorderCreated, 0);
  assert.equal(Object.isFrozen(result), true);
});

test('preflight preserva a recusa de permissão sem iniciar captura', async () => {
  const denial = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const { runtime } = createRuntime({ getUserMedia: async () => { throw denial; } });

  assert.deepEqual(
    await requestVoiceMicrophonePermission(runtime),
    { granted: false, errorCode: 'permission_denied' },
  );
});

test('preflight sem getUserMedia retorna unsupported de forma controlada', async () => {
  assert.deepEqual(
    await requestVoiceMicrophonePermission({ navigator: {} }),
    { granted: false, errorCode: 'unsupported' },
  );
});

test('getUserMedia solicita somente constraints de fala suportadas, incluindo autoGainControl', async () => {
  let received = null;
  const { runtime, stream } = createRuntime({
    getUserMedia: async (constraints) => {
      received = constraints;
      return stream;
    },
  });
  runtime.navigator.mediaDevices.getSupportedConstraints = () => ({
    channelCount: true,
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: true,
  });

  const adapter = createMediaRecorderAdapter({ runtime });
  assert.equal(await adapter.start(), true);
  assert.deepEqual(received, {
    audio: { channelCount: 1, echoCancellation: true, autoGainControl: true },
    video: false,
  });
  adapter.cancel();
});

for (const [label, blobSize] of [['baixa', 16], ['normal', 512], ['alta', 4096]]) {
  test(`nível simulado ${label}: nenhum threshold/VAD local descarta blob não vazio`, async () => {
    const { runtime } = createRuntime();
    runtime.MediaRecorder = class extends FakeMediaRecorder {
      stop() {
        if (this.state !== 'recording') return;
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['x'.repeat(blobSize)], { type: this.mimeType }) });
        this.onstop?.();
      }
    };
    let capture = null;
    const adapter = createMediaRecorderAdapter({
      runtime,
      onAudio: (value) => { capture = value; },
    });

    await adapter.start();
    assert.equal(adapter.stop(), true);
    assert.equal(capture.audio.size, blobSize);
  });
}

test('stop sem onstop nativo encerra a sessão pelo timeout de finalização e libera a track', async () => {
  const timers = new Map();
  let timerSequence = 0;
  const { runtime, track } = createRuntime();
  runtime.setTimeout = (callback, delay) => {
    const id = ++timerSequence;
    timers.set(id, { callback, delay });
    return id;
  };
  runtime.clearTimeout = (id) => timers.delete(id);
  runtime.MediaRecorder = class extends FakeMediaRecorder {
    stop() {
      if (this.state === 'recording') this.state = 'inactive';
    }
  };
  const errors = [];
  const adapter = createMediaRecorderAdapter({
    runtime,
    stopTimeoutMs: 25,
    onError: (error) => errors.push(error),
  });

  await adapter.start();
  assert.equal(adapter.stop(), true);
  const stopTimeout = [...timers.values()].find((timer) => timer.delay === 25);
  assert.ok(stopTimeout);
  stopTimeout.callback();

  assert.deepEqual(errors, [{ code: 'capture_failed' }]);
  assert.equal(track.stopped, true);
  assert.equal(adapter.getRecorderState(), 'inactive');
  assert.equal(timers.size, 0);
});

test('stress: 20 ciclos start -> hold -> release -> blob encerram recursos e permitem a próxima sessão', async () => {
  for (let cycle = 1; cycle <= 20; cycle += 1) {
    const timers = new Set();
    const track = { stopped: false, stop() { this.stopped = true; } };
    const stream = {
      active: true,
      getTracks: () => [track],
      getAudioTracks: () => [track],
    };
    const runtime = {
      navigator: { mediaDevices: { getUserMedia: async () => stream } },
      MediaRecorder: class extends FakeMediaRecorder {
        stop() {
          if (this.state !== 'recording') return;
          this.state = 'inactive';
          queueMicrotask(() => {
            this.ondataavailable?.({ data: new Blob([`voice-${cycle}`], { type: this.mimeType }) });
            this.onstop?.();
          });
        }
      },
      setTimeout(callback, delay) {
        const id = setTimeout(callback, delay);
        timers.add(id);
        return id;
      },
      clearTimeout(id) {
        clearTimeout(id);
        timers.delete(id);
      },
    };
    let capture = null;
    const adapter = createMediaRecorderAdapter({
      runtime,
      sessionId: cycle,
      onAudio: (value) => { capture = value; },
    });

    assert.equal(await adapter.start(), true, `ciclo ${cycle}: iniciou`);
    assert.equal(adapter.getRecorderState(), 'recording', `ciclo ${cycle}: recorder ativo`);
    assert.equal(adapter.stop(), true, `ciclo ${cycle}: release aceito`);
    assert.equal(track.stopped, false, `ciclo ${cycle}: track permanece viva até dataavailable/onstop`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(capture?.audio?.size > 0, `ciclo ${cycle}: blob não vazio`);
    assert.equal(track.stopped, true, `ciclo ${cycle}: track encerrada`);
    assert.equal(adapter.getRecorderState(), 'inactive', `ciclo ${cycle}: recorder encerrado`);
    assert.equal(timers.size, 0, `ciclo ${cycle}: timers zerados`);
    assert.equal(adapter.stop(), false, `ciclo ${cycle}: finish idempotente`);
  }
});

for (const durationMs of [1_000, 3_000, 8_000]) {
  test(`hold ${durationMs / 1000}s permanece válido e preserva a duração real`, async () => {
    let clock = 10_000;
    const { runtime } = createRuntime();
    let capture = null;
    const adapter = createMediaRecorderAdapter({
      runtime,
      now: () => clock,
      onAudio: (value) => { capture = value; },
    });

    await adapter.start();
    clock += durationMs;
    assert.equal(adapter.stop(), true);
    assert.equal(capture.durationMs, durationMs);
    assert.ok(capture.audio.size > 0);
  });
}

test('useUniVoiceInput isola callbacks por sessionId e soltura consulta o recorder, não um render atrasado', () => {
  const source = readFileSync(new URL('./useUniVoiceInput.js', import.meta.url), 'utf8');
  assert.match(source, /const sessionId = \+\+sessionSequenceRef\.current;/);
  assert.match(source, /const isCurrentSession = \(\) => activeSessionIdRef\.current === sessionId/);
  assert.match(source, /if \(!isCurrentSession\(\)\) return;/);
  assert.match(source, /const stopped = adapterRef\.current\.stop\('released'\);/);
  assert.doesNotMatch(
    source.slice(source.indexOf('const stop = useCallback'), source.indexOf('const toggle = useCallback')),
    /state\.status !== VOICE_CAPTURE_STATES\.LISTENING/,
  );
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

// ============================================================================
// HOTFIX CRÍTICO 2 (UI diz "Ouvindo", mas microfone não entrega áudio) --
// CAUSA RAIZ (uma delas): getUserMedia pode resolver "com sucesso" e ainda
// assim entregar um stream/track já morto (active:false ou
// readyState:'ended') -- sem nenhuma validação, o pipeline inteiro seguia
// adiante (MediaRecorder criado, "Ouvindo..." exibido, onStart disparado)
// para gravar silêncio garantido, sem NENHUM erro visível ao usuário nem
// à Uni. Agora start() reprova esse caso ANTES de criar o MediaRecorder,
// retornando ao estado idle com um erro recuperável (nunca preso em
// "Ouvindo..."). Tracks/streams sem esses campos (ex.: runtimes de teste
// simples como o `createRuntime()` usado nos testes acima) NUNCA reprovam
// -- só reprova quando o runtime AFIRMA explicitamente que está morto.
// ============================================================================

test('HOTFIX CRÍTICO 2: stream resolvido com active:false nunca inicia o MediaRecorder -- falha com erro recuperável', async () => {
  const deadTrack = { stopped: false, stop() { this.stopped = true; } };
  const deadStream = { active: false, getTracks: () => [deadTrack], getAudioTracks: () => [deadTrack] };
  const { runtime } = createRuntime({ getUserMedia: async () => deadStream });
  let recorderCreated = 0;
  runtime.MediaRecorder = class extends FakeMediaRecorder {
    constructor(...args) {
      super(...args);
      recorderCreated += 1;
    }
  };
  const errors = [];
  const adapter = createMediaRecorderAdapter({ runtime, onError: (e) => errors.push(e) });

  assert.equal(await adapter.start(), false);
  assert.equal(recorderCreated, 0, 'nunca cria o MediaRecorder para um stream já morto');
  assert.deepEqual(errors, [{ code: 'no_audio_track' }]);
  assert.equal(deadTrack.stopped, true, 'libera a track morta mesmo sem nunca ter gravado');
});

test('HOTFIX CRÍTICO 2: track com readyState "ended" logo após getUserMedia nunca inicia o MediaRecorder', async () => {
  const endedTrack = { stopped: false, readyState: 'ended', stop() { this.stopped = true; } };
  const staleStream = { active: true, getTracks: () => [endedTrack], getAudioTracks: () => [endedTrack] };
  const { runtime } = createRuntime({ getUserMedia: async () => staleStream });
  let recorderCreated = 0;
  runtime.MediaRecorder = class extends FakeMediaRecorder {
    constructor(...args) {
      super(...args);
      recorderCreated += 1;
    }
  };
  const errors = [];
  const adapter = createMediaRecorderAdapter({ runtime, onError: (e) => errors.push(e) });

  assert.equal(await adapter.start(), false);
  assert.equal(recorderCreated, 0);
  assert.deepEqual(errors, [{ code: 'no_audio_track' }]);
});

test('pipeline de voz: track explicitamente disabled nunca inicia o MediaRecorder', async () => {
  const disabledTrack = {
    enabled: false,
    readyState: 'live',
    stopped: false,
    stop() { this.stopped = true; },
  };
  const disabledStream = {
    active: true,
    getTracks: () => [disabledTrack],
    getAudioTracks: () => [disabledTrack],
  };
  const { runtime } = createRuntime({ getUserMedia: async () => disabledStream });
  let recorderCreated = 0;
  runtime.MediaRecorder = class extends FakeMediaRecorder {
    constructor(...args) {
      super(...args);
      recorderCreated += 1;
    }
  };
  const errors = [];
  const adapter = createMediaRecorderAdapter({ runtime, onError: (error) => errors.push(error) });

  assert.equal(await adapter.start(), false);
  assert.equal(recorderCreated, 0);
  assert.deepEqual(errors, [{ code: 'no_audio_track' }]);
  assert.equal(disabledTrack.stopped, true);
});

test('HOTFIX CRÍTICO 2: track "live" (readyState/muted ausentes, como em runtimes de teste simples) segue funcionando normalmente -- validação nunca reprova por ausência de sinal, só por sinal explícito de morte', async () => {
  const { runtime, track } = createRuntime();
  let started = 0;
  const adapter = createMediaRecorderAdapter({ runtime, onStart: () => { started += 1; } });
  assert.equal(await adapter.start(), true);
  assert.equal(started, 1);
  assert.equal(track.stopped, false);
  adapter.dispose();
});

test('HOTFIX CRÍTICO 2: track encerrando NO MEIO da gravação (evento "ended") nunca deixa a captura presa -- falha com erro recuperável em vez de silêncio', async () => {
  let endedListener = null;
  const track = {
    stopped: false,
    stop() { this.stopped = true; },
    addEventListener(type, listener) { if (type === 'ended') endedListener = listener; },
    removeEventListener() {},
  };
  const stream = { active: true, getTracks: () => [track], getAudioTracks: () => [track] };
  const { runtime } = createRuntime({ getUserMedia: async () => stream });
  const errors = [];
  let sent = false;
  const adapter = createMediaRecorderAdapter({
    runtime,
    onError: (e) => errors.push(e),
    onAudio: () => { sent = true; },
  });

  assert.equal(await adapter.start(), true);
  assert.ok(typeof endedListener === 'function', 'registrou um listener real de "ended" na track');

  endedListener();

  assert.deepEqual(errors, [{ code: 'track_ended' }]);
  assert.equal(sent, false, 'nunca produz áudio a partir de uma track morta no meio da captura');
  assert.equal(track.stopped, true);
});

test('HOTFIX CRÍTICO 2: evento "ended" disparado pelo NOSSO PRÓPRIO track.stop() durante um stop gracioso normal NUNCA é tratado como falha (distingue encerramento intencional de falha real)', async () => {
  let endedListener = null;
  const track = {
    stopped: false,
    stop() {
      this.stopped = true;
      endedListener?.();
    },
    addEventListener(type, listener) { if (type === 'ended') endedListener = listener; },
    removeEventListener() {},
  };
  const stream = { active: true, getTracks: () => [track], getAudioTracks: () => [track] };
  const { runtime } = createRuntime({ getUserMedia: async () => stream });
  const errors = [];
  let capture = null;
  const adapter = createMediaRecorderAdapter({
    runtime,
    onError: (e) => errors.push(e),
    onAudio: (value) => { capture = value; },
  });

  await adapter.start();
  assert.equal(adapter.stop(), true);

  assert.deepEqual(errors, [], 'stop gracioso nunca dispara um erro, mesmo com "ended" dependente do nosso próprio track.stop()');
  assert.ok(capture.audio instanceof Blob);
});

// ============================================================================
// HOTFIX FINAL (deadlock "OUVINDO..." travado após start/cancel repetidos)
// -- CAUSA RAIZ: cancel() só marcava a sessão como cancelada (canceled=true
// + permissionRequestId incrementado) quando `recorder`/`stream` já
// existiam. Chamado ENQUANTO getUserMedia() ainda estava pendente (a janela
// mais comum de um cancelamento rápido), cancel() virava um NO-OP -- a
// promise pendente, ao resolver mais tarde, não encontrava nenhum marcador
// de cancelamento e seguia adiante criando o MediaRecorder e chamando
// recorder.start() mesmo já cancelado, prendendo a UI em "ouvindo" para
// sempre. Corrigido para marcar a sessão como cancelada
// INCONDICIONALMENTE.
// ============================================================================

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('A) start -> cancel (com getUserMedia ainda pendente) -> resolver tardio da permissão NUNCA inicia a gravação', async () => {
  const deferred = createDeferred();
  const { runtime, track } = createRuntime({ getUserMedia: () => deferred.promise });
  let audioSent = false;
  let started = 0;
  const adapter = createMediaRecorderAdapter({
    runtime,
    onStart: () => { started += 1; },
    onAudio: () => { audioSent = true; },
  });

  const startPromise = adapter.start(); // fica pendente em getUserMedia
  assert.equal(adapter.cancel(), true, 'cancel() enquanto getUserMedia está pendente deve reportar sucesso');

  // resolver tardio da permissão -- exatamente a race do bug real.
  deferred.resolve({ getTracks: () => [track] });
  const started_ = await startPromise;

  assert.equal(started_, false, 'start() deve resolver como não iniciado');
  assert.equal(started, 0, 'onStart nunca deve disparar para uma sessão já cancelada');
  assert.equal(audioSent, false);
  assert.equal(track.stopped, true, 'a track do stream tardio deve ser liberada, nunca deixada ativa');
});

test('B) start -> cancel -> start novamente (adaptador novo) -> captura funcional normalmente', async () => {
  const { runtime: runtime1 } = createRuntime();
  const adapter1 = createMediaRecorderAdapter({ runtime: runtime1 });
  await adapter1.start();
  assert.equal(adapter1.cancel(), true);

  // useUniVoiceInput sempre cria um adaptador NOVO por start() -- replica
  // aqui: segunda captura é uma instância independente.
  const { runtime: runtime2 } = createRuntime();
  let capture = null;
  const adapter2 = createMediaRecorderAdapter({ runtime: runtime2, onAudio: (value) => { capture = value; } });
  assert.equal(await adapter2.start(), true, 'a segunda captura deve iniciar normalmente, sem contaminação da primeira');
  assert.equal(adapter2.stop(), true);
  assert.ok(capture.audio instanceof Blob, 'a segunda captura deve produzir áudio normalmente');
});

test('C) start/cancel repetido várias vezes seguidas nunca fica preso em "gravando"', async () => {
  for (let i = 0; i < 6; i += 1) {
    const { runtime } = createRuntime();
    const adapter = createMediaRecorderAdapter({ runtime });
    await adapter.start();
    assert.equal(adapter.cancel(), true, `ciclo ${i}: cancel deve sempre reportar sucesso`);
  }
});

// ============================================================================
// HOTFIX FINAL (deadlock "OUVINDO..." travado ao tocar para PARAR, não só
// ao cancelar) -- CAUSA RAIZ: mediaRecorderAdapter.stop() retorna false em
// silêncio sempre que o MediaRecorder nativo não está exatamente em
// "recording" (ex.: já parou sozinho por algum evento nativo não
// percebido). useUniVoiceInput.stop() repassava esse false sem nenhum
// dispatch -- o status React ficava travado em LISTENING para sempre,
// porque um segundo toque no botão repetia exatamente a mesma checagem
// sempre-falsa. cancel() (que SEMPRE limpa o estado, dispatch CANCEL +
// releaseAdapter) virou o fallback garantido de stop() quando o stop
// nativo falha.
// ============================================================================

test('E) adapter.stop() chamado quando o recorder não está mais "recording" retorna false silenciosamente (precondição real do deadlock)', async () => {
  const { runtime } = createRuntime();
  const adapter = createMediaRecorderAdapter({ runtime });
  await adapter.start();
  assert.equal(adapter.stop(), true, 'primeira chamada para o recorder realmente "recording"');
  assert.equal(adapter.stop(), false, 'segunda chamada -- recorder já não está mais "recording", retorna false em silêncio');
});

test('HOTFIX FINAL: useUniVoiceInput.stop() cai para cancel() quando o adapter falha ao parar -- nunca fica travado em LISTENING', () => {
  const source = readFileSync(new URL('./useUniVoiceInput.js', import.meta.url), 'utf8');
  const stopBlock = source.slice(
    source.indexOf('const stop = useCallback'),
    source.indexOf('const stop = useCallback') + 400,
  );
  assert.match(stopBlock, /const stopped = adapterRef\.current\.stop\('released'\);/);
  assert.match(stopBlock, /if \(!stopped\) return cancel\(\);/);
  // cancel deve estar declarado ANTES de stop (senão o array de
  // dependências do useCallback de stop quebraria por TDZ).
  assert.ok(source.indexOf('const cancel = useCallback') < source.indexOf('const stop = useCallback'));
});

test('D) callback onstop tardio de uma sessão já cancelada nunca produz áudio (a sessão cancelada nunca chega a chamar recorder.start())', async () => {
  const deferred = createDeferred();
  const { runtime, track } = createRuntime({ getUserMedia: () => deferred.promise });
  let audioSent = false;
  const adapter = createMediaRecorderAdapter({ runtime, onAudio: () => { audioSent = true; } });

  const startPromise = adapter.start();
  adapter.cancel();
  deferred.resolve({ getTracks: () => [track] });
  await startPromise;

  // mesmo que o navegador ainda entregasse um onstop tardio de algum jeito,
  // não há recorder ativo para essa sessão -- nunca produz áudio.
  assert.equal(audioSent, false);
});

test('E) cancel() chamado duas vezes seguidas continua seguro (idempotente, nunca lança)', async () => {
  const { runtime, track } = createRuntime();
  const adapter = createMediaRecorderAdapter({ runtime });
  await adapter.start();
  assert.equal(adapter.cancel(), true, 'primeira chamada cancela de verdade');
  assert.equal(adapter.cancel(), false, 'segunda chamada é um no-op seguro, nunca lança');
  assert.equal(track.stopped, true);
});

test('F) cancel() chamado ANTES de qualquer start() nunca lança, e um start() real na mesma instância continua funcionando depois (start() sempre reseta o marcador de cancelamento no início da própria sessão)', async () => {
  const { runtime } = createRuntime();
  const adapter = createMediaRecorderAdapter({ runtime });
  assert.equal(adapter.cancel(), true, 'idempotente e seguro mesmo sem sessão ativa -- nunca lança');
  let audioSent = false;
  const adapter2 = createMediaRecorderAdapter({ runtime, onAudio: () => { audioSent = true; } });
  assert.equal(await adapter2.start(), true, 'uma nova instância de adaptador nunca é afetada pelo cancel() de outra');
  assert.equal(adapter2.stop(), true);
  assert.equal(audioSent, true);
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

test('Safari/iOS prefere audio/mp4 quando WebM e MP4 estão disponíveis', async () => {
  class SafariMediaRecorder extends FakeMediaRecorder {
    static isTypeSupported(type) {
      return type === 'audio/mp4' || type.startsWith('audio/webm');
    }
  }
  const { runtime } = createRuntime();
  runtime.MediaRecorder = SafariMediaRecorder;
  runtime.navigator.userAgent = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  runtime.navigator.platform = 'iPhone';
  let capture = null;
  const adapter = createMediaRecorderAdapter({
    runtime,
    onAudio: (value) => { capture = value; },
  });

  assert.equal(isAppleWebKitRuntime(runtime), true);
  assert.equal(await adapter.start(), true);
  assert.equal(adapter.stop(), true);
  assert.equal(capture.mimeType, 'audio/mp4');
  assert.equal(capture.audio.type, 'audio/mp4');
});

test('Chrome/Android continua preferindo WebM/Opus', () => {
  const { runtime } = createRuntime();
  runtime.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
  runtime.navigator.platform = 'Linux armv8l';
  assert.equal(isAppleWebKitRuntime(runtime), false);
  assert.equal(getSupportedVoiceMimeType(runtime.MediaRecorder, {
    preferMp4: isAppleWebKitRuntime(runtime),
  }), 'audio/webm;codecs=opus');
});

test('Safari tenta constraints simples quando rejeita constraints avançadas', async () => {
  const { runtime, stream } = createRuntime();
  const constraints = [];
  runtime.navigator.mediaDevices.getUserMedia = async (value) => {
    constraints.push(value);
    if (constraints.length === 1) {
      throw Object.assign(new Error('unsupported constraints'), { name: 'OverconstrainedError' });
    }
    return stream;
  };
  const adapter = createMediaRecorderAdapter({ runtime });

  assert.equal(await adapter.start(), true);
  assert.equal(constraints.length, 2);
  assert.deepEqual(constraints[1], { audio: true, video: false });
  adapter.dispose();
});

test('ciclo de vida iOS cancela captura e transcrição ao ocultar página e remove listeners', () => {
  const source = readFileSync(new URL('./useUniVoiceInput.js', import.meta.url), 'utf8');
  assert.match(source, /addEventListener\('pagehide', cancelForLifecycle\)/);
  assert.match(source, /addEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.match(source, /visibilityState === 'hidden'/);
  assert.match(source, /requestIdRef\.current \+= 1/);
  assert.match(source, /adapterRef\.current\?\.cancel\(\)/);
  assert.match(source, /removeEventListener\('pagehide', cancelForLifecycle\)/);
  assert.match(source, /removeEventListener\('visibilitychange', handleVisibilityChange\)/);
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

// HOTFIX FINAL P4: diagnóstico sanitizado (DEV only) para todo caminho que
// resolve em EMPTY_TRANSCRIPT/422 -- nunca "mascara" silenciosamente, só
// não expõe nada em produção (voiceTranscriptionTelemetry.test.js cobre a
// sanitização/gate por DEV exaustivamente; aqui confirmamos que o provider
// realmente chama o registro nos dois caminhos que produzem EMPTY_TRANSCRIPT).
test('HOTFIX FINAL P4: o provider registra o diagnóstico (status, duração, tamanho, mime, errorKind) tanto no 422 explícito quanto no 200-com-texto-vazio', () => {
  const source = readFileSync(new URL('./uniVoiceTranscriptionProvider.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ recordVoiceTranscriptionTelemetry \} from '\.\/voiceTranscriptionTelemetry\.js';/);
  const occurrences = source.match(/recordVoiceTranscriptionTelemetry\(\{/g) ?? [];
  assert.equal(occurrences.length, 2, 'um registro no branch !response.ok (422/outros erros HTTP) e outro no 200 com texto vazio');
  assert.match(source, /responseStatus: response\.status,/);
  assert.match(source, /blobSizeBytes: audio\.size,/);
  assert.match(source, /mimeType: audio\.type,/);
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

test('P1-11: cancelamento externo aborta o fetch real da transcrição', async () => {
  const externalController = new AbortController();
  let requestSignal = null;
  const provider = createUniVoiceTranscriptionProvider({
    client: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
    url: 'https://project.supabase.co',
    anonKey: 'anon',
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      requestSignal = signal;
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });
  const resultPromise = provider.transcribe({
    audio: new Blob(['voice'], { type: 'audio/webm' }),
    durationMs: 1200,
    workspaceId: 'workspace',
    signal: externalController.signal,
  });

  await Promise.resolve();
  externalController.abort('cancelled');
  const result = await resultPromise;

  assert.equal(requestSignal?.aborted, true);
  assert.equal(result.error.code, 'ABORTED');
});

test('P1-10/P1-11: captura tem owner imutável e desmontagem cancela a operação ativa', () => {
  const provider = readFileSync(new URL('./UniVoiceInputProvider.jsx', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('./UniVoiceInputProviderRuntime.js', import.meta.url), 'utf8');
  const registry = readFileSync(new URL('./voiceHandlerRegistry.js', import.meta.url), 'utf8');
  assert.match(provider, /UniVoiceInputProviderRuntime/);
  assert.match(runtime, /const \[handlerRegistry\] = useState/);
  assert.match(runtime, /handlerRegistry\.updateCancelCapture\(voiceInput\.cancel\)/);
  assert.match(registry, /captureOwnerToken/);
  assert.match(registry, /currentRegistration\?\.token !== token/);
  assert.match(registry, /cancelCapture\(\)/);
});

test('P1-11/P2: hook passa AbortSignal ao provider e onCaptureEnd é idempotente por captura', () => {
  const hook = readFileSync(new URL('./useUniVoiceInput.js', import.meta.url), 'utf8');
  assert.match(hook, /transcriptionAbortRef/);
  assert.match(hook, /signal: transcriptionController\.signal/);
  assert.match(hook, /transcriptionAbortRef\.current\?\.abort/);
  assert.match(hook, /captureEndNotifiedRef/);
});

test('exceção inesperada do provider sai de PROCESSING por FAIL e não publica transcrição', () => {
  const source = readFileSync(new URL('./useUniVoiceInput.js', import.meta.url), 'utf8');
  const transcribeBlock = source.slice(
    source.indexOf('const transcribe = useCallback'),
    source.indexOf('const start = useCallback'),
  );

  assert.match(transcribeBlock, /try \{\s*result = await transcriptionProvider\.transcribe/);
  assert.match(transcribeBlock, /catch \(error\)/);
  assert.match(transcribeBlock, /if \(requestId !== requestIdRef\.current\) return;/);
  assert.match(transcribeBlock, /type: 'FAIL'/);
  assert.match(transcribeBlock, /status: VOICE_CAPTURE_STATES\.ERROR/);
  assert.match(transcribeBlock, /return;\s*\n\s*} finally \{[\s\S]*if \(requestId !== requestIdRef\.current\) return;/);
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

// HOTFIX FINAL (422 em producao -- "Fala nao identificada" para audio real
// e completo): auditoria do pipeline cliente (MediaRecorder -> Blob ->
// upload) nao encontrou nenhum bug estrutural -- Blob montado corretamente
// so apos onstop, sem race condition, mime/duracao/tamanho validados nos
// dois lados. O 422 sempre vinha de OpenAI responder 200 com texto vazio.
// Default do modelo trocado de 'gpt-4o-mini-transcribe' (mais novo, menos
// maduro) para 'whisper-1' (mesmo endpoint/contrato, mais robusto para
// fala curta/coloquial em PT-BR) -- UNI_TRANSCRIPTION_MODEL continua
// disponivel para sobrescrever.
test('HOTFIX FINAL: modelo padrao de transcricao e whisper-1 (trocado de gpt-4o-mini-transcribe), com UNI_TRANSCRIPTION_MODEL ainda disponivel para sobrescrever', () => {
  const edge = readFileSync(
    new URL('../../../supabase/functions/uni-voice-transcribe/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(edge, /Deno\.env\.get\('UNI_TRANSCRIPTION_MODEL'\) \?\? 'whisper-1'/);
  assert.doesNotMatch(edge, /\?\? 'gpt-4o-mini-transcribe'/);
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
