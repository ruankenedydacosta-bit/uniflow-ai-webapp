// GUARD FIX: única fonte de verdade sobre acesso ao Plano Pessoal é a
// assinatura real em billing_customers/subscriptions (via
// billing-get-subscription) -- nunca o marcador local
// (personalPlanStorage.js), que é só cache visual para evitar flicker,
// nunca autorização. Só `internal_status === 'active'` libera o app;
// `exists === false` e qualquer outro status (pending/canceled/expired/
// past_due/suspended) bloqueia e manda de volta para /plano-pessoal.
export function resolvePersonalPlanAccess(subscriptionData) {
  if (!subscriptionData || subscriptionData.exists === false) return 'blocked';
  return subscriptionData.internal_status === 'active' ? 'active' : 'blocked';
}
