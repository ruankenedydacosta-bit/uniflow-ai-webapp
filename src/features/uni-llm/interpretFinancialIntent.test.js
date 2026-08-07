// Sprint 3 (Interpretação Semântica): testes do serviço "frase livre ->
// interpretação estruturada". Mesmo padrão de phraseStructuredFact.test.js.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createFinancialIntentInterpreter } from './interpretFinancialIntent.js';

function createSupabaseStub(accessToken = 'token-123') {
  return {
    auth: {
      getSession: async () => ({ data: { session: accessToken ? { access_token: accessToken } : null } }),
    },
  };
}

function makeInterpreter({ enabled = true, fetchImpl, timeoutMs, supabase = createSupabaseStub() } = {}) {
  return createFinancialIntentInterpreter({
    supabase,
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled,
    fetchImpl,
    timeoutMs,
  });
}

const VALID_INTERPRETATION = {
  status: 'resolved',
  intent: 'total_expenses',
  confidence: 0.85,
  entities: {
    transactionType: null, amount: null, account: null, category: null,
    description: null, period: 'este mês', comparisonPeriod: null,
  },
  suggestedTool: null,
  clarificationQuestion: null,
  reasoningTags: ['expense_query'],
};

test('resposta válida retorna a interpretação e nenhum error', async () => {
  const interpreter = makeInterpreter({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ interpretation: VALID_INTERPRETATION }) }),
  });
  const { interpretation, error } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei este mês?' });
  assert.equal(error, null);
  assert.equal(interpretation.intent, 'total_expenses');
});

test('envia mode=financial_intent e os dados sanitizados no corpo, nunca system/messages do chat', async () => {
  let capturedBody = null;
  const interpreter = makeInterpreter({
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ interpretation: VALID_INTERPRETATION }) };
    },
  });
  await interpreter.interpretFinancialIntent({
    text: 'Quanto gastei no Nubank?',
    accounts: ['Nubank', 'Itaú'],
    categories: ['Alimentação'],
    availableTools: ['get_financial_summary'],
    referenceDate: '2026-08-05',
  });
  assert.equal(capturedBody.mode, 'financial_intent');
  assert.equal(capturedBody.financialIntent.text, 'Quanto gastei no Nubank?');
  assert.deepEqual(capturedBody.financialIntent.accounts, ['Nubank', 'Itaú']);
  assert.equal(capturedBody.financialIntent.referenceDate, '2026-08-05');
  assert.equal('system' in capturedBody, false);
  assert.equal('messages' in capturedBody, false);
});

test('enabled=false (flag desligada) nunca chama fetch -- UNSUPPORTED', async () => {
  let called = false;
  const interpreter = makeInterpreter({ enabled: false, fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; } });
  const { interpretation, error } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei?' });
  assert.equal(interpretation, null);
  assert.equal(error.code, 'UNSUPPORTED');
  assert.equal(called, false);
});

test('texto vazio -> INSUFFICIENT_INPUT, nunca chama fetch', async () => {
  let called = false;
  const interpreter = makeInterpreter({ fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; } });
  for (const badText of [null, undefined, '', '   ']) {
    const { error } = await interpreter.interpretFinancialIntent({ text: badText });
    assert.equal(error.code, 'INSUFFICIENT_INPUT');
  }
  assert.equal(called, false);
});

test('sem sessão autenticada -> UNAUTHORIZED, nunca chama fetch', async () => {
  let called = false;
  const interpreter = makeInterpreter({
    supabase: createSupabaseStub(null),
    fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
  });
  const { error } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei?' });
  assert.equal(error.code, 'UNAUTHORIZED');
  assert.equal(called, false);
});

test('timeout -> TIMEOUT', async () => {
  const fetchImpl = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
  const interpreter = makeInterpreter({ fetchImpl, timeoutMs: 20 });
  const { interpretation, error } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei?' });
  assert.equal(interpretation, null);
  assert.equal(error.code, 'TIMEOUT');
});

test('falha de rede -> NETWORK', async () => {
  const interpreter = makeInterpreter({ fetchImpl: async () => { throw new Error('network down'); } });
  const { error } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei?' });
  assert.equal(error.code, 'NETWORK');
});

test('erro HTTP (422/503/429) mapeado corretamente', async () => {
  for (const [status, code] of [[422, 'INVALID_RESPONSE'], [503, 'NOT_CONFIGURED'], [429, 'RATE_LIMIT']]) {
    const interpreter = makeInterpreter({ fetchImpl: async () => ({ ok: false, status, json: async () => ({}) }) });
    const { error } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei?' });
    assert.equal(error.code, code);
  }
});

test('JSON de resposta inválido -> PARSE_ERROR', async () => {
  const interpreter = makeInterpreter({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }) });
  const { error } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei?' });
  assert.equal(error.code, 'PARSE_ERROR');
});

test('JSON fora do contrato (falta campo obrigatório) -> INVALID_RESPONSE, nunca usado parcialmente', async () => {
  const interpreter = makeInterpreter({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ interpretation: { status: 'resolved' } }) }),
  });
  const { interpretation, error } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei?' });
  assert.equal(interpretation, null);
  assert.equal(error.code, 'INVALID_RESPONSE');
});

test('resposta vazia/ausente (interpretation undefined) -> INVALID_RESPONSE, cai no fallback seguro', async () => {
  const interpreter = makeInterpreter({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  const { interpretation, error } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei?' });
  assert.equal(interpretation, null);
  assert.equal(error.code, 'INVALID_RESPONSE');
});

test('isSupported reflete enabled + presença de supabase/url/anonKey/fetch', () => {
  assert.equal(makeInterpreter({ enabled: true, fetchImpl: async () => {} }).isSupported(), true);
  assert.equal(makeInterpreter({ enabled: false, fetchImpl: async () => {} }).isSupported(), false);
  const noSupabase = createFinancialIntentInterpreter({ enabled: true, supabaseUrl: 'x', supabaseAnonKey: 'y', fetchImpl: async () => {} });
  assert.equal(noSupabase.isSupported(), false);
});

test('Sprint 4 Ciclo 4 (Bloco 4.9): repassa usage (promptTokens/completionTokens) real da Edge Function', async () => {
  const interpreter = makeInterpreter({
    fetchImpl: async () => ({
      ok: true, status: 200,
      json: async () => ({ interpretation: VALID_INTERPRETATION, usage: { promptTokens: 240, completionTokens: 40 } }),
    }),
  });
  const { usage } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei este mês?' });
  assert.deepEqual(usage, { promptTokens: 240, completionTokens: 40 });
});

test('sem usage na resposta (campo ausente), devolve usage null -- nunca inventa tokens', async () => {
  const interpreter = makeInterpreter({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ interpretation: VALID_INTERPRETATION }) }),
  });
  const { usage } = await interpreter.interpretFinancialIntent({ text: 'Quanto eu gastei este mês?' });
  assert.equal(usage, null);
});
