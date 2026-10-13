// Roda a Edge Function da conversa por voz de verdade, com Deno, Supabase e
// OpenAI simulados: confere o vocabulário no prompt da transcrição (#79) e
// a nova tentativa sem ele quando a OpenAI recusa a sessão.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const WORKSPACE = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const ORIGEM = 'https://app.exemplo';
const PROMPT = 'Nomes que podem aparecer na fala: Nubank, Inter, Dízimo.';

const fetchOriginal = globalThis.fetch;
const denoOriginal = globalThis.Deno;
after(() => {
  globalThis.fetch = fetchOriginal;
  if (denoOriginal === undefined) delete globalThis.Deno;
  else globalThis.Deno = denoOriginal;
});

const env = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  OPENAI_API_KEY: 'sk-teste',
  APP_ALLOWED_ORIGINS: ORIGEM,
};
let handlerCapturado = null;
globalThis.Deno = {
  env: { get: (chave) => env[chave] },
  serve: (handler) => { handlerCapturado = handler; },
};

async function carregarHandler(caminho) {
  handlerCapturado = null;
  await import(caminho);
  return handlerCapturado;
}

const abrirSessao = await carregarHandler('../../../supabase/functions/uni-voice-realtime-session/index.ts');

// cenario.sessao: status de cada pedido de client_secrets, em ordem.
function simularRede(cenario) {
  const chamadas = { rest: [], sessoes: [] };
  globalThis.fetch = async (url, init = {}) => {
    const endereco = String(url);
    if (endereco.endsWith('/auth/v1/user')) return Response.json({ id: 'usuario-1' });
    if (endereco.includes('/rest/v1/accounts') || endereco.includes('/rest/v1/categories')) {
      chamadas.rest.push({ endereco, authorization: init.headers?.Authorization });
      return Response.json(endereco.includes('/accounts')
        ? [{ name: 'Nubank' }, { name: 'Inter' }]
        : [{ name: 'Dízimo' }]);
    }
    if (endereco.includes('/rest/v1/profiles')) return Response.json([{ preferred_name: 'Ana' }]);
    if (endereco.includes('/rpc/voice_reserve_block')) {
      return Response.json({
        session_id: '11111111-1111-4111-8111-111111111111',
        reserved_seconds: 300,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        remaining_seconds: 600,
      });
    }
    if (endereco.includes('/rpc/voice_release_failed')) return Response.json(null);
    if (endereco.endsWith('/v1/realtime/client_secrets')) {
      const corpo = JSON.parse(init.body);
      chamadas.sessoes.push(corpo.session.audio.input.transcription);
      const status = cenario.sessao?.[chamadas.sessoes.length - 1] ?? 200;
      if (status !== 200) return Response.json({ error: { code: 'invalid_value' } }, { status });
      return Response.json({ value: 'chave-efemera', expires_at: 1 });
    }
    throw new Error(`endereço inesperado: ${endereco}`);
  };
  return chamadas;
}

async function pedirSessao(cenario, corpo) {
  const chamadas = simularRede(cenario);
  const resposta = await abrirSessao(new Request('https://edge/uni-voice-realtime-session', {
    method: 'POST',
    headers: { Origin: ORIGEM, Authorization: 'Bearer jwt-do-usuario', 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  }));
  return { status: resposta.status, corpo: await resposta.json(), chamadas };
}

test('sessão em tempo real leva o vocabulário na transcrição, lido com o JWT da pessoa', async () => {
  const { status, chamadas } = await pedirSessao({}, { eagerness: 'low', workspace_id: WORKSPACE });
  assert.equal(status, 200);
  assert.deepEqual(chamadas.sessoes, [{ model: 'gpt-4o-transcribe', language: 'pt', prompt: PROMPT }]);
  assert.ok(chamadas.rest.length > 0);
  assert.ok(chamadas.rest.every(({ authorization }) => authorization === 'Bearer jwt-do-usuario'));
});

test('sessão em tempo real recusada com o vocabulário tenta de novo sem ele', async () => {
  const { status, corpo, chamadas } = await pedirSessao({ sessao: [400, 200] }, { workspace_id: WORKSPACE });
  assert.equal(status, 200);
  assert.equal(corpo.client_secret, 'chave-efemera');
  assert.deepEqual(chamadas.sessoes, [
    { model: 'gpt-4o-transcribe', language: 'pt', prompt: PROMPT },
    { model: 'gpt-4o-transcribe', language: 'pt' },
  ]);
});

test('sessão em tempo real sem workspace_id abre sem vocabulário e sem segunda tentativa', async () => {
  const { status, chamadas } = await pedirSessao({ sessao: [400] }, { eagerness: 'low' });
  assert.equal(status, 502);
  assert.deepEqual(chamadas.sessoes, [{ model: 'gpt-4o-transcribe', language: 'pt' }]);
  assert.equal(chamadas.rest.length, 0);
});
