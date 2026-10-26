import { billingDueTimestamp, derivePaidPeriodEndFromPayments, GRACE_PERIOD_DAYS, PLAN_PRICE_BRL } from './billingSubscriptionRules.ts';
export { billingDueTimestamp };

type Subscription = {
  status: string;
  current_period_ends_at?: string | null;
  cancel_at_period_end?: boolean;
  cancel_effective_at?: string | null;
};
type Payment = Record<string, unknown>;
const DAY_MS = 86_400_000;

export function effectiveBillingStatus(subscription: Subscription & { billing_grace_ends_at?: string | null }, now = Date.now()) {
  if (subscription.cancel_at_period_end && Date.parse(subscription.cancel_effective_at ?? subscription.current_period_ends_at ?? '') <= now) return 'canceled';
  if (subscription.status === 'past_due' && Date.parse(subscription.billing_grace_ends_at ?? '') <= now) return 'suspended';
  return subscription.status;
}

export function validateProviderPayments(payments: Payment[], subscriptionId: string, customerId: string): boolean {
  return payments.every((row) => Boolean(customerId) && row.customer === customerId
    && typeof row.id === 'string' && row.subscription === subscriptionId
    && typeof row.value === 'number' && row.value >= 0
    && (!['CONFIRMED','RECEIVED'].includes(String(row.status)) || row.value === PLAN_PRICE_BRL));
}

export function validateProviderSubscription(remote: Record<string, unknown>, local: Record<string, unknown>) {
  return remote?.id === local.asaas_subscription_id && remote?.customer === local.asaas_customer_id
    && Boolean(local.asaas_customer_id) && remote.value === PLAN_PRICE_BRL && remote.cycle === 'MONTHLY'
    && ['ACTIVE','INACTIVE','EXPIRED'].includes(String(remote.status))
    && remote.billingType === (local.payment_method === 'credit_card' ? 'CREDIT_CARD' : 'PIX');
}

// Asaas dueDate is a Brazilian civil date. Three calendar days are measured
// from midnight in the billing timezone, never from subscriptions.updated_at.

export function resolveBillingLifecycle({ subscription, payments, now, providerStatus }: {
  subscription: Subscription; payments: Payment[]; now: string; providerStatus?: string | null;
}) {
  const currentTime = Date.parse(now);
  if (!Number.isFinite(currentTime)) throw new Error('INVALID_BILLING_CLOCK');
  const patch: Record<string, unknown> = {};
  if (['canceled', 'expired'].includes(subscription.status)) return { patch, notices: [] };
  const confirmed = payments.filter((row) => ['CONFIRMED', 'RECEIVED'].includes(String(row.status).toUpperCase()));
  const paidEnd = derivePaidPeriodEndFromPayments(confirmed);
  const localEnd = Date.parse(subscription.current_period_ends_at ?? '');
  if (paidEnd && Date.parse(paidEnd) > currentTime) {
    if (!Number.isFinite(localEnd) || Date.parse(paidEnd) > localEnd) patch.current_period_ends_at = paidEnd;
    if (['pending', 'past_due', 'suspended'].includes(subscription.status)) patch.status = 'active';
    if (subscription.cancel_at_period_end && patch.current_period_ends_at) patch.cancel_effective_at = paidEnd;
  }
  if (['INACTIVE', 'EXPIRED'].includes(providerStatus ?? '')) {
    // Provider-side termination stops renewal, while retaining every paid day.
    const end = Math.max(Number.isFinite(localEnd) ? localEnd : -Infinity,
      paidEnd ? Date.parse(paidEnd) : -Infinity);
    if (!Number.isFinite(end)) throw new Error('STOPPED_SUBSCRIPTION_PERIOD_UNAVAILABLE');
    patch.cancel_at_period_end = true;
    patch.cancel_effective_at = new Date(end).toISOString();
    if (currentTime >= end) patch.status = 'canceled';
    return { patch, notices: [] };
  }
  const effectiveEnd = Date.parse(String(patch.cancel_effective_at ?? subscription.cancel_effective_at ?? subscription.current_period_ends_at ?? ''));
  if (subscription.cancel_at_period_end && Number.isFinite(effectiveEnd) && currentTime >= effectiveEnd) {
    patch.status = 'canceled';
    return { patch, notices: [] };
  }
  const accessEnd = Date.parse(String(patch.current_period_ends_at ?? subscription.current_period_ends_at ?? ''));
  const unpaid = payments.filter((row) => ['PENDING', 'OVERDUE'].includes(String(row.status).toUpperCase())
    && Number.isFinite(billingDueTimestamp(row.dueDate)) && typeof row.id === 'string')
    .sort((a, b) => billingDueTimestamp(a.dueDate) - billingDueTimestamp(b.dueDate));
  const renewal = unpaid.find((row) => !Number.isFinite(accessEnd)
    || billingDueTimestamp(row.dueDate) >= accessEnd);
  const notices: { key: string; stage: string; paymentId: string }[] = [];
  if (renewal) {
    const elapsed = currentTime - billingDueTimestamp(renewal.dueDate);
    const stage = elapsed >= GRACE_PERIOD_DAYS * DAY_MS ? 'suspended'
      : elapsed >= DAY_MS ? 'overdue' : elapsed >= 0 ? 'due' : elapsed >= -DAY_MS ? 'before' : null;
    if (subscription.status !== 'pending' && elapsed >= 0 && !(Number.isFinite(accessEnd) && accessEnd > currentTime)) {
      patch.status = elapsed >= GRACE_PERIOD_DAYS * DAY_MS ? 'suspended' : 'past_due';
      patch.billing_grace_ends_at = new Date(billingDueTimestamp(renewal.dueDate) + GRACE_PERIOD_DAYS * DAY_MS).toISOString();
    }
    if (stage) notices.push({ key: `${renewal.id}:${stage}`, stage, paymentId: String(renewal.id) });
  }
  if (patch.status === 'active' && ['past_due', 'suspended'].includes(subscription.status)) {
    notices.push({ key: `reactivated:${paidEnd}`, stage: 'reactivated', paymentId: String(confirmed.at(-1)?.id ?? '') });
  }
  return { patch, notices };
}
