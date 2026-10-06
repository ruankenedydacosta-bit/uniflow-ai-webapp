// BILLING2 (Bloco Asaas 2): billingService agora chama as Edge Functions
// reais criadas neste bloco -- nunca a API da Asaas diretamente, nunca
// conhece a API key, nunca define valor/plano (isso e 100% decidido pelo
// backend, ver as Edge Functions em supabase/functions/billing-*).
// BLOCO FINAL DO MVP: o botao real de assinatura (PersonalPlanPage.jsx)
// agora chama createCustomer/createSubscription daqui de verdade -- ver
// SubscriptionMethodModal em personal-plan/PersonalPlanPage.jsx.
//
// Fabrica testavel (createBillingService), mesmo padrao ja usado por
// createUniLlmProvider() (uni-llm/uniLlmProvider.js) -- aceita
// supabase/supabaseUrl/supabaseAnonKey/fetchImpl como parametros para que
// os testes injetem um fetch mockado, sem chamada de rede real.
//
// Contrato (mudou do Bloco Asaas 1): cada metodo RESOLVE sempre com
// { data, error } -- nunca lanca -- seguindo o mesmo padrao ja usado por
// uniLlmProvider.generateResponse(), o precedente do projeto para "chamar
// uma Edge Function e devolver o resultado normalizado para o chamador
// decidir o que fazer". `error` e sempre { code, message } quando
// presente; `data` e o corpo normalizado da resposta quando `error` e nulo.

import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './supabaseClient.js';

// BLOCO FINAL DO MVP (Histórico de pagamentos): `billing_payments` é
// escrita 100% pelo backend (billing-webhook, service role) -- a leitura do
// cliente é uma consulta direta protegida por RLS
// (billing_payments_select_active_member, migration 024), o mesmo padrão já
// usado por outras leituras deste projeto (workspaceService.js,
// transactionService.js). Nunca consulta a Asaas diretamente.
const PAYMENT_FIELDS =
  'id, asaas_payment_id, asaas_subscription_id, status, billing_type, value, due_date, paid_at, invoice_url, created_at';

