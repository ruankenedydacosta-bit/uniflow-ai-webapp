import { createAsaasClient } from '../_shared/asaasClient.ts';
import { buildBillingPaymentRow } from '../_shared/billingSubscriptionRules.ts';
import { resolveBillingLifecycle, validateProviderPayments } from '../_shared/billingLifecycle.ts';
import { BILLING_PLAN_ID } from '../_shared/planCatalog.js';

export async function handleBillingLifecycle(request: Request): Promise<Response> {
  const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  if (request.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!key || request.headers.get('apikey') !== key) return json(401, { error: 'SERVICE_ROLE_REQUIRED' });
  if (Deno.env.get('UNIFLOW_BILLING_LIFECYCLE_ENABLED') !== 'true') return json(503, { error: 'LIFECYCLE_DISABLED' });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  if (!url) return json(503, { error: 'SERVICE_UNAVAILABLE' });
  const headers = { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
  try {
    // A bounded, rotating scan also sees upcoming invoices, so notices do not
    // depend on an overdue webhook or on the customer keeping a page open.
    const params = new URLSearchParams({ select: '*', plan_id: `eq.${BILLING_PLAN_ID}`,
      status: 'in.(active,trialing,past_due,suspended)', asaas_subscription_id: 'not.is.null',
      order: 'billing_lifecycle_checked_at.asc.nullsfirst,id.asc', limit: '20' });
    const scan = await fetch(`${url}/rest/v1/subscriptions?${params}`, { headers });
    if (!scan.ok) return json(503, { error: 'LIFECYCLE_SCAN_FAILED' });
    const subscriptions = await scan.json();
    if (!Array.isArray(subscriptions)) return json(503, { error: 'LIFECYCLE_SCAN_INVALID' });
    const client = createAsaasClient({ apiKey: Deno.env.get('ASAAS_API_KEY') ?? '',
      baseUrl: Deno.env.get('ASAAS_BASE_URL') ?? '' }); // Sandbox only until homologation.
    let applied = 0;
    let failed = 0;
    let attempted = 0;
    const started = Date.now();
    for (const subscription of subscriptions) {
      if (Date.now() - started > 90_000) break;
      attempted += 1;
      try {
        const { data: payments } = await client.listSubscriptionPayments(subscription.asaas_subscription_id);
        if (!validateProviderPayments(payments, subscription.asaas_subscription_id)) {
          throw new Error('PROVIDER_PAYMENT_MISMATCH');
        }
        const now = new Date().toISOString();
        const { patch, notices } = resolveBillingLifecycle({ subscription, payments, now });
        const rows = payments.map((payment) => buildBillingPaymentRow({ workspaceId: subscription.workspace_id,
          asaasPaymentId: String(payment.id), asaasSubscriptionId: subscription.asaas_subscription_id,
          eventType: 'PAYMENT_UPDATED', payment }));
        const result = await fetch(`${url}/rest/v1/rpc/apply_billing_lifecycle`, {
          method: 'POST', headers, body: JSON.stringify({ p_subscription_id: subscription.id,
            p_expected_updated_at: subscription.updated_at, p_patch: patch,
            p_notices: notices, p_payments: rows, p_now: now }),
        });
        if (!result.ok || await result.json() !== true) throw new Error('LIFECYCLE_RETRY_REQUIRED');
        applied += 1;
      } catch {
        // No body, key, taxpayer ID or invoice URL is written to logs.
        failed += 1;
        // Rotate a failing item too, without changing financial state or
        // allowing a broken provider record to starve the rest of the batch.
        const params = new URLSearchParams({ id: `eq.${subscription.id}`, updated_at: `eq.${subscription.updated_at}` });
        await fetch(`${url}/rest/v1/subscriptions?${params}`, { method: 'PATCH', headers,
          body: JSON.stringify({ billing_lifecycle_checked_at: new Date().toISOString() }) }).catch(() => null);
      }
    }
    return json(failed ? 503 : 200, { scanned: attempted, applied, failed });
  } catch {
    return json(503, { error: 'LIFECYCLE_UNAVAILABLE' });
  }
}

Deno.serve(handleBillingLifecycle);
