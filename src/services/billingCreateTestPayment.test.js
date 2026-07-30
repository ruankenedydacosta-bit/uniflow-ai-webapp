import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ============================================================================
// BLOCO ASAAS 3A -- billing-create-test-payment: função EXCLUSIVA de
// homologação, cria/confirma uma cobrança avulsa (nunca recorrente) no
// Sandbox, para validar o webhook de ponta a ponta. Mesmo padrão de
// cobertura estrutural (source-regex) já usado pelas demais Edge Functions
// de billing -- Deno não roda sob `node --test`.
// ============================================================================

const SOURCE = readFileSync(
  new URL('../../supabase/functions/billing-create-test-payment/index.ts', import.meta.url),
  'utf8',
);

test('JWT obrigatório: exige Authorization Bearer, mesma validação de sessão das demais funções de billing', () => {
  assert.match(SOURCE, /if \(!authorization\.startsWith\('Bearer '\)\) \{\s*\n\s*return jsonResponse\(401, errorBody\('AUTH_REQUIRED'/);
});

test('exige workspace_id válido (UUID) e associação ativa ao workspace -- mesma allowlist de CORS das demais funções', () => {
  assert.match(SOURCE, /const UUID_PATTERN =/);
  assert.match(SOURCE, /hasWorkspaceMembership/);
  assert.match(SOURCE, /WORKSPACE_NOT_AUTHORIZED/);
});

test('só POST é aceito; OPTIONS só responde CORS', () => {
  assert.match(SOURCE, /if \(request\.method === 'OPTIONS'\) return new Response\('ok'/);
  assert.match(SOURCE, /if \(request\.method !== 'POST'\) \{\s*\n\s*return jsonResponse\(405, errorBody\('METHOD_NOT_ALLOWED'/);
});

test('action "create" exige billing_customer já existente -- nunca cria cliente aqui, reaproveita billing-create-customer', () => {
  assert.match(SOURCE, /CUSTOMER_REQUIRED/);
  assert.doesNotMatch(SOURCE, /createCustomer\(/);
});

test('valor e descrição são fixos no backend (R\\$ 29,90) -- nunca aceitos do chamador, mesmo padrão das demais funções', () => {
  assert.match(SOURCE, /const TEST_PAYMENT_VALUE = 29\.9;/);
  assert.match(SOURCE, /value: TEST_PAYMENT_VALUE,/);
});

test('billingType default é PIX; só aceita BOLETO como alternativa explícita neste teste técnico -- nunca CREDIT_CARD (sem dado de cartão aqui)', () => {
  assert.match(SOURCE, /const billingType = payload\?\.billing_type === 'BOLETO' \? 'BOLETO' : 'PIX';/);
  assert.doesNotMatch(SOURCE, /CREDIT_CARD/);
});

test('action "confirm" chama exclusivamente client.confirmSandboxPayment -- nunca cria/altera dado financeiro pessoal', () => {
  const idx = SOURCE.indexOf("if (action === 'confirm') {");
  const slice = SOURCE.slice(idx, idx + 600);
  assert.match(slice, /client\.confirmSandboxPayment\(asaasPaymentId\)/);
  assert.match(slice, /MISSING_REQUIRED_FIELD/);
});

test('nunca escreve em subscriptions ou billing_payments -- persistência é responsabilidade do Bloco Asaas 3B (processamento de webhook)', () => {
  assert.doesNotMatch(SOURCE, /rest\/v1\/subscriptions/);
  assert.doesNotMatch(SOURCE, /rest\/v1\/billing_payments/);
});

test('nunca chama createSubscription -- não mexe na arquitetura principal de assinatura recorrente', () => {
  assert.doesNotMatch(SOURCE, /createSubscription/);
});

test('externalReference tem prefixo identificável de teste quando não informado pelo chamador', () => {
  assert.match(SOURCE, /`uniflow-sandbox-payment-\$\{crypto\.randomUUID\(\)\}`/);
});

test('erros da Asaas nunca vazam detalhe de infraestrutura -- log sanitizado (operationId/providerStatus), nunca payload/token', () => {
  const idx = SOURCE.indexOf('error instanceof AsaasApiError');
  const slice = SOURCE.slice(idx, idx + 300);
  assert.match(slice, /operationId: error\.operationId, providerStatus: error\.providerStatus/);
  assert.doesNotMatch(slice, /ASAAS_API_KEY|apiKey/);
});
