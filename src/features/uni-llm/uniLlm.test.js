import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { resolveLlmConfig, isLlmFlagEnabled } from './llmConfig.js';
import { createUniLlmProvider } from './uniLlmProvider.js';
import { createUniLlmOrchestrator } from './uniLlmOrchestrator.js';
import {
  buildLlmPayload,
  buildSanitizedHistory,
  buildSanitizedFinancialSummary,
  buildSystemPrompt,
  sanitizeText,
} from './llmContext.js';
import { validateLlmResponse, looksLikeStructuredFinancialAction, MAX_RESPONSE_CHARS } from './llmResponseGuard.js';

const silentLogger = { info() {}, warn() {}, error() {} };

function fakeSupabase(token = 'jwt-token') {
  return { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function makeProvider({ fetchImpl, enabled = true, token = 'jwt-token', timeoutMs = 20000 } = {}) {
  return createUniLlmProvider({
    supabase: fakeSupabase(token),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled,
    fetchImpl,
    timeoutMs,
  });
}

test('feature flag desativada: config nao habilita e provider nao chama o backend', () => {
  assert.equal(isLlmFlagEnabled({ VITE_UNI_LLM_ENABLED: 'false' }), false);
  assert.equal(isLlmFlagEnabled({}), false);
  const config = resolveLlmConfig({
    supabaseUrl: 'https://x.supabase.co',
    supabaseAnonKey: 'k',
    env: { VITE_UNI_LLM_ENABLED: 'false' },
  });
  assert.equal(config.enabled, false);
});

test('feature flag ativa mas backend Supabase ausente: nao habilita', () => {
  const config = resolveLlmConfig({
    supabaseUrl: '',
    supabaseAnonKey: '',
    env: { VITE_UNI_LLM_ENABLED: 'true' },
  });
  assert.equal(config.backendConfigured, false);
  assert.equal(config.enabled, false);
});

test('provider desabilitado nunca chama fetch (LLM nunca acionado)', async () => {
  let called = 0;
  const provider = makeProvider({ enabled: false, fetchImpl: () => { called += 1; return jsonResponse(200, {}); } });
  const res = await provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(called, 0);
  assert.equal(res.text, null);
  assert.equal(res.error.code, 'UNSUPPORTED');
});

test('ausencia de credencial no backend (503) -> fallback automatico', async () => {
  const provider = makeProvider({ fetchImpl: async () => jsonResponse(503, { error: 'nao configurada' }) });
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateContextualResponse({ text: 'como vou de gastos?', messages: [] });
  assert.equal(res, null);
});

test('resposta valida do provider (mock) retorna texto', async () => {
  const provider = makeProvider({ fetchImpl: async () => jsonResponse(200, { text: 'Seu saldo esta positivo este mes.', usage: { promptTokens: 10 } }) });
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateContextualResponse({ text: 'como estou?', messages: [] });
  assert.ok(res);
  assert.match(res.text, /saldo/);
});

test('timeout -> provider retorna TIMEOUT e orquestrador cai no fallback', async () => {
  const fetchImpl = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
  const provider = makeProvider({ fetchImpl, timeoutMs: 20 });
  const direct = await provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(direct.error.code, 'TIMEOUT');
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateContextualResponse({ text: 'oi', messages: [] });
  assert.equal(res, null);
});

test('erro do provider (500) -> fallback', async () => {
  const provider = makeProvider({ fetchImpl: async () => jsonResponse(500, { error: 'boom' }) });
  const direct = await provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(direct.error.code, 'PROVIDER_ERROR');
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  assert.equal(await orchestrator.generateContextualResponse({ text: 'oi', messages: [] }), null);
});

test('rate limit (429) -> fallback', async () => {
  const provider = makeProvider({ fetchImpl: async () => jsonResponse(429, { error: 'slow down' }) });
  const direct = await provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(direct.error.code, 'RATE_LIMIT');
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  assert.equal(await orchestrator.generateContextualResponse({ text: 'oi', messages: [] }), null);
});

test('sem sessao autenticada -> UNAUTHORIZED e fallback', async () => {
  const provider = makeProvider({ token: null, fetchImpl: async () => jsonResponse(200, { text: 'x' }) });
  const direct = await provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(direct.error.code, 'UNAUTHORIZED');
});

test('sanitizacao: CPF, email, cartao e token nao vazam no payload', () => {
  const payload = buildLlmPayload({
    text: 'meu cpf e 123.456.789-09 e email joao@teste.com',
    messages: [
      { from: 'user', text: 'cartao 4111 1111 1111 1111 senha: segredo123' },
      { from: 'uni', text: 'ok', type: 'confirmation' },
    ],
    financialContext: { hasData: true, balance: 1200.5, monthlyIncome: 3000, monthlyExpense: 1800, result: 1200, topCategory: { name: 'Mercado', amount: 500 } },
    mode: 'pessoal',
    personalityProfileId: 'balanced',
    workspaceType: 'personal',
  });
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /123\.456\.789-09/);
  assert.doesNotMatch(serialized, /joao@teste\.com/);
  assert.doesNotMatch(serialized, /4111 1111 1111 1111/);
  assert.doesNotMatch(serialized, /segredo123/);
  // mensagem de confirmacao nunca entra no historico
  assert.equal(payload.messages.some((m) => m.content === 'ok'), false);
});

test('limite de contexto: historico truncado e mensagem limitada', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ from: i % 2 ? 'uni' : 'user', text: `msg ${i}` }));
  const history = buildSanitizedHistory(many);
  assert.ok(history.length <= 8);
  const long = sanitizeText('a'.repeat(2000));
  assert.ok(long.length <= 500);
});

