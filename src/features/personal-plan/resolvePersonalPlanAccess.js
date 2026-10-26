import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from '../simplified-app/simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from '../simplified-app/simplifiedRoutes.js';

const REGULARIZATION_ROUTES = new Set([
  SIMPLIFIED_ROUTES.ACCOUNT, SIMPLIFIED_ROUTES.SUPPORT, SIMPLIFIED_ROUTES.SUPPORT_CHAT,
  ...[ACCOUNT_SUBROUTE_IDS.PLAN, ACCOUNT_SUBROUTE_IDS.PAYMENTS, ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY,
    ACCOUNT_SUBROUTE_IDS.SECURITY].map((id) => ACCOUNT_SUBROUTES[id].path),
]);
export function isBillingRegularizationRoute(pathname) {
  return REGULARIZATION_ROUTES.has(pathname);
}

// Paid access and the documented three-day grace come from backend state.
// Suspended users can still reach billing, receipts, security and support.
export function resolvePersonalPlanAccess(subscriptionData, now = Date.now()) {
  if (!subscriptionData || subscriptionData.exists === false) return 'blocked';
  const status = subscriptionData.internal_status;
  if (status === 'active') {
    return subscriptionData.cancel_at_period_end
      && Date.parse(subscriptionData.cancel_effective_at ?? subscriptionData.current_period_ends_at ?? '') <= now
      ? 'blocked' : 'active';
  }
  if (status === 'trialing') return Date.parse(subscriptionData.trial_ends_at ?? '') > now ? 'active' : 'blocked';
  if (status === 'canceled') {
    return Date.parse(subscriptionData.current_period_ends_at ?? '') > now ? 'active' : 'blocked';
  }
  if (status === 'past_due') {
    return Date.parse(subscriptionData.grace_ends_at ?? '') > now ? 'active' : 'regularization';
  }
  return status === 'suspended' ? 'regularization' : 'blocked';
}
