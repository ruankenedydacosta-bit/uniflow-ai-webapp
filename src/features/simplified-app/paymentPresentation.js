// BLOCO FINAL DO MVP (Histórico de pagamentos): apresentação de um item de
// `billing_payments` (histórico real de cobranças, espelhado da Asaas pelo
// webhook -- ver supabase/functions/billing-webhook/index.ts e
// _shared/billingSubscriptionRules.ts). Reaproveita o mesmo contrato de
// status já usado pelo backend (billing_payments_status_check,
// mapAsaasPaymentStatus) -- nunca inventa um nome de status novo.
const PAYMENT_STATUS_LABELS = Object.freeze({
  pending: 'Pendente',
  confirmed: 'Confirmado',
  received: 'Recebido',
  overdue: 'Vencido',
  refunded: 'Estornado',
  chargeback: 'Contestado',
  canceled: 'Cancelado',
});

const PAYMENT_STATUS_TONES = Object.freeze({
  pending: 'neutral',
  confirmed: 'ok',
  received: 'ok',
  overdue: 'warn',
  refunded: 'danger',
  chargeback: 'danger',
  canceled: 'danger',
});

export function resolvePaymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[status] ?? 'Status desconhecido';
}

export function resolvePaymentStatusTone(status) {
  return PAYMENT_STATUS_TONES[status] ?? 'neutral';
}

// Descrição honesta do item -- "Plano Pessoal" é o único plano vendido no
// MVP (mesmo rótulo usado pela Edge Function billing-get-subscription,
// PLAN_LABELS), nunca um valor inventado por linha de pagamento (a Asaas
// não devolve uma descrição própria por cobrança de assinatura recorrente).
export const PAYMENT_DESCRIPTION = 'Plano Pessoal';
