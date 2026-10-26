// Identificadores e nomes que atravessam cliente e Edge Functions.
// Capacidades efetivas são mantidas em public.plan_capabilities; este arquivo
// define somente as chaves estáveis do contrato compartilhado.
export const PLANS = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
  BUSINESS: 'business',
  ENTERPRISE: 'enterprise',
});

export const PLAN_IDS = Object.freeze(Object.values(PLANS));
export const BILLING_PLAN_ID = PLANS.PRO;

export const PLAN_CAPABILITY = Object.freeze({
  REPORTS: 'reports',
  BUSINESS_FEATURES: 'business_features',
});

export const PLAN_CAPABILITY_IDS = Object.freeze(Object.values(PLAN_CAPABILITY));

export const PLAN_LABELS = Object.freeze({
  [PLANS.FREE]: 'Free',
  [PLANS.PRO]: 'Plano Pessoal',
  [PLANS.BUSINESS]: 'Business',
  [PLANS.ENTERPRISE]: 'Enterprise',
});

/** @param {string} planId */
export function getPlanLabel(planId) {
  return PLAN_LABELS[planId] ?? planId;
}

const SUBSCRIPTION_STATUSES_WITH_ACCESS = new Set(['trialing', 'active', 'past_due']);

export function hasPlanAccess(subscription, now = new Date()) {
  if (!subscription) return false;
  if (SUBSCRIPTION_STATUSES_WITH_ACCESS.has(subscription.status)) return true;
  if (subscription.status !== 'canceled' || !subscription.current_period_ends_at) return false;

  const periodEnd = Date.parse(subscription.current_period_ends_at);
  const currentTime = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(periodEnd) && Number.isFinite(currentTime) && periodEnd > currentTime;
}

export function normalizePlanCapabilities(capabilityRows) {
  const granted = new Set(
    Array.isArray(capabilityRows)
      ? capabilityRows.map((row) => (typeof row === 'string' ? row : row?.capability_id))
      : Object.entries(capabilityRows ?? {})
          .filter(([, enabled]) => enabled === true)
          .map(([capabilityId]) => capabilityId),
  );

  return Object.freeze(Object.fromEntries(
    PLAN_CAPABILITY_IDS.map((capabilityId) => [capabilityId, granted.has(capabilityId)]),
  ));
}

// Fixture exclusiva do seletor de acesso em DEV/demo, sem valor de autorização
// em sessões reais. A produção sempre usa as linhas retornadas pelo banco.
export function getDemoPlanCapabilities(planId) {
  const grants = {
    [PLANS.FREE]: [],
    [PLANS.PRO]: [PLAN_CAPABILITY.REPORTS],
    [PLANS.BUSINESS]: [PLAN_CAPABILITY.REPORTS, PLAN_CAPABILITY.BUSINESS_FEATURES],
    [PLANS.ENTERPRISE]: [PLAN_CAPABILITY.REPORTS, PLAN_CAPABILITY.BUSINESS_FEATURES],
  };
  return normalizePlanCapabilities(grants[planId] ?? []);
}
