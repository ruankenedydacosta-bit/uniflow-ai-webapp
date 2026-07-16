import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { voiceManifest } from '../uni-audio/voiceManifest.js';
import {
  appendAudioHistory,
  createAudioSelectionStorage,
  MAX_AUDIO_HISTORY,
  selectAudio,
} from './index.js';

const clip = (id, overrides = {}) => Object.freeze({
  id,
  category: 'processing',
  context: 'processing',
  emotion: 'calmly',
  text: id,
  src: `/assets/${id}.mp3`,
  enabled: true,
  weight: 1,
  cooldownMs: 0,
  oncePerUser: false,
  oncePerSession: false,
  requiresUserGesture: false,
  sensitiveAllowed: true,
  tags: [],
  ...overrides,
});
const manifest = (...clips) => ({ clips });
const event = (audio, playedAt, overrides = {}) => ({
  clipId: audio.id,
  category: audio.category,
  context: audio.context,
  playedAt,
  operationId: null,
  ...overrides,
});

test('first_app_access permanece em fallback silencioso', () => {
  assert.equal(selectAudio({ context: 'first_app_access', manifest: voiceManifest }).status, 'silent');
  assert.equal(voiceManifest.metadata.firstAppAccess.status, 'silent_pending_exact_asset');
});

test('returning welcome nunca usa first_app_access', () => {
  const result = selectAudio({ context: 'returning_user', manifest: voiceManifest, userGesture: true, random: () => 0 });
  assert.equal(result.status, 'selected');
  assert.equal(result.clip.context, 'returning_user');
  assert.notEqual(result.clip.text, 'Seja bem-vindo à UniFlow.');
});

test('returning welcome respeita cooldown de 12 horas', () => {
  const audio = clip('return', { category: 'welcome', context: 'returning_user', requiresUserGesture: true });
  const result = selectAudio({
    context: 'returning_user', manifest: manifest(audio), userGesture: true, now: 1_000,
    history: [event(audio, 999)],
  });
  assert.equal(result.status, 'silent');
});

test('saudacao respeita horario da manha', () => {
  const audio = clip('morning', { category: 'greeting', context: 'greeting_morning', requiresUserGesture: true });
  assert.equal(selectAudio({ context: 'greeting_morning', manifest: manifest(audio), hour: 8, userGesture: true }).status, 'selected');
  assert.equal(selectAudio({ context: 'greeting_morning', manifest: manifest(audio), hour: 18, userGesture: true }).status, 'silent');
});

test('saudacao respeita horarios da tarde e noite', () => {
  const afternoon = clip('afternoon', { context: 'greeting_afternoon', requiresUserGesture: true });
  const evening = clip('evening', { context: 'greeting_evening', requiresUserGesture: true });
  assert.equal(selectAudio({ context: 'greeting_afternoon', manifest: manifest(afternoon), hour: 15, userGesture: true }).status, 'selected');
  assert.equal(selectAudio({ context: 'greeting_evening', manifest: manifest(evening), hour: 2, userGesture: true }).status, 'selected');
});

test('saudacao nao interrompe outra fala ativa', () => {
  const audio = clip('morning', { category: 'greeting', context: 'greeting_morning', requiresUserGesture: true });
  assert.equal(selectAudio({ context: 'greeting_morning', manifest: manifest(audio), hour: 8, userGesture: true, voiceActive: true }).status, 'silent');
});

test('mesma frase nao repete seguida quando existe alternativa', () => {
  const first = clip('first');
  const second = clip('second');
  const result = selectAudio({ context: 'processing', manifest: manifest(first, second), history: [event(first, 1)], now: 100_000 });
  assert.equal(result.clip.id, 'second');
});

test('ultimos tres audios sao evitados quando existe alternativa', () => {
  const clips = ['a', 'b', 'c', 'd'].map((id) => clip(id));
  const history = clips.slice(0, 3).map((audio, index) => event(audio, index + 1));
  assert.equal(selectAudio({ context: 'processing', manifest: manifest(...clips), history, now: 100_000 }).clip.id, 'd');
});

