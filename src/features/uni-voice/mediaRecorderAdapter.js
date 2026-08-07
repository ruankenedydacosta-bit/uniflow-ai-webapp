export const VOICE_AUDIO_MAX_BYTES = 4 * 1024 * 1024;
export const VOICE_AUDIO_MAX_DURATION_MS = 15_000;
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

async function requestAudioStream(runtime) {
  try {
    return await runtime.navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
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
} = {}) {
  if (!isMediaRecorderSupported(runtime)) {
    return {
      supported: false,
      start: async () => false,
      stop: () => false,
      cancel: () => false,
      dispose: () => {},
    };
  }

  let stream = null;
  let recorder = null;
  let chunks = [];
  let startedAt = 0;
  let limitTimer = null;
  let canceled = false;
  let disposed = false;
  let permissionRequestId = 0;

  function clearResources() {
    runtime.clearTimeout?.(limitTimer);
    limitTimer = null;
    stopTracks(stream);
    stream = null;
    recorder = null;
    chunks = [];
    startedAt = 0;
  }

  function fail(code) {
    clearResources();
    onError?.({ code });
  }

  async function start() {
    if (stream || recorder || disposed) return false;
    const requestId = ++permissionRequestId;
    canceled = false;

    try {
      const nextStream = await requestAudioStream(runtime);

      if (disposed || canceled || requestId !== permissionRequestId) {
        stopTracks(nextStream);
        return false;
      }

      stream = nextStream;
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
        if (!canceled && event?.data?.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => fail('capture_failed');
      recorder.onstart = () => {
        startedAt = Date.now();
        onStart?.();
        limitTimer = runtime.setTimeout?.(() => {
          canceled = true;
          recorder?.stop?.();
          fail('duration_limit');
        }, maxDurationMs);
      };
      recorder.onstop = () => {
        if (canceled || disposed) {
          clearResources();
          return;
        }

        const durationMs = Math.max(1, Date.now() - startedAt);
        const type = recorder?.mimeType || mimeType || chunks[0]?.type || 'audio/webm';
        const audio = new Blob(chunks, { type });

        if (!audio.size) {
          fail('empty_audio');
          return;
        }
        if (audio.size > maxBytes) {
          fail('size_limit');
          return;
        }

        clearResources();
        onAudio?.({ audio, durationMs, mimeType: type });
      };

      recorder.start();
      return true;
    } catch (error) {
      if (!canceled && !disposed) fail(mapCaptureError(error));
      return false;
    }
  }

  function stop() {
    if (!recorder || recorder.state !== 'recording' || canceled) return false;
    recorder.stop();
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
    if (canceled) return false;
    canceled = true;
    permissionRequestId += 1;
    if (recorder?.state === 'recording') recorder.stop();
    clearResources();
    onCancel?.();
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    canceled = true;
    permissionRequestId += 1;
    if (recorder?.state === 'recording') recorder.stop();
    clearResources();
  }

  return { supported: true, start, stop, cancel, dispose };
}
