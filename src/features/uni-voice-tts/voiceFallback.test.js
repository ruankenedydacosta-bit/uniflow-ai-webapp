import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserSpeechTtsProvider } from './browserSpeechTtsProvider.js';
import { createFallbackVoiceTtsProvider } from './fallbackVoiceTtsProvider.js';
import {
  parseVoiceTestUserIds,
  resolveVoiceFallbackPolicy,
  shouldUseBrowserFallback,
} from './voiceFallbackPolicy.js';
import { VOICE_TTS_ERROR_CODES } from './voiceTtsStatus.js';
import {
  createVoiceTtsRequestContext,
  recordVoiceTtsTelemetry,
  resetVoiceTtsRequestSequenceForTests,
} from './voiceTtsTelemetry.js';

function providerError(code) {
  return Object.assign(new Error(code), { code, retryable: false, providerStatus: 402 });
}

function createProviderDouble({ supported = true, result = 'success', name = 'provider' } = {}) {
  const calls = { speak: 0, stop: 0, pause: 0, resume: 0, cancel: 0, texts: [] };
  return {
    calls,
    providerName: name,
    isSupported: () => supported,
    healthCheck: async () => ({ available: supported, reason: supported ? null : 'UNAVAILABLE' }),
    speak: async (text, callbacks = {}) => {
      calls.speak += 1;
      calls.texts.push(text);
      if (result instanceof Error) throw result;
      callbacks.onPlaying?.();
      callbacks.onEnded?.();
      return result && typeof result === 'object'
        ? result
        : { providerName: name };
    },
    play: () => false,
    pause: () => { calls.pause += 1; },
    resume: () => { calls.resume += 1; },
    stop: () => { calls.stop += 1; },
    cancel: () => { calls.cancel += 1; },
  };
}

function createBrowserRuntime({ autoEnd = true, error = null } = {}) {
  const calls = { cancel: 0, pause: 0, resume: 0, speak: 0, utterances: [] };
  class SpeechSynthesisUtterance {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.volume = 0;
      this.voice = null;
    }
  }
  const speechSynthesis = {
    paused: false,
    getVoices: () => [
      { name: 'English', lang: 'en-US' },
      { name: 'Português Brasil', lang: 'pt-BR' },
    ],
    speak(utterance) {
      calls.speak += 1;
      calls.utterances.push(utterance);
      queueMicrotask(() => {
        utterance.onstart?.();
        if (error) utterance.onerror?.({ error });
        else if (autoEnd) utterance.onend?.();
      });
    },
    cancel() { calls.cancel += 1; },
    pause() { calls.pause += 1; this.paused = true; },
    resume() { calls.resume += 1; this.paused = false; },
  };
  return { runtime: { speechSynthesis, SpeechSynthesisUtterance }, calls };
}

test('allowlist de contas de teste e centralizada, normalizada e sem duplicatas', () => {
  assert.deepEqual(parseVoiceTestUserIds(' user-a, user-b,user-a, '), ['user-a', 'user-b']);
});

test('DEV exige flag explicita para liberar fallback; variavel ausente permanece desligada', () => {
  assert.equal(resolveVoiceFallbackPolicy({ env: { DEV: true } }).browserFallbackAllowed, false);
  assert.equal(resolveVoiceFallbackPolicy({
    env: { DEV: true, VITE_UNI_VOICE_DEV_FALLBACK_ENABLED: 'true' },
  }).browserFallbackAllowed, true);
});

test('producao sem flag nunca ativa fallback nem modo forcado', () => {
  assert.deepEqual(
    resolveVoiceFallbackPolicy({
      env: { PROD: true, VITE_UNI_VOICE_FORCE_BROWSER_TTS: 'true' },
      userId: 'test-user',
    }),
    {
      browserFallbackAllowed: false,
      forceBrowserTts: false,
      shouldTryPrimaryProvider: true,
      isDevelopment: false,
      isAuthorizedTestUser: false,
    },
  );
});

