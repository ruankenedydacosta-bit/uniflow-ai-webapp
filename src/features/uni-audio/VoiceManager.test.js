import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createAudioPlayer, isLocalAudioSource } from './audioPlayer.js';
import { createVoiceManager } from './VoiceManager.js';
import { validateVoiceManifest, voiceManifest } from './voiceManifest.js';

function createFakePlayer() {
  const calls = [];
  return {
    calls,
    play: async (...args) => { calls.push(['play', ...args]); },
    pause: () => calls.push(['pause']),
    resume: async () => calls.push(['resume']),
    stop: () => calls.push(['stop']),
    setVolume: (value) => calls.push(['volume', value]),
    dispose: () => calls.push(['dispose']),
  };
}

const manifest = Object.freeze({
  clips: Object.freeze([
    Object.freeze({ id: 'greeting.welcome', category: 'greetings', src: '/assets/welcome.mp3' }),
  ]),
});

test('manifest registra catálogo local auditável e é profundamente imutável', () => {
  assert.equal(validateVoiceManifest(voiceManifest), true);
  assert.equal(voiceManifest.clips.length, 109);
  assert.equal(voiceManifest.clips.filter((clip) => clip.enabled).length, 104);
  assert.equal(voiceManifest.clips.filter((clip) => !clip.enabled).length, 5);
  assert.equal(isLocalAudioSource(voiceManifest.clips.find((clip) => clip.enabled).src), true);
  assert.equal(Object.isFrozen(voiceManifest), true);
  assert.equal(Object.isFrozen(voiceManifest.metadata), true);
});

test('fontes HTTP e data URL são rejeitadas', () => {
  assert.equal(isLocalAudioSource('https://example.com/voice.mp3'), false);
  assert.equal(
    isLocalAudioSource('http://127.0.0.1:5173/assets/voice.mp3', 'http://127.0.0.1:5173'),
    true,
  );
  assert.equal(
    isLocalAudioSource('http://example.com/voice.mp3', 'http://127.0.0.1:5173'),
    false,
  );
  assert.equal(isLocalAudioSource('//example.com/voice.mp3'), false);
  assert.equal(isLocalAudioSource('data:audio/mp3;base64,AA'), false);
  assert.equal(isLocalAudioSource('/assets/voice.mp3'), true);
});

test('player configura e libera um asset local', async () => {
  const calls = [];
  const audio = {
    pause: () => calls.push('pause'),
    play: async () => {
      calls.push('play');
      listeners.playing?.();
    },
    addEventListener: (event, listener) => { listeners[event] = listener; },
    removeEventListener: (event) => { delete listeners[event]; },
    removeAttribute: () => calls.push('remove'),
    load: () => calls.push('load'),
  };
  const listeners = {};
  const player = createAudioPlayer({ createAudio: () => audio });
  await player.play('/assets/voice.mp3', { volume: 2, playbackRate: 0.1 });
  assert.equal(audio.volume, 1);
  assert.equal(audio.muted, false);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.playbackRate, 0.5);
  assert.deepEqual(listeners, {});
  player.stop();
  assert.deepEqual(calls, ['play', 'pause', 'remove', 'load']);
});

test('novo play interrompe e libera o áudio anterior', async () => {
  const audios = [];
  const createAudio = () => {
    const listeners = {};
    const calls = [];
    const audio = {
      calls,
      pause: () => calls.push('pause'),
      play: async () => queueMicrotask(() => listeners.playing?.()),
      addEventListener: (event, listener) => { listeners[event] = listener; },
      removeEventListener: (event) => { delete listeners[event]; },
      removeAttribute: () => calls.push('remove'),
      load: () => calls.push('load'),
    };
    audios.push(audio);
    return audio;
  };
  const player = createAudioPlayer({ createAudio });
  await player.play('/assets/first.mp3');
  await player.play('/assets/second.mp3');
  assert.deepEqual(audios[0].calls, ['pause', 'remove', 'load']);
});

test('player persistente anuncia o fim sem criar reprodução paralela', async () => {
  const listeners = {};
  const audio = {
    pause() {},
    play: async () => queueMicrotask(() => listeners.playing?.()),
    addEventListener: (event, listener) => { listeners[event] = listener; },
    removeEventListener: (event) => { delete listeners[event]; },
    removeAttribute() {},
    load() {},
  };
  const player = createAudioPlayer({ createAudio: () => audio });
  let ended = 0;
  await player.play('/assets/voice.mp3', { onEnded: () => { ended += 1; } });
  listeners.ended();
  assert.equal(ended, 1);
  assert.equal(listeners.ended, undefined);
});

test('manager reproduz clip cadastrado sem integração externa', async () => {
  const player = createFakePlayer();
  const manager = createVoiceManager({ manifest, player });
  await manager.play('greeting.welcome');
  assert.equal(manager.getState().status, 'playing');
  assert.equal(player.calls[0][0], 'play');
  assert.equal(player.calls[0][1], '/assets/welcome.mp3');
  assert.equal(typeof player.calls[0][2].onEnded, 'function');
});

test('manager retorna a idle e repassa callback quando o áudio termina', async () => {
  const player = createFakePlayer();
  const manager = createVoiceManager({ manifest, player });
  let ended = 0;
  await manager.play('greeting.welcome', { onEnded: () => { ended += 1; } });
  player.calls[0][2].onEnded();
  assert.equal(manager.getState().status, 'idle');
  assert.equal(ended, 1);
});

test('manager rejeita clip ausente sem iniciar player', async () => {
  const player = createFakePlayer();
  const manager = createVoiceManager({ manifest, player });
  await assert.rejects(manager.play('missing'), { code: 'CLIP_NOT_FOUND' });
  assert.deepEqual(player.calls, []);
});

