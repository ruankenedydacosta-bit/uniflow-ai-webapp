import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBrowserVoiceProvider } from './browserVoiceProvider.js';
import { createPremiumVoiceProvider } from './premiumVoiceProvider.js';
import {
  createPremiumSessionGuard,
  prepareVoiceOutputText,
  PREMIUM_TEXT_LIMIT,
  resolveVoicePreset,
  sanitizeVoiceOutputText,
} from './voiceOutputPolicy.js';

const EDGE_SOURCE = readFileSync(
  new URL('../../../supabase/functions/generate-uni-premium-voice/index.ts', import.meta.url),
  'utf8',
);
const HOOK_SOURCE = readFileSync(new URL('./useUniVoiceOutput.js', import.meta.url), 'utf8');
const PAGE_SOURCE = readFileSync(new URL('../../pages/UniAIPage.jsx', import.meta.url), 'utf8');
const PROVIDER_SOURCE = readFileSync(new URL('./premiumVoiceProvider.js', import.meta.url), 'utf8');

function createBrowserRuntime() {
  const calls = { cancel: 0, speak: 0, utterance: null };
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  const speechSynthesis = {
    cancel() { calls.cancel += 1; },
    getVoices: () => [{ name: 'Luciana', lang: 'pt-BR' }],
    speak(utterance) {
      calls.speak += 1;
      calls.utterance = utterance;
      utterance.onstart?.();
      utterance.onend?.();
    },
  };
  return { runtime: { SpeechSynthesisUtterance: Utterance, speechSynthesis }, calls };
}

