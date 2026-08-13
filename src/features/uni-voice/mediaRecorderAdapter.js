import { recordVoicePipelineDiagnostic } from './voicePipelineDiagnostics.js';

export const VOICE_AUDIO_MAX_BYTES = 4 * 1024 * 1024;
export const VOICE_AUDIO_MAX_DURATION_MS = 15_000;
export const VOICE_RECORDER_STOP_TIMEOUT_MS = 3_000;
export const VOICE_AUDIO_MIME_TYPES = Object.freeze([
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]);

const APPLE_AUDIO_MIME_TYPES = Object.freeze([
  'audio/mp4',
  ...VOICE_AUDIO_MIME_TYPES.filter((mimeType) => mimeType !== 'audio/mp4'),
]);

function mapCaptureError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'permission_denied';
  }
  if (error?.name === 'NotFoundError') return 'microphone_not_found';
  if (error?.name === 'NotReadableError') return 'microphone_busy';
  return 'capture_failed';
}

function stopTracks(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

// HOTFIX CRÍTICO 2: alguns runtimes (visto em campo no Chrome mobile)
// resolvem getUserMedia com "sucesso" mas entregam um stream/track já
// inativo (conflito de hardware, permissão revogada entre o preflight e a
// captura real, etc.) -- gravar esse stream produz um blob tecnicamente
// válido porém vazio de áudio real, sem NENHUM erro visível. Só reprovamos
// quando o runtime AFIRMA explicitamente que está morto (`active === false`
// ou `readyState === 'ended'`); campos ausentes (ex.: runtimes de teste)
// nunca reprovam -- isso preserva 100% do comportamento anterior sempre
// que o runtime não expõe esses sinais.
function getAudioTracks(mediaStream) {
  return typeof mediaStream?.getAudioTracks === 'function'
    ? mediaStream.getAudioTracks()
    : (mediaStream?.getTracks?.() ?? []);
}

function isStreamUsable(mediaStream, track) {
  if (!track) return false;
  if (mediaStream?.active === false) return false;
  if (track.readyState === 'ended') return false;
  if (track.enabled === false) return false;
  return true;
}

async function requestAudioStream(runtime) {
  const hasConstraintDetection = typeof runtime.navigator.mediaDevices.getSupportedConstraints === 'function';
  const supported = hasConstraintDetection
    ? runtime.navigator.mediaDevices.getSupportedConstraints()
    : {};
  const allows = (name) => !hasConstraintDetection || supported[name] === true;
  const audio = {};
  if (allows('channelCount')) audio.channelCount = 1;
  if (allows('echoCancellation')) audio.echoCancellation = true;
  if (allows('noiseSuppression')) audio.noiseSuppression = true;
  if (allows('autoGainControl')) audio.autoGainControl = true;
  try {
    return await runtime.navigator.mediaDevices.getUserMedia({
      audio,
      video: false,
    });
  } catch (error) {
    if (!['OverconstrainedError', 'TypeError'].includes(error?.name)) throw error;
    return runtime.navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

export async function requestVoiceMicrophonePermission(runtime = globalThis) {
  if (!runtime?.navigator?.mediaDevices?.getUserMedia) {
    return Object.freeze({ granted: false, errorCode: 'unsupported' });
  }

  try {
    const stream = await requestAudioStream(runtime);
    stopTracks(stream);
    return Object.freeze({ granted: true, errorCode: null });
  } catch (error) {
    return Object.freeze({ granted: false, errorCode: mapCaptureError(error) });
  }
}

export function isAppleWebKitRuntime(runtime = globalThis) {
  const navigator = runtime?.navigator;
  const userAgent = String(navigator?.userAgent || '');
  const platform = String(navigator?.platform || '');
  const isTouchMac = platform === 'MacIntel' && Number(navigator?.maxTouchPoints) > 1;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);
  const isDesktopSafari = /Safari/i.test(userAgent)
    && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPR|Android/i.test(userAgent);
  return /AppleWebKit/i.test(userAgent)
    && (isAppleMobile || isTouchMac || isDesktopSafari);
}

export function getSupportedVoiceMimeType(
  MediaRecorderClass = globalThis.MediaRecorder,
  { preferMp4 = false } = {},
) {
  if (!MediaRecorderClass) return '';
  const candidates = preferMp4 ? APPLE_AUDIO_MIME_TYPES : VOICE_AUDIO_MIME_TYPES;
  return candidates.find(
    (mimeType) => MediaRecorderClass.isTypeSupported?.(mimeType),
  ) ?? '';
}

export function isMediaRecorderSupported(runtime = globalThis) {
  return Boolean(
    runtime?.navigator?.mediaDevices?.getUserMedia
      && runtime?.MediaRecorder,
  );
}

export function createMediaRecorderAdapter({
  runtime = globalThis,
  maxBytes = VOICE_AUDIO_MAX_BYTES,
  maxDurationMs = VOICE_AUDIO_MAX_DURATION_MS,
  onStart,
  onAudio,
  onError,
  onCancel,
  onStreamReady,
  sessionId = 0,
  stopTimeoutMs = VOICE_RECORDER_STOP_TIMEOUT_MS,
  now = () => Date.now(),
} = {}) {
  if (!isMediaRecorderSupported(runtime)) {
    return {
      supported: false,
      start: async () => false,
      stop: () => false,
      cancel: () => false,
      dispose: () => {},
      getRecorderState: () => 'inactive',
    };
  }

  let stream = null;
  let recorder = null;
  let audioTrack = null;
  let chunks = [];
  let startedAt = 0;
  let limitTimer = null;
  let stopTimer = null;
  let canceled = false;
  let disposed = false;
  let finalized = false;
  let stopReason = null;
  let permissionRequestId = 0;

  function clearResources() {
    runtime.clearTimeout?.(limitTimer);
    runtime.clearTimeout?.(stopTimer);
    limitTimer = null;
    stopTimer = null;
    // HOTFIX CRÍTICO 2: remove o listener e ZERA `stream`/`recorder`/
    // `audioTrack` ANTES de chamar stopTracks() (que executa track.stop(),
    // o próprio gatilho do evento 'ended' que handleTrackEnded escuta) --
    // ordem importa aqui. Sem isso, um runtime que dispare 'ended'
    // sincronamente dentro de track.stop() reentraria em handleTrackEnded
    // ENQUANTO stream/recorder ainda não tinham sido zerados, passando pelo
    // guard `!stream || !recorder` como se a captura ainda estivesse ativa
    // -- transformando um encerramento gracioso (stop/cancel/dispose) num
    // 'track_ended' falso.
    const trackToRelease = audioTrack;
    const streamToRelease = stream;
    trackToRelease?.removeEventListener?.('ended', handleTrackEnded);
    trackToRelease?.removeEventListener?.('mute', handleTrackMuted);
    stream = null;
    recorder = null;
    audioTrack = null;
    chunks = [];
    startedAt = 0;
    stopTracks(streamToRelease);
  }

  function finalizeSession({ kind, code = null, capture = null, reason = null }) {
    if (finalized) return false;
    finalized = true;
    clearResources();
    if (kind === 'audio') onAudio?.(capture);
    else if (kind === 'cancel') onCancel?.();
    else if (kind === 'error') onError?.({ code });
    if (kind !== 'dispose') {
      recordVoicePipelineDiagnostic('VOICE_SESSION_FINISHED', {
        sessionId,
        stopReason: reason ?? code ?? stopReason ?? kind,
      });
    }
    return true;
  }

  function fail(code) {
    return finalizeSession({ kind: 'error', code, reason: code });
  }

  // HOTFIX CRÍTICO 2: rede de segurança para a track de áudio encerrar
  // NO MEIO da captura (dispositivo revoga acesso, outro app assume o
  // microfone, driver falha) -- sem isso, o MediaRecorder simplesmente para
  // de receber amostras em silêncio, sem `onerror` nem `onstop`, e a UI
  // fica presa em "Ouvindo..." indefinidamente. Só age se ainda houver
  // captura de verdade em andamento (`stream`/`recorder` não nulos e não
  // `canceled`/`disposed`) -- um `ended` disparado pelo NOSSO PRÓPRIO
  // `track.stop()` durante um stop/cancel graciosos chega DEPOIS de
  // `clearResources()` já ter zerado essas variáveis, então é sempre um
  // no-op nesse caso (distingue encerramento intencional de falha real).
  function handleTrackEnded() {
    if (!stream || !recorder || canceled || disposed) return;
    recordVoicePipelineDiagnostic('TRACK_ENDED', { streamActive: Boolean(stream?.active), sessionId });
    fail('track_ended');
  }

  function handleTrackMuted() {
    recordVoicePipelineDiagnostic('TRACK_MUTED', { trackMuted: true, sessionId });
  }

  async function start() {
    if (stream || recorder || disposed) return false;
    const requestId = ++permissionRequestId;
    canceled = false;
    recordVoicePipelineDiagnostic('MIC_REQUEST_STARTED', { sessionId });
    recordVoicePipelineDiagnostic('VOICE_SESSION_STARTED', { sessionId });

    try {
      const nextStream = await requestAudioStream(runtime);
      recordVoicePipelineDiagnostic('MIC_PERMISSION_GRANTED', { sessionId });

      if (disposed || canceled || requestId !== permissionRequestId) {
        stopTracks(nextStream);
        return false;
      }

      const audioTracks = getAudioTracks(nextStream);
      recordVoicePipelineDiagnostic('MIC_STREAM_RECEIVED', {
        streamActive: Boolean(nextStream?.active),
        audioTrackCount: audioTracks.length,
        sessionId,
      });
      const nextTrack = audioTracks[0] ?? null;

      // HOTFIX CRÍTICO 2: getUserMedia pode resolver "com sucesso" e ainda
      // assim entregar um stream/track já morto -- ver isStreamUsable().
      // Sem esta checagem, o pipeline inteiro prosseguia (MediaRecorder
      // criado, "Ouvindo..." exibido) para gravar silêncio garantido, sem
      // NENHUM erro visível ao usuário.
      if (!isStreamUsable(nextStream, nextTrack)) {
        recordVoicePipelineDiagnostic('TRACK_ENDED', {
          streamActive: Boolean(nextStream?.active),
          trackReadyState: nextTrack?.readyState ?? 'absent',
          trackEnabled: nextTrack?.enabled,
          sessionId,
        });
        stopTracks(nextStream);
        fail('no_audio_track');
        return false;
      }

      recordVoicePipelineDiagnostic('MIC_AUDIO_TRACK_LIVE', {
        trackReadyState: nextTrack.readyState,
        trackEnabled: nextTrack.enabled,
        trackMuted: Boolean(nextTrack.muted),
        sessionId,
        ...(nextTrack.getSettings?.() ?? {}),
      });

      stream = nextStream;
      audioTrack = nextTrack;
      audioTrack.addEventListener?.('ended', handleTrackEnded);
      audioTrack.addEventListener?.('mute', handleTrackMuted);
      // BUG 3: expoe o MESMO MediaStream ja capturado aqui (nunca um
      // segundo getUserMedia) para quem quiser visualizar a intensidade da
      // voz (ex.: AnalyserNode no botao da Uni) -- puramente informativo,
      // nunca afeta a gravacao/transcricao.
      onStreamReady?.(stream);
      const mimeType = getSupportedVoiceMimeType(runtime.MediaRecorder, {
        preferMp4: isAppleWebKitRuntime(runtime),
      });
      recorder = mimeType
        ? new runtime.MediaRecorder(stream, { mimeType })
        : new runtime.MediaRecorder(stream);
      chunks = [];

      recorder.ondataavailable = (event) => {
        if (!canceled && event?.data?.size > 0) {
          chunks.push(event.data);
          recordVoicePipelineDiagnostic('RECORDER_DATA_AVAILABLE', { blobSizeBytes: event.data.size, sessionId });
        }
      };
      recorder.onerror = () => {
        recordVoicePipelineDiagnostic('RECORDER_ERROR', { sessionId });
        fail('capture_failed');
      };
      recorder.onstart = () => {
        startedAt = now();
        recordVoicePipelineDiagnostic('RECORDER_STARTED', {
          mimeType: recorder?.mimeType || mimeType || '',
          recorderState: recorder?.state ?? null,
          sessionId,
        });
        onStart?.();
        limitTimer = runtime.setTimeout?.(() => {
          canceled = true;
          recorder?.stop?.();
          fail('duration_limit');
        }, maxDurationMs);
      };
      recorder.onstop = () => {
        recordVoicePipelineDiagnostic('RECORDER_STOPPED', { sessionId, stopReason });
        if (finalized || canceled || disposed) {
          clearResources();
          return;
        }

        const durationMs = Math.max(1, now() - startedAt);
        const type = recorder?.mimeType || mimeType || chunks[0]?.type || 'audio/webm';
        const audio = new Blob(chunks, { type });

        if (!audio.size) {
          recordVoicePipelineDiagnostic('EMPTY_AUDIO', { sessionId });
          fail('empty_audio');
          return;
        }
        if (audio.size > maxBytes) {
          fail('size_limit');
          return;
        }

        recordVoicePipelineDiagnostic('AUDIO_BLOB_CREATED', {
          blobSizeBytes: audio.size, mimeType: type, durationMs, sessionId,
        });
        finalizeSession({
          kind: 'audio',
          capture: { audio, durationMs, mimeType: type },
          reason: stopReason ?? 'released',
        });
      };

      recordVoicePipelineDiagnostic('CAPTURE_STARTED', { mimeType: mimeType || '', sessionId });
      recorder.start();
      return true;
    } catch (error) {
      recordVoicePipelineDiagnostic('MIC_PERMISSION_ERROR', { sessionId });
      if (!canceled && !disposed) fail(mapCaptureError(error));
      return false;
    }
  }

  function stop(reason = 'released') {
    if (!recorder || recorder.state !== 'recording' || canceled || finalized) return false;
    stopReason = reason;
    stopTimer = runtime.setTimeout?.(() => {
      if (finalized) return;
      recordVoicePipelineDiagnostic('RECORDER_STOP_TIMEOUT', {
        recorderState: recorder?.state ?? null,
        sessionId,
        stopReason,
      });
      fail('capture_failed');
    }, stopTimeoutMs);
    try {
      recorder.stop();
    } catch {
      fail('capture_failed');
      return false;
    }
    return true;
  }

  // HOTFIX FINAL (deadlock "OUVINDO..." travado após start/cancel
  // repetidos) -- CAUSA RAIZ: a guarda antiga `(!recorder && !stream)`
  // fazia cancel() ser um NO-OP completo (nunca marcava `canceled=true`
  // nem incrementava `permissionRequestId`) sempre que chamado ENQUANTO
  // `getUserMedia()` ainda estava pendente (a janela mais comum num
  // cancelamento rápido: usuário solta/cancela antes da permissão
  // resolver). Sem esses dois marcadores setados, quando a promise de
  // getUserMedia finalmente resolvia (ainda que bem depois), a checagem
  // em `start()` (`if (disposed || canceled || requestId !==
  // permissionRequestId)`) não pegava o cancelamento -- a sessão seguia
  // adiante, criava o MediaRecorder de verdade e chamava `recorder.start()`
  // mesmo já tendo sido cancelada, prendendo a UI em "ouvindo" para uma
  // captura que o usuário já achava encerrada. Só não travava sempre
  // porque `useUniVoiceInput.cancel()` também chama `dispose()` logo em
  // seguida (que corrige os dois marcadores) -- mas isso dependia da ORDEM
  // exata de duas chamadas em dois arquivos diferentes, não de cancel()
  // ser correto sozinho. Agora cancel() sempre marca a sessão como
  // cancelada, independente de recorder/stream já existirem -- correção na
  // causa raiz, idempotente (uma segunda chamada cai no guard `canceled` e
  // não faz nada).
  function cancel() {
    if (canceled || finalized) return false;
    canceled = true;
    stopReason = stopReason ?? 'cancelled';
    permissionRequestId += 1;
    if (recorder?.state === 'recording') recorder.stop();
    return finalizeSession({ kind: 'cancel', reason: stopReason });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    canceled = true;
    permissionRequestId += 1;
    if (recorder?.state === 'recording') recorder.stop();
    finalizeSession({ kind: 'dispose', reason: 'disposed' });
  }

  return {
    supported: true,
    start,
    stop,
    cancel,
    dispose,
    getRecorderState: () => recorder?.state ?? 'inactive',
  };
}