test('conta autorizada exige simultaneamente flag e user id presente na allowlist', () => {
  const env = {
    PROD: true,
    VITE_UNI_VOICE_DEV_FALLBACK_ENABLED: 'true',
    VITE_UNI_VOICE_TEST_USER_IDS: 'allowed-user',
  };
  assert.equal(resolveVoiceFallbackPolicy({ env, userId: 'allowed-user' }).browserFallbackAllowed, true);
  assert.equal(resolveVoiceFallbackPolicy({ env, userId: 'other-user' }).browserFallbackAllowed, false);
});

test('modo browser forcado so e aceito quando o fallback esta autorizado', () => {
  const flag = { VITE_UNI_VOICE_FORCE_BROWSER_TTS: 'true' };
  assert.equal(resolveVoiceFallbackPolicy({ env: { DEV: true, ...flag } }).forceBrowserTts, false);
  assert.equal(resolveVoiceFallbackPolicy({
    env: { DEV: true, VITE_UNI_VOICE_DEV_FALLBACK_ENABLED: 'true', ...flag },
  }).forceBrowserTts, true);
});

test('falhas do lado do provedor (502/quota/auth/timeout/rede) acionam fallback automatico; erros de sessao/texto nao', () => {
  const policy = { browserFallbackAllowed: true };
  for (const code of [
    'PROVIDER_QUOTA_ERROR',
    'PROVIDER_AUTH_ERROR',
    'PROVIDER_VOICE_NOT_FOUND',
    'PROVIDER_ERROR',
    'PROVIDER_TIMEOUT',
    'PROVIDER_RATE_LIMIT',
    'NETWORK_ERROR',
  ]) {
    assert.equal(shouldUseBrowserFallback(providerError(code), policy), true, code);
  }
  for (const code of [
    'UNAUTHORIZED',
    'FORBIDDEN',
    'INVALID_TEXT',
    'TEXT_TOO_LONG',
    'CONFIGURATION_ERROR',
    'INVALID_REQUEST',
    'CANCELLED',
    'AUDIO_PLAYBACK_ERROR',
  ]) {
    assert.equal(shouldUseBrowserFallback(providerError(code), policy), false, code);
  }
  assert.equal(shouldUseBrowserFallback(providerError('PROVIDER_QUOTA_ERROR'), { browserFallbackAllowed: false }), false);
});

test('quota da ElevenLabs usa fallback do navegador e preserva o texto integral', async () => {
  const primary = createProviderDouble({ result: providerError('PROVIDER_QUOTA_ERROR') });
  const browser = createProviderDouble({ name: 'browser_speech_tts' });
  const provider = createFallbackVoiceTtsProvider({
    primaryProvider: primary,
    browserProvider: browser,
    policy: { browserFallbackAllowed: true, forceBrowserTts: false },
  });
  const result = await provider.speak('Seja bem-vindo, senhor Ruan.');
  assert.equal(result.providerName, 'browser_speech_tts');
  assert.deepEqual(primary.calls.texts, ['Seja bem-vindo, senhor Ruan.']);
  assert.deepEqual(browser.calls.texts, ['Seja bem-vindo, senhor Ruan.']);
});

test('502 de quota aciona exatamente um fallback e nunca entra em loop de retry', async () => {
  const primary = createProviderDouble({ result: providerError('PROVIDER_QUOTA_ERROR') });
  const browser = createProviderDouble({ name: 'browser_speech_tts' });
  const events = [];
  const provider = createFallbackVoiceTtsProvider({
    primaryProvider: primary,
    browserProvider: browser,
    policy: { browserFallbackAllowed: true, forceBrowserTts: false },
  });
  await provider.speak('Olá', { onProviderEvent: (event) => events.push(event) });
  assert.equal(primary.calls.speak, 1);
  assert.equal(browser.calls.speak, 1);
  assert.deepEqual(events, [
    { provider: 'elevenlabs', status: 'requested', fallbackUsed: false },
    { provider: 'elevenlabs', status: 'error', fallbackUsed: false },
    { provider: 'browser', status: 'requested', fallbackUsed: true },
    { provider: 'browser', status: 'success', fallbackUsed: true },
  ]);
});

