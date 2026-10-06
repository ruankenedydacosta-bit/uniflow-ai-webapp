import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import './voiceTtsTelemetry.test.js';
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
  const calls = { audioInstances: 0, created: 0, revoked: 0, paused: 0, played: 0 };
  class Audio {
    constructor() {
      calls.audioInstances += 1;
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

function makeProvider({
  fetchImpl,
  enabled = true,
  token = 'jwt-token',
  timeoutMs = 20000,
  playbackPreparationTimeoutMs,
  runtime,
} = {}) {
  return createElevenLabsTtsProvider({
    supabase: fakeSupabase(token),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled,
    fetchImpl,
    runtime: runtime ?? createFakeRuntime().runtime,
    timeoutMs,
    playbackPreparationTimeoutMs,
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

test('Safari prepara e reutiliza um único elemento de áudio antes da resposta assíncrona', async () => {
  const { runtime, calls } = createFakeRuntime();
  const provider = makeProvider({ runtime, fetchImpl: async () => jsonResponse(200, {}) });

  assert.equal(await provider.preparePlayback(), true);
  assert.equal(calls.played, 1);
  await provider.speak('Resposta depois da rede');
  assert.equal(calls.played, 2);
  assert.equal(calls.audioInstances, 1);
});

test('Safari libera a ativação quando play() da preparação nunca resolve', async () => {
  const { runtime, calls } = createFakeRuntime();
  runtime.Audio = class PendingAudio {
    play() {
      calls.played += 1;
      return new Promise(() => {});
    }
    pause() { calls.paused += 1; }
    load() {}
  };
  const provider = makeProvider({
    runtime,
    fetchImpl: async () => jsonResponse(200, {}),
    playbackPreparationTimeoutMs: 5,
  });

  assert.equal(await provider.preparePlayback(), false);
  assert.equal(calls.played, 1);
  assert.ok(calls.paused >= 1);
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

// HOTFIX (barge-in) — Requisito 5: um callback nativo tardio ('ended'/
// 'error') do <audio> INTERROMPIDO nunca pode chegar depois de stop() e
// mexer no estado de uma captura de voz que já começou no mesmo gesto.
// releaseAudio() desliga onplay/onended/onerror ANTES de pause() -- então
// o evento nativo, mesmo que o navegador o dispare de forma assíncrona,
// encontra handlers já nulos.
test('Requisito 5 — callback tardio do áudio interrompido (onended) nunca dispara depois de stop(): o handler já foi desligado', async () => {
  const { runtime, calls } = createFakeRuntime();
  let liveInstance = null;
  class ControllableAudio {
    constructor() {
      this.src = '';
      liveInstance = this;
    }
    play() { calls.played += 1; this.onplay?.(); return Promise.resolve(); }
    pause() { calls.paused += 1; }
  }
  runtime.Audio = ControllableAudio;
  const provider = makeProvider({ runtime, fetchImpl: async () => jsonResponse(200, {}) });

  let onEndedCalls = 0;
  const playback = provider
    .speak('Frase interrompida pelo barge-in', { onEnded: () => { onEndedCalls += 1; } })
    .catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Barge-in: o usuário pressionou o botão -- interrompe a fala.
  provider.stop();
  assert.equal(liveInstance.onended, null, 'onended precisa estar desligado imediatamente após stop()');

  // Callback tardio simulado: o navegador dispara 'ended' depois do stop()
  // (race real de áudio) -- precisa ser um no-op seguro, nunca lançar nem
  // disparar onEnded de novo.
  assert.doesNotThrow(() => liveInstance.onended?.());
  await playback;
  assert.equal(onEndedCalls, 0, 'onEnded (e portanto qualquer troca de estado dependente dele) nunca deve disparar depois de stop()');
});

// ----------------------------------------------------------------------------
// INCIDENTE IPHONE (VOZ) -- diagnostico sanitizado do pipeline de audio.
// 'tts.playback_lifecycle' precisa estar de fato registrado no contrato de
// telemetry (telemetryContracts.js): o client (telemetryClient.js) descarta
// silenciosamente qualquer nome/campo fora do allowlist, entao sem isto os
// 5 pontos de instrumentacao abaixo nunca produziriam log nenhum -- nem
// erro, nem aviso, so silencio, exatamente o oposto do que o incidente
// pede ("provar, nao inferir").
// ----------------------------------------------------------------------------

test('tts.playback_lifecycle esta registrado como EVENT permitido -- senao o telemetryClient descarta o diagnostico de voz em silencio', async () => {
  const { TELEMETRY_EVENT_NAMES, TELEMETRY_KINDS } = await import('../observability/telemetryContracts.js');
  const { isTelemetryNameAllowed } = await import('../observability/telemetryContracts.js');
  assert.ok(TELEMETRY_EVENT_NAMES.includes('tts.playback_lifecycle'));
  assert.equal(isTelemetryNameAllowed(TELEMETRY_KINDS.EVENT, 'tts.playback_lifecycle'), true);
});

test('os campos enviados por recordPlaybackTelemetry (event/runtimeBuildId/cacheHit/errorCode) sobrevivem a sanitizacao intactos', async () => {
  const { TELEMETRY_KINDS } = await import('../observability/telemetryContracts.js');
  const { sanitizeTelemetryData, isSanitizedTelemetryData } = await import('../observability/telemetryRedaction.js');
  const payload = {
    event: 'audio_play_rejected',
    runtimeBuildId: 'abc1234',
    cacheHit: false,
    errorCode: 'NotAllowedError',
  };
  const sanitized = sanitizeTelemetryData(TELEMETRY_KINDS.EVENT, payload);
  assert.deepEqual(sanitized, payload);
  assert.equal(isSanitizedTelemetryData(TELEMETRY_KINDS.EVENT, sanitized), true);
});

test('REGRESSAO: um runtimeBuildId com SHA completo (40 chars) frequentemente teria o campo descartado -- por isso o provider trunca para 7 chars antes de enviar', async () => {
  const { TELEMETRY_KINDS } = await import('../observability/telemetryContracts.js');
  const { sanitizeTelemetryData } = await import('../observability/telemetryRedaction.js');
  // SHA real com 7+ digitos consecutivos -- caso que a heuristica anti-PII
  // (bloquear sequencias longas de digitos, ex.: telefone/conta) rejeita.
  const fullShaWithDigitRun = 'a1b2c3d4e5f6789012345abcdef67890abcdef1';
  assert.match(fullShaWithDigitRun, /\d{7,}/);
  const sanitizedFull = sanitizeTelemetryData(TELEMETRY_KINDS.EVENT, { runtimeBuildId: fullShaWithDigitRun });
  assert.equal(sanitizedFull.runtimeBuildId, undefined, 'SHA completo com sequencia de digitos some do evento -- prova a necessidade do truncamento');

  const shortSha = fullShaWithDigitRun.slice(0, 7);
  const sanitizedShort = sanitizeTelemetryData(TELEMETRY_KINDS.EVENT, { runtimeBuildId: shortSha });
  assert.equal(sanitizedShort.runtimeBuildId, shortSha, 'a versao truncada de 7 chars sobrevive');
});

test('speak() instrumenta os 5 pontos exigidos pelo incidente: request/blob/play chamado/resolvido/rejeitado', () => {
  assert.match(PROVIDER_SOURCE, /recordPlaybackTelemetry\('tts_request_started'\)/);
  assert.match(PROVIDER_SOURCE, /recordPlaybackTelemetry\('audio_blob_received', \{ cacheHit \}\)/);
  assert.match(PROVIDER_SOURCE, /recordPlaybackTelemetry\('audio_play_called'\)/);
  assert.match(PROVIDER_SOURCE, /recordPlaybackTelemetry\('audio_play_resolved'\)/);
  assert.match(PROVIDER_SOURCE, /recordPlaybackTelemetry\('audio_play_rejected', \{/);
});

test('audio_play_rejected sanitiza o erro via errorCode (nunca errorName -- chave rejeitada pela heuristica anti-PII) e nunca loga error.message', () => {
  assert.match(PROVIDER_SOURCE, /errorCode: normalizeTelemetryErrorCode\(playError\?\.name, 'UNKNOWN_ERROR'\)/);
  assert.doesNotMatch(PROVIDER_SOURCE, /errorName:/);
  const rejectedBlock = PROVIDER_SOURCE.slice(
    PROVIDER_SOURCE.indexOf("recordPlaybackTelemetry('audio_play_rejected'"),
    PROVIDER_SOURCE.indexOf('const err = providerError(code,'),
  );
  assert.doesNotMatch(rejectedBlock, /playError\?\.message/);
});

test('recordPlaybackTelemetry envia o build id JA truncado (SHORT_BUILD_ID), nunca o LOADED_BUILD_ID cru', () => {
  assert.match(PROVIDER_SOURCE, /const SHORT_BUILD_ID = typeof LOADED_BUILD_ID === 'string' \? LOADED_BUILD_ID\.slice\(0, 7\) : null;/);
  assert.match(PROVIDER_SOURCE, /runtimeBuildId: SHORT_BUILD_ID,/);
});

// ----------------------------------------------------------------------------
// Erros HTTP -- lidos do corpo {code,...} da Edge Function quando presente
// ----------------------------------------------------------------------------

test('erros legados continuam mapeados a partir do code retornado pela Edge Function', async () => {
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [429, 'RATE_LIMIT']]) {
    const provider = makeProvider({ fetchImpl: async () => jsonResponse(status, { code, error: 'x' }) });
    await assert.rejects(provider.speak('Olá'), { code });
  }
});

test('503 legado e 500 estruturado são mapeados corretamente', async () => {
  const notConfigured = makeProvider({ fetchImpl: async () => jsonResponse(503, { code: 'NOT_CONFIGURED', error: 'x' }) });
  await assert.rejects(notConfigured.speak('Olá'), { code: 'NOT_CONFIGURED' });

  const providerError = makeProvider({ fetchImpl: async () => jsonResponse(502, {
    error: { code: 'PROVIDER_ERROR', message: 'x', provider_status: 500, retryable: true },
  }) });
  await assert.rejects(providerError.speak('Olá'), {
    code: 'PROVIDER_ERROR', providerStatus: 500, retryable: true,
  });
});

test('corpo de erro sem "code" reconhecido cai no mapeamento por status HTTP', async () => {
  const provider = makeProvider({ fetchImpl: async () => jsonResponse(413, {}) });
  await assert.rejects(provider.speak('Olá'), { code: 'INVALID_REQUEST' });
});

test('erros estruturados distinguem autenticação, quota, voiceId inexistente, rate limit e timeout do provider', async () => {
  for (const [code, status, retryable] of [
    ['PROVIDER_AUTH_ERROR', 401, false],
    ['PROVIDER_QUOTA_ERROR', 402, false],
    ['PROVIDER_VOICE_NOT_FOUND', 404, false],
    ['PROVIDER_RATE_LIMIT', 429, true],
    ['PROVIDER_TIMEOUT', 504, true],
  ]) {
    const provider = makeProvider({ fetchImpl: async () => jsonResponse(502, {
      error: { code, message: 'safe', provider_status: status, retryable },
    }) });
    await assert.rejects(provider.speak('Olá'), {
      code, providerStatus: status, retryable,
    });
  }
});

// ----------------------------------------------------------------------------
// Timeout, rede, retry seletivo, cancelamento
// ----------------------------------------------------------------------------

test('timeout -> PROVIDER_TIMEOUT, nunca re-tentado (uma unica chamada)', async () => {
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
  await assert.rejects(provider.speak('Olá'), { code: 'PROVIDER_TIMEOUT' });
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

test('falha de rede persistente para em 2 tentativas (1 original + 1 retry), erro final NETWORK_ERROR', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('network down'); };
  const provider = makeProvider({ fetchImpl });
  await assert.rejects(provider.speak('Olá'), { code: 'NETWORK_ERROR' });
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

// BUG REAL (BUG 3): 502 da Edge Function não quebra o chat. Mapeia para
// PROVIDER_ERROR, NUNCA re-tenta (erro HTTP não é falha de rede) e o hook
// (useUniVoiceTts.speak) devolve { error } sem lançar -- o botão "Ouvir"
// continua disponível para uma nova tentativa manual.
test('BUG REAL (BUG 3): 502 da Edge Function vira PROVIDER_ERROR sem retry -- UI não quebra', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return jsonResponse(502, {}); };
  const provider = makeProvider({ fetchImpl });
  await assert.rejects(provider.speak('Olá'), { code: 'PROVIDER_ERROR' });
  assert.equal(calls, 1, '502 é erro HTTP: nunca re-tenta');
});

test('play bloqueado pelo navegador vira AUTOPLAY_BLOCKED, distinto de erro do provider', async () => {
  const { runtime } = createFakeRuntime();
  runtime.Audio = class BlockedAudio {
    play() {
      const error = new Error('gesture required');
      error.name = 'NotAllowedError';
      return Promise.reject(error);
    }
    pause() {}
  };
  const provider = makeProvider({ runtime, fetchImpl: async () => jsonResponse(200, {}) });
  await assert.rejects(provider.speak('Olá'), { code: 'AUTOPLAY_BLOCKED' });
});

test('BUG REAL (BUG 3): hook de voz captura erro do provider e devolve { error } sem lançar', async () => {
  assert.match(HOOK_SOURCE, /catch \(providerError\) \{/);
  assert.match(HOOK_SOURCE, /return \{ error: err \};/);
  assert.match(HOOK_SOURCE, /setStatus\(VOICE_TTS_STATUS\.ERROR\);/);
  assert.doesNotMatch(
    HOOK_SOURCE,
    /catch \(providerError\) \{[\s\S]*?throw/,
    'nunca relança o erro do provider para o caller (UI preservada)',
  );
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

test('códigos legados e estruturados exigidos pela fase estão presentes', () => {
  const required = [
    'UNAVAILABLE', 'NOT_CONFIGURED', 'UNAUTHORIZED', 'FORBIDDEN', 'RATE_LIMIT',
    'INVALID_TEXT', 'TIMEOUT', 'NETWORK', 'PROVIDER_ERROR', 'CANCELLED', 'AUDIO_PLAYBACK_ERROR',
    'CONFIGURATION_ERROR', 'INVALID_REQUEST', 'PROVIDER_AUTH_ERROR', 'PROVIDER_QUOTA_ERROR',
    'PROVIDER_VOICE_NOT_FOUND', 'PROVIDER_RATE_LIMIT', 'PROVIDER_TIMEOUT', 'NETWORK_ERROR', 'AUTOPLAY_BLOCKED',
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

// BLOCO A1: texto longo demais para narrar e um caso distinto de texto
// invalido -- o texto em si e valido (nao vazio, sem dado sensivel), so
// excede o limite de narracao. Codigo/mensagem proprios convidam a ler na
// tela em vez de soar como falha tecnica generica.
test('texto valido mas longo demais para TTS usa TEXT_TOO_LONG (nao INVALID_TEXT), com mensagem convidando a ler na tela', () => {
  assert.match(HOOK_SOURCE, /VOICE_TTS_ERROR_CODES\.TEXT_TOO_LONG/);
  assert.equal(VOICE_TTS_ERROR_CODES.TEXT_TOO_LONG, 'TEXT_TOO_LONG');
  const message = getVoiceTtsErrorMessage(VOICE_TTS_ERROR_CODES.TEXT_TOO_LONG);
  assert.match(message, /mostrar na tela/);
});

test('cleanup: hook para o audio no unmount (useEffect com cleanup chamando provider.stop)', () => {
  assert.match(HOOK_SOURCE, /useEffect\(\(\) => \(\) => \{[\s\S]*requestOwnershipRef\.current\.invalidate\(\);[\s\S]*provider\.stop\(\);[\s\S]*\}, \[provider\]\);/);
});

test('callbacks antigos de TTS não alteram o status de uma solicitação mais nova', () => {
  assert.match(HOOK_SOURCE, /createVoiceTtsRequestOwnership/);
  assert.match(HOOK_SOURCE, /const requestId = requestOwnershipRef\.current\.begin\(\)/);
  assert.match(HOOK_SOURCE, /if \(isCurrentRequest\(\)\) setStatus\(VOICE_TTS_STATUS\.PLAYING\)/);
  assert.match(HOOK_SOURCE, /if \(isCurrentRequest\(\)\) setStatus\(VOICE_TTS_STATUS\.STOPPED\)/);
  assert.match(HOOK_SOURCE, /setStatus\(VOICE_TTS_STATUS\.LOADING\);\s*setError\(null\);/);
});

test('hook prepara reprodução manual e interrompe TTS ao ocultar a página no Safari', () => {
  assert.match(HOOK_SOURCE, /requestMetadata\.userInitiated \|\| requestMetadata\.source === 'manual_replay'/);
  assert.match(HOOK_SOURCE, /!requestMetadata\.playbackPreparationAttempted/);
  assert.match(HOOK_SOURCE, /await preparePlayback\(\)/);
  assert.match(HOOK_SOURCE, /window\.addEventListener\('pagehide', stopForPageLifecycle\)/);
  assert.match(HOOK_SOURCE, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.match(HOOK_SOURCE, /window\.removeEventListener\('pagehide', stopForPageLifecycle\)/);
});

// ----------------------------------------------------------------------------
// Edge Function -- autenticacao, configuracao, sanitizacao e CORS por origem
// ----------------------------------------------------------------------------

test('Edge Function exige Authorization Bearer e rejeita usuario nao autenticado (401)', () => {
  assert.match(EDGE_SOURCE, /if \(!authorization\.startsWith\('Bearer '\)\)/);
  assert.match(EDGE_SOURCE, /getAuthenticatedUserId/);
  assert.match(EDGE_SOURCE, /if \(!userId\) return jsonResponse\(401,/);
});

// LATENCIA1: o user_id vem do claim "sub" do JWT (decodificado localmente),
// nunca de um round-trip de rede para /auth/v1/user -- essa chamada extra
// era sequencial e rodava antes até da busca no cache, somando uma latência
// de rede inteira ao início de toda resposta de voz. É seguro porque a
// função roda com verify_jwt = true (padrão do Supabase sem entrada em
// config.toml): o gateway já validou o token antes de invocar o código.
test('user_id vem de um decode local do JWT (claim sub), nunca de fetch a /auth/v1/user', () => {
  assert.doesNotMatch(EDGE_SOURCE, /fetch\(`\$\{supabaseUrl\}\/auth\/v1\/user`/);
  assert.match(EDGE_SOURCE, /function getAuthenticatedUserId\(authorization: string\): string \| null \{/);
  assert.match(EDGE_SOURCE, /payload\?\.sub/);
  assert.match(EDGE_SOURCE, /const userId = getAuthenticatedUserId\(authorization\);/);
});

test('Edge Function retorna CONFIGURATION_ERROR (503) quando faltar chave OU voice ID, sem chamar a ElevenLabs', () => {
  assert.match(
    EDGE_SOURCE,
    /if \(!supabaseUrl \|\| !providerKey \|\| !voiceId\) \{[\s\S]*?return jsonResponse\(503, 'CONFIGURATION_ERROR',/,
  );
  // SUPABASE_ANON_KEY não é mais lida por esta função (LATENCIA1: user_id
  // agora vem do claim "sub" do JWT, decodificado localmente).
  assert.doesNotMatch(EDGE_SOURCE, /SUPABASE_ANON_KEY/);
});

test('Edge Function limita CORS por APP_ALLOWED_ORIGINS sem criar allowlist de usuários', () => {
  assert.match(EDGE_SOURCE, /Deno\.env\.get\('APP_ALLOWED_ORIGINS'\)/);
  assert.match(EDGE_SOURCE, /if \(!isAllowedOrigin\(origin\)\)/);
  assert.match(EDGE_SOURCE, /'Access-Control-Allow-Origin': origin/);
  assert.match(EDGE_SOURCE, /jsonResponse\(403, 'ORIGIN_NOT_ALLOWED'/);
  assert.doesNotMatch(EDGE_SOURCE, /allowlist\.has\(|ALLOWED_USER_IDS|readAllowlist/);
  assert.doesNotMatch(EDGE_SOURCE, /'Access-Control-Allow-Origin': '\*'/);
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

test('Edge Function nunca loga a chave e só a usa nos headers de autenticação do provedor; resposta de audio nunca e cacheada', () => {
  assert.doesNotMatch(EDGE_SOURCE, /console\.(log|info|warn|error)\([^)]*providerKey\b/);
  assert.doesNotMatch(EDGE_SOURCE, /jsonResponse\([^)]*providerKey\b/);
  // TTS-OPENAI: dois provedores, dois usos legitimos -- o Bearer da OpenAI e
  // o xi-api-key da ElevenLabs. Em nenhum outro lugar o valor da chave e
  // interpolado (corpo, mensagem ou URL).
  const interpolations = EDGE_SOURCE.match(/\$\{providerKey\}/g) ?? [];
  assert.equal(interpolations.length, 1, 'a chave só é interpolada no header Authorization da OpenAI');
  assert.match(EDGE_SOURCE, /Authorization: `Bearer \$\{providerKey\}`,/);
  assert.match(EDGE_SOURCE, /'xi-api-key': providerKey,/);
  assert.match(EDGE_SOURCE, /'Cache-Control': 'no-store'/);
});

test('TTS-OPENAI -- provedor padrão é a OpenAI (gpt-4o-mini-tts); ElevenLabs só com UNI_TTS_PROVIDER=elevenlabs explícito', () => {
  assert.match(EDGE_SOURCE, /const ttsProvider = resolveTtsProvider\(Deno\.env\.get\('UNI_TTS_PROVIDER'\)\);/);
  assert.match(EDGE_SOURCE, /=== 'elevenlabs' \? 'elevenlabs' : 'openai'/);
  assert.match(EDGE_SOURCE, /OPENAI_TTS_URL = 'https:\/\/api\.openai\.com\/v1\/audio\/speech'/);
  assert.match(EDGE_SOURCE, /OPENAI_DEFAULT_MODEL = 'gpt-4o-mini-tts'/);
  assert.match(EDGE_SOURCE, /Deno\.env\.get\('OPENAI_TTS_VOICE'\) \|\| OPENAI_DEFAULT_VOICE/);
  assert.match(EDGE_SOURCE, /isOpenAi \? 'OPENAI_API_KEY' : 'ELEVENLABS_API_KEY'/);
});

test('TTS-OPENAI -- a persona de voz da Uni vai em instructions, e voz/modelo nunca vêm do cliente', () => {
  assert.match(EDGE_SOURCE, /instructions: UNI_VOICE_INSTRUCTIONS,/);
  assert.match(EDGE_SOURCE, /português do Brasil/);
  assert.match(EDGE_SOURCE, /input: text,/);
  assert.doesNotMatch(EDGE_SOURCE, /payload\.(?:voice|model|instructions)\b/);
});

test('Edge Function tem modelo/formato/timeout configuraveis com defaults seguros -- so chave e voice ID sao obrigatorios', () => {
  assert.match(EDGE_SOURCE, /DEFAULT_MODEL_ID = 'eleven_multilingual_v2'/);
  assert.match(EDGE_SOURCE, /DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128'/);
  assert.match(EDGE_SOURCE, /Deno\.env\.get\('ELEVENLABS_MODEL_ID'\) \|\| DEFAULT_MODEL_ID/);
});

test('Edge Function envia output_format na query e não no corpo JSON do provider', () => {
  assert.match(EDGE_SOURCE, /\?output_format=\$\{encodeURIComponent\(outputFormat\)\}/);
  const bodyStart = EDGE_SOURCE.indexOf('body: JSON.stringify({');
  const bodyEnd = EDGE_SOURCE.indexOf('}),', bodyStart);
  assert.ok(bodyStart > -1 && bodyEnd > bodyStart);
  assert.doesNotMatch(EDGE_SOURCE.slice(bodyStart, bodyEnd), /output_format/);
});

test('Edge Function devolve erro estruturado e registra somente metadados seguros (code/status/retryable/providerTag)', () => {
  assert.match(EDGE_SOURCE, /error: \{\s*\n\s*code,\s*\n\s*message,\s*\n\s*provider_status: Number\.isInteger\(details\.providerStatus\)[\s\S]*?retryable: Boolean\(details\.retryable\),/);
  assert.match(
    EDGE_SOURCE,
    /console\.warn\('uni_voice_tts_provider_failure', \{\s*\n\s*code, providerStatus, retryable, providerTag: providerTag \|\| null,\s*\n\s*\}\);/,
  );
  assert.doesNotMatch(EDGE_SOURCE, /console\.(?:log|info|warn|error)\([^\n]*(?:text|providerKey|voiceId|userId)/);
});

test('ELEVEN3 -- Edge Function distingue voiceId inexistente (404/voice_not_found) do erro genérico e loga a tag do provedor', () => {
  assert.match(EDGE_SOURCE, /providerTag\.includes\('voice_not_found'\) \|\| providerResponse\.status === 404/);
  assert.match(EDGE_SOURCE, /'PROVIDER_VOICE_NOT_FOUND'/);
  // A tag/status nunca aparecem sozinhos numa mensagem visível ao usuário --
  // só dentro do console.warn (diagnóstico interno).
  assert.doesNotMatch(EDGE_SOURCE, /jsonResponse\([^)]*voice_not_found/);
});

test('ELEVEN3 -- erro de configuração loga quais variáveis de ambiente estão ausentes (nunca o valor)', () => {
  assert.match(EDGE_SOURCE, /console\.warn\('uni_voice_tts_configuration_error', \{ missing \}\);/);
  assert.doesNotMatch(EDGE_SOURCE, /uni_voice_tts_configuration_error'[^)]*providerKey\b/);
});

test('Edge Function usa o mesmo criterio de timeout/AbortController ja validado em generate-uni-premium-voice', () => {
  assert.match(EDGE_SOURCE, /new AbortController\(\)/);
  assert.match(EDGE_SOURCE, /controller\.abort\('timeout'\)/);
  assert.match(EDGE_SOURCE, /signal: controller\.signal/);
});

test('Edge Function usa TTS_FUNCTION_NAME identico ao configurado no frontend', () => {
  assert.equal(TTS_FUNCTION_NAME, 'uni-voice-tts');
});

// ----------------------------------------------------------------------------
// ELEVEN2 -- useVoicePreference: fonte unica lida por SettingsPage e
// UniChatPage, backed por voicePreferenceStorage.js (ja testado a parte).
// ----------------------------------------------------------------------------

test('useVoicePreference le o valor inicial de readVoicePreferenceEnabled e escreve via writeVoicePreferenceEnabled ao mudar', () => {
  const source = readFileSync(new URL('./useVoicePreference.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ readVoicePreferenceEnabled, writeVoicePreferenceEnabled \} from '\.\/voicePreferenceStorage\.js';/);
  assert.match(source, /useState\(\(\) => readVoicePreferenceEnabled\(\)\)/);
  assert.match(source, /writeVoicePreferenceEnabled\(next\);/);
});

test('index.js do modulo exporta useVoicePreference e o storage puro', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(source, /export \{ useVoicePreference \} from '\.\/useVoicePreference\.js';/);
  assert.match(source, /readVoicePreferenceEnabled,\s*\n\s*writeVoicePreferenceEnabled,/);
});