test('resumo financeiro so contem agregados (sem ids/descricoes)', () => {
  const summary = buildSanitizedFinancialSummary(
    { hasData: true, balance: 100, monthlyIncome: 200, monthlyExpense: 50, result: 150, topCategory: { name: 'Casa', amount: 30 }, recentTransactions: [{ id: 'secret-id', description: 'pagamento sigiloso' }] },
    'pessoal',
  );
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /secret-id/);
  assert.doesNotMatch(serialized, /sigiloso/);
  assert.equal(summary.balance, 100);
});

test('guarda: resposta que parece acao financeira estruturada e descartada', async () => {
  assert.equal(looksLikeStructuredFinancialAction('{"action":"create","amount":50}'), true);
  assert.equal(validateLlmResponse('{"action":"create","amount":50}').valid, false);
  assert.equal(validateLlmResponse('').valid, false);
  // BLOCO A1: texto (sem fronteira de frase nenhuma) que excede o limite
  // agora e RESUMIDO (corte duro no limite), nao mais descartado por
  // inteiro -- so fica invalido se o resumo ficar vazio.
  const longResult = validateLlmResponse('a'.repeat(5000));
  assert.equal(longResult.valid, true);
  assert.ok(longResult.text.length <= MAX_RESPONSE_CHARS);
  assert.equal(longResult.summarized, true);
  assert.equal(validateLlmResponse('Voce pode registrar essa despesa pelo botao +.').valid, true);

  const provider = makeProvider({ fetchImpl: async () => jsonResponse(200, { text: '{"action":"create","transaction":{"amount":50}}' }) });
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateContextualResponse({ text: 'crie uma despesa', messages: [] });
  assert.equal(res, null, 'acao financeira do LLM nunca deve ser exibida/disparada');
});

test('guarda: resposta longa com frases e resumida na ultima fronteira de frase, nao truncada no meio de uma palavra', () => {
  const sentence = 'Isso é uma frase completa sobre suas finanças pessoais. ';
  const long = sentence.repeat(40);
  const result = validateLlmResponse(long, { maxChars: 200 });
  assert.equal(result.valid, true);
  assert.equal(result.summarized, true);
  assert.ok(result.text.length <= 200);
  assert.ok(/[.!?]$/.test(result.text), 'deve terminar em fronteira de frase, nunca cortado no meio');
});

