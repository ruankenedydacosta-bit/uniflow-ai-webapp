// Correção (Bloco Saldo + Cobrança): fonte ÚNICA de apresentação da
// assinatura, reaproveitada pelas três telas que precisam mostrar o mesmo
// estado real (Conta, Seu plano, Pagamento e assinatura) -- antes cada tela
// reimplementava seu próprio mapeamento de status, e duas delas (Conta e
// Pagamento e assinatura) sequer liam a mesma fonte de dados que "Seu
// plano" (`billing-get-subscription`, já testado e correto), causando
// divergência entre as telas para o MESMO workspace.
//
// `subscription` aqui é sempre o objeto normalizado devolvido por
// billingService.getSubscription() (Edge Function billing-get-subscription)
// -- nunca a linha bruta da tabela `subscriptions`.
import { PAYMENT_METHOD } from '../../services/billingTypes.js';

export function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

// Mapeia o `internal_status` real (contrato de subscriptions.status +
// SUBSCRIPTION_STATUS em billingTypes.js) para o estado exibido nas três
// telas. `cancel_scheduled` é um estado de APRESENTAÇÃO (não existe como
// valor de coluna) para "active + cancel_at_period_end" -- distinção real
// que o usuário precisa ver, sem inventar um status novo no banco.
export function resolvePlanState(subscription) {
  if (!subscription?.exists) {
    return { status: 'not_configured', label: 'Nenhuma assinatura ativa', tone: 'neutral' };
  }
  const { internal_status: status, cancel_at_period_end: cancelAtPeriodEnd } = subscription;
  if (status === 'active' && cancelAtPeriodEnd) {
    return { status: 'cancel_scheduled', label: 'Cancelamento agendado', tone: 'warn' };
  }
  if (status === 'active') {
    return { status: 'active', label: 'Seu plano está ativo', tone: 'ok' };
  }
  if (status === 'pending') {
    return { status: 'pending', label: 'Pagamento pendente', tone: 'neutral' };
  }
  if (status === 'trialing') {
    return { status: 'trialing', label: 'Período de teste', tone: 'ok' };
  }
  if (status === 'past_due') {
    return { status: 'past_due', label: 'Pagamento em atraso', tone: 'warn' };
  }
  if (status === 'suspended') {
    return { status: 'suspended', label: 'Assinatura suspensa', tone: 'danger' };
  }
  if (status === 'canceled') {
    return { status: 'canceled', label: 'Assinatura cancelada', tone: 'danger' };
  }
  // 'expired'
  return { status: 'expired', label: 'Assinatura expirada', tone: 'danger' };
}

// Correção (Bloco Cobrança + Histórico): 'cancel_scheduled' NUNCA entra
// aqui -- uma assinatura com cancelamento agendado não gera nenhuma cobrança
// futura (cancel_at_period_end=true), então "renewsAt" (usado como "Próxima
// cobrança" nas telas) só pode existir para status em que uma nova cobrança
// realmente vai acontecer. A data de encerramento de acesso do
// cancel_scheduled é exclusivamente resolveCancelEffectiveAt() abaixo,
// exibida com um rótulo diferente ("Acesso disponível até" / "Cancelamento
// efetivo em"), nunca "Próxima cobrança".
const RENEWAL_ELIGIBLE_STATUSES = Object.freeze(['active', 'trialing']);

// Próxima cobrança real: só existe para status em que de fato haverá uma
// nova cobrança. Nunca inventa uma data -- ausência aqui deve virar
// "Nenhuma próxima cobrança disponível." na tela, nunca um placeholder.
export function resolveRenewsAt(subscription, planState) {
  return RENEWAL_ELIGIBLE_STATUSES.includes(planState.status)
    ? subscription?.current_period_ends_at ?? null
    : null;
}

export function resolveCancelEffectiveAt(subscription, planState) {
  return planState.status === 'cancel_scheduled' ? subscription?.cancel_effective_at ?? null : null;
}

export function resolveTrialEndsAt(subscription, planState) {
  return planState.status === 'trialing' ? subscription?.trial_ends_at ?? null : null;
}

const PAYMENT_METHOD_LABELS = Object.freeze({
  [PAYMENT_METHOD.PIX]: 'Pix',
  [PAYMENT_METHOD.PIX_AUTOMATICO]: 'Pix Automático',
  [PAYMENT_METHOD.CREDIT_CARD]: 'Cartão de crédito',
});

export function resolvePaymentMethodLabel(paymentMethod) {
  return PAYMENT_METHOD_LABELS[paymentMethod] ?? null;
}
