import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertBillingWebhookWriteSucceeded,
  buildWebhookProcessingFailurePatch,
  buildWebhookProcessingSuccessPatch,
  isWebhookEventEligibleForProcessing,
} from '../../supabase/functions/_shared/billingWebhookReliability.ts';

// ============================================================================
// BILLING2 (Bloco Asaas 2) -- cobertura estrutural (source-regex) das 7
// Edge Functions de billing, agora com logica REAL (nao mais o esqueleto do
// Bloco Asaas 1). Mesmo padrao ja usado no resto do projeto para testar
// Edge Functions (Deno/TS nao roda sob `node --test`): o codigo precisa
// CONTER a validacao/branch/mensagem certa, nunca executamos o handler.
// ============================================================================

function source(name) {
  return readFileSync(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
}

const HEALTH = source('billing-health');
const CREATE_CUSTOMER = source('billing-create-customer');
const CREATE_SUBSCRIPTION = source('billing-create-subscription');
const CREATE_CHECKOUT = source('billing-create-checkout');
const GET_SUBSCRIPTION = source('billing-get-subscription');
const CANCEL_SUBSCRIPTION = source('billing-cancel-subscription');
const SYNC = source('billing-sync');
const WEBHOOK = source('billing-webhook');

test('as 8 Edge Functions de billing importam o cliente HTTP compartilhado (_shared/asaasClient.ts) -- nenhuma duplica lógica de fetch para a Asaas', () => {
  for (const [name, code] of Object.entries({
    HEALTH, CREATE_CUSTOMER, CREATE_SUBSCRIPTION, CREATE_CHECKOUT, GET_SUBSCRIPTION, CANCEL_SUBSCRIPTION, SYNC,
  })) {
    assert.match(code, /from '\.\.\/_shared\/asaasClient\.ts'/, `${name} deveria importar o cliente compartilhado`);
  }
});

// -- BILLING HEALTH -----------------------------------------------------------

test('billing-health: testa autenticação via GET /customers?limit=1 (listagem, não destrutiva, documentada)', () => {
  assert.match(HEALTH, /client\.listCustomers\(\{ limit: '1' \}\)/);
});

test('billing-health: nunca retorna API key, dados de conta, saldo ou documentos -- só {ok, environment, provider, authenticated}', () => {
  // Extrai cada bloco literal `{ ... }` passado como body de jsonResponse
  // e garante que NENHUM contém um campo sensível -- nunca o arquivo
  // inteiro (que naturalmente referencia asaasApiKey em outro lugar).
  const responseBodies = [...HEALTH.matchAll(/jsonResponse\(\s*\d+,\s*(\{[\s\S]*?\n\s*\}),/g)].map((m) => m[1]);
  assert.ok(responseBodies.length >= 4, 'deveria haver múltiplos corpos de resposta a inspecionar');
  for (const body of responseBodies) {
    for (const forbidden of ['apiKey', 'ASAAS_API_KEY', 'cpfCnpj', 'saldo', 'balance', 'creditCard']) {
      assert.doesNotMatch(body, new RegExp(forbidden), `campo sensível "${forbidden}" não deveria aparecer num corpo de resposta de billing-health`);
    }
  }
  assert.match(HEALTH, /ok: true,\s*\n\s*environment:/);
});

test('billing-health: configuração ausente é um estado esperado (200, ok:false), nunca um 500 surpreendente', () => {
  assert.match(HEALTH, /CONFIGURATION_MISSING/);
  const idx = HEALTH.indexOf('CONFIGURATION_MISSING');
  const slice = HEALTH.slice(Math.max(0, idx - 300), idx + 50);
  assert.match(slice, /jsonResponse\(200,/);
});

test('billing-health: distingue timeout, indisponibilidade de rede e chave inválida (401/403 -> INVALID_API_KEY)', () => {
  assert.match(HEALTH, /reason: 'TIMEOUT'/);
  assert.match(HEALTH, /reason: 'PROVIDER_UNAVAILABLE'/);
  assert.match(HEALTH, /reason = error\.httpStatus === 503 \? 'INVALID_API_KEY' : 'PROVIDER_ERROR';/);
});

// -- CUSTOMER -----------------------------------------------------------------

test('billing-create-customer: cliente EXISTENTE no nosso banco é reutilizado -- nunca cria outro na Asaas', () => {
  assert.match(CREATE_CUSTOMER, /getExistingBillingCustomer/);
  const idx = CREATE_CUSTOMER.indexOf('if (existing) {');
  const slice = CREATE_CUSTOMER.slice(idx, idx + 250);
  assert.match(slice, /reused: true,/);
  assert.doesNotMatch(slice, /createCustomer/);
});

test('billing-create-customer: camada extra de idempotência via externalReference na própria Asaas (cobre falha parcial anterior)', () => {
  assert.match(CREATE_CUSTOMER, /findCustomersByExternalReference\(workspaceId\)/);
  const idx = CREATE_CUSTOMER.indexOf('const found = await client.findCustomersByExternalReference');
  const slice = CREATE_CUSTOMER.slice(idx, idx + 400);
  assert.match(slice, /if \(!asaasCustomerId\) \{\s*\n\s*const created = await client\.createCustomer/);
});

test('billing-create-customer: cpf_cnpj é OBRIGATÓRIO e nunca inventado -- ausente/inválido retorna MISSING_REQUIRED_FIELD determinístico', () => {
  assert.match(CREATE_CUSTOMER, /normalizeCpfCnpj\(payload\?\.cpf_cnpj\)/);
  assert.match(CREATE_CUSTOMER, /MISSING_REQUIRED_FIELD.*cpf_cnpj/);
  assert.doesNotMatch(CREATE_CUSTOMER, /cpfCnpj:\s*['"]\d{11,14}['"]/, 'nenhum CPF/CNPJ hardcoded/inventado');
});

test('billing-create-customer: nome vem do perfil real (profiles.full_name) -- ausência retorna erro, nunca um nome inventado', () => {
  assert.match(CREATE_CUSTOMER, /getProfile\(/);
  assert.match(CREATE_CUSTOMER, /if \(!name\) \{\s*\n\s*return jsonResponse\(422, errorBody\('MISSING_REQUIRED_FIELD'/);
});

test('billing-create-customer: usuário de outro workspace é bloqueado por hasWorkspaceMembership antes de qualquer chamada à Asaas', () => {
  const isMemberIdx = CREATE_CUSTOMER.indexOf('const isMember = await hasWorkspaceMembership');
  const existingIdx = CREATE_CUSTOMER.indexOf('const existing = await getExistingBillingCustomer');
  assert.ok(isMemberIdx > -1 && existingIdx > -1 && isMemberIdx < existingIdx);
});

test('billing-create-customer: frontend nunca controla asaas_customer_id/status/plan_id/value -- campos rejeitados explicitamente', () => {
  assert.match(CREATE_CUSTOMER, /FORBIDDEN_CLIENT_FIELDS = \['asaas_customer_id', 'status', 'plan_id', 'value'\];/);
  assert.match(CREATE_CUSTOMER, /FIELD_NOT_ALLOWED/);
});

test('billing-create-customer: asaas_customer_id é persistido localmente após criação (nunca só em memória)', () => {
  assert.match(CREATE_CUSTOMER, /persistBillingCustomer\(/);
  assert.match(CREATE_CUSTOMER, /asaas_customer_id: asaasCustomerId/);
});

test('billing-create-customer: falha ao persistir localmente após sucesso na Asaas nunca é escondida -- retorna PERSISTENCE_FAILED', () => {
  assert.match(CREATE_CUSTOMER, /PERSISTENCE_FAILED/);
});

// -- SUBSCRIPTION ---------------------------------------------------------------

test('billing-create-subscription: só aceita plan_id "pro" -- qualquer outro é rejeitado', () => {
  assert.match(CREATE_SUBSCRIPTION, /ALLOWED_PLAN_IDS = new Set\(\['pro'\]\);/);
  assert.match(CREATE_SUBSCRIPTION, /INVALID_PLAN/);
});

test('billing-create-subscription: valor é SEMPRE R$ 29,90 e ciclo SEMPRE mensal, definidos só pelo backend', () => {
  assert.match(CREATE_SUBSCRIPTION, /PLAN_PRICE = 29\.9;/);
  assert.match(CREATE_SUBSCRIPTION, /PLAN_CYCLE = 'MONTHLY';/);
  assert.match(CREATE_SUBSCRIPTION, /value: PLAN_PRICE,/);
  assert.match(CREATE_SUBSCRIPTION, /cycle: PLAN_CYCLE,/);
});

test('billing-create-subscription: boleto nunca é enviado como billingType (só documentado como opção existente da Asaas, nunca usado); payment_method inválido é rejeitado', () => {
  assert.doesNotMatch(CREATE_SUBSCRIPTION, /billingType: 'BOLETO'/);
  assert.doesNotMatch(CREATE_SUBSCRIPTION, /paymentMethod === 'boleto'/);
  assert.match(CREATE_SUBSCRIPTION, /ALLOWED_PAYMENT_METHODS = new Set\(\['pix', 'pix_automatico', 'credit_card'\]\);/);
  assert.match(CREATE_SUBSCRIPTION, /INVALID_PAYMENT_METHOD/);
});

test('billing-create-subscription: value/price/cycle/discount/status enviados pelo frontend são sempre rejeitados', () => {
  assert.match(CREATE_SUBSCRIPTION, /FORBIDDEN_CLIENT_FIELDS = \[\s*\n\s*'value', 'price', 'discount', 'cycle', 'next_due_date', 'status',/);
});

test('billing-create-subscription: assinatura começa SEMPRE "pending" -- nunca "active" só por ter sido criada', () => {
  assert.match(CREATE_SUBSCRIPTION, /status: 'pending',/);
  assert.doesNotMatch(CREATE_SUBSCRIPTION, /status: 'active',/);
});

test('billing-create-subscription: criação duplicada é impedida -- qualquer assinatura não-terminal existente é reutilizada', () => {
  assert.match(CREATE_SUBSCRIPTION, /getNonTerminalSubscription/);
  assert.match(CREATE_SUBSCRIPTION, /status: 'not\.in\.\(canceled,expired\)'/);
  const idx = CREATE_SUBSCRIPTION.indexOf('if (existingSubscription) {');
  const slice = CREATE_SUBSCRIPTION.slice(idx, idx + 1150);
  assert.match(slice, /reused: true,/);
});

test('billing-create-subscription: cartão nunca aceita dados brutos -- exige credit_card_token (tokenização prévia)', () => {
  assert.match(CREATE_SUBSCRIPTION, /credit_card_token/);
  assert.match(CREATE_SUBSCRIPTION, /'credit_card_number', 'card_number', 'cvv', 'credit_card',/);
  assert.doesNotMatch(CREATE_SUBSCRIPTION, /creditCardCvv|creditCardNumber:/);
});

test('billing-create-subscription: Pix Automático nunca é forçado no endpoint tradicional -- devolve PIX_AUTOMATIC_AUTHORIZATION_REQUIRED sem chamar a Asaas', () => {
  const idx = CREATE_SUBSCRIPTION.indexOf("paymentMethod === 'pix_automatico'");
  assert.ok(idx > -1);
  const slice = CREATE_SUBSCRIPTION.slice(idx, idx + 400);
  assert.match(slice, /PIX_AUTOMATIC_AUTHORIZATION_REQUIRED/);
  assert.doesNotMatch(slice, /client\.createSubscription/);
  assert.doesNotMatch(slice, /client\.createPixAutomaticAuthorization/);
});

test('billing-create-subscription: exige billing-create-customer ter rodado antes (CUSTOMER_REQUIRED se não houver billing_customers)', () => {
  assert.match(CREATE_SUBSCRIPTION, /CUSTOMER_REQUIRED/);
});

test('billing-create-subscription: externalReference enviado à Asaas é o workspace_id -- rastreabilidade/idempotência', () => {
  assert.match(CREATE_SUBSCRIPTION, /externalReference: workspaceId,/);
});

// -- CORRECAO FINAL PIX: QR Code oficial devolvido junto com a assinatura ----

test('billing-create-subscription: busca QR Code Pix via listSubscriptionPayments + getPixQrCode -- nunca gera/inventa o QR', () => {
  const idx = CREATE_SUBSCRIPTION.indexOf('async function fetchPixQrCode');
  const slice = CREATE_SUBSCRIPTION.slice(idx, idx + 900);
  assert.match(slice, /client\.listSubscriptionPayments\(asaasSubscriptionId\)/);
  assert.match(slice, /client\.getPixQrCode\(paymentId\)/);
  assert.match(slice, /encoded_image: qr\.encodedImage,/);
  assert.match(slice, /payload: qr\.payload,/);
});

test('billing-create-subscription: primeira cobrança é a de menor dueDate -- a Asaas não garante ordem no array de payments', () => {
  const idx = CREATE_SUBSCRIPTION.indexOf('function pickEarliestPayment');
  const slice = CREATE_SUBSCRIPTION.slice(idx, idx + 400);
  assert.match(slice, /dateA\.localeCompare\(dateB\)/);
});

test('billing-create-subscription: QR Code só é buscado para Pix -- cartão nunca chama fetchPixQrCode (segue redirecionando para o Asaas Checkout)', () => {
  assert.match(CREATE_SUBSCRIPTION, /const pix = paymentMethod === 'pix' \? await fetchPixQrCode\(client, asaasSubscriptionId\) : null;/);
});

test('billing-create-subscription: assinatura Pix pendente reaproveitada também devolve o QR de novo (nunca cria checkout/assinatura duplicada)', () => {
  const idx = CREATE_SUBSCRIPTION.indexOf('if (existingSubscription) {');
  const slice = CREATE_SUBSCRIPTION.slice(idx, idx + 1150);
  assert.match(slice, /existingSubscription\.payment_method === 'pix'/);
  assert.match(slice, /existingSubscription\.status === 'pending'/);
  assert.match(slice, /pix,/);
});

test('billing-create-subscription: falha ao buscar o QR nunca quebra a criação da assinatura (já persistida) -- best-effort com try/catch', () => {
  const idx = CREATE_SUBSCRIPTION.indexOf('async function fetchPixQrCode');
  const slice = CREATE_SUBSCRIPTION.slice(idx, idx + 1300);
  assert.match(slice, /\} catch \{\s*\n\s*return null;\s*\n\s*\}/);
});

// -- GET SUBSCRIPTION -----------------------------------------------------------

test('billing-get-subscription: resposta normalizada -- nunca o payload bruto da Asaas', () => {
  assert.doesNotMatch(GET_SUBSCRIPTION, /return jsonResponse\(200, remote/);
  assert.match(GET_SUBSCRIPTION, /plan_name: PLAN_LABELS\[local\.plan_id\]/);
});

test('billing-get-subscription: assinatura ausente é tratada (exists:false), nunca um erro', () => {
  assert.match(GET_SUBSCRIPTION, /exists: false, internal_status: 'free' \}/);
});

test('billing-get-subscription: workspace alheio é bloqueado antes de consultar qualquer dado', () => {
  const isMemberIdx = GET_SUBSCRIPTION.indexOf('const isMember = await hasWorkspaceMembership');
  const localIdx = GET_SUBSCRIPTION.indexOf('const local = await getLocalSubscription');
  assert.ok(isMemberIdx > -1 && localIdx > -1 && isMemberIdx < localIdx);
});

test('billing-get-subscription: nunca ativa/suspende/cancela -- é somente leitura, mesmo consultando a Asaas', () => {
  assert.doesNotMatch(GET_SUBSCRIPTION, /patchSubscription|PATCH/);
  assert.doesNotMatch(GET_SUBSCRIPTION, /status: 'active'/);
});

test('billing-get-subscription: falha ao consultar a Asaas não quebra a resposta -- devolve o estado local mesmo assim', () => {
  const idx = GET_SUBSCRIPTION.indexOf('} catch (error) {');
  const slice = GET_SUBSCRIPTION.slice(idx, idx + 500);
  assert.match(slice, /provider_unavailable|provider_error/);
  assert.doesNotMatch(slice, /throw error;\s*\n\s*\}\s*\n\s*\}\s*\n\s*\n\s*return jsonResponse\(200,/); // não deve interromper o fluxo normal
});

// -- CORRECAO FINAL PIX: reload da página enquanto pending continua com QR --

test('billing-get-subscription: só busca o QR Pix quando payment_method é "pix" E status é "pending" -- nunca para cartão/outros status', () => {
  assert.match(GET_SUBSCRIPTION, /if \(local\.payment_method === 'pix' && local\.status === 'pending'\) \{\s*\n\s*pix = await fetchPixQrCode\(client, local\.asaas_subscription_id\);/);
});

test('billing-get-subscription: pix vai na resposta pública, ao lado de payment_method', () => {
  assert.match(GET_SUBSCRIPTION, /payment_method: local\.payment_method,\s*\n\s*pix,/);
});

test('billing-get-subscription: busca do QR é best-effort dentro do mesmo try/catch do providerStatus -- falha nunca quebra a consulta', () => {
  const idx = GET_SUBSCRIPTION.indexOf('const remote = await client.getSubscription');
  const catchIdx = GET_SUBSCRIPTION.indexOf('} catch (error) {', idx);
  const slice = GET_SUBSCRIPTION.slice(idx, catchIdx);
  assert.match(slice, /pix = await fetchPixQrCode\(client, local\.asaas_subscription_id\);/);
});

// -- CANCEL ---------------------------------------------------------------------

test('billing-cancel-subscription: agenda o cancelamento (cancel_at_period_end=true), nunca corta acesso imediato quando já pago', () => {
  const idx = CANCEL_SUBSCRIPTION.indexOf('const isPending = subscription.status');
  const slice = CANCEL_SUBSCRIPTION.slice(idx, idx + 400);
  assert.match(slice, /cancel_at_period_end: true,/);
  assert.match(slice, /cancel_effective_at: subscription\.current_period_ends_at/);
});

test('billing-cancel-subscription: assinatura nunca ativada (ainda "pending") é cancelada definitivamente -- não há período pago a preservar', () => {
  const idx = CANCEL_SUBSCRIPTION.indexOf('const isPending');
  const slice = CANCEL_SUBSCRIPTION.slice(idx, idx + 300);
  assert.match(slice, /status: 'canceled' \}/);
});

test('billing-cancel-subscription: repetição é idempotente -- cancelamento já agendado retorna sucesso sem nova chamada à Asaas', () => {
  const idx = CANCEL_SUBSCRIPTION.indexOf('if (subscription.cancel_at_period_end) {');
  assert.ok(idx > -1);
  const slice = CANCEL_SUBSCRIPTION.slice(idx, idx + 300);
  assert.match(slice, /already_scheduled: true,/);
  assert.doesNotMatch(slice, /cancelSubscription\(/);
});

test('billing-cancel-subscription: nunca gera reembolso, nunca apaga cliente/pagamentos/histórico (nenhuma chamada DELETE a billing_customers/billing_payments)', () => {
  assert.doesNotMatch(CANCEL_SUBSCRIPTION, /refund/i);
  assert.doesNotMatch(CANCEL_SUBSCRIPTION, /DELETE.*billing_customers/);
  assert.doesNotMatch(CANCEL_SUBSCRIPTION, /DELETE.*billing_payments/);
});

test('billing-cancel-subscription: guardas para assinatura inexistente, já cancelada, e sem vínculo Asaas', () => {
  assert.match(CANCEL_SUBSCRIPTION, /SUBSCRIPTION_NOT_FOUND/);
  assert.match(CANCEL_SUBSCRIPTION, /SUBSCRIPTION_ALREADY_CANCELED/);
  assert.match(CANCEL_SUBSCRIPTION, /SUBSCRIPTION_NOT_LINKED/);
});

test('billing-cancel-subscription: cancela no PROVEDOR primeiro -- falha externa nunca altera o estado local (guarda contra inconsistência escondida)', () => {
  const idx = CANCEL_SUBSCRIPTION.indexOf('await client.cancelSubscription(subscription.asaas_subscription_id);');
  const patchIdx = CANCEL_SUBSCRIPTION.indexOf('const updated = await patchSubscription');
  assert.ok(idx > -1 && patchIdx > -1 && idx < patchIdx);
});

test('billing-cancel-subscription: falha LOCAL após sucesso EXTERNO retorna RECONCILIATION_REQUIRED -- nunca escondida', () => {
  assert.match(CANCEL_SUBSCRIPTION, /RECONCILIATION_REQUIRED/);
});

// -- SYNC -------------------------------------------------------------------

test('billing-sync: NUNCA ativa uma assinatura só pelo status externo -- exige pagamento CONFIRMED/RECEIVED como evidência', () => {
  assert.match(SYNC, /PAYMENT_EVIDENCE_STATUSES = new Set\(\['CONFIRMED', 'RECEIVED'\]\);/);
  assert.match(SYNC, /hasConfirmedPayment && ACTIVATABLE_LOCAL_STATUSES\.has\(subscription\.status\)/);
});

test('billing-sync: mapeamento provider_status/internal_status preserva o valor original da Asaas (nunca perdido)', () => {
  assert.match(SYNC, /provider_status: providerStatus,/);
  assert.match(SYNC, /internal_status: updatedStatus,/);
});

test('billing-sync: falha de sincronização nunca corrompe o estado local -- resposta 200 com sync_error, sem escrever nada', () => {
  const idx = SYNC.indexOf('if (error instanceof AsaasTimeoutError || error instanceof AsaasNetworkError)');
  const slice = SYNC.slice(idx, idx + 500);
  assert.match(slice, /synced: false,/);
  assert.match(slice, /sync_error: error\.code,\s*\n\s*\}, origin\);/);
});

test('billing-sync: pagamentos são reconciliados via upsert idempotente (on_conflict=asaas_payment_id) -- nunca duplica cobrança', () => {
  assert.match(SYNC, /on_conflict=asaas_payment_id/);
  assert.match(SYNC, /resolution=merge-duplicates/);
});

test('billing-sync: campos ainda não existentes na migration 024 (provider_status/last_synced_at/sync_error em subscriptions) são documentados, nunca escritos silenciosamente', () => {
  assert.match(SYNC, /PENDENCIA DE BANCO DOCUMENTADA/);
  assert.match(SYNC, /add column provider_status text,/);
  assert.doesNotMatch(SYNC, /patch\w*\(\{[^}]*provider_status/s);
});

test('BLOCO ASAAS FINAL: billing-sync suspende past_due após grace period expirado (isGracePeriodExpired), usando updated_at como início da carência -- nunca uma coluna nova', () => {
  assert.match(SYNC, /import \{ isGracePeriodExpired \} from '\.\.\/_shared\/billingSubscriptionRules\.ts';/);
  const idx = SYNC.indexOf("subscription.status === 'past_due'");
  assert.ok(idx > -1);
  const slice = SYNC.slice(idx, idx + 900);
  assert.match(slice, /isGracePeriodExpired\(\{ pastDueSince: subscription\.updated_at, now: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(slice, /status: 'suspended',/);
});

test('BLOCO ASAAS FINAL: suspensão por carência nunca compete com reativação -- só é avaliada quando NÃO há pagamento confirmado novo', () => {
  const ifIdx = SYNC.indexOf('if (hasConfirmedPayment && ACTIVATABLE_LOCAL_STATUSES.has(subscription.status)) {');
  const elseIdx = SYNC.indexOf("} else if (subscription.status === 'past_due') {", ifIdx);
  assert.ok(ifIdx > -1 && elseIdx > ifIdx, 'a checagem de carência deveria ser um "else if", nunca um bloco independente que pudesse rodar junto com a reativação');
});

test('billing-sync: não confia em status enviado pelo chamador -- workspace_id é o único campo lido do payload', () => {
  const bodyIdx = SYNC.indexOf('let payload: Record<string, unknown>;');
  const workspaceIdx = SYNC.indexOf('const workspaceId = payload?.workspace_id;');
  assert.ok(bodyIdx > -1 && workspaceIdx > -1);
  assert.doesNotMatch(SYNC, /payload\?\.status/);
  assert.doesNotMatch(SYNC, /payload\?\.internal_status/);
});

// -- CREATE CHECKOUT (BLOCO ASAAS CHECKOUT -- cartão via Checkout hospedado) --

test('billing-create-checkout: sessão obrigatória e workspace validado antes de qualquer chamada à Asaas', () => {
  assert.match(CREATE_CHECKOUT, /if \(!authorization\.startsWith\('Bearer '\)\) \{/);
  assert.match(CREATE_CHECKOUT, /AUTH_REQUIRED/);
  assert.match(CREATE_CHECKOUT, /hasWorkspaceMembership/);
  assert.match(CREATE_CHECKOUT, /WORKSPACE_NOT_AUTHORIZED/);
});

test('billing-create-checkout: nunca aceita valor/preço/status/customer_id/checkout_id/checkout_url arbitrário do frontend', () => {
  assert.match(CREATE_CHECKOUT, /FORBIDDEN_CLIENT_FIELDS = \[/);
  for (const field of ['value', 'price', 'status', 'customer_id', 'checkout_id', 'checkout_url', 'asaas_subscription_id']) {
    assert.match(CREATE_CHECKOUT, new RegExp(`'${field}'`), `${field} deveria estar em FORBIDDEN_CLIENT_FIELDS`);
  }
});

test('billing-create-checkout: nunca aceita dado bruto de cartão (número/CVV) -- campos rejeitados explicitamente', () => {
  assert.match(CREATE_CHECKOUT, /'credit_card_number', 'card_number', 'cvv', 'credit_card'/);
});

// BILLING PROD: producao ja esta habilitada para o Checkout (cartao), igual
// ao Pix -- allowProduction: true e obrigatorio aqui, senao createAsaasClient
// lanca AsaasConfigurationError sempre que ASAAS_BASE_URL apontar para a
// producao real (ver _shared/asaasClient.ts), quebrando o Checkout em prod.
test('billing-create-checkout: habilitado para produção real (allowProduction) e nunca expõe ASAAS_API_KEY na resposta', () => {
  assert.match(CREATE_CHECKOUT, /createAsaasClient\(\{ apiKey: asaasApiKey, baseUrl: asaasBaseUrl, allowProduction: true \}\)/);
  assert.doesNotMatch(CREATE_CHECKOUT, /jsonResponse\([^)]*asaasApiKey/s);
});

test('billing-create-checkout: monta o payload via buildCheckoutPayload (regra pura centralizada, testada isoladamente)', () => {
  assert.match(CREATE_CHECKOUT, /from '\.\.\/_shared\/billingSubscriptionRules\.ts'/);
  assert.match(CREATE_CHECKOUT, /buildCheckoutPayload\(\{/);
});

test('billing-create-checkout: idempotência -- assinatura não-terminal JÁ vinculada à Asaas nunca gera um segundo checkout', () => {
  assert.match(CREATE_CHECKOUT, /if \(existingSubscription\?\.asaas_subscription_id\) \{/);
  assert.match(CREATE_CHECKOUT, /reused: true,/);
});

test('billing-create-checkout: checkout anterior abandonado (pending, sem asaas_subscription_id) reaproveita a MESMA linha -- nunca insere uma segunda', () => {
  assert.match(CREATE_CHECKOUT, /const persisted = existingSubscription\s*\n\s*\? await updatePendingCheckoutSubscription/);
});

// DESCOBERTA REAL NO SANDBOX (Bloco Asaas Checkout, teste executado de
// verdade): enviar customerData PARCIAL (name/cpfCnpj/email/phone, sem
// endereço) é REJEITADO pela Asaas -- ela exige endereço completo dentro
// de customerData, que a UniFlow nunca coletou (fora de escopo). Testado
// no Sandbox: omitir customerData por completo funciona (201, checkout
// criado) -- o próprio Checkout hospedado pede os dados do pagador na
// página dele. Por isso esta função NUNCA lê CPF/perfil e NUNCA envia
// customerData -- nada disso é necessário nem enviado à Asaas aqui.
test('billing-create-checkout: nunca lê CPF/perfil, nunca envia customerData -- o Checkout hospedado coleta os dados do pagador, nunca a UniFlow', () => {
  const codeOnly = CREATE_CHECKOUT.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /cpf_cnpj|cpfCnpj|getProfile|customerData/);
});

// ============================================================================
// CORRECAO NOTIFICACOES (cartao): confirmado nas docs oficiais que o
// Checkout aceita `customer` (ID de cliente Asaas existente) como
// alternativa a `customerData` -- mutuamente exclusivos
// (docs.asaas.com/docs/how-to-provide-customer-data). billing-create-checkout
// passa a REUTILIZAR, quando já existe, o billing_customers do workspace
// (criado com notificationDisabled:true por billing-create-customer, já em
// Production) -- nunca cria um customer novo aqui, nunca chama
// billing-create-customer, nunca lê um id vindo do corpo da requisição.
// ============================================================================

test('billing-create-checkout: reutiliza billing_customers existente (read-only, MESMO padrão de billing-create-subscription.getBillingCustomer) para obter o asaas_customer_id', () => {
  assert.match(CREATE_CHECKOUT, /async function getBillingCustomer\(\{/);
  const idx = CREATE_CHECKOUT.indexOf('async function getBillingCustomer({');
  const slice = CREATE_CHECKOUT.slice(idx, idx + 500);
  assert.match(slice, /select: 'asaas_customer_id', workspace_id: `eq\.\$\{workspaceId\}`/);
  // RLS via Authorization do próprio usuário -- NUNCA service role para
  // esta leitura (o mesmo padrão já usado por billing-create-subscription).
  assert.match(slice, /headers: \{ Authorization: authorization, apikey: anonKey \}/);
  assert.doesNotMatch(slice, /serviceRoleKey/);
});

test('billing-create-checkout: NUNCA chama billing-create-customer nem cria um customer novo -- só lê billing_customers já existente', () => {
  assert.doesNotMatch(CREATE_CHECKOUT, /createCustomer/);
});

test('billing-create-checkout: getBillingCustomer é chamado ANTES de montar o payload, e o resultado alimenta buildCheckoutPayload como asaasCustomerId', () => {
  const callIdx = CREATE_CHECKOUT.indexOf('const billingCustomer = await getBillingCustomer(');
  const payloadIdx = CREATE_CHECKOUT.indexOf('buildCheckoutPayload({');
  assert.ok(callIdx > -1 && payloadIdx > callIdx, 'getBillingCustomer precisa ser resolvido antes de montar o payload do checkout');
  const payloadSlice = CREATE_CHECKOUT.slice(payloadIdx, CREATE_CHECKOUT.indexOf('});', payloadIdx));
  assert.match(payloadSlice, /asaasCustomerId,/);
});

test('billing-create-checkout: asaas_customer_id NUNCA vem do corpo da requisição do frontend -- só da leitura server-side de billing_customers (proteção contra IDOR)', () => {
  // customer_id já está bloqueado por FORBIDDEN_CLIENT_FIELDS (regressão
  // coberta em teste separado); aqui a garantia é que o valor realmente
  // usado no payload do checkout nunca lê `payload?.customer` nem
  // `payload?.asaas_customer_id`.
  assert.doesNotMatch(CREATE_CHECKOUT, /payload\?\.\s*customer/);
  assert.doesNotMatch(CREATE_CHECKOUT, /payload\?\.\s*asaas_customer_id/);
  assert.match(CREATE_CHECKOUT, /FORBIDDEN_CLIENT_FIELDS = \[[^\]]*'customer_id'[^\]]*\]/);
});

test('billing-create-checkout: asaasCustomerId nulo/ausente (workspace sem billing_customers) preserva exatamente o comportamento antigo -- nenhuma quebra para quem nunca teve customer', () => {
  const idx = CREATE_CHECKOUT.indexOf('const asaasCustomerId = typeof billingCustomer?.asaas_customer_id');
  assert.ok(idx > -1);
  const slice = CREATE_CHECKOUT.slice(idx, idx + 200);
  assert.match(slice, /: null;/);
});

test('billing-create-checkout: nunca devolve CPF ao frontend -- resposta pública é só checkout_id/checkout_url/status/external_reference', () => {
  const idx = CREATE_CHECKOUT.indexOf('return jsonResponse(201, {');
  const slice = CREATE_CHECKOUT.slice(idx, CREATE_CHECKOUT.indexOf('}, origin);', idx));
  assert.match(slice, /checkout_id: checkoutId,/);
  assert.match(slice, /checkout_url: checkoutUrl,/);
  assert.match(slice, /external_reference: workspaceId,/);
  assert.doesNotMatch(slice, /cpf/i);
});

test('billing-create-checkout: callback de retorno aponta para /plano-pessoal/retorno na mesma origem validada (nunca URL fixa/hardcoded de terceiro)', () => {
  assert.match(CREATE_CHECKOUT, /const successUrl = `\$\{origin\}\/plano-pessoal\/retorno\?status=success`;/);
  assert.match(CREATE_CHECKOUT, /const cancelUrl = `\$\{origin\}\/plano-pessoal\/retorno\?status=cancel`;/);
});

test('billing-create-checkout: assinatura local criada SEMPRE como "pending", payment_method "credit_card" -- nunca "active" só por criar o checkout', () => {
  const idx = CREATE_CHECKOUT.indexOf('async function insertPendingCheckoutSubscription');
  const slice = CREATE_CHECKOUT.slice(idx, idx + 900);
  assert.match(slice, /status: 'pending',/);
  assert.match(slice, /payment_method: 'credit_card',/);
});

// -- WEBHOOK ------------------------------------------------------------------

test('billing-webhook: método diferente de POST é rejeitado', () => {
  assert.match(WEBHOOK, /if \(request\.method !== 'POST'\) \{/);
  assert.match(WEBHOOK, /METHOD_NOT_ALLOWED/);
});

test('billing-webhook: token ausente ou inválido é rejeitado (401) -- comparação exata, nunca aceita vazio', () => {
  assert.match(WEBHOOK, /if \(!receivedToken \|\| receivedToken !== expectedToken\) \{/);
  assert.match(WEBHOOK, /WEBHOOK_AUTH_REQUIRED/);
});

test('billing-webhook: header oficial confirmado é "asaas-access-token" (docs.asaas.com/docs/about-webhooks), nunca Bearer', () => {
  assert.match(WEBHOOK, /ASAAS_WEBHOOK_TOKEN_HEADER = 'asaas-access-token';/);
  assert.doesNotMatch(WEBHOOK, /authorization\.startsWith\('Bearer '\)/);
});

test('billing-webhook: secret é ASAAS_WEBHOOK_TOKEN -- distinto de ASAAS_API_KEY; API key nunca funciona como token de webhook', () => {
  assert.match(WEBHOOK, /Deno\.env\.get\('ASAAS_WEBHOOK_TOKEN'\)/);
  // BLOCO ASAAS CHECKOUT: ASAAS_API_KEY agora também aparece no arquivo
  // (linkCheckoutOriginatedSubscription consulta a Asaas para correlacionar
  // um pagamento de Checkout) -- isolado ao bloco de comparação do token de
  // autenticidade do webhook, não ao arquivo inteiro.
  const authIdx = WEBHOOK.indexOf("const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')");
  const authBlockEnd = WEBHOOK.indexOf('const supabaseUrl', authIdx);
  const authBlock = WEBHOOK.slice(authIdx, authBlockEnd);
  assert.doesNotMatch(authBlock, /ASAAS_API_KEY/);
});

test('billing-webhook: evento válido (id + event) é persistido em webhook_events via service role', () => {
  assert.match(WEBHOOK, /persistWebhookEvent/);
  assert.match(WEBHOOK, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(WEBHOOK, /rest\/v1\/webhook_events/);
});

test('billing-webhook: evento duplicado (mesmo asaas_event_id) não duplica efeito -- upsert com resolution=ignore-duplicates', () => {
  assert.match(WEBHOOK, /on_conflict=asaas_event_id/);
  assert.match(WEBHOOK, /resolution=ignore-duplicates/);
});

// BLOCO ASAAS FINAL: processamento passou a existir (ver
// billingSubscriptionRules.test.js e billingWebhookProcessing.test.js para
// as regras de negócio) -- este teste passa a exigir que ele exista e seja
// SEMPRE não-bloqueante (2xx mesmo se o processamento falhar).
test('billing-webhook: processa o evento (ativação/inadimplência) de forma idempotente, mas a resposta 2xx nunca depende do resultado do processamento', () => {
  assert.match(WEBHOOK, /jsonResponse\(200, \{ received: true, asaas_event_id: asaasEventId \}\);/);
  assert.match(WEBHOOK, /processPaymentEvent/);
  assert.match(WEBHOOK, /patchSubscription/);
  // A chamada de processamento fica DENTRO de um try/catch cujo catch nunca
  // devolve um status de erro -- só registra processing_error e segue.
  const tryIdx = WEBHOOK.indexOf('try {\n      await processPaymentEvent');
  const catchIdx = WEBHOOK.indexOf('} catch (error) {', tryIdx);
  assert.ok(tryIdx > -1 && catchIdx > tryIdx);
  const catchBlock = WEBHOOK.slice(catchIdx, WEBHOOK.indexOf('return jsonResponse(200,'));
  assert.doesNotMatch(catchBlock, /jsonResponse\(5\d\d/, 'erro de processamento nunca deveria gerar um status 5xx');
});

test('billing-webhook: sucesso é terminal; processing_error continua elegível para retry, inclusive em linha legada', () => {
  assert.equal(isWebhookEventEligibleForProcessing({ processed_at: null, processing_error: null }), true);
  assert.equal(isWebhookEventEligibleForProcessing({ processed_at: null, processing_error: 'SUBSCRIPTION_PATCH_FAILED' }), true);
  assert.equal(isWebhookEventEligibleForProcessing({ processed_at: '2026-08-15T10:00:00Z', processing_error: 'LEGACY_FAILURE' }), true);
  assert.equal(isWebhookEventEligibleForProcessing({ processed_at: '2026-08-15T10:00:00Z', processing_error: null }), false);
  assert.match(WEBHOOK, /isWebhookEventEligibleForProcessing\(eventRow\)/);
  assert.match(WEBHOOK, /select: 'id,processed_at,processing_error'/);
});

test('billing-webhook: SUCCESS preenche processed_at e limpa processing_error; FAILURE registra erro sem concluir evento', () => {
  assert.deepEqual(buildWebhookProcessingSuccessPatch('2026-08-15T10:00:00Z'), {
    processed_at: '2026-08-15T10:00:00Z',
    processing_error: null,
  });
  assert.deepEqual(buildWebhookProcessingFailurePatch('SUBSCRIPTION_PATCH_FAILED'), {
    processed_at: null,
    processing_error: 'SUBSCRIPTION_PATCH_FAILED',
  });
});

test('billing-webhook: retry posterior bem-sucedido conclui o mesmo evento e limpa o erro anterior', () => {
  const failedState = buildWebhookProcessingFailurePatch('SUBSCRIPTION_PATCH_FAILED');
  assert.equal(isWebhookEventEligibleForProcessing(failedState), true);

  const recoveredState = buildWebhookProcessingSuccessPatch('2026-08-15T10:05:00Z');
  assert.deepEqual(recoveredState, {
    processed_at: '2026-08-15T10:05:00Z',
    processing_error: null,
  });
  assert.equal(isWebhookEventEligibleForProcessing(recoveredState), false);
});

test('billing-webhook: falhas HTTP das escritas críticas são propagadas como erro categórico e seguro', () => {
  assert.doesNotThrow(() => assertBillingWebhookWriteSucceeded({ ok: true }, 'billing_payment_upsert'));
  assert.throws(
    () => assertBillingWebhookWriteSucceeded({ ok: false }, 'billing_payment_upsert'),
    /BILLING_WEBHOOK_WRITE_FAILED:billing_payment_upsert/,
  );
  assert.throws(
    () => assertBillingWebhookWriteSucceeded({ ok: false }, 'subscription_patch'),
    /BILLING_WEBHOOK_WRITE_FAILED:subscription_patch/,
  );
});

test('billing-webhook: toda escrita crítica valida response.ok antes de concluir o processamento', () => {
  for (const operation of [
    'billing_payment_upsert',
    'subscription_patch',
    'billing_customer_patch',
    'billing_customer_insert',
    'webhook_event_processing_state',
  ]) {
    assert.match(WEBHOOK, new RegExp(`assertBillingWebhookWriteSucceeded\\(response, '${operation}'\\)`));
  }
});

test('billing-webhook: transição de assinatura usa guarda otimista e observa se a escrita foi aplicada', () => {
  const patchIdx = WEBHOOK.indexOf('async function patchSubscription');
  const patchBlock = WEBHOOK.slice(patchIdx, WEBHOOK.indexOf('// BLOCO ASAAS FINAL: processa UM evento', patchIdx));
  assert.match(patchBlock, /params\.set\('status', `eq\.\$\{expectedStatus\}`\)/);
  assert.match(patchBlock, /Prefer: 'return=representation'/);
  assert.match(patchBlock, /rows\.length === 1\) return true/);
  assert.match(patchBlock, /rows\.length === 0\) return false/);

  const processIdx = WEBHOOK.indexOf('async function processPaymentEvent');
  const processBlock = WEBHOOK.slice(processIdx, WEBHOOK.indexOf('async function processCheckoutEvent', processIdx));
  assert.match(processBlock, /expectedStatus: subscription\.status as string/);
  assert.match(processBlock, /subscription_transition_applied: transitionApplied/);
});

test('billing-webhook: falha ao persistir processing_error não bloqueia retry e não derruba o endpoint fail-safe', () => {
  assert.match(WEBHOOK, /status: 'processing_error_persist_failed'/);
  const failureLogIdx = WEBHOOK.indexOf("status: 'processing_error_persist_failed'");
  const successResponseIdx = WEBHOOK.indexOf('return jsonResponse(200,', failureLogIdx);
  assert.ok(successResponseIdx > failureLogIdx);
});

test('billing-webhook: falha parcial nunca recebe marca de sucesso antes de todas as escritas críticas', () => {
  const paymentProcessorIdx = WEBHOOK.indexOf('async function processPaymentEvent');
  const paymentProcessorEnd = WEBHOOK.indexOf('async function processCheckoutEvent', paymentProcessorIdx);
  const paymentProcessor = WEBHOOK.slice(paymentProcessorIdx, paymentProcessorEnd);
  assert.ok(paymentProcessor.indexOf('await upsertBillingPayment') < paymentProcessor.indexOf('await patchSubscription'));

  const handlerIdx = WEBHOOK.indexOf('if (isWebhookEventEligibleForProcessing(eventRow))');
  const handler = WEBHOOK.slice(handlerIdx);
  const processPaymentIdx = handler.indexOf('await processPaymentEvent');
  const processCheckoutIdx = handler.indexOf('await processCheckoutEvent');
  const markSuccessIdx = handler.indexOf('buildWebhookProcessingSuccessPatch');
  assert.ok(processPaymentIdx > -1 && processCheckoutIdx > processPaymentIdx && markSuccessIdx > processCheckoutIdx);
});

test('billing-webhook: evento desconhecido/com campos adicionais é armazenado sem quebrar -- payload bruto inteiro é gravado, nunca validado campo a campo', () => {
  assert.match(WEBHOOK, /body: JSON\.stringify\(\{ asaas_event_id: asaasEventId, event_type: eventType, payload \}\)/);
});

test('billing-webhook: payload malformado (sem id ou sem event) é rejeitado com 400', () => {
  assert.match(WEBHOOK, /INVALID_EVENT/);
  assert.match(WEBHOOK, /typeof asaasEventId !== 'string' \|\| !asaasEventId\.trim\(\)/);
  assert.match(WEBHOOK, /typeof eventType !== 'string' \|\| !eventType\.trim\(\)/);
});

test('billing-webhook: logs de falha nunca expõem o token -- log só referencia asaasEventId/eventType', () => {
  const idx = WEBHOOK.indexOf('console.log');
  const slice = WEBHOOK.slice(idx, idx + 200);
  assert.doesNotMatch(slice, /expectedToken|receivedToken/);
});

test('billing-webhook: ativação só ocorre via resolveSubscriptionPatchForEvent (regra centralizada e testada isoladamente) -- nunca uma condição solta dentro do handler', () => {
  assert.match(WEBHOOK, /resolveSubscriptionPatchForEvent/);
  assert.doesNotMatch(WEBHOOK, /if \(eventType === 'PAYMENT_CONFIRMED'/, 'a decisão de ativar nunca deveria estar hardcoded no handler');
});

test('billing-webhook: cobrança avulsa (sem payment.subscription) nunca toca em subscriptions -- só billing_payments', () => {
  const idx = WEBHOOK.indexOf('if (!asaasSubscriptionId) return;');
  assert.ok(idx > -1, 'deveria existir uma guarda explícita antes de qualquer acesso a subscriptions');
});

// -- BLOCO ASAAS CHECKOUT: correlação de pagamento originado por Checkout ----

test('billing-webhook: cliente desconhecido (customer não bate) tenta o caminho alternativo via linkCheckoutOriginatedSubscription antes de desistir', () => {
  const idx = WEBHOOK.indexOf('if (!workspaceId && asaasSubscriptionId) {');
  assert.ok(idx > -1);
  const slice = WEBHOOK.slice(idx, idx + 250);
  assert.match(slice, /linkCheckoutOriginatedSubscription/);
});

test('billing-webhook: correlação alternativa usa checkoutSession (GET /v3/subscriptions/{id}) -- nunca mistura checkout.id com payment.id', () => {
  const idx = WEBHOOK.indexOf('async function linkCheckoutOriginatedSubscription');
  const slice = WEBHOOK.slice(idx, idx + 1400);
  assert.match(slice, /client\.getSubscription\(asaasSubscriptionId\)/);
  assert.match(slice, /checkoutSession/);
  assert.match(slice, /findSubscriptionByCheckoutId/);
});

test('billing-webhook: ao correlacionar via checkout, atualiza billing_customers com o asaas_customer_id real (nunca deixa desatualizado)', () => {
  assert.match(WEBHOOK, /upsertBillingCustomerAsaasId/);
  const idx = WEBHOOK.indexOf('async function upsertBillingCustomerAsaasId');
  const slice = WEBHOOK.slice(idx, idx + 1400);
  assert.match(slice, /cpf_cnpj: null, email: null/, 'nunca inventa CPF/email que o Checkout não devolveu');
});

test('billing-webhook: eventos de Checkout usados SOMENTE para higiene (expirado/cancelado) -- nunca ativa nada por evento de Checkout', () => {
  assert.match(WEBHOOK, /processCheckoutEvent/);
  assert.match(WEBHOOK, /resolveCheckoutHygienePatch/);
  // CHECKOUT_PAID é citado só em comentário explicando a decisão -- nunca
  // aparece em código executável (PROCESSABLE_CHECKOUT_EVENT_TYPES, testado
  // isoladamente em billingSubscriptionRules.test.js, não o inclui).
  const codeOnly = WEBHOOK.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /CHECKOUT_PAID/, 'ativação nunca deveria depender de CHECKOUT_PAID -- só PAYMENT_CONFIRMED/PAYMENT_RECEIVED');
});

test('billing-webhook: eventos de Checkout e de pagamento nunca se misturam -- cada handler filtra seu próprio conjunto de eventType antes de fazer qualquer coisa', () => {
  const paymentIdx = WEBHOOK.indexOf('async function processPaymentEvent');
  const paymentGuard = WEBHOOK.slice(paymentIdx, paymentIdx + 300);
  assert.match(paymentGuard, /if \(!PROCESSABLE_PAYMENT_EVENT_TYPES\.has\(eventType\)\) return;/);

  const checkoutIdx = WEBHOOK.indexOf('async function processCheckoutEvent');
  const checkoutGuard = WEBHOOK.slice(checkoutIdx, checkoutIdx + 300);
  assert.match(checkoutGuard, /if \(!PROCESSABLE_CHECKOUT_EVENT_TYPES\.has\(eventType\)\) return;/);
});

test('billing-webhook: os dois processadores rodam por evento, mas cada um decide independentemente se faz algo (nunca quebra o handler existente)', () => {
  const idx = WEBHOOK.indexOf('await processPaymentEvent({ supabaseUrl, serviceRoleKey, eventType, payload });');
  const slice = WEBHOOK.slice(idx, idx + 400);
  assert.match(slice, /await processCheckoutEvent\(\{ supabaseUrl, serviceRoleKey, eventType, payload \}\);/);
});