test('guarda: maxChars customizado (orcamento por estilo) e respeitado', () => {
  const shortEnough = validateLlmResponse('Resposta curta.', { maxChars: 50 });
  assert.equal(shortEnough.valid, true);
  assert.equal(shortEnough.summarized, false);
});

test('nenhuma chave hardcoded no frontend e credencial so na Edge Function', () => {
  const dir = new URL('.', import.meta.url);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const src = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(src, /sk-[A-Za-z0-9]{16,}/, `chave hardcoded em ${file}`);
    // A credencial do provedor nunca deve ter prefixo VITE_ (nao vai ao bundle)
    assert.doesNotMatch(src, /VITE_[A-Z_]*OPENAI/, `credencial exposta ao Vite em ${file}`);
  }
  const edge = readFileSync(new URL('../../../supabase/functions/uni-chat-llm/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.doesNotMatch(edge, /VITE_/);
});

test('integracao UniChatPage preserva determinismo e persistencia', () => {
  const page = readFileSync(new URL('../uni-chat/UniChatPage.jsx', import.meta.url), 'utf8');
  // camada deterministica preservada
  assert.match(page, /classifyFinancialQuery/);
  assert.match(page, /financialConversation\.interpret/);
  // LLM so no ramo nao resolvido
  assert.match(page, /handleUnresolvedMessage/);
  // persistencia mantida no caminho LLM/fallback
  assert.match(page, /handleUnresolvedMessage[\s\S]*syncMessageToSupabase/);
});

test('buildSystemPrompt adapta vocabulario explicitamente por workspaceType (PJ)', () => {
  const prompt = buildSystemPrompt({ workspaceType: 'business', financialSummary: { hasData: false } });
  assert.match(prompt, /sua empresa/);
  assert.match(prompt, /fluxo de caixa/);
  assert.doesNotMatch(prompt, /seu dinheiro/);
});

test('buildSystemPrompt adapta vocabulario explicitamente por workspaceType (PF)', () => {
  const prompt = buildSystemPrompt({ workspaceType: 'personal', financialSummary: { hasData: false } });
  assert.match(prompt, /seu dinheiro/);
  assert.doesNotMatch(prompt, /fluxo de caixa/);
});

// ============================================================================
// OPENAI1 -- consolidacao da infraestrutura existente (uniLlmProvider.js):
// healthCheck(), retry seletivo (so em falha de rede) e cancel() explicito
// via o MESMO AbortController ja usado para o timeout interno. Nenhum
// cliente/provider/hook novo -- apenas correcoes minimas no que ja existia.
// ============================================================================

test('healthCheck: provider desabilitado -> indisponivel por flag (DISABLED), sem chamar fetch', async () => {
  let called = 0;
  const provider = makeProvider({ enabled: false, fetchImpl: () => { called += 1; return jsonResponse(200, {}); } });
  const health = await provider.healthCheck();
  assert.deepEqual(health, { available: false, reason: 'DISABLED' });
  assert.equal(called, 0);
});

test('healthCheck: habilitado mas backend Supabase ausente -> BACKEND_NOT_CONFIGURED', async () => {
  const provider = createUniLlmProvider({
    supabase: null,
    supabaseUrl: '',
    supabaseAnonKey: '',
    enabled: true,
    fetchImpl: async () => jsonResponse(200, {}),
  });
  const health = await provider.healthCheck();
  assert.deepEqual(health, { available: false, reason: 'BACKEND_NOT_CONFIGURED' });
});

test('healthCheck: habilitado e configurado -> disponivel, sem chamar fetch (checagem de capacidade, nao uma chamada real)', async () => {
  let called = 0;
  const provider = makeProvider({ fetchImpl: () => { called += 1; return jsonResponse(200, {}); } });
  const health = await provider.healthCheck();
  assert.deepEqual(health, { available: true, reason: null });
  assert.equal(called, 0);
});

test('retry: falha de rede na 1a tentativa, sucesso na 2a -- resultado final tem texto, fetch chamado 2 vezes', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new Error('network down');
    return jsonResponse(200, { text: 'resposta apos retry' });
  };
  const provider = makeProvider({ fetchImpl });
  const result = await provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(calls, 2);
  assert.equal(result.text, 'resposta apos retry');
  assert.equal(result.error, null);
});

