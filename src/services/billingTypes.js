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

// Níveis do Plano Pessoal (épico #116): mesmo plan_id 'pro', preço e cota de
// voz diferentes. Espelho de public.subscription_tiers (migration 049) para a
// página de venda não esperar consulta; subscriptionTiersMigration.test.js
// confere os valores contra o SQL.
export const SUBSCRIPTION_TIER_IDS = Object.freeze({
  ESSENCIAL: 'essencial',
  UNI_VOZ: 'uni_voz',
  UNI_VOZ_PLUS: 'uni_voz_plus',
});

export const SUBSCRIPTION_TIERS = Object.freeze([
  Object.freeze({ id: SUBSCRIPTION_TIER_IDS.ESSENCIAL, name: 'Essencial', priceBrl: 14.9, voiceMinutes: 20 }),
  Object.freeze({ id: SUBSCRIPTION_TIER_IDS.UNI_VOZ, name: 'Uni Voz', priceBrl: 29.9, voiceMinutes: 60 }),
  Object.freeze({ id: SUBSCRIPTION_TIER_IDS.UNI_VOZ_PLUS, name: 'Uni Voz Plus', priceBrl: 69.9, voiceMinutes: 180 }),
]);

// Nível de quem já assinava antes dos três planos, e o padrão do banco.
export const DEFAULT_SUBSCRIPTION_TIER_ID = SUBSCRIPTION_TIER_IDS.UNI_VOZ;

export function findSubscriptionTier(tierId) {
  return SUBSCRIPTION_TIERS.find((tier) => tier.id === tierId) ?? null;
}