export function createBillingService({
  supabase: supabaseClient,
  supabaseUrl: baseUrl,
  supabaseAnonKey: anonKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  async function getAccessToken() {
    if (!supabaseClient) return null;
    try {
      const { data } = await supabaseClient.auth.getSession();
      return data?.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  async function invokeBillingFunction(functionName, body) {
    if (!supabaseClient || !baseUrl || !anonKey || !fetchImpl) {
      return { data: null, error: { code: 'BACKEND_NOT_CONFIGURED', message: 'billing_unavailable' } };
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { data: null, error: { code: 'UNAUTHORIZED', message: 'billing_auth_required' } };
    }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      return { data: null, error: { code: 'NETWORK', message: 'billing_request_failed' } };
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return { data: null, error: { code: 'PARSE_ERROR', message: 'billing_bad_response' } };
    }

    if (!response.ok) {
      return {
        data: null,
        error: payload?.error ?? { code: 'REQUEST_FAILED', message: 'billing_request_rejected' },
      };
    }

    return { data: payload, error: null };
  }

  return {
    createCustomer({ workspaceId, cpfCnpj, email, mobilePhone } = {}) {
      return invokeBillingFunction('billing-create-customer', {
        workspace_id: workspaceId,
        cpf_cnpj: cpfCnpj,
        email,
        mobile_phone: mobilePhone,
      });
    },
    // tierId: nível escolhido (essencial, uni_voz, uni_voz_plus). O preço é
    // lido do banco pela Edge Function, nunca enviado daqui.
    createSubscription({ workspaceId, planId, tierId, paymentMethod, creditCardToken } = {}) {
      return invokeBillingFunction('billing-create-subscription', {
        workspace_id: workspaceId,
        plan_id: planId,
        tier_id: tierId,
        payment_method: paymentMethod,
        credit_card_token: creditCardToken,
      });
    },
    // BLOCO ASAAS CHECKOUT: cartao de credito via Asaas Checkout hospedado --
    // nunca um checkout proprio, nunca coleta numero/validade/CVV aqui.
    // Nunca envia CPF/nome/endereco -- o proprio Checkout hospedado da
    // Asaas coleta os dados do pagador na pagina dele (Asaas rejeita
    // customerData parcial sem endereco, que a UniFlow nunca coletou --
    // ver comentario em billing-create-checkout/index.ts). Devolve
    // { checkout_id, checkout_url, status, external_reference } -- o
    // chamador so precisa redirecionar para checkout_url.
    createCheckout({ workspaceId, tierId } = {}) {
      return invokeBillingFunction('billing-create-checkout', {
        workspace_id: workspaceId,
        tier_id: tierId,
      });
    },
    // Épico #116: troca de plano. Descer vale na próxima cobrança; subir
    // devolve o Pix da diferença e o plano novo vale assim que ele é pago.
    changePlan({ workspaceId, tierId } = {}) {
      return invokeBillingFunction('billing-change-plan', { workspace_id: workspaceId, tier_id: tierId });
    },
    cancelSubscription({ workspaceId } = {}) {
      return invokeBillingFunction('billing-cancel-subscription', { workspace_id: workspaceId });
    },
    getSubscription({ workspaceId } = {}) {
      return invokeBillingFunction('billing-get-subscription', { workspace_id: workspaceId });
    },
    syncSubscription({ workspaceId } = {}) {
      return invokeBillingFunction('billing-sync', { workspace_id: workspaceId });
    },
    // BLOCO FINAL DO MVP (Histórico de pagamentos): lista real de
    // `billing_payments` do workspace, mais recente primeiro. RLS
    // (`is_workspace_member`) já isola por workspace -- o `.eq` abaixo é
    // defesa em profundidade, mesmo padrão de outras leituras do projeto.
    async listPayments({ workspaceId, limit = 50 } = {}) {
      if (!supabaseClient) {
        return { data: null, error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'billing_unavailable' } };
      }
      if (!workspaceId) {
        return { data: [], error: null };
      }

      const { data, error } = await supabaseClient
        .from('billing_payments')
        .select(PAYMENT_FIELDS)
        .eq('workspace_id', workspaceId)
        .order('due_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return { data: null, error: { code: 'PAYMENTS_QUERY_FAILED', message: 'billing_payments_unavailable' } };
      }
      return { data: data ?? [], error: null };
    },
    // BILLING2: metodo novo (nao previsto no contrato original do Bloco 1),
    // adicionado por ser compativel com a arquitetura -- ver Parte 11 da
    // tarefa ("healthCheck(), se compatível com a arquitetura").
    healthCheck() {
      return invokeBillingFunction('billing-health', {});
    },
  };
}

// Instancia real, usada pelo resto do app -- construida uma unica vez a
// partir do client Supabase singleton (mesmo padrao de useUniLlm.js).
// isSupabaseConfigured=false (sem .env) resolve para supabase=null, e
// invokeBillingFunction ja trata isso como BACKEND_NOT_CONFIGURED.
const defaultBillingService = createBillingService({
  supabase: isSupabaseConfigured ? supabase : null,
  supabaseUrl,
  supabaseAnonKey,
});

export const createCustomer = defaultBillingService.createCustomer;
export const createSubscription = defaultBillingService.createSubscription;
export const createCheckout = defaultBillingService.createCheckout;
export const changePlan = defaultBillingService.changePlan;
export const cancelSubscription = defaultBillingService.cancelSubscription;
export const getSubscription = defaultBillingService.getSubscription;
export const syncSubscription = defaultBillingService.syncSubscription;
export const listPayments = defaultBillingService.listPayments;
export const healthCheck = defaultBillingService.healthCheck;