test('retry: falha de rede persistente -- apenas 1 nova tentativa (2 chamadas no total), erro final continua NETWORK', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error('network down');
  };
  const provider = makeProvider({ fetchImpl });
  const result = await provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(calls, 2);
  assert.equal(result.error.code, 'NETWORK');
});

test('retry NUNCA se aplica a TIMEOUT -- so uma tentativa, mesmo com o prazo esgotado', async () => {
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
  const result = await provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(calls, 1);
  assert.equal(result.error.code, 'TIMEOUT');
});

test('retry NUNCA se aplica a erros HTTP (401/429/500) -- cada um e um resultado definitivo, nao uma falha de rede', async () => {
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return jsonResponse(status, { error: 'x' }); };
    const provider = makeProvider({ fetchImpl });
    await provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });
    assert.equal(calls, 1, `status ${status} nao deveria re-tentar`);
  }
});

test('cancel(): aborta a requisicao em andamento via o mesmo AbortController do timeout -- erro CANCELLED, distinto de TIMEOUT', async () => {
  const fetchImpl = (url, opts) => {
    assert.ok(opts.signal instanceof AbortSignal, 'fetch deve receber um AbortSignal real');
    return new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  };
  const provider = makeProvider({ fetchImpl, timeoutMs: 20000 });
  const resultPromise = provider.generateResponse({ system: 's', messages: [{ role: 'user', content: 'oi' }] });

  // Aguarda a requisicao realmente comecar (accessToken resolvido, fetch em
  // voo) antes de cancelar -- evita corrida com currentController ainda nulo.
  await new Promise((resolve) => setTimeout(resolve, 0));
  provider.cancel();

  const result = await resultPromise;
  assert.equal(result.error.code, 'CANCELLED');
});

test('cancel() sem requisicao em andamento e um no-op seguro, nunca lanca', () => {
  const provider = makeProvider({ fetchImpl: async () => jsonResponse(200, { text: 'x' }) });
  assert.doesNotThrow(() => provider.cancel());
});

test('useUniLlm expoe healthCheck e cancel do provider, sem duplicar logica (repasse direto)', async () => {
  const source = readFileSync(new URL('./useUniLlm.js', import.meta.url), 'utf8');
  assert.match(source, /healthCheck: provider\.healthCheck,/);
  assert.match(source, /cancel: provider\.cancel,/);
});

// ============================================================================
// OPENAI1 -- vocabulario formal de estados de interface (aiStatus.js).
// Fundacao para integracao futura (OPENAI2); nao usado ainda por
// UniChatPage.jsx nesta fase.
// ============================================================================

test('deriveAiStatus: IA desabilitada -> UNAVAILABLE, mesmo com loading/erro/resultado presentes', async () => {
  const { AI_STATUS, deriveAiStatus } = await import('./aiStatus.js');
  assert.equal(deriveAiStatus({ enabled: false, isLoading: true, hasResult: true }), AI_STATUS.UNAVAILABLE);
  assert.equal(deriveAiStatus(), AI_STATUS.UNAVAILABLE);
});

test('deriveAiStatus: prioriza responding > loading > error > success, nesta ordem', async () => {
  const { AI_STATUS, deriveAiStatus } = await import('./aiStatus.js');
  assert.equal(deriveAiStatus({ enabled: true, isResponding: true, isLoading: true, error: {} }), AI_STATUS.RESPONDING);
  assert.equal(deriveAiStatus({ enabled: true, isLoading: true, error: {} }), AI_STATUS.LOADING);
  assert.equal(deriveAiStatus({ enabled: true, error: { code: 'TIMEOUT' } }), AI_STATUS.ERROR);
  assert.equal(deriveAiStatus({ enabled: true, hasResult: true }), AI_STATUS.SUCCESS);
});

