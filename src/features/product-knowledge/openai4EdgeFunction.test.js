// OPENAI4: testes estruturais (source-regex) sobre a validacao/correcao da
// integracao real com a OpenAI em supabase/functions/uni-chat-llm/index.ts.
// Mesmo padrao ja usado no projeto para Edge Functions Deno (sem runtime
// Deno disponivel em `npm test`) -- ver uniModeEdgeFunction.test.js e
// uniVoiceCache.test.js. Nenhum teste aqui imprime, mocka ou depende do
// valor real de OPENAI_API_KEY -- o secret real so e exercitado pelas
// chamadas reais controladas da fase (fora do test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EDGE_SOURCE = readFileSync(
  join(__dirname, '..', '..', '..', 'supabase', 'functions', 'uni-chat-llm', 'index.ts'),
  'utf8',
);

test('a chave do provedor so e lida a partir de Deno.env, nunca hardcoded ou de payload do cliente', () => {
  assert.match(EDGE_SOURCE, /Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.doesNotMatch(EDGE_SOURCE, /sk-[A-Za-z0-9]{16,}/);
  assert.doesNotMatch(EDGE_SOURCE, /payload\.(apiKey|providerKey|openaiKey)/i);
});

test('endpoint e Chat Completions oficial (POST /v1/chat/completions), sem migracao desnecessaria para Responses API', () => {
  assert.match(EDGE_SOURCE, /https:\/\/api\.openai\.com\/v1\/chat\/completions/);
});

test('autenticacao ao provedor usa Bearer server-side', () => {
  assert.match(EDGE_SOURCE, /Authorization: `Bearer \$\{apiKey\}`/);
});

test('modelo e configuravel via env (UNI_LLM_MODEL) com default seguro e documentado, sem editar o frontend', () => {
  assert.match(EDGE_SOURCE, /Deno\.env\.get\('UNI_LLM_MODEL'\) \?\? 'gpt-5\.4-mini'/);
});

test('usa max_completion_tokens (nome atual do parametro), nunca o max_tokens legado rejeitado pela API real', () => {
  assert.match(EDGE_SOURCE, /max_completion_tokens: MAX_OUTPUT_TOKENS/);
  assert.doesNotMatch(EDGE_SOURCE, /\bmax_tokens\s*:/);
});

test('usa o role "developer" para as instrucoes de sistema, o caminho oficial atual (nao mais "system")', () => {
  assert.match(EDGE_SOURCE, /messages: \[\{ role: 'developer', content: system \}, \.\.\.messages\]/);
});

test('chave invalida (401 do provedor) nunca reflete detalhe do provedor -- vira 503 generico', () => {
  assert.match(EDGE_SOURCE, /if \(response\.status === 401\) \{\s*return \{ status: 401, text: null, usage: null, reason: 'invalid_key' \};/);
  assert.match(EDGE_SOURCE, /if \(result\.status === 401\) \{[\s\S]{0,200}return finish\(503, result\.reason, \{ error: 'A resposta por IA nao esta configurada neste ambiente\.' \}\);/);
});

test('saldo insuficiente (429 + error.code=insufficient_quota) e distinguido de rate limit generico e nunca reflete o codigo bruto ao cliente', () => {
  assert.match(EDGE_SOURCE, /errBody\?\.error\?\.code/);
  assert.match(EDGE_SOURCE, /code === 'insufficient_quota' \? 'insufficient_quota' : 'rate_limit'/);
  assert.match(EDGE_SOURCE, /if \(result\.status === 429 && result\.reason === 'insufficient_quota'\) \{[\s\S]{0,200}return finish\(503,/);
});

test('rate limit generico (429 sem insufficient_quota) continua retornando 429 ao cliente para o frontend tratar', () => {
  assert.match(EDGE_SOURCE, /if \(result\.status === 429\) \{\s*return finish\(429, result\.reason, \{ error: 'Muitas solicitacoes\. Tente em instantes\.' \}\);/);
});

test('recusa do modelo (message.refusal) e resposta vazia sao tratadas sem lancar e sem expor detalhe ao cliente', () => {
  assert.match(EDGE_SOURCE, /const refusal = choice\?\.message\?\.refusal;/);
  assert.match(EDGE_SOURCE, /reason: 'refusal'/);
  assert.match(EDGE_SOURCE, /reason: 'empty'/);
});

test('JSON invalido no corpo da requisicao do cliente retorna 400 sem lancar excecao nao tratada', () => {
  assert.match(EDGE_SOURCE, /catch \{\s*return jsonResponse\(400, \{ error: 'Nao foi possivel ler esta solicitacao\.' \}\);/);
});

test('timeout do provedor e distinguido de erro de rede no log seguro, ambos sem detalhe ao cliente', () => {
  assert.match(EDGE_SOURCE, /timedOut \? 'timeout' : 'network_error'/);
  assert.match(EDGE_SOURCE, /timedOut \? 504 : 502/);
});

test('observabilidade segura: log estruturado inclui apenas metadados operacionais (modo, modelo, duracao, status, motivo, tokens)', () => {
  const fnIdx = EDGE_SOURCE.indexOf('function logSafeMetric(');
  const fnEnd = EDGE_SOURCE.indexOf('\nDeno.serve(');
  const fnSlice = EDGE_SOURCE.slice(fnIdx, fnEnd);
  assert.match(fnSlice, /mode: entry\.mode/);
  assert.match(fnSlice, /model: entry\.model/);
  assert.match(fnSlice, /durationMs: entry\.durationMs/);
  assert.match(fnSlice, /status: entry\.status/);
  assert.match(fnSlice, /reason: entry\.reason/);
  assert.match(fnSlice, /promptTokens: entry\.promptTokens/);
  assert.match(fnSlice, /completionTokens: entry\.completionTokens/);
});

test('observabilidade segura nunca loga texto de pergunta/resposta, contexto financeiro, conhecimento de produto, e-mail ou chave', () => {
  const fnIdx = EDGE_SOURCE.indexOf('function logSafeMetric(');
  const fnEnd = EDGE_SOURCE.indexOf('\nDeno.serve(');
  const fnSlice = EDGE_SOURCE.slice(fnIdx, fnEnd);
  assert.doesNotMatch(fnSlice, /\btext\b/);
  assert.doesNotMatch(fnSlice, /\bsystem\b/);
  assert.doesNotMatch(fnSlice, /\bmessages\b/);
  assert.doesNotMatch(fnSlice, /\bproductContext\b/);
  assert.doesNotMatch(fnSlice, /apiKey/i);
});

test('nenhuma chamada real ao provedor acontece antes de autenticar o usuario (fetch ao OpenAI vem depois de getAuthenticatedUserId)', () => {
  const authCallIdx = EDGE_SOURCE.indexOf('const userId = await getAuthenticatedUserId(');
  const openAiAdapterCallIdx = EDGE_SOURCE.indexOf('const result = await callOpenAiAdapter(');
  assert.ok(authCallIdx > -1 && openAiAdapterCallIdx > -1);
  assert.ok(authCallIdx < openAiAdapterCallIdx);
});

test('historico, mensagens e contexto de produto continuam limitados (defesa em profundidade preservada de OPENAI1/2/3)', () => {
  assert.match(EDGE_SOURCE, /MAX_MESSAGES = 12/);
  assert.match(EDGE_SOURCE, /MAX_MESSAGE_CHARS = 800/);
  assert.match(EDGE_SOURCE, /MAX_SYSTEM_CHARS = 6000/);
  assert.match(EDGE_SOURCE, /MAX_PRODUCT_CONTEXT_ENTRIES = 5/);
  assert.match(EDGE_SOURCE, /MAX_PRODUCT_CONTEXT_TOTAL_CHARS = 3000/);
});

test('nenhum novo secret ou fallback hardcoded introduzido; nenhum uso de VITE_OPENAI', () => {
  assert.doesNotMatch(EDGE_SOURCE, /VITE_OPENAI/);
  assert.doesNotMatch(EDGE_SOURCE, /VITE_/);
});