test('peso influencia selecao', () => {
  const frequent = clip('frequent', { weight: 9 });
  const rare = clip('rare', { weight: 1 });
  assert.equal(selectAudio({ context: 'processing', manifest: manifest(frequent, rare), random: () => 0.5 }).clip.id, 'frequent');
  assert.equal(selectAudio({ context: 'processing', manifest: manifest(frequent, rare), random: () => 0.99 }).clip.id, 'rare');
});

test('cooldown bloqueia categoria', () => {
  const audio = clip('cooldown', { cooldownMs: 30_000 });
  assert.equal(selectAudio({ context: 'processing', manifest: manifest(audio), history: [event(audio, 10_000)], now: 20_000 }).status, 'silent');
});

test('oncePerSession funciona', () => {
  const audio = clip('session', { oncePerSession: true });
  assert.equal(selectAudio({ context: 'processing', manifest: manifest(audio), sessionPlayed: new Set([audio.id]) }).status, 'silent');
});

test('oncePerUser funciona', () => {
  const audio = clip('user', { oncePerUser: true });
  assert.equal(selectAudio({ context: 'processing', manifest: manifest(audio), history: [event(audio, 1)], now: 100_000 }).status, 'silent');
});

test('processing toca no maximo uma vez por operacao', () => {
  const audio = clip('operation');
  const history = [event(audio, 1, { operationId: 'op-1' })];
  assert.equal(selectAudio({ context: 'processing', manifest: manifest(audio), history, operationId: 'op-1', now: 100_000 }).status, 'silent');
});

test('listening nao fala continuamente na mesma captura', () => {
  const audio = clip('listen', { category: 'listening', context: 'listening' });
  const history = [event(audio, 1, { operationId: 'capture-1' })];
  assert.equal(selectAudio({ context: 'listening', manifest: manifest(audio), history, operationId: 'capture-1', now: 100_000 }).status, 'silent');
});

test('waiting cancela quando usuario volta a falar', () => {
  const audio = clip('wait', { context: 'waiting_for_user' });
  assert.equal(selectAudio({ context: 'waiting_for_user', manifest: manifest(audio), userSpeaking: true, silenceDurationMs: 4_000 }).status, 'silent');
});

test('waiting exige silencio real de 3,5 segundos', () => {
  const audio = clip('wait', { context: 'waiting_for_user' });
  assert.equal(selectAudio({ context: 'waiting_for_user', manifest: manifest(audio), silenceDurationMs: 3_499 }).status, 'silent');
  assert.equal(selectAudio({ context: 'waiting_for_user', manifest: manifest(audio), silenceDurationMs: 3_500 }).status, 'selected');
});

test('listening exige hold minimo de 400ms', () => {
  const audio = clip('listen', { category: 'listening', context: 'listening' });
  assert.equal(selectAudio({ context: 'listening', manifest: manifest(audio), holdDurationMs: 399 }).status, 'silent');
  assert.equal(selectAudio({ context: 'listening', manifest: manifest(audio), holdDurationMs: 400 }).status, 'selected');
});

test('confirmacao sensivel usa somente contexto seguro', () => {
  const safe = clip('safe', { category: 'confirmation', context: 'confirmation_sensitive' });
  const general = clip('general', { category: 'confirmation', context: 'confirmation_general' });
  const result = selectAudio({ context: 'confirmation_sensitive', manifest: manifest(safe, general), sensitive: true });
  assert.equal(result.clip.id, 'safe');
});

test('audio desativado nunca e elegivel', () => {
  const disabled = voiceManifest.clips.filter((audio) => !audio.enabled);
  assert.equal(disabled.length, 5);
  disabled.forEach((audio) => {
    assert.equal(selectAudio({ context: audio.context, manifest: manifest(audio), userGesture: true, sensitive: true, mockData: true }).status, 'silent');
  });
});

test('erro nunca seleciona frase com risada', () => {
  const laughter = clip('laugh', { category: 'error', context: 'error_understanding', tags: ['laughter'] });
  const neutral = clip('neutral', { category: 'error', context: 'error_understanding' });
  assert.equal(selectAudio({ context: 'error_understanding', manifest: manifest(laughter, neutral) }).clip.id, 'neutral');
});

test('erro de compreensao para depois de duas tentativas faladas', () => {
  const audio = clip('neutral', { category: 'error', context: 'error_understanding' });
  assert.equal(selectAudio({ context: 'error_understanding', manifest: manifest(audio), attemptNumber: 3 }).status, 'silent');
});

