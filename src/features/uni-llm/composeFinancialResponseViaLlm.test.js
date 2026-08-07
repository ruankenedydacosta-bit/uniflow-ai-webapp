// Sprint 4 Ciclo 3 (Bloco 4.4): testes do serviço "fatos estruturados ->
// texto natural via LLM". Mesmo padrão de interpretFinancialIntent.test.js.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createFinancialResponseComposer } from './composeFinancialResponseViaLlm.js';

function createSupabaseStub(accessToken = 'token-123') {
  return {
    auth: {
      getSession: async () => ({ data: { session: accessToken ? { access_token: accessToken } : null } }),
    },
  };
}

function makeComposer({ enabled = true, fetchImpl, timeoutMs, supabase = createSupabaseStub() } = {}) {
  return createFinancialResponseComposer({
    supabase,
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled,
    fetchImpl,
    timeoutMs,
  });
}

const FACTS = { balance: 1500.5, account: 'Nubank' };

test('flag desligada -- isSupported() é false e composeFinancialResponseViaLlm nunca chama fetch', async () => {
  let called = false;
  const composer = makeComposer({ enabled: false, fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
  assert.equal(composer.isSupported(), false);
  const { text, error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(called, false);
  assert.equal(text, null);
  assert.equal(error.code, 'UNSUPPORTED');
});

test('sem fatos estruturados -- nunca chama fetch, devolve INSUFFICIENT_INPUT', async () => {
  let called = false;
  const composer = makeComposer({ fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
  const { text, error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: null });
  assert.equal(called, false);
  assert.equal(text, null);
  assert.equal(error.code, 'INSUFFICIENT_INPUT');
});

test('resposta válida (200, texto não vazio) retorna o texto e nenhum error', async () => {
  const composer = makeComposer({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ text: 'Você tem R$ 1.500,50 na Nubank.' }) }),
  });
  const { text, error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(error, null);
  assert.equal(text, 'Você tem R$ 1.500,50 na Nubank.');
});

test('envia mode=financial_response_compose e os fatos no corpo, nunca system/messages do chat', async () => {
  let capturedBody = null;
  const composer = makeComposer({
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ text: 'ok.' }) };
    },
  });
  await composer.composeFinancialResponseViaLlm({
    userIntent: 'consultar saldo',
    operation: 'total_balance',
    structuredFacts: FACTS,
    conversationStyle: 'detailed',
    emotionalContext: true,
    explanationRequest: null,
  });
  assert.equal(capturedBody.mode, 'financial_response_compose');
  assert.equal(capturedBody.system, undefined);
  assert.equal(capturedBody.messages, undefined);
  assert.equal(capturedBody.financialResponseCompose.operation, 'total_balance');
  assert.deepEqual(capturedBody.financialResponseCompose.structuredFacts, FACTS);
  assert.equal(capturedBody.financialResponseCompose.emotionalContext, true);
  assert.equal(capturedBody.financialResponseCompose.explanationRequest, null);
});

test('sem sessão autenticada -- nunca chama fetch, devolve UNAUTHORIZED', async () => {
  let called = false;
  const composer = makeComposer({
    supabase: createSupabaseStub(null),
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  const { text, error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(called, false);
  assert.equal(text, null);
  assert.equal(error.code, 'UNAUTHORIZED');
});

test('HTTP 422 (resposta inválida do lado do servidor) mapeia para INVALID_RESPONSE', async () => {
  const composer = makeComposer({ fetchImpl: async () => ({ ok: false, status: 422, json: async () => ({}) }) });
  const { text, error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(text, null);
  assert.equal(error.code, 'INVALID_RESPONSE');
});

test('HTTP 503 (provedor não configurado) mapeia para NOT_CONFIGURED', async () => {
  const composer = makeComposer({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  const { error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(error.code, 'NOT_CONFIGURED');
});

test('texto vazio na resposta -- tratado como INVALID_RESPONSE, nunca publica string vazia', async () => {
  const composer = makeComposer({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ text: '   ' }) }) });
  const { text, error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(text, null);
  assert.equal(error.code, 'INVALID_RESPONSE');
});

test('erro de rede (fetch rejeita) nunca lança -- devolve NETWORK', async () => {
  const composer = makeComposer({ fetchImpl: async () => { throw new Error('network down'); } });
  const { text, error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(text, null);
  assert.equal(error.code, 'NETWORK');
});

test('timeout aborta a requisição e devolve TIMEOUT, nunca lança', async () => {
  const composer = makeComposer({
    timeoutMs: 5,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });
  const { text, error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(text, null);
  assert.equal(error.code, 'TIMEOUT');
});

test('resposta JSON malformada nunca lança -- devolve PARSE_ERROR', async () => {
  const composer = makeComposer({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
  });
  const { text, error } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(text, null);
  assert.equal(error.code, 'PARSE_ERROR');
});

test('Sprint 4 Ciclo 4 (Bloco 4.9): repassa usage (promptTokens/completionTokens) real da Edge Function', async () => {
  const composer = makeComposer({
    fetchImpl: async () => ({
      ok: true, status: 200,
      json: async () => ({ text: 'ok.', usage: { promptTokens: 88, completionTokens: 12 } }),
    }),
  });
  const { usage } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.deepEqual(usage, { promptTokens: 88, completionTokens: 12 });
});

test('sem usage na resposta (campo ausente), devolve usage null -- nunca inventa tokens', async () => {
  const composer = makeComposer({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ text: 'ok.' }) }),
  });
  const { usage } = await composer.composeFinancialResponseViaLlm({ structuredFacts: FACTS });
  assert.equal(usage, null);
});

// ── Fase 1 (correção do kill switch, Bloco 4.10) ────────────────────────

test('enabled como função é chamada a cada isSupported() -- nunca memoizada (kill switch instantâneo)', () => {
  let flag = true;
  let calls = 0;
  const composer = makeComposer({ enabled: () => { calls += 1; return flag; } });
  assert.equal(composer.isSupported(), true);
  flag = false;
  assert.equal(composer.isSupported(), false);
  assert.ok(calls >= 2, 'o thunk precisa ser chamado em toda verificação, não só na criação');
});

test('enabled como booleano estático continua funcionando exatamente como antes (retrocompatibilidade)', () => {
  const enabledTrue = makeComposer({ enabled: true });
  const enabledFalse = makeComposer({ enabled: false });
  assert.equal(enabledTrue.isSupported(), true);
  assert.equal(enabledFalse.isSupported(), false);
});

test('enabled função que lança nunca propaga -- isSupported() falha seguro para false', () => {
  const composer = makeComposer({ enabled: () => { throw new Error('boom'); } });
  assert.doesNotThrow(() => composer.isSupported());
});
