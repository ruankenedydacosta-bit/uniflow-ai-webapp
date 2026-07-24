import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElevenLabsTtsProvider } from './elevenLabsTtsProvider.js';
import { VOICE_TTS_ERROR_CODES, getVoiceTtsErrorMessage } from './voiceTtsStatus.js';
import { MAX_TTS_TEXT_LENGTH, TTS_FUNCTION_NAME } from './voiceTtsConfig.js';

const EDGE_SOURCE = readFileSync(
  new URL('../../../supabase/functions/uni-voice-tts/index.ts', import.meta.url),
  'utf8',
);
const HOOK_SOURCE = readFileSync(new URL('./useUniVoiceTts.js', import.meta.url), 'utf8');
const PROVIDER_SOURCE = readFileSync(new URL('./elevenLabsTtsProvider.js', import.meta.url), 'utf8');

// ============================================================================
// ELEVEN1 -- fundacao de Text-to-Speech via ElevenLabs. Mesmo padrao de
// cobertura ja usado por uniVoiceOutput.test.js: comportamental (fetch/Audio
// simulados) para o provider, estrutural (source-regex) para hook e Edge
// Function.
// ============================================================================

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: async () => new Blob(['audio']),
    json: async () => body,
  };
}

function fakeSupabase(token = 'jwt-token') {
  return { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } };
}