test('deriveAiStatus: habilitado, sem loading/erro/resultado -> UNAVAILABLE (estado inicial neutro)', async () => {
  const { AI_STATUS, deriveAiStatus } = await import('./aiStatus.js');
  assert.equal(deriveAiStatus({ enabled: true }), AI_STATUS.UNAVAILABLE);
});

test('aiStatus.js exportado pelo barrel do modulo (features/uni-llm)', async () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(source, /export \{ AI_STATUS, deriveAiStatus \} from '\.\/aiStatus\.js';/);
});

test('buildLlmPayload nao vaza vocabulario de um contexto para o outro ao trocar workspaceType entre chamadas', () => {
  const base = { text: 'como estou indo?', messages: [], financialContext: { hasData: false } };
  const businessPayload = buildLlmPayload({ ...base, mode: 'empresa', workspaceType: 'business' });
  const personalPayload = buildLlmPayload({ ...base, mode: 'pessoal', workspaceType: 'personal' });

  assert.match(businessPayload.system, /sua empresa/);
  assert.doesNotMatch(businessPayload.system, /seu dinheiro/);
  assert.match(personalPayload.system, /seu dinheiro/);
  assert.doesNotMatch(personalPayload.system, /fluxo de caixa/);
  // cada chamada monta o system prompt do zero a partir do workspaceType recebido:
  // nao ha estado compartilhado entre as duas chamadas (troca de contexto == sem residuo).
  assert.notEqual(businessPayload.system, personalPayload.system);
});

// ============================================================================
// OPENAI3 -- extensao do provider para o payload de UNI_MODE.SUPPORT. O
// chat financeiro (chamada sem mode/productContext) continua enviando
// exatamente { system, messages }, byte-identico a OPENAI1/OPENAI2.
// ============================================================================

test('chamada financeira (sem mode/productContext) envia corpo byte-identico a OPENAI1/OPENAI2', async () => {
  let capturedBody = null;
  const provider = makeProvider({
    fetchImpl: async (_url, init) => {
      capturedBody = init.body;
      return jsonResponse(200, { text: 'ok' });
    },
  });
  await provider.generateResponse({ system: 'sys', messages: [{ role: 'user', content: 'oi' }] });
  assert.deepEqual(JSON.parse(capturedBody), { system: 'sys', messages: [{ role: 'user', content: 'oi' }] });
});

test('chamada em modo suporte inclui mode e productContext no corpo enviado', async () => {
  let capturedBody = null;
  const provider = makeProvider({
    fetchImpl: async (_url, init) => {
      capturedBody = init.body;
      return jsonResponse(200, { text: 'ok', mode: 'support', knowledge: { matched: true, usedDocumentIds: ['uni-voice'], escalate: false } });
    },
  });
  const productContext = [{ id: 'uni-voice', title: 'Voz da Uni', content: 'resumo...' }];
  await provider.generateResponse({
    system: 'ignorado-no-servidor',
    messages: [{ role: 'user', content: 'como ouço a Uni?' }],
    mode: 'support',
    productContext,
  });
  const parsed = JSON.parse(capturedBody);
  assert.equal(parsed.mode, 'support');
  assert.deepEqual(parsed.productContext, productContext);
});

// ============================================================================
// Sprint 1 (IA Conversacional) -- tools/tool_calls end-to-end. Sem a flag
// VITE_UNI_LLM_TOOLS_ENABLED (default, sempre o caso neste ambiente de
// teste Node puro -- import.meta.env não populado), buildLlmPayload nunca
// inclui `tools`; o corpo continua byte-idêntico (já coberto acima). Os
// testes abaixo cobrem o transporte (provider/orquestrador) assumindo que
// `tools` FOI passado -- ou seja, o comportamento com a flag ligada.
// ============================================================================