test('alerta proativo nunca seleciona frase com risada', () => {
  const laughter = clip('laugh', { category: 'proactive', context: 'proactive_attention', tags: ['laughter'] });
  const neutral = clip('neutral', { category: 'proactive', context: 'proactive_attention' });
  assert.equal(selectAudio({ context: 'proactive_attention', manifest: manifest(laughter, neutral), mockData: true }).clip.id, 'neutral');
});

test('suporte sensivel nunca seleciona frase com risada', () => {
  const laughter = clip('laugh', { category: 'support', context: 'support_emotional', tags: ['laughter'], sensitiveAllowed: false });
  const neutral = clip('neutral', { category: 'support', context: 'support_emotional' });
  assert.equal(selectAudio({ context: 'support_emotional', manifest: manifest(laughter, neutral), sensitive: true }).clip.id, 'neutral');
});

test('positive nao e elegivel em contexto negativo', () => {
  const audio = clip('positive', { category: 'positive', context: 'positive_progress' });
  assert.equal(selectAudio({ context: 'positive_progress', manifest: manifest(audio), mockData: true, negativeContext: true }).status, 'silent');
});

test('finance nao repete o mesmo audio em 24 horas', () => {
  const audio = clip('finance', { category: 'finance', context: 'finance_insight' });
  const now = 100_000_000;
  assert.equal(selectAudio({
    context: 'finance_insight', manifest: manifest(audio), hasVerifiedData: true, now,
    history: [event(audio, now - 60 * 60 * 1000)],
  }).status, 'silent');
});

test('proactive respeita limite diario', () => {
  const audio = clip('proactive', { category: 'proactive', context: 'proactive_suggestion' });
  const now = 100_000;
  const history = [event(audio, now - 2), event({ ...audio, id: 'other' }, now - 1)];
  assert.equal(selectAudio({ context: 'proactive_suggestion', manifest: manifest(audio), history, now, mockData: true }).status, 'silent');
});

test('proactive desligado nao toca', () => {
  const audio = clip('proactive', { category: 'proactive', context: 'proactive_suggestion' });
  assert.equal(selectAudio({ context: 'proactive_suggestion', manifest: manifest(audio), mockData: true, preferences: { proactiveVoiceEnabled: false } }).status, 'silent');
});

test('voiceEnabled false nao toca', () => {
  assert.equal(selectAudio({ context: 'processing', manifest: manifest(clip('voice')), preferences: { voiceEnabled: false } }).status, 'silent');
});

test('fallback silencioso nao lanca em entrada vazia', () => {
  assert.deepEqual(selectAudio(), { status: 'silent', clip: null, reason: 'NO_ELIGIBLE_AUDIO' });
});

test('storage indisponivel nao quebra', () => {
  const storage = createAudioSelectionStorage({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.doesNotThrow(() => storage.record('restricted', event(clip('stored'), 1)));
  assert.equal(storage.read('restricted').length, 1);
});

test('historico fica limitado a 100 eventos', () => {
  let history = [];
  for (let index = 0; index < MAX_AUDIO_HISTORY + 5; index += 1) history = appendAudioHistory(history, event(clip(`c-${index}`), index));
  assert.equal(history.length, MAX_AUDIO_HISTORY);
  assert.equal(history[0].clipId, 'c-5');
});

test('manifesto nao possui ids duplicados', () => {
  const ids = voiceManifest.clips.map((audio) => audio.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('todos os arquivos ativos do manifesto existem', async () => {
  await Promise.all(voiceManifest.clips.filter((audio) => audio.enabled).map((audio) => access(fileURLToPath(audio.src))));
});

test('todos os MP3 importados possuem texto e emocao', () => {
  voiceManifest.clips.filter((audio) => audio.enabled).forEach((audio) => {
    assert.ok(audio.text);
    assert.ok(audio.emotion);
    assert.ok(audio.origin.checksumSha256);
  });
});

test('nenhuma API HTTP ou ElevenLabs foi adicionada ao catalogo', () => {
  voiceManifest.clips.forEach((audio) => {
    assert.doesNotMatch(audio.src ?? '', /^https?:/);
    assert.equal(audio.origin.c2paProvenancePreserved, true);
  });
});