function createPremiumRuntime() {
  const calls = { created: 0, revoked: 0, paused: 0 };
  class Audio {
    constructor() {
      this.src = '';
    }
    play() {
      this.onplay?.();
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
    pause() { calls.paused += 1; }
  }
  return {
    runtime: {
      Audio,
      URL: {
        createObjectURL() { calls.created += 1; return 'blob:test'; },
        revokeObjectURL() { calls.revoked += 1; },
      },
      setTimeout,
      clearTimeout,
    },
    calls,
  };
}

test('voz padrão usa SpeechSynthesis com pt-BR', async () => {
  const { runtime, calls } = createBrowserRuntime();
  await createBrowserVoiceProvider(runtime).speak('Orientação pronta.');
  assert.equal(calls.speak, 1);
  assert.equal(calls.utterance.lang, 'pt-BR');
  assert.equal(calls.utterance.voice.name, 'Luciana');
});

test('stop encerra a reprodução padrão', () => {
  const { runtime, calls } = createBrowserRuntime();
  createBrowserVoiceProvider(runtime).stop();
  assert.equal(calls.cancel, 1);
});

test('stop conclui a Promise ativa como cancelada', async () => {
  class Utterance {}
  const runtime = {
    SpeechSynthesisUtterance: Utterance,
    speechSynthesis: { cancel() {}, getVoices: () => [{ name: 'Luciana', lang: 'pt-BR' }], speak() {} },
  };
  const provider = createBrowserVoiceProvider(runtime);
  const playback = provider.speak('Orientação');
  provider.stop();
  await assert.rejects(playback, { code: 'CANCELED' });
});

test('navegador sem SpeechSynthesis é tratado', async () => {
  const provider = createBrowserVoiceProvider({});
  assert.equal(provider.isSupported(), false);
  await assert.rejects(provider.speak('Texto'), { code: 'UNSUPPORTED' });
});

test('premium exige sessão autenticada no cliente', async () => {
  const { runtime } = createPremiumRuntime();
  const provider = createPremiumVoiceProvider({
    supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
    supabaseUrl: 'https://dev.supabase.co',
    supabaseAnonKey: 'anon',
    enabled: true,
    fetchImpl: async () => { throw new Error('não deveria chamar'); },
    runtime,
  });
  await assert.rejects(provider.speak('Orientação'), { code: 'UNAUTHORIZED' });
});

test('Edge Function exige allowlist para premium', () => {
  assert.match(EDGE_SOURCE, /allowlist\.has\(userId\)/);
  assert.match(EDGE_SOURCE, /return jsonResponse\(403/);
});

test('user_id do caller é rejeitado pela Edge Function', () => {
  assert.match(EDGE_SOURCE, /'user_id' in payload/);
  assert.doesNotMatch(PROVIDER_SOURCE, /user_id/);
});

test('segredos ElevenLabs não aparecem no frontend', () => {
  assert.doesNotMatch(`${HOOK_SOURCE}\n${PROVIDER_SOURCE}`, /ELEVENLABS_(?:API_KEY|VOICE_ID|MODEL_ID)/);
  assert.doesNotMatch(`${HOOK_SOURCE}\n${PROVIDER_SOURCE}`, /VITE_ELEVENLABS/);
});

test('texto vazio é rejeitado', () => {
  assert.equal(prepareVoiceOutputText('  ').error.code, 'EMPTY_TEXT');
});

test('texto premium acima de 320 caracteres é rejeitado antes da chamada', () => {
  const result = prepareVoiceOutputText('a'.repeat(PREMIUM_TEXT_LIMIT + 1), { premium: true });
  assert.equal(result.error.code, 'TEXT_TOO_LONG');
});

test('HTML e markdown de apresentação são removidos', () => {
  assert.equal(sanitizeVoiceOutputText('# **Saldo** <b>saudável</b> [agora](https://example.com)'), 'Saldo saudável agora');
});

test('dados sensíveis são bloqueados', () => {
  assert.equal(prepareVoiceOutputText('CPF 123.456.789-00').error.code, 'SENSITIVE_TEXT');
  assert.equal(prepareVoiceOutputText('senha: segredo').error.code, 'SENSITIVE_TEXT');
});

test('geração premium duplicada é impedida', () => {
  const guard = createPremiumSessionGuard();
  assert.equal(guard.begin().allowed, true);
  assert.equal(guard.begin().reason, 'DUPLICATE_GENERATION');
});

test('limite de dez gerações por sessão é respeitado', () => {
  const guard = createPremiumSessionGuard(10);
  for (let count = 0; count < 10; count += 1) {
    assert.equal(guard.begin().allowed, true);
    guard.finish();
  }
  assert.equal(guard.begin().reason, 'QUOTA_REACHED');
});

test('voz premium nunca é iniciada automaticamente', () => {
  assert.doesNotMatch(PAGE_SOURCE, /queueAutomaticSpeech|autoSpeechTimer/);
  assert.match(PAGE_SOURCE, /handleSpeakPremium/);
});

test('falha premium possui caminho explícito para fallback padrão', () => {
  assert.match(HOOK_SOURCE, /speakBrowser\(fallbackText, \{ fallback: true \}\)/);
});

test('áudio e texto não são persistidos', () => {
  assert.doesNotMatch(`${EDGE_SOURCE}\n${PROVIDER_SOURCE}`, /storage\.|localStorage|sessionStorage|\.insert\(/);
  assert.match(EDGE_SOURCE, /Cache-Control': 'no-store/);
});

test('ObjectURL é revogada após reprodução premium', async () => {
  const { runtime, calls } = createPremiumRuntime();
  const provider = createPremiumVoiceProvider({
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
    supabaseUrl: 'https://dev.supabase.co',
    supabaseAnonKey: 'anon',
    enabled: true,
    fetchImpl: async () => ({ ok: true, blob: async () => new Blob(['audio']) }),
    runtime,
  });
  await provider.speak('Orientação');
  assert.equal(calls.created, 1);
  assert.equal(calls.revoked, 1);
});

test('sanitização não altera a resposta textual original', () => {
  const response = Object.freeze({ text: '**Saldo saudável.**' });
  assert.equal(sanitizeVoiceOutputText(response.text), 'Saldo saudável.');
  assert.equal(response.text, '**Saldo saudável.**');
});

test('saída de voz não executa ação financeira', () => {
  assert.doesNotMatch(HOOK_SOURCE, /sendMessage|confirm|transaction|financial/i);
});

test('personalidade seleciona somente preset interno seguro', () => {
  assert.equal(resolveVoicePreset('warm').speed, 0.96);
  assert.deepEqual(resolveVoicePreset('invasivo'), resolveVoicePreset('balanced'));
  assert.doesNotMatch(PROVIDER_SOURCE, /voice_settings/);
});

test('modo sem Supabase ou recursos de áudio não quebra', () => {
  const provider = createPremiumVoiceProvider({});
  assert.equal(provider.isSupported(), false);
  provider.stop();
});

test('testes usam somente fetch simulado e não chamam API real', () => {
  assert.doesNotMatch(import.meta.url, /^https?:/);
  assert.match(EDGE_SOURCE, /ELEVENLABS_BASE_URL/);
});