test('sucesso oficial e cache HIT nunca acionam o fallback', async () => {
  for (const primaryResult of [
    { providerName: 'elevenlabs_tts', cacheHit: false },
    { providerName: 'cache', cacheHit: true },
  ]) {
    const primary = createProviderDouble({ result: primaryResult });
    const browser = createProviderDouble({ name: 'browser_speech_tts' });
    const events = [];
    const provider = createFallbackVoiceTtsProvider({
      primaryProvider: primary,
      browserProvider: browser,
      policy: { browserFallbackAllowed: true, forceBrowserTts: false },
    });
    await provider.speak('Olá', { onProviderEvent: (event) => events.push(event) });
    assert.equal(primary.calls.speak, 1);
    assert.equal(browser.calls.speak, 0);
    assert.equal(events.at(-1).provider, primaryResult.cacheHit ? 'cache' : 'elevenlabs');
    assert.equal(events.at(-1).fallbackUsed, false);
  }
});

test('telemetria DEV registra somente metadados seguros e requestId único', () => {
  resetVoiceTtsRequestSequenceForTests();
  const first = createVoiceTtsRequestContext({ messageId: 'msg-1', source: 'home_response' });
  const second = createVoiceTtsRequestContext({ messageId: 'msg-1', source: 'manual_replay' });
  const logs = [];
  const event = recordVoiceTtsTelemetry({
    ...first,
    provider: 'cache',
    status: 'success',
    deduplicated: false,
    fallbackUsed: false,
    text: 'dado que não pode aparecer',
    account: 'conta que não pode aparecer',
  }, {
    env: { DEV: true },
    logger: (...args) => logs.push(args),
  });
  assert.notEqual(first.requestId, second.requestId);
  assert.deepEqual(Object.keys(event), [
    'messageId', 'requestId', 'source', 'provider', 'status', 'deduplicated', 'fallbackUsed',
  ]);
  assert.equal(JSON.stringify(logs).includes('dado que não pode aparecer'), false);
  assert.equal(JSON.stringify(logs).includes('conta que não pode aparecer'), false);
});

test('telemetria fica silenciosa fora de DEV', () => {
  const logs = [];
  const result = recordVoiceTtsTelemetry({ provider: 'elevenlabs', status: 'success' }, {
    env: { PROD: true },
    logger: (...args) => logs.push(args),
  });
  assert.equal(result, null);
  assert.equal(logs.length, 0);
});

test('voiceId inexistente no ElevenLabs (PROVIDER_VOICE_NOT_FOUND) aciona o fallback do navegador', async () => {
  const primary = createProviderDouble({ result: providerError('PROVIDER_VOICE_NOT_FOUND') });
  const browser = createProviderDouble({ name: 'browser_speech_tts' });
  const provider = createFallbackVoiceTtsProvider({
    primaryProvider: primary,
    browserProvider: browser,
    policy: { browserFallbackAllowed: true, forceBrowserTts: false },
  });
  const result = await provider.speak('Seja bem-vindo, senhor Ruan.');
  assert.equal(result.providerName, 'browser_speech_tts');
  assert.equal(primary.calls.speak, 1);
  assert.equal(browser.calls.speak, 1);
});

test('502 generico da Edge Function (PROVIDER_ERROR) tambem usa o fallback do navegador', async () => {
  const primary = createProviderDouble({ result: providerError('PROVIDER_ERROR') });
  const browser = createProviderDouble({ name: 'browser_speech_tts' });
  const provider = createFallbackVoiceTtsProvider({
    primaryProvider: primary,
    browserProvider: browser,
    policy: { browserFallbackAllowed: true, forceBrowserTts: false },
  });
  const result = await provider.speak('Seja bem-vindo, senhor Ruan.');
  assert.equal(result.providerName, 'browser_speech_tts');
  assert.equal(primary.calls.speak, 1);
  assert.equal(browser.calls.speak, 1);
});

test('quota com fallback indisponivel devolve erro real e nao finge sucesso', async () => {
  const quota = providerError('PROVIDER_QUOTA_ERROR');
  const provider = createFallbackVoiceTtsProvider({
    primaryProvider: createProviderDouble({ result: quota }),
    browserProvider: createProviderDouble({ supported: false }),
    policy: { browserFallbackAllowed: true, forceBrowserTts: false },
  });
  await assert.rejects(provider.speak('Olá'), { code: 'PROVIDER_QUOTA_ERROR' });
});

