import { CHECKOUT_MINUTES_TO_EXPIRE, computePaidPeriodEnd, PLAN_PRICE_BRL } from './billingSubscriptionRules.ts';

export const PIX_AUTOMATIC_STATUSES = new Set(['CREATED','ACTIVE','CANCELLED','EXPIRED','REFUSED']);
export const PIX_AUTOMATIC_EVENT_PREFIX = 'PIX_AUTOMATIC_RECURRING_';
export function buildPixAutomaticPayload({ contractId, customerId, now }: { contractId: string; customerId: string; now: string }) {
  if (!/^[a-f0-9]{32}$/.test(contractId) || !customerId.startsWith('cus_')) throw new Error('INVALID_AUTHORIZATION_IDENTITY');
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_AUTHORIZATION_CLOCK');
  return { frequency: 'MONTHLY', contractId, customerId, value: PLAN_PRICE_BRL,
    description: 'UniFlow AI Plano Pessoal', paymentCreationMode: 'SUBSCRIPTION', retryPolicy: 'NOT_ALLOWED',
    startDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date),
    immediateQrCode: { expirationSeconds: CHECKOUT_MINUTES_TO_EXPIRE * 60, originalValue: PLAN_PRICE_BRL,
      description: `UF:${contractId}` } };
}
export function validatePixAuthorization(remote: Record<string, unknown>, local: Record<string, unknown>) {
  return typeof remote.id === 'string' && PIX_AUTOMATIC_STATUSES.has(String(remote.status))
    && remote.contractId === local.contract_id && remote.customerId === local.asaas_customer_id
    && remote.value === PLAN_PRICE_BRL && remote.frequency === 'MONTHLY'
    && remote.paymentCreationMode === 'SUBSCRIPTION'
    && (!local.asaas_authorization_id || remote.id === local.asaas_authorization_id);
}
export function resolvePixAutomaticPaymentPatch({ payment, subscription, authorizationStatus, now }: {
  payment: Record<string, unknown>; subscription: { status: string; current_period_ends_at?: string | null };
  authorizationStatus: string; now: string;
}) {
  if (!['CONFIRMED','RECEIVED'].includes(String(payment.status)) || payment.value !== PLAN_PRICE_BRL
    || ['canceled','expired'].includes(subscription.status)) return {};
  const paymentDate = payment.paymentDate ?? payment.clientPaymentDate;
  const dueDate = payment.dueDate;
  if (![paymentDate,dueDate].some((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))) return {};
  const periodEnd = computePaidPeriodEnd({ paymentDate: typeof paymentDate === 'string' ? paymentDate : null,
    dueDate: typeof dueDate === 'string' ? dueDate : null, currentPeriodEndsAt: subscription.current_period_ends_at, now });
  if (Date.parse(periodEnd) <= Date.parse(now)) return {};
  return { status: 'active', current_period_ends_at: periodEnd,
    ...(authorizationStatus !== 'ACTIVE'
      ? { cancel_at_period_end: true, cancel_effective_at: periodEnd } : {}) };
}
export function pixAutomaticView(row: Record<string, unknown> | null) {
  if (!row) return null;
  return { id: row.id, status: row.status, recurring_active: row.status === 'ACTIVE',
    value: row.expected_value,
    initial_payment_confirmed: row.initial_payment_confirmed === true,
    payload: row.qr_payload, encoded_image: row.qr_encoded_image, expiration_date: row.qr_expires_at,
    cancellation_reason: row.cancellation_reason, cancellation_requested: row.cancel_requested === true };
}