function createFakeRuntime() {
  const calls = { created: 0, revoked: 0, paused: 0, played: 0 };
  class Audio {
    constructor() {
      this.src = '';
    }
    play() {
      calls.played += 1;
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

function makeProvider({ fetchImpl, enabled = true, token = 'jwt-token', timeoutMs = 20000, runtime } = {}) {
  return createElevenLabsTtsProvider({
    supabase: fakeSupabase(token),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled,
    fetchImpl,
    runtime: runtime ?? createFakeRuntime().runtime,
    timeoutMs,
  });
}

// ----------------------------------------------------------------------------
// Provider: ausencia de chave/config, autenticacao, sucesso, Blob URL
// ----------------------------------------------------------------------------

test('provider desabilitado nunca chama fetch -- UNAVAILABLE', async () => {
  let called = 0;
  const provider = makeProvider({ enabled: false, fetchImpl: () => { called += 1; return jsonResponse(200, {}); } });
  await assert.rejects(provider.speak('Olá'), { code: 'UNAVAILABLE' });
  assert.equal(called, 0);
});

test('healthCheck reflete disabled/backend ausente/disponivel, sem chamar fetch', async () => {
  let called = 0;
  const fetchImpl = () => { called += 1; return jsonResponse(200, {}); };
  const disabled = makeProvider({ enabled: false, fetchImpl });
  assert.deepEqual(await disabled.healthCheck(), { available: false, reason: 'DISABLED' });

  const noBackend = createElevenLabsTtsProvider({ supabase: null, supabaseUrl: '', supabaseAnonKey: '', enabled: true, fetchImpl });
  assert.deepEqual(await noBackend.healthCheck(), { available: false, reason: 'BACKEND_NOT_CONFIGURED' });

  const ok = makeProvider({ fetchImpl });
  assert.deepEqual(await ok.healthCheck(), { available: true, reason: null });
  assert.equal(called, 0);
});

test('sem sessão autenticada -> UNAUTHORIZED antes de qualquer fetch', async () => {
  const provider = makeProvider({ token: null, fetchImpl: async () => jsonResponse(200, {}) });
  await assert.rejects(provider.speak('Olá'), { code: 'UNAUTHORIZED' });
});

test('sucesso: gera Blob URL, toca e revoga ao terminar (onended)', async () => {
  const { runtime, calls } = createFakeRuntime();
  const provider = makeProvider({ runtime, fetchImpl: async () => jsonResponse(200, {}) });
  const result = await provider.speak('Olá, tudo bem?');
  assert.equal(result.providerName, 'elevenlabs_tts');
  assert.equal(calls.created, 1);
  assert.equal(calls.revoked, 1);
  assert.equal(calls.played, 1);
});

test('novo speak() sempre encerra o audio anterior primeiro -- apenas um ativo', async () => {
  const { runtime, calls } = createFakeRuntime();
  const provider = makeProvider({ runtime, fetchImpl: async () => jsonResponse(200, {}) });
  await provider.speak('Primeira frase');
  await provider.speak('Segunda frase');
  // Cada speak() cria e revoga sua propria URL; nenhuma URL fica orfa.
  assert.equal(calls.created, 2);
  assert.equal(calls.revoked, 2);
});

test('stop() revoga a Blob URL e libera o audio mesmo sem terminar sozinho', async () => {
  const { runtime, calls } = createFakeRuntime();
  class NeverEndsAudio {
    play() { this.onplay?.(); return Promise.resolve(); }
    pause() {}
  }
  runtime.Audio = NeverEndsAudio;
  const provider = makeProvider({ runtime, fetchImpl: async () => jsonResponse(200, {}) });
  const playback = provider.speak('Frase longa').catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  provider.stop();
  await playback;
  assert.equal(calls.revoked, 1);
});

// ----------------------------------------------------------------------------
// Erros HTTP -- lidos do corpo {code,...} da Edge Function quando presente
// ----------------------------------------------------------------------------

test('401/403/429 mapeados a partir do code retornado pela Edge Function', async () => {
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [429, 'RATE_LIMIT']]) {
    const provider = makeProvider({ fetchImpl: async () => jsonResponse(status, { code, error: 'x' }) });
    await assert.rejects(provider.speak('Olá'), { code });
  }
});

test('503 (NOT_CONFIGURED) e 500 (PROVIDER_ERROR) são mapeados corretamente', async () => {
  const notConfigured = makeProvider({ fetchImpl: async () => jsonResponse(503, { code: 'NOT_CONFIGURED', error: 'x' }) });
  await assert.rejects(notConfigured.speak('Olá'), { code: 'NOT_CONFIGURED' });

  const providerError = makeProvider({ fetchImpl: async () => jsonResponse(500, { code: 'PROVIDER_ERROR', error: 'x' }) });
  await assert.rejects(providerError.speak('Olá'), { code: 'PROVIDER_ERROR' });
});

test('corpo de erro sem "code" reconhecido cai no mapeamento por status HTTP', async () => {
  const provider = makeProvider({ fetchImpl: async () => jsonResponse(413, {}) });
  await assert.rejects(provider.speak('Olá'), { code: 'INVALID_TEXT' });
});

// ----------------------------------------------------------------------------
// Timeout, rede, retry seletivo, cancelamento
// ----------------------------------------------------------------------------

test('timeout -> TIMEOUT, nunca re-tentado (uma unica chamada)', async () => {
  let calls = 0;
  const fetchImpl = (url, opts) => {
    calls += 1;
    return new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  };
  const provider = makeProvider({ fetchImpl, timeoutMs: 20 });
  await assert.rejects(provider.speak('Olá'), { code: 'TIMEOUT' });
  assert.equal(calls, 1);
});

test('falha de rede tenta novamente exatamente 1 vez; sucesso na 2a tentativa funciona', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new Error('network down');
    return jsonResponse(200, {});
  };
  const provider = makeProvider({ fetchImpl });
  const result = await provider.speak('Olá');
  assert.equal(calls, 2);
  assert.equal(result.providerName, 'elevenlabs_tts');
});

test('falha de rede persistente para em 2 tentativas (1 original + 1 retry), erro final NETWORK', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('network down'); };
  const provider = makeProvider({ fetchImpl });
  await assert.rejects(provider.speak('Olá'), { code: 'NETWORK' });
  assert.equal(calls, 2);
});

test('retry NUNCA se aplica a erros HTTP (401/429/500) -- uma unica chamada cada', async () => {
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return jsonResponse(status, {}); };
    const provider = makeProvider({ fetchImpl });
    await assert.rejects(provider.speak('Olá'));
    assert.equal(calls, 1, `status ${status} nao deveria re-tentar`);
  }
});

