import { createAsaasClient } from './asaasClient.ts';
import { buildBillingPaymentRow } from './billingSubscriptionRules.ts';
import { resolvePixAutomaticPaymentPatch, validatePixAuthorization } from './pixAutomaticRules.ts';

export type PixDatabase = { url: string; key: string; authorization?: string };
export function pixAutomaticProcessingEnabled() {
  return Deno.env.get('UNIFLOW_PIX_AUTOMATIC_ENABLED') === 'true'
    || Deno.env.get('UNIFLOW_PIX_AUTOMATIC_PROCESSING_ENABLED') === 'true';
}
export async function pixRest(db: PixDatabase, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${db.url}/rest/v1/${path}`, { method,
    headers: { Authorization: db.authorization ?? `Bearer ${db.key}`, apikey: db.key, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error('PIX_PERSISTENCE_UNAVAILABLE');
  return response.status === 204 ? null : response.json();
}
export function pixClient() {
  return createAsaasClient({ apiKey: Deno.env.get('ASAAS_API_KEY') ?? '', baseUrl: Deno.env.get('ASAAS_BASE_URL') ?? '' });
}
export async function findPixAuthorization(db: PixDatabase, field: string, value: string) {
  const params = new URLSearchParams({ select: '*', [field]: `eq.${value}`, order: 'created_at.desc,id.desc', limit: '1' });
  const rows = await pixRest(db, `billing_pix_authorizations?${params}`);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}
export async function savePixAuthorization(db: PixDatabase, local: Record<string, unknown>, remote: Record<string, unknown>) {
  if (!validatePixAuthorization(remote, local)) throw new Error('PIX_AUTHORIZATION_MISMATCH');
  if (await pixRest(db, 'rpc/apply_pix_authorization', 'POST', { p_authorization_id: local.id, p_remote: remote }) !== true) {
    throw new Error('PIX_RECONCILIATION_REQUIRED');
  }
  return findPixAuthorization(db, 'id', String(local.id));
}

export async function recoverPixAuthorization(db: PixDatabase, local: Record<string, unknown>) {
  const client = pixClient();
  const matches: Record<string, unknown>[] = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const result = await client.listPixAutomaticAuthorizations(String(local.asaas_customer_id), offset) as { data?: Record<string, unknown>[]; hasMore?: boolean };
    if (!Array.isArray(result.data) || (result.hasMore && !result.data.length)) throw new Error('PIX_LIST_INCOMPLETE');
    matches.push(...result.data.filter((row) => row.contractId === local.contract_id));
    if (!result.hasMore) {
      if (matches.length !== 1) throw new Error('PIX_AUTOMATIC_RECONCILIATION_REQUIRED');
      return savePixAuthorization(db, local, matches[0]);
    }
    offset += result.data.length;
  }
  throw new Error('PIX_LIST_INCOMPLETE');
}

export async function cancelPixAuthorization(db: PixDatabase, local: Record<string, unknown>) {
  if (!pixAutomaticProcessingEnabled() || typeof local.asaas_authorization_id !== 'string') throw new Error('PIX_CANCELLATION_RECONCILIATION_REQUIRED');
  const client = pixClient();
  const current = await client.getPixAutomaticAuthorization(local.asaas_authorization_id) as Record<string, unknown>;
  if (!validatePixAuthorization(current, local)) throw new Error('PIX_AUTHORIZATION_MISMATCH');
  await pixRest(db, `billing_pix_authorizations?${new URLSearchParams({ id: `eq.${local.id}` })}`, 'PATCH', { cancel_requested: true });
  if (current.status === 'ACTIVE') await client.cancelPixAutomaticAuthorization(local.asaas_authorization_id);
  const remote = await client.getPixAutomaticAuthorization(local.asaas_authorization_id) as Record<string, unknown>;
  const saved = await savePixAuthorization(db, local, remote);
  if (['CANCELLED','EXPIRED','REFUSED'].includes(String(remote.status)) && typeof remote.subscriptionId === 'string') {
    await client.deactivateSubscription(remote.subscriptionId);
  }
  return saved;
}

// The first payment and the consent have independent lifecycles. A verified
// instruction, a linked subscription, or our exact immutable QR description
// can correlate a canonical provider payment; customer/amount alone cannot.
export async function processPixAutomaticPayment(db: PixDatabase, payment: Record<string, unknown>, verifiedAuthorizationId?: string) {
  if (!pixAutomaticProcessingEnabled()) return false;
  let local = verifiedAuthorizationId ? await findPixAuthorization(db, 'asaas_authorization_id', verifiedAuthorizationId) : null;
  if (!local && typeof payment.id === 'string') {
    const links = await pixRest(db, `billing_pix_payment_links?${new URLSearchParams({ asaas_payment_id: `eq.${payment.id}`, select: 'authorization_id', limit: '1' })}`);
    if (links?.[0]) local = await findPixAuthorization(db, 'id', links[0].authorization_id);
  }
  if (!local && typeof payment.subscription === 'string') local = await findPixAuthorization(db, 'asaas_subscription_id', payment.subscription);
  if (!local && typeof payment.description === 'string' && /^UF:[a-f0-9]{32}$/.test(payment.description)) {
    local = await findPixAuthorization(db, 'contract_id', payment.description.slice(3));
  }
  if (!local) {
    if (typeof payment.customer === 'string' && ['CONFIRMED','RECEIVED'].includes(String(payment.status))) {
      const candidate = await findPixAuthorization(db, 'asaas_customer_id', payment.customer);
      if (candidate && !candidate.initial_payment_confirmed && payment.value === candidate.expected_value) {
        // Preserve the event for retry/manual reconciliation. Customer and
        // amount are insufficient to assign money to this authorization.
        throw new Error('PIX_PAYMENT_CORRELATION_REQUIRED');
      }
    }
    return false;
  }
  if (payment.customer !== local.asaas_customer_id || payment.value !== local.expected_value
    || (typeof payment.subscription === 'string' && local.asaas_subscription_id && payment.subscription !== local.asaas_subscription_id)) {
    throw new Error('PIX_PAYMENT_MISMATCH');
  }
  const params = new URLSearchParams({ select: '*', id: `eq.${local.subscription_id}`, limit: '1' });
  const subscriptions = await pixRest(db, `subscriptions?${params}`);
  if (!subscriptions?.[0]) throw new Error('PIX_SUBSCRIPTION_UNAVAILABLE');
  const patch = resolvePixAutomaticPaymentPatch({ payment, subscription: subscriptions[0], authorizationStatus: local.status, now: new Date().toISOString() });
  const row = buildBillingPaymentRow({ workspaceId: local.workspace_id, asaasPaymentId: String(payment.id),
    asaasSubscriptionId: local.asaas_subscription_id, eventType: 'PAYMENT_UPDATED', payment });
  if (await pixRest(db, 'rpc/apply_pix_automatic_payment', 'POST', { p_authorization_id: local.id,
    p_payment: { ...payment, local_status: row.status }, p_patch: patch }) !== true) throw new Error('PIX_PAYMENT_RECONCILIATION_REQUIRED');
  return true;
}

export async function processPixAutomaticEvent({ supabaseUrl, serviceRoleKey, eventType, payload }: {
  supabaseUrl: string; serviceRoleKey: string; eventType: string; payload: Record<string, unknown>;
}) {
  if (!eventType.startsWith('PIX_AUTOMATIC_RECURRING_')) return;
  if (!pixAutomaticProcessingEnabled()) return;
  const db = { url: supabaseUrl, key: serviceRoleKey };
  if (eventType === 'PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED') {
    const account = payload.account as Record<string, unknown> | undefined;
    const eligibility = payload.eligibility as Record<string, unknown> | undefined;
    const expected = Deno.env.get('ASAAS_ACCOUNT_ID');
    if (!expected || account?.id !== expected || !['ELIGIBLE','INELIGIBLE'].includes(String(eligibility?.status))) {
      throw new Error('PIX_ELIGIBILITY_UNVERIFIED');
    }
    await pixRest(db, 'billing_pix_automatic_account?on_conflict=provider_account_id', 'POST', {
      provider_account_id: expected, eligibility_status: eligibility?.status, verified_at: new Date().toISOString(),
    });
    return;
  }
  const authorization = payload.authorization as Record<string, unknown> | undefined;
  if (eventType.startsWith('PIX_AUTOMATIC_RECURRING_AUTHORIZATION_') && typeof authorization?.id === 'string') {
    let local = await findPixAuthorization(db, 'asaas_authorization_id', authorization.id);
    if (!local && typeof authorization.contractId === 'string') local = await findPixAuthorization(db, 'contract_id', authorization.contractId);
    if (!local) return;
    const client = pixClient();
    let remote = await client.getPixAutomaticAuthorization(authorization.id) as Record<string, unknown>;
    if (!validatePixAuthorization(remote, local)) throw new Error('PIX_AUTHORIZATION_MISMATCH');
    if (local.cancel_requested && remote.status === 'ACTIVE') {
      await client.cancelPixAutomaticAuthorization(authorization.id);
      remote = await client.getPixAutomaticAuthorization(authorization.id) as Record<string, unknown>;
    }
    await savePixAuthorization(db, local, remote);
    if (['CANCELLED','EXPIRED','REFUSED'].includes(String(remote.status)) && typeof remote.subscriptionId === 'string') {
      await client.deactivateSubscription(remote.subscriptionId);
    }
    return;
  }
  const instruction = payload.paymentInstruction as Record<string, unknown> | undefined;
  if (eventType.startsWith('PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_') && typeof instruction?.id === 'string') {
    const client = pixClient();
    const remote = await client.getPixAutomaticPaymentInstruction(instruction.id) as Record<string, unknown>;
    if (remote.id !== instruction.id) throw new Error('PIX_INSTRUCTION_MISMATCH');
    const id = (remote.authorization as Record<string, unknown> | undefined)?.id;
    if (typeof id !== 'string') throw new Error('PIX_INSTRUCTION_AUTHORIZATION_MISSING');
    const local = await findPixAuthorization(db, 'asaas_authorization_id', id);
    if (!local) return;
    // An instruction does not itself prove a payment. Requery the payment.
    if (typeof remote.paymentId === 'string') {
      const payment = await client.getPayment(remote.paymentId) as Record<string, unknown>;
      if (payment.id !== remote.paymentId) throw new Error('PIX_INSTRUCTION_PAYMENT_MISMATCH');
      await processPixAutomaticPayment(db, payment, id);
    }
    await pixRest(db, 'billing_pix_instructions?on_conflict=asaas_instruction_id', 'POST', {
      asaas_instruction_id: remote.id, authorization_id: local.id, asaas_payment_id: remote.paymentId ?? null,
      status: remote.status, refusal_reason: remote.refusalReason ?? null, updated_at: new Date().toISOString(),
    });
  }
}
