// BILLING1 (Bloco Asaas 1): constantes de status/forma de pagamento da
// integracao Asaas. Nenhuma chamada externa acontece aqui -- so os valores
// congelados em docs/00-master/PLANO_INTEGRACAO_ASAAS.md (Bloco Asaas 0).
//
// SUBSCRIPTION_STATUS usa os 6 nomes oficiais pedidos (active/pending/
// overdue/suspended/canceled/expired). OVERDUE aponta para o valor
// 'past_due' ja existente em subscriptions.status (migration 001) -- nao
// criamos um valor redundante so para bater o nome; PENDING e SUSPENDED sao
// os dois valores novos, adicionados de forma aditiva pela migration 024
// (billing_asaas_foundation) sem remover nenhum valor antigo.
export const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: 'active',
  PENDING: 'pending',
  OVERDUE: 'past_due',
  SUSPENDED: 'suspended',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
});

export const SUBSCRIPTION_STATUS_VALUES = Object.freeze(Object.values(SUBSCRIPTION_STATUS));

export function isValidSubscriptionStatus(value) {
  return SUBSCRIPTION_STATUS_VALUES.includes(value);
}

// Formas de pagamento oficiais do MVP (decisao comercial, Bloco Asaas 0).
// Boleto fica explicitamente FORA do MVP -- nunca adicionar aqui sem uma
// nova decisao comercial equivalente.
export const PAYMENT_METHOD = Object.freeze({
  PIX: 'pix',
  PIX_AUTOMATICO: 'pix_automatico',
  CREDIT_CARD: 'credit_card',
});

export const PAYMENT_METHOD_VALUES = Object.freeze(Object.values(PAYMENT_METHOD));

export function isValidPaymentMethod(value) {
  return PAYMENT_METHOD_VALUES.includes(value);
}

// Tolerancia oficial de inadimplencia (Bloco Asaas 0): 3 dias corridos entre
// `overdue` e `suspended`.
export const OVERDUE_TOLERANCE_DAYS = 3;

// Identificador oficial do unico plano vendido no MVP (Bloco Asaas 0):
// "Plano Pessoal" reaproveita a linha 'pro' ja existente em `plans` -- nunca
// cria uma linha nova nem altera o check constraint de `plans.id`.
export const BILLING_PLAN_ID = 'pro';