test('playOnce marca o clip somente depois do evento de reprodução confirmado', async () => {
  let finishPlayback;
  const player = createFakePlayer();
  player.play = () => new Promise((resolve) => { finishPlayback = resolve; });
  const manager = createVoiceManager({ manifest, player });
  const playback = manager.playOnce('greeting.welcome');
  assert.equal(manager.hasPlayed('greeting.welcome'), false);
  finishPlayback();
  assert.equal(await playback, true);
  assert.equal(manager.hasPlayed('greeting.welcome'), true);
  assert.equal(await manager.playOnce('greeting.welcome'), false);
});

test('falha não marca o clip e permite nova tentativa', async () => {
  const player = createFakePlayer();
  player.play = async () => { throw Object.assign(new Error('blocked'), { code: 'BLOCKED' }); };
  const manager = createVoiceManager({ manifest, player });
  await assert.rejects(manager.playOnce('greeting.welcome'), { code: 'BLOCKED' });
  assert.equal(manager.hasPlayed('greeting.welcome'), false);
});

test('provider persiste acima das rotas e o botão não possui player paralelo', async () => {
  const [mainSource, buttonSource, gestureSource] = await Promise.all([
    readFile(new URL('../../main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../layouts/mobile-app-shell/UniCenterButton.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../uni-instant/usePressAndHold.js', import.meta.url), 'utf8'),
  ]);
  assert.match(mainSource, /<VoiceProvider>[\s\S]*?<App \/>/);
  assert.match(buttonSource, /useVoiceManager\(\)/);
  assert.match(buttonSource, /playContext\('returning_user'/);
  assert.match(buttonSource, /Promise\.race\([\s\S]*?700/);
  assert.doesNotMatch(buttonSource, /createVoiceManager|new Audio/);
  assert.doesNotMatch(buttonSource, /\.stop\(\)|\.dispose\(\)/);
  assert.ok(buttonSource.indexOf("playContext('returning_user'") < buttonSource.indexOf('navigate(path)'));
  assert.match(buttonSource, /playContext\('returning_user'[\s\S]*?\.catch\(\(\) => false\)[\s\S]*?navigate\(path\)/);
  assert.match(gestureSource, /if \(wasHolding\)[\s\S]*?onHoldEnd[\s\S]*?else if \(wasPressing/);
});

test('playContext registra histórico somente após playing confirmado', async () => {
  let confirmPlaying;
  const contextualClip = Object.freeze({
    id: 'processing_001', category: 'processing', context: 'processing', src: '/assets/process.mp3',
    enabled: true, weight: 1, cooldownMs: 0, oncePerUser: false, oncePerSession: false,
    requiresUserGesture: false, sensitiveAllowed: true, tags: [],
  });
  const player = createFakePlayer();
  player.play = () => new Promise((resolve) => { confirmPlaying = resolve; });
  const events = [];
  const selectionStorage = { read: () => events, record: (_userId, next) => events.push(next) };
  const manager = createVoiceManager({ manifest: { clips: [contextualClip] }, player, selectionStorage });
  const playback = manager.playContext('processing', { operationId: 'op-1', now: 100 });
  assert.equal(events.length, 0);
  confirmPlaying();
  assert.equal((await playback).id, contextualClip.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].operationId, 'op-1');
});

test('falha de play contextual não registra histórico', async () => {
  const contextualClip = Object.freeze({
    id: 'processing_001', category: 'processing', context: 'processing', src: '/assets/process.mp3',
    enabled: true, weight: 1, cooldownMs: 0, oncePerUser: false, oncePerSession: false,
    requiresUserGesture: false, sensitiveAllowed: true, tags: [],
  });
  const player = createFakePlayer();
  player.play = async () => { throw new Error('blocked'); };
  const events = [];
  const manager = createVoiceManager({
    manifest: { clips: [contextualClip] }, player,
    selectionStorage: { read: () => events, record: (_userId, next) => events.push(next) },
  });
  await assert.rejects(manager.playContext('processing'));
  assert.equal(events.length, 0);
});

test('timeout de início não registra histórico', async () => {
  const contextualClip = Object.freeze({
    id: 'returning_user_001', category: 'welcome', context: 'returning_user', src: '/assets/return.mp3',
    enabled: true, weight: 1, cooldownMs: 0, oncePerUser: false, oncePerSession: false,
    requiresUserGesture: true, sensitiveAllowed: true, tags: [],
  });
  const player = createFakePlayer();
  player.play = () => new Promise(() => {});
  const events = [];
  const manager = createVoiceManager({
    manifest: { clips: [contextualClip] }, player,
    selectionStorage: { read: () => events, record: (_userId, next) => events.push(next) },
  });
  await assert.rejects(
    manager.playContext('returning_user', { userGesture: true, maxStartWaitMs: 1 }),
    { code: 'AUDIO_START_TIMEOUT' },
  );
  assert.equal(events.length, 0);
  assert.equal(player.calls.some(([operation]) => operation === 'stop'), true);
});

test('pause, resume, stop e dispose preservam ciclo controlado', async () => {
  const player = createFakePlayer();
  const manager = createVoiceManager({ manifest, player });
  const states = [];
  const unsubscribe = manager.subscribe((state) => states.push(state.status));
  await manager.play('greeting.welcome');
  manager.pause();
  await manager.resume();
  manager.stop();
  unsubscribe();
  manager.dispose();
  assert.deepEqual(states, ['playing', 'paused', 'playing', 'idle']);
  assert.equal(Object.isFrozen(manager.getState()), true);
  assert.equal(player.calls.at(-1)[0], 'dispose');
});
