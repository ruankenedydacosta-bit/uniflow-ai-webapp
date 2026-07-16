import { createAudioPlayer } from './audioPlayer.js';
import { findVoiceClip, voiceManifest } from './voiceManifest.js';
import {
  createAudioHistoryEvent,
  createAudioSelectionStorage,
  selectAudio,
} from '../uni-audio-selection/index.js';

const INITIAL_STATE = Object.freeze({ status: 'idle', clipId: null, error: null });

function managerError(code, message) {
  return Object.assign(new Error(message), { code });
}

export class VoiceManager {
  #listeners = new Set();
  #manifest;
  #playedClips = new Set();
  #pendingClips = new Map();
  #player;
  #random;
  #selectionStorage;
  #sessionPlayed = new Set();
  #state = INITIAL_STATE;

  constructor({
    manifest = voiceManifest,
    player = createAudioPlayer(),
    random = Math.random,
    selectionStorage = createAudioSelectionStorage(),
  } = {}) {
    this.#manifest = manifest;
    this.#player = player;
    this.#random = random;
    this.#selectionStorage = selectionStorage;
  }

  getState() {
    return this.#state;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async play(clipId, options) {
    const clip = findVoiceClip(clipId, this.#manifest);
    if (!clip) throw managerError('CLIP_NOT_FOUND', 'Áudio da Uni ainda não cadastrado.');

    this.#setState({ status: 'playing', clipId, error: null });
    try {
      await this.#player.play(clip.src, options);
      return this.#state;
    } catch (error) {
      this.#setState(error?.code === 'PLAYBACK_CANCELED'
        ? INITIAL_STATE
        : { status: 'error', clipId, error: error?.code ?? 'PLAYBACK_FAILED' });
      throw error;
    }
  }

  playOnce(clipId, options) {
    if (this.#playedClips.has(clipId)) return Promise.resolve(false);
    if (this.#pendingClips.has(clipId)) return this.#pendingClips.get(clipId);

    const playback = this.play(clipId, options)
      .then(() => {
        this.#playedClips.add(clipId);
        return true;
      })
      .finally(() => this.#pendingClips.delete(clipId));
    this.#pendingClips.set(clipId, playback);
    return playback;
  }

  hasPlayed(clipId) {
    return this.#playedClips.has(clipId);
  }

  selectContext(context, options = {}) {
    return selectAudio({
      ...options,
      context,
      manifest: this.#manifest,
      history: this.#selectionStorage.read(options.userId),
      sessionPlayed: this.#sessionPlayed,
      random: options.random ?? this.#random,
      voiceActive: options.voiceActive ?? this.#state.status === 'playing',
    });
  }

  async playContext(context, options = {}) {
    const selection = this.selectContext(context, options);
    if (selection.status !== 'selected') return false;
    const { clip } = selection;
    const playback = this.play(clip.id, { volume: options.preferences?.volume ?? 1 });
    if (Number.isFinite(options.maxStartWaitMs) && options.maxStartWaitMs >= 0) {
      let timeoutId;
      try {
        await Promise.race([
          playback,
          new Promise((_, reject) => {
            timeoutId = setTimeout(
              () => reject(managerError('AUDIO_START_TIMEOUT', 'O áudio não iniciou dentro do limite.')),
              options.maxStartWaitMs,
            );
          }),
        ]);
      } catch (error) {
        if (error?.code === 'AUDIO_START_TIMEOUT') {
          this.#player.stop();
          this.#setState(INITIAL_STATE);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    } else {
      await playback;
    }
    const event = createAudioHistoryEvent(clip, {
      now: options.now,
      operationId: options.operationId,
    });
    this.#selectionStorage.record(options.userId, event);
    this.#sessionPlayed.add(clip.id);
    return clip;
  }

  pause() {
    this.#player.pause();
    if (this.#state.status === 'playing') this.#setState({ ...this.#state, status: 'paused' });
  }

  async resume() {
    if (this.#state.status !== 'paused') return this.#state;
    await this.#player.resume();
    this.#setState({ ...this.#state, status: 'playing' });
    return this.#state;
  }

  stop() {
    this.#player.stop();
    this.#setState(INITIAL_STATE);
  }

  setVolume(volume) {
    this.#player.setVolume(volume);
  }

  dispose() {
    this.#player.dispose();
    this.#listeners.clear();
    this.#playedClips.clear();
    this.#pendingClips.clear();
    this.#sessionPlayed.clear();
    this.#state = INITIAL_STATE;
  }

  #setState(nextState) {
    this.#state = Object.freeze({ ...nextState });
    this.#listeners.forEach((listener) => listener(this.#state));
  }
}

export function createVoiceManager(options) {
  return new VoiceManager(options);
}
