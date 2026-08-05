// Sprint 1 (IA Conversacional): testes da ponte "fato estruturado -> frase natural".
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhraseStructuredFactService } from './phraseStructuredFact.js';

function createSupabaseStub(accessToken = 'token-123') {
  return {
    auth: {
      getSession: async () => ({ data: { session: accessToken ? { access_token: accessToken } : null } }),
    },
  };
}

function makeService({ enabled = true, fetchImpl, timeoutMs, supabase = createSupabaseStub() } = {}) {
  return createPhraseStructuredFactService({
    supabase,
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled,
    fetchImpl,
    timeoutMs,
  });
}

const FACT = { situation: 'needs_clarification', field: 'account', transactionType: 'expense' };

test('resposta válida retorna a frase e nenhum error', async () => {
  const service = makeService({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ text: 'Em qual conta foi esse gasto?' }) }),
  });
  const { text, error } = await service.phraseFact({ fact: FACT });
  assert.equal(error, null);
  assert.equal(text, 'Em qual conta foi esse gasto?');
});

test('envia mode=phrase_fact e o fato serializado no corpo, nunca system/messages do chat', async () => {
  let capturedBody = null;
  const service = makeService({
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ text: 'ok' }) };
    },
  });
  await service.phraseFact({ fact: FACT });
  assert.equal(capturedBody.mode, 'phrase_fact');
  assert.deepEqual(capturedBody.phraseFact, { fact: FACT });
  assert.equal('system' in capturedBody, false);
  assert.equal('messages' in capturedBody, false);
});

test('enabled=false (flag desligada, combinada pelo chamador) nunca chama fetch -- UNSUPPORTED', async () => {
  let called = false;
  const service = makeService({ enabled: false, fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; } });
  const { text, error } = await service.phraseFact({ fact: FACT });
  assert.equal(text, null);
  assert.equal(error.code, 'UNSUPPORTED');
  assert.equal(called, false);
});

test('sem fato estruturado válido -> INSUFFICIENT_INPUT, nunca chama fetch', async () => {
  let called = false;
  const service = makeService({ fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; } });
  for (const badFact of [null, undefined, 'string', [1, 2], 42]) {
    const { error } = await service.phraseFact({ fact: badFact });
    assert.equal(error.code, 'INSUFFICIENT_INPUT');
  }
  assert.equal(called, false);
});

test('sem sessão autenticada -> UNAUTHORIZED, nunca chama fetch', async () => {
  let called = false;
  const service = makeService({
    supabase: createSupabaseStub(null),
    fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
  });
  const { error } = await service.phraseFact({ fact: FACT });
  assert.equal(error.code, 'UNAUTHORIZED');
  assert.equal(called, false);
});

test('timeout -> TIMEOUT, resposta canônica preservada pelo chamador', async () => {
  const fetchImpl = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
  const service = makeService({ fetchImpl, timeoutMs: 20 });
  const { text, error } = await service.phraseFact({ fact: FACT });
  assert.equal(text, null);
  assert.equal(error.code, 'TIMEOUT');
});

test('falha de rede -> NETWORK', async () => {
  const service = makeService({ fetchImpl: async () => { throw new Error('network down'); } });
  const { error } = await service.phraseFact({ fact: FACT });
  assert.equal(error.code, 'NETWORK');
});

test('erro HTTP (503/429/500) mapeado corretamente', async () => {
  for (const [status, code] of [[503, 'NOT_CONFIGURED'], [429, 'RATE_LIMIT'], [500, 'PROVIDER_ERROR']]) {
    const service = makeService({ fetchImpl: async () => ({ ok: false, status, json: async () => ({}) }) });
    const { error } = await service.phraseFact({ fact: FACT });
    assert.equal(error.code, code);
  }
});

test('JSON de resposta inválido -> PARSE_ERROR', async () => {
  const service = makeService({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }) });
  const { error } = await service.phraseFact({ fact: FACT });
  assert.equal(error.code, 'PARSE_ERROR');
});

test('texto vazio -> EMPTY', async () => {
  const service = makeService({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ text: '   ' }) }) });
  const { text, error } = await service.phraseFact({ fact: FACT });
  assert.equal(text, null);
  assert.equal(error.code, 'EMPTY');
});

test('texto que parece ação financeira estruturada é rejeitado (mesma defesa do resto do chat)', async () => {
  const service = makeService({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ text: '{"action":"create","transaction":{"amount":50}}' }) }),
  });
  const { text, error } = await service.phraseFact({ fact: FACT });
  assert.equal(text, null);
  assert.equal(error.code, 'INVALID_RESPONSE');
});

test('isSupported reflete enabled + presença de supabase/url/anonKey/fetch', () => {
  assert.equal(makeService({ enabled: true, fetchImpl: async () => {} }).isSupported(), true);
  assert.equal(makeService({ enabled: false, fetchImpl: async () => {} }).isSupported(), false);
  const noSupabase = createPhraseStructuredFactService({ enabled: true, supabaseUrl: 'x', supabaseAnonKey: 'y', fetchImpl: async () => {} });
  assert.equal(noSupabase.isSupported(), false);
});
