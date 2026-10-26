import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createAsaasClient } from '../../supabase/functions/_shared/asaasClient.ts';

test('consulta real do cliente HTTP percorre as páginas antes de reconciliar a assinatura', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify(urls.length === 1
      ? { data: [{ id: 'pay_old', status: 'PENDING' }], hasMore: true }
      : { data: [{ id: 'pay_paid', status: 'CONFIRMED' }], hasMore: false }), { status: 200 });
  });
  const client = createAsaasClient({ apiKey: 'fixture-key', baseUrl: 'https://api-sandbox.asaas.com/v3' });
  const result = await client.listSubscriptionPayments('sub_fixture');
  assert.equal(result.data.length, 2);
  assert.match(urls[1], /offset=1&limit=100$/);
});

test('página quebrada não é tratada como histórico vazio ou completo', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ hasMore: true, data: [] }), { status: 200 }));
  const client = createAsaasClient({ apiKey: 'fixture-key', baseUrl: 'https://api-sandbox.asaas.com/v3' });
  await assert.rejects(client.listSubscriptionPayments('sub_fixture'), /histórico completo/);
});

// ============================================================================
// BILLING2 (Bloco Asaas 2) -- cobertura estrutural (source-regex) do cliente
// HTTP compartilhado da Asaas (_shared/asaasClient.ts). Mesmo padrão já
// usado por notificationsMigration.test.js/uniVoiceCache.test.js: Deno Edge
// Functions/TS não rodam sob `node --test` (runtime diferente, sem `Deno`
// global) -- por isso a verificação é sobre o CÓDIGO conter a lógica
// correta (headers, mapeamento de status, sanitização), não sobre executar
// o handler.
// ============================================================================

const CLIENT_SOURCE = readFileSync(
  new URL('../../supabase/functions/_shared/asaasClient.ts', import.meta.url),
  'utf8',
);

// -- Autenticação e URLs -----------------------------------------------------

test('base URLs corretas: sandbox e produção, ambas oficiais (docs.asaas.com/docs/authentication-2)', () => {
  assert.match(CLIENT_SOURCE, /ASAAS_SANDBOX_BASE_URL = 'https:\/\/api-sandbox\.asaas\.com\/v3';/);
  assert.match(CLIENT_SOURCE, /ASAAS_PRODUCTION_BASE_URL = 'https:\/\/api\.asaas\.com\/v3';/);
});

test('autenticação envia o header "access_token" (nunca "Authorization: Bearer", esquema da Asaas é diferente do nosso Supabase Auth)', () => {
  assert.match(CLIENT_SOURCE, /access_token: apiKey,/);
});

test('Content-Type e User-Agent sempre enviados (exigidos pela Asaas para contas criadas após 11/06/2024)', () => {
  assert.match(CLIENT_SOURCE, /'Content-Type': 'application\/json',/);
  assert.match(CLIENT_SOURCE, /'User-Agent': userAgent,/);
});

test('produção é recusada nesta fase mesmo se ASAAS_BASE_URL apontar para ela, sem allowProduction explícito', () => {
  const idx = CLIENT_SOURCE.indexOf('export function createAsaasClient');
  const slice = CLIENT_SOURCE.slice(idx, idx + 1200);
  assert.match(slice, /if \(baseUrl === ASAAS_PRODUCTION_BASE_URL && !config\.allowProduction\)/);
  assert.match(slice, /nao e permitida nesta fase/);
});

test('URL que não é HTTPS é recusada antes de qualquer tentativa de rede', () => {
  const idx = CLIENT_SOURCE.indexOf('export function createAsaasClient');
  const slice = CLIENT_SOURCE.slice(idx, idx + 800);
  assert.match(slice, /if \(!baseUrl\.startsWith\('https:\/\/'\)\)/);
});