test('cancel() durante a geracao aborta a requisicao -- CANCELLED, distinto de erro', async () => {
  const fetchImpl = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
  const provider = makeProvider({ fetchImpl, timeoutMs: 20000 });
  const playback = provider.speak('Olá');
  await new Promise((resolve) => setTimeout(resolve, 0));
  provider.cancel();
  await assert.rejects(playback, { code: 'CANCELLED' });
});

// ----------------------------------------------------------------------------
// Pause/resume/play (transporte de audio)
// ----------------------------------------------------------------------------

test('pause/resume/play delegam ao HTMLAudioElement atual, sem lancar quando nao ha audio', () => {
  const provider = makeProvider({ fetchImpl: async () => jsonResponse(200, {}) });
  assert.doesNotThrow(() => provider.pause());
  assert.doesNotThrow(() => provider.resume());
  assert.equal(provider.play(), false);
});

// ----------------------------------------------------------------------------
// Estrutura/fundacao: erros amigaveis, sem chave no frontend
// ----------------------------------------------------------------------------

test('getVoiceTtsErrorMessage cobre todos os codigos exigidos pela ELEVEN1, nunca expõe detalhe tecnico', () => {
  for (const code of Object.values(VOICE_TTS_ERROR_CODES)) {
    const message = getVoiceTtsErrorMessage(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /elevenlabs|api[_-]?key|stack|undefined/i);
  }
});

test('todos os 11 codigos de erro exigidos pela fase estao presentes', () => {
  const required = [
    'UNAVAILABLE', 'NOT_CONFIGURED', 'UNAUTHORIZED', 'FORBIDDEN', 'RATE_LIMIT',
    'INVALID_TEXT', 'TIMEOUT', 'NETWORK', 'PROVIDER_ERROR', 'CANCELLED', 'AUDIO_PLAYBACK_ERROR',
  ];
  for (const code of required) {
    assert.equal(VOICE_TTS_ERROR_CODES[code], code, `codigo ${code} ausente`);
  }
});

test('nenhuma chave/segredo da ElevenLabs aparece no frontend (provider/hook)', () => {
  const combined = `${HOOK_SOURCE}\n${PROVIDER_SOURCE}`;
  assert.doesNotMatch(combined, /ELEVENLABS_(?:API_KEY|VOICE_ID|MODEL_ID)/);
  assert.doesNotMatch(combined, /VITE_ELEVENLABS/);
  assert.doesNotMatch(combined, /xi-api-key/);
});

test('provider nunca chama a API da ElevenLabs diretamente -- so a Edge Function', () => {
  assert.doesNotMatch(PROVIDER_SOURCE, /api\.elevenlabs\.io/);
  assert.match(PROVIDER_SOURCE, /TTS_FUNCTION_NAME/);
});

