function createPlaybackError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function isLocalAudioSource(source, origin = globalThis.location?.origin) {
  if (typeof source !== 'string' || source.length === 0 || /^(?:data|javascript):/i.test(source)) {
    return false;
  }
  if (!/^[a-z][a-z\d+.-]*:/i.test(source) && !source.startsWith('//')) return true;

  try {
    const url = new URL(source, origin);
    if (url.protocol === 'file:') return true;
    return Boolean(origin)
      && url.origin === origin
      && ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function createAudioPlayer({ createAudio } = {}) {
  const audioFactory = createAudio ?? ((source) => new Audio(source));
  let audio = null;
  let cancelPending = null;

  const release = () => {
    cancelPending?.();
    cancelPending = null;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute?.('src');
    audio.load?.();
    audio = null;
  };

  return Object.freeze({
    async play(source, { volume = 1, playbackRate = 1 } = {}) {
      if (!isLocalAudioSource(source)) {
        throw createPlaybackError('INVALID_LOCAL_SOURCE', 'O áudio precisa ser um asset local válido.');
      }
      release();
      audio = audioFactory(source);
      audio.volume = Math.min(1, Math.max(0, Number(volume) || 0));
      audio.muted = false;
      audio.currentTime = 0;
      audio.playbackRate = Math.min(2, Math.max(0.5, Number(playbackRate) || 1));
      const currentAudio = audio;
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          currentAudio.removeEventListener?.('playing', handlePlaying);
          currentAudio.removeEventListener?.('error', handleError);
        };
        const handlePlaying = () => {
          cleanup();
          cancelPending = null;
          resolve();
        };
        const handleError = () => {
          cleanup();
          cancelPending = null;
          reject(createPlaybackError('PLAYBACK_FAILED', 'Não foi possível iniciar o áudio.'));
        };
        cancelPending = () => {
          cleanup();
          reject(createPlaybackError('PLAYBACK_CANCELED', 'A reprodução foi cancelada antes de iniciar.'));
        };
        currentAudio.addEventListener?.('playing', handlePlaying, { once: true });
        currentAudio.addEventListener?.('error', handleError, { once: true });
        Promise.resolve(currentAudio.play())
          .catch((error) => {
            cleanup();
            cancelPending = null;
            reject(error);
          });
      });
    },
    pause() { audio?.pause(); },
    resume() { return audio?.play() ?? Promise.resolve(); },
    stop: release,
    setVolume(volume) {
      if (audio) audio.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    },
    dispose: release,
  });
}