test('Sprint 2: buildLlmPayload inclui a data de referencia no system prompt quando o snapshot a fornece', () => {
  const payload = buildLlmPayload({
    text: 'oi',
    messages: [],
    financialContext: { hasData: false, snapshot: { referenceDate: '2026-08-05' } },
  });
  assert.match(payload.system, /Data de referencia de hoje: 2026-08-05\./);
});

test('Sprint 2: sem referenceDate no snapshot, o system prompt sai exatamente como antes (aditivo, nunca obrigatorio)', () => {
  const payload = buildLlmPayload({ text: 'oi', messages: [], financialContext: { hasData: false } });
  assert.ok(!payload.system.includes('Data de referencia de hoje'));
});

test('buildLlmPayload nao inclui tools por padrao (flag desligada neste ambiente)', () => {
  const payload = buildLlmPayload({ text: 'oi', messages: [], financialContext: { hasData: false } });
  assert.equal(payload.tools, undefined);
});

test('provider inclui tools no corpo quando fornecido, omite quando ausente', async () => {
  let capturedBody = null;
  const provider = makeProvider({
    fetchImpl: async (_url, init) => {
      capturedBody = init.body;
      return jsonResponse(200, { text: 'ok' });
    },
  });
  await provider.generateResponse({
    system: 'sys',
    messages: [{ role: 'user', content: 'qual meu saldo?' }],
    tools: [{ type: 'function', function: { name: 'get_financial_summary', description: 'x', parameters: { type: 'object', properties: {} } } }],
  });
  const parsed = JSON.parse(capturedBody);
  assert.equal(parsed.tools.length, 1);
  assert.equal(parsed.tools[0].function.name, 'get_financial_summary');

  capturedBody = null;
  await provider.generateResponse({ system: 'sys', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal('tools' in JSON.parse(capturedBody), false);
});

test('provider repassa tool_calls quando presentes na resposta da Edge Function', async () => {
  const toolCalls = [{ id: 'call_1', type: 'function', function: { name: 'get_financial_summary', arguments: '{}' } }];
  const provider = makeProvider({
    fetchImpl: async () => jsonResponse(200, { text: null, usage: { promptTokens: 5 }, tool_calls: toolCalls }),
  });
  const result = await provider.generateResponse({ system: 'sys', messages: [{ role: 'user', content: 'qual meu saldo?' }] });
  assert.equal(result.error, null);
  assert.equal(result.text, null);
  assert.deepEqual(result.tool_calls, toolCalls);
});

test('provider: resposta so com tool_calls (texto vazio) NUNCA vira erro EMPTY', async () => {
  const toolCalls = [{ id: 'call_1', type: 'function', function: { name: 'get_financial_summary', arguments: '{}' } }];
  const provider = makeProvider({
    fetchImpl: async () => jsonResponse(200, { tool_calls: toolCalls }),
  });
  const result = await provider.generateResponse({ system: 'sys', messages: [{ role: 'user', content: 'qual meu saldo?' }] });
  assert.equal(result.error, null);
  assert.deepEqual(result.tool_calls, toolCalls);
});

test('provider: resposta sem texto e sem tool_calls continua sendo EMPTY (comportamento preservado)', async () => {
  const provider = makeProvider({ fetchImpl: async () => jsonResponse(200, {}) });
  const result = await provider.generateResponse({ system: 'sys', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(result.error.code, 'EMPTY');
  assert.equal(result.tool_calls, undefined);
});

test('orquestrador repassa tool_calls mesmo quando a resposta nao tem texto', async () => {
  const toolCalls = [{ id: 'call_1', type: 'function', function: { name: 'get_financial_summary', arguments: '{}' } }];
  const provider = {
    generateResponse: async () => ({ text: null, usage: null, tool_calls: toolCalls, error: null }),
  };
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  const result = await orchestrator.generateContextualResponse({
    text: 'qual meu saldo?', messages: [], financialContext: { hasData: false },
  });
  assert.equal(result.text, null);
  assert.deepEqual(result.tool_calls, toolCalls);
});

test('orquestrador: texto invalido (parece acao estruturada) descartado, mas tool_calls legitimo e preservado', async () => {
  const toolCalls = [{ id: 'call_1', type: 'function', function: { name: 'get_financial_summary', arguments: '{}' } }];
  const provider = {
    generateResponse: async () => ({
      text: '{"action":"create","transaction":{"amount":50}}',
      usage: null,
      tool_calls: toolCalls,
      error: null,
    }),
  };
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  const result = await orchestrator.generateContextualResponse({
    text: 'gastei 50 no mercado', messages: [], financialContext: { hasData: false },
  });
  assert.equal(result.text, null);
  assert.deepEqual(result.tool_calls, toolCalls);
});

test('orquestrador: sem tool_calls e sem texto valido continua caindo no fallback (null) -- comportamento preservado', async () => {
  const provider = { generateResponse: async () => ({ text: null, usage: null, tool_calls: null, error: null }) };
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  const result = await orchestrator.generateContextualResponse({
    text: 'oi', messages: [], financialContext: { hasData: false },
  });
  assert.equal(result, null);
});

// ============================================================================
// SUPORTE1 -- useUniLlm passa a expor generateSupportResponse, com a MESMA
// instância de provider (transporte compartilhado com o financeiro).
// AI_STATUS ganha CANCELLED (cancelamento nunca deve parecer um erro real).
// ============================================================================

test('useUniLlm expoe generateSupportResponse, compartilhando a MESMA instancia de provider do financeiro', async () => {
  const source = readFileSync(new URL('./useUniLlm.js', import.meta.url), 'utf8');
  assert.match(source, /const supportOrchestrator = createUniSupportOrchestrator\(\{ provider \}\);/);
  assert.match(source, /const financialOrchestrator = createUniLlmOrchestrator\(\{ provider \}\);/);
  assert.match(source, /async generateSupportResponse\(input\) \{/);
  assert.match(source, /return supportOrchestrator\.generateSupportResponse\(input\);/);
});

test('generateSupportResponse tambem respeita a flag/config desabilitada (nunca chama o orquestrador se config.enabled for falso)', async () => {
  const source = readFileSync(new URL('./useUniLlm.js', import.meta.url), 'utf8');
  const fnBody = source.slice(
    source.indexOf('async generateSupportResponse(input) {'),
    source.indexOf('// OPENAI1: checagem de disponibilidade'),
  );
  assert.match(fnBody, /if \(!config\.enabled\) return null;/);
});

test('AI_STATUS.CANCELLED existe e e distinto de ERROR (cancelamento deliberado nunca deve parecer falha real)', async () => {
  const { AI_STATUS } = await import('./aiStatus.js');
  assert.equal(AI_STATUS.CANCELLED, 'cancelled');
  assert.notEqual(AI_STATUS.CANCELLED, AI_STATUS.ERROR);
});

test('provider repassa knowledge da resposta da Edge Function quando presente (modo suporte); ausente/null em chamadas financeiras', async () => {
  const providerWithKnowledge = makeProvider({
    fetchImpl: async () => jsonResponse(200, {
      text: 'resposta de suporte',
      usage: { promptTokens: 1 },
      mode: 'support',
      knowledge: { matched: true, usedDocumentIds: ['uni-voice'], escalate: false },
    }),
  });
  const withKnowledge = await providerWithKnowledge.generateResponse({ messages: [{ role: 'user', content: 'oi' }], mode: 'support', productContext: [] });
  assert.deepEqual(withKnowledge.knowledge, { matched: true, usedDocumentIds: ['uni-voice'], escalate: false });

  const providerFinancial = makeProvider({
    fetchImpl: async () => jsonResponse(200, { text: 'resposta financeira', usage: { promptTokens: 1 } }),
  });
  const financialResult = await providerFinancial.generateResponse({ system: 'sys', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(financialResult.knowledge, null);
});