test('hook usa apenas o provider -- nenhum fetch/Audio direto no hook', () => {
  assert.doesNotMatch(HOOK_SOURCE, /\bfetch\(|new Audio\(/);
});

test('hook reaproveita a sanitizacao ja existente (uni-voice-output), sem duplicar regex', () => {
  assert.match(HOOK_SOURCE, /import \{ sanitizeVoiceOutputText, containsSensitiveVoiceData \} from '\.\.\/uni-voice-output\/voiceOutputPolicy\.js';/);
});

test('hook limita o texto pelo mesmo MAX_TTS_TEXT_LENGTH usado na config', () => {
  assert.match(HOOK_SOURCE, /sanitized\.length > MAX_TTS_TEXT_LENGTH/);
  assert.equal(MAX_TTS_TEXT_LENGTH, 600);
});

test('cleanup: hook para o audio no unmount (useEffect com cleanup chamando provider.stop)', () => {
  assert.match(HOOK_SOURCE, /useEffect\(\(\) => \(\) => provider\.stop\(\), \[provider\]\);/);
});

// ----------------------------------------------------------------------------
// Edge Function -- autenticacao, NOT_CONFIGURED, sanitizacao, sem allowlist
// ----------------------------------------------------------------------------

test('Edge Function exige Authorization Bearer e rejeita usuario nao autenticado (401)', () => {
  assert.match(EDGE_SOURCE, /if \(!authorization\.startsWith\('Bearer '\)\)/);
  assert.match(EDGE_SOURCE, /getAuthenticatedUserId/);
  assert.match(EDGE_SOURCE, /if \(!userId\) return jsonResponse\(401,/);
});

test('Edge Function retorna NOT_CONFIGURED (503) quando faltar chave OU voice ID, sem chamar a ElevenLabs', () => {
  assert.match(
    EDGE_SOURCE,
    /if \(!supabaseUrl \|\| !anonKey \|\| !providerKey \|\| !voiceId\) \{\s*\n\s*return jsonResponse\(503, 'NOT_CONFIGURED',/,
  );
});

test('Edge Function NUNCA aplica allowlist/403 -- diferente de generate-uni-premium-voice, disponivel para qualquer usuario autenticado', () => {
  // O comentario de cabecalho pode CITAR a outra funcao (contexto
  // arquitetural); o que nao pode existir aqui e a logica de enforcement.
  assert.doesNotMatch(EDGE_SOURCE, /allowlist\.has\(|ALLOWED_USER_IDS|readAllowlist/);
  assert.doesNotMatch(EDGE_SOURCE, /jsonResponse\(403/);
});

test('Edge Function sanitiza o texto e rejeita vazio/muito longo/dados sensiveis', () => {
  assert.match(EDGE_SOURCE, /function sanitizeText/);
  assert.match(EDGE_SOURCE, /if \(!text\) return jsonResponse\(400,/);
  assert.match(EDGE_SOURCE, /if \(text\.length > MAX_TEXT_LENGTH\)/);
  assert.match(EDGE_SOURCE, /containsSensitiveData\(text\)/);
});

test('Edge Function rejeita campos nao permitidos no payload (user_id/voice_id/model_id/api_key do caller)', () => {
  assert.match(EDGE_SOURCE, /'user_id' in payload \|\| 'voice_id' in payload \|\| 'model_id' in payload \|\| 'api_key' in payload/);
});

test('Edge Function nunca loga a chave, e a usa apenas no header xi-api-key da ElevenLabs; resposta de audio nunca e cacheada', () => {
  assert.doesNotMatch(EDGE_SOURCE, /console\.(log|info|warn|error)\([^)]*providerKey/);
  // Unica atribuicao (leitura do secret) + unico uso legitimo (header da
  // ElevenLabs) -- em nenhum lugar o valor de providerKey e interpolado
  // dentro do corpo/mensagem de uma resposta ao cliente.
  const providerKeyUsages = EDGE_SOURCE.match(/providerKey/g) ?? [];
  assert.equal(providerKeyUsages.length, 3, 'providerKey deve aparecer só na leitura do secret, no check de config e no header xi-api-key');
  assert.match(EDGE_SOURCE, /'xi-api-key': providerKey,/);
  assert.match(EDGE_SOURCE, /'Cache-Control': 'no-store'/);
});

test('Edge Function tem modelo/formato/timeout configuraveis com defaults seguros -- so chave e voice ID sao obrigatorios', () => {
  assert.match(EDGE_SOURCE, /DEFAULT_MODEL_ID = 'eleven_multilingual_v2'/);
  assert.match(EDGE_SOURCE, /DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128'/);
  assert.match(EDGE_SOURCE, /Deno\.env\.get\('ELEVENLABS_MODEL_ID'\) \|\| DEFAULT_MODEL_ID/);
});

test('Edge Function usa o mesmo criterio de timeout/AbortController ja validado em generate-uni-premium-voice', () => {
  assert.match(EDGE_SOURCE, /new AbortController\(\)/);
  assert.match(EDGE_SOURCE, /controller\.abort\('timeout'\)/);
  assert.match(EDGE_SOURCE, /signal: controller\.signal/);
});

test('Edge Function usa TTS_FUNCTION_NAME identico ao configurado no frontend', () => {
  assert.equal(TTS_FUNCTION_NAME, 'uni-voice-tts');
});
