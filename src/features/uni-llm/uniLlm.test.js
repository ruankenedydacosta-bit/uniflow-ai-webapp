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
import { validateLlmResponse, looksLikeStructuredFinancialAction } from './llmResponseGuard.js';

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
  assert.equal(validateLlmResponse('a'.repeat(5000)).valid, false);
  assert.equal(validateLlmResponse('Voce pode registrar essa despesa pelo botao +.').valid, true);

  const provider = makeProvider({ fetchImpl: async () => jsonResponse(200, { text: '{"action":"create","transaction":{"amount":50}}' }) });
  const orchestrator = createUniLlmOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateContextualResponse({ text: 'crie uma despesa', messages: [] });
  assert.equal(res, null, 'acao financeira do LLM nunca deve ser exibida/disparada');
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