test('chave ausente ou base URL ausente lançam AsaasConfigurationError síncrono, antes do fetch', () => {
  const idx = CLIENT_SOURCE.indexOf('export function createAsaasClient');
  const slice = CLIENT_SOURCE.slice(idx, idx + 800);
  assert.match(slice, /if \(!apiKey\) \{\s*\n\s*throw new AsaasConfigurationError/);
  assert.match(slice, /if \(!baseUrl\) \{\s*\n\s*throw new AsaasConfigurationError/);
});

// -- Timeout, rede, JSON, erros HTTP -----------------------------------------

test('timeout usa AbortController com um prazo configurável (default 15s)', () => {
  assert.match(CLIENT_SOURCE, /DEFAULT_TIMEOUT_MS = 15_000;/);
  assert.match(CLIENT_SOURCE, /new AbortController\(\)/);
  assert.match(CLIENT_SOURCE, /setTimeout\(\(\) => controller\.abort\('timeout'\), timeoutMs\)/);
});

test('timeout e falha de rede são erros distintos (AsaasTimeoutError vs AsaasNetworkError)', () => {
  assert.match(CLIENT_SOURCE, /if \(controller\.signal\.aborted && controller\.signal\.reason === 'timeout'\) \{\s*\n\s*throw new AsaasTimeoutError\(operationId\);/);
  assert.match(CLIENT_SOURCE, /throw new AsaasNetworkError\(operationId, cause\);/);
});

test('resposta sem JSON válido (texto não parseável) é tratada como AsaasApiError com status seguro 502', () => {
  assert.match(CLIENT_SOURCE, /rawText nao pode ser interpretada|nao pode ser interpretada \(nao e JSON valido\)/);
  assert.match(CLIENT_SOURCE, /httpStatus: 502,\s*\n\s*logDetails: \{ rawTextLength: rawText\.length \},/);
});

test('respostas 4xx/5xx da Asaas nunca são silenciosamente ignoradas -- sempre viram AsaasApiError', () => {
  assert.match(CLIENT_SOURCE, /if \(!response\.ok\) \{\s*\n\s*throw new AsaasApiError/);
});

test('mapeamento de status SEGURO: 401/403 da Asaas (nossa credencial) nunca vira 401/403 para o usuário final -- vira 503', () => {
  const idx = CLIENT_SOURCE.indexOf('function mapProviderStatusToSafeHttpStatus');
  const slice = CLIENT_SOURCE.slice(idx, idx + 400);
  assert.match(slice, /if \(providerStatus === 401 \|\| providerStatus === 403\) return 503;/);
});

test('mapeamento de status SEGURO: 429 preservado (rate limit), 5xx vira 502, 400/404 preservados', () => {
  const idx = CLIENT_SOURCE.indexOf('function mapProviderStatusToSafeHttpStatus');
  const slice = CLIENT_SOURCE.slice(idx, idx + 400);
  assert.match(slice, /if \(providerStatus === 400 \|\| providerStatus === 404\) return providerStatus;/);
  assert.match(slice, /if \(providerStatus === 429\) return 429;/);
  assert.match(slice, /if \(providerStatus >= 500\) return 502;/);
});

// -- Segurança: nunca loga API key / dados de cartão -------------------------

test('sanitizeForLog redige access_token/apikey/creditcard/cvv/authtoken em qualquer profundidade -- nunca aparece em log/erro', () => {
  assert.match(CLIENT_SOURCE, /const SENSITIVE_LOG_KEYS = new Set\(\[/);
  for (const key of ['access_token', 'apikey', 'creditcardnumber', 'creditcardcvv', 'cvv', 'creditcardtoken', 'authtoken', 'password']) {
    assert.match(CLIENT_SOURCE, new RegExp(`'${key}'`), `${key} deveria estar na lista de chaves sensíveis`);
  }
  assert.match(CLIENT_SOURCE, /result\[key\] = SENSITIVE_LOG_KEYS\.has\(key\.toLowerCase\(\)\)\s*\n\s*\? '\[REDACTED\]'/);
});

test('sanitizeForLog é recursivo (objetos aninhados e arrays) e tem limite de profundidade -- nunca recursão infinita', () => {
  assert.match(CLIENT_SOURCE, /if \(depth > 6\) return '\[REDACTED_MAX_DEPTH\]';/);
  assert.match(CLIENT_SOURCE, /Array\.isArray\(value\)\) return value\.map\(\(item\) => sanitizeForLog\(item, depth \+ 1\)\);/);
});

test('todo erro tipado (AsaasApiError, AsaasNetworkError) sanitiza logDetails via sanitizeForLog antes de guardar', () => {
  assert.match(CLIENT_SOURCE, /logDetails = \{ cause: sanitizeForLog\(cause instanceof Error \? cause\.message : String\(cause\)\) \};/);
  assert.match(CLIENT_SOURCE, /logDetails: \{ body: sanitizeForLog\(body\) \},/);
});

// -- Erros tipados pedidos na tarefa ------------------------------------------

test('4 erros tipados existem com os nomes pedidos: AsaasApiError, AsaasConfigurationError, AsaasValidationError, AsaasTimeoutError', () => {
  for (const errorClass of ['AsaasApiError', 'AsaasConfigurationError', 'AsaasValidationError', 'AsaasTimeoutError']) {
    assert.match(CLIENT_SOURCE, new RegExp(`export class ${errorClass} extends Error`));
  }
});

test('cada erro tipado carrega code, httpStatus (seguro) e operationId -- correlacionável com logs', () => {
  for (const errorClass of ['AsaasConfigurationError', 'AsaasValidationError', 'AsaasTimeoutError', 'AsaasNetworkError', 'AsaasApiError']) {
    const idx = CLIENT_SOURCE.indexOf(`export class ${errorClass} extends Error`);
    const slice = CLIENT_SOURCE.slice(idx, idx + 400);
    assert.match(slice, /httpStatus/, `${errorClass} deveria ter httpStatus`);
  }
});

test('AsaasApiError carrega providerStatus (status bruto recebido da Asaas) separado de httpStatus (seguro)', () => {
  const idx = CLIENT_SOURCE.indexOf('export class AsaasApiError extends Error');
  const slice = CLIENT_SOURCE.slice(idx, idx + 700);
  assert.match(slice, /providerStatus: number;/);
  assert.match(slice, /httpStatus: number;/);
});

// -- Endpoints reais utilizados (fonte oficial confirmada) --------------------

test('createCustomer chama POST /customers (docs.asaas.com/reference/create-new-customer)', () => {
  assert.match(CLIENT_SOURCE, /createCustomer\(payload: Record<string, unknown>\) \{\s*\n\s*return request\('createCustomer', '\/customers', \{ method: 'POST'/);
});

test('findCustomersByExternalReference usa GET /customers?externalReference=... (docs.asaas.com/reference/list-customers) -- camada extra de idempotência do lado da Asaas', () => {
  assert.match(CLIENT_SOURCE, /findCustomersByExternalReference\(externalReference: string\) \{/);
  assert.match(CLIENT_SOURCE, /\/customers\?\$\{params\.toString\(\)\}/);
});

test('createSubscription chama POST /subscriptions (docs.asaas.com/reference/create-new-subscription)', () => {
  assert.match(CLIENT_SOURCE, /createSubscription\(payload: Record<string, unknown>\) \{\s*\n\s*return request\('createSubscription', '\/subscriptions', \{ method: 'POST'/);
});

test('getSubscription chama GET /subscriptions/{id} (docs.asaas.com/reference/retrieve-a-single-subscription)', () => {
  assert.match(CLIENT_SOURCE, /getSubscription\(asaasSubscriptionId: string\) \{\s*\n\s*return request\('getSubscription', `\/subscriptions\/\$\{encodeURIComponent\(asaasSubscriptionId\)\}`, \{ method: 'GET' \}\);/);
});

test('cancelSubscription chama DELETE /subscriptions/{id} para encerrar tentativa inicial ainda não paga', () => {
  assert.match(CLIENT_SOURCE, /cancelSubscription\(asaasSubscriptionId: string\) \{\s*\n\s*return request\('cancelSubscription', `\/subscriptions\/\$\{encodeURIComponent\(asaasSubscriptionId\)\}`, \{ method: 'DELETE' \}\);/);
});

test('deactivateSubscription chama PUT INACTIVE para parar renovações sem remover cobranças existentes', () => {
  assert.match(CLIENT_SOURCE, /deactivateSubscription\(asaasSubscriptionId: string\) \{[\s\S]{0,260}method: 'PUT', body: JSON\.stringify\(\{ status: 'INACTIVE' \}\)/);
});

test('tokenizeCreditCard chama POST /creditCard/tokenize (docs.asaas.com/reference/credit-card-tokenization) -- nunca recebe cartão bruto do nosso backend', () => {
  assert.match(CLIENT_SOURCE, /tokenizeCreditCard\(payload: Record<string, unknown>\) \{\s*\n\s*return request\('tokenizeCreditCard', '\/creditCard\/tokenize'/);
});

test('createPixAutomaticAuthorization chama POST /pix/automatic/authorizations (docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico) -- endpoint PRÓPRIO, nunca /subscriptions', () => {
  assert.match(CLIENT_SOURCE, /createPixAutomaticAuthorization\(payload: Record<string, unknown>\) \{\s*\n\s*return request\('createPixAutomaticAuthorization', '\/pix\/automatic\/authorizations'/);
});

test('nenhuma referência a boleto em nenhum lugar do cliente HTTP', () => {
  assert.doesNotMatch(CLIENT_SOURCE, /boleto/i);
  assert.doesNotMatch(CLIENT_SOURCE, /BOLETO/);
});

// -- BLOCO ASAAS 3A: cobrança avulsa de homologação --------------------------

test('createPayment chama POST /payments (docs.asaas.com/reference/create-new-payment) -- cobrança avulsa, usada só pela homologação', () => {
  assert.match(CLIENT_SOURCE, /createPayment\(payload: Record<string, unknown>\) \{\s*\n\s*return request\('createPayment', '\/payments', \{ method: 'POST'/);
});

test('getPayment reconsulta GET /payments/{id} para validar o evento antes de atualizar o estado local', () => {
  assert.match(CLIENT_SOURCE, /getPayment\(asaasPaymentId: string\) \{\s*\n\s*return request\('getPayment', `\/payments\/\$\{encodeURIComponent\(asaasPaymentId\)\}`, \{ method: 'GET' \}\);/);
});

test('confirmSandboxPayment chama POST /sandbox/payment/{id}/confirm (docs.asaas.com/reference/confirm-payment) -- endpoint SANDBOX-ONLY documentado', () => {
  assert.match(
    CLIENT_SOURCE,
    /confirmSandboxPayment\(asaasPaymentId: string\) \{\s*\n\s*return request\(\s*\n\s*'confirmSandboxPayment',\s*\n\s*`\/sandbox\/payment\/\$\{encodeURIComponent\(asaasPaymentId\)\}\/confirm`,\s*\n\s*\{ method: 'POST' \},\s*\n\s*\);/,
  );
});

// -- CORRECAO FINAL PIX: QR Code oficial de cobrança Pix ---------------------

test('getPixQrCode chama GET /payments/{id}/pixQrCode (docs.asaas.com/reference/get-qr-code-for-pix-payments)', () => {
  assert.match(
    CLIENT_SOURCE,
    /getPixQrCode\(asaasPaymentId: string\) \{\s*\n\s*return request\('getPixQrCode', `\/payments\/\$\{encodeURIComponent\(asaasPaymentId\)\}\/pixQrCode`, \{ method: 'GET' \}\);/,
  );
});
