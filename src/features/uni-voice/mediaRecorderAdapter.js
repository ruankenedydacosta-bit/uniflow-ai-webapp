export const VOICE_AUDIO_MAX_BYTES = 4 * 1024 * 1024;
export const VOICE_AUDIO_MAX_DURATION_MS = 15_000;
export const VOICE_AUDIO_MIME_TYPES = Object.freeze([
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
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

export function getSupportedVoiceMimeType(MediaRecorderClass = globalThis.MediaRecorder) {
  if (!MediaRecorderClass) return '';
  return VOICE_AUDIO_MIME_TYPES.find(
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
      const nextStream = await runtime.navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

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
      const mimeType = getSupportedVoiceMimeType(runtime.MediaRecorder);
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

  function cancel() {
    if ((!recorder && !stream) || canceled) return false;
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