test('DEV com fallback forcado nao chama ElevenLabs', async () => {
  const primary = createProviderDouble();
  const browser = createProviderDouble({ name: 'browser_speech_tts' });
  const provider = createFallbackVoiceTtsProvider({
    primaryProvider: primary,
    browserProvider: browser,
    policy: { browserFallbackAllowed: true, forceBrowserTts: true },
  });
  await provider.speak('Olá');
  assert.equal(primary.calls.speak, 0);
  assert.equal(browser.calls.speak, 1);
});

test('producao sem autorizacao mantem ElevenLabs e nao usa fallback apos quota', async () => {
  const browser = createProviderDouble({ name: 'browser_speech_tts' });
  const provider = createFallbackVoiceTtsProvider({
    primaryProvider: createProviderDouble({ result: providerError('PROVIDER_QUOTA_ERROR') }),
    browserProvider: browser,
    policy: { browserFallbackAllowed: false, forceBrowserTts: false },
  });
  await assert.rejects(provider.speak('Olá'), { code: 'PROVIDER_QUOTA_ERROR' });
  assert.equal(browser.calls.speak, 0);
});

test('Web Speech seleciona pt-BR, volume audivel e confirma sucesso apenas no onend', async () => {
  const { runtime, calls } = createBrowserRuntime();
  const provider = createBrowserSpeechTtsProvider({ runtime });
  let playing = 0;
  const result = await provider.speak('Olá', { onPlaying: () => { playing += 1; } });
  assert.equal(result.providerName, 'browser_speech_tts');
  assert.equal(playing, 1);
  assert.equal(calls.utterances[0].lang, 'pt-BR');
  assert.equal(calls.utterances[0].voice.lang, 'pt-BR');
  assert.equal(calls.utterances[0].volume, 1);
});

test('Web Speech indisponivel e falha do navegador sao erros distintos', async () => {
  const unavailable = createBrowserSpeechTtsProvider({ runtime: {} });
  await assert.rejects(unavailable.speak('Olá'), { code: 'BROWSER_FALLBACK_UNAVAILABLE' });

  const { runtime } = createBrowserRuntime({ error: 'synthesis-failed' });
  const failing = createBrowserSpeechTtsProvider({ runtime });
  await assert.rejects(failing.speak('Olá'), { code: 'BROWSER_FALLBACK_ERROR' });
});

test('nova fala cancela a anterior e evita sobreposicao', async () => {
  const { runtime, calls } = createBrowserRuntime({ autoEnd: false });
  const provider = createBrowserSpeechTtsProvider({ runtime });
  const first = provider.speak('Primeira').catch((error) => error);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = provider.speak('Segunda').catch((error) => error);
  assert.equal((await first).code, VOICE_TTS_ERROR_CODES.CANCELLED);
  provider.stop();
  assert.equal((await second).code, VOICE_TTS_ERROR_CODES.CANCELLED);
  assert.equal(calls.cancel, 2);
});

test('cleanup do provider composto para os dois mecanismos ao trocar de pagina', () => {
  const primary = createProviderDouble();
  const browser = createProviderDouble();
  const provider = createFallbackVoiceTtsProvider({
    primaryProvider: primary,
    browserProvider: browser,
    policy: { browserFallbackAllowed: true, forceBrowserTts: false },
  });
  provider.stop();
  assert.equal(primary.calls.stop, 1);
  assert.equal(browser.calls.stop, 1);
});

test('nao ha retry interno no provider composto: uma tentativa primaria e um fallback', async () => {
  const primary = createProviderDouble({ result: providerError('PROVIDER_QUOTA_ERROR') });
  const browser = createProviderDouble({ result: providerError('BROWSER_FALLBACK_ERROR') });
  const provider = createFallbackVoiceTtsProvider({
    primaryProvider: primary,
    browserProvider: browser,
    policy: { browserFallbackAllowed: true, forceBrowserTts: false },
  });
  await assert.rejects(provider.speak('Olá'), { code: 'BROWSER_FALLBACK_ERROR' });
  assert.equal(primary.calls.speak, 1);
  assert.equal(browser.calls.speak, 1);
});
