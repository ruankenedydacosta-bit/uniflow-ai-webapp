import { PLAN_PRICE_BRL } from './billingSubscriptionRules.ts';
import type { createAsaasClient } from './asaasClient.ts';

// GET only: zero/ambiguous/mismatched resources never authorize another POST.
export async function recoverConventionalSubscription({ client, customerId, workspaceId, paymentMethod, resourceId }: {
  client: ReturnType<typeof createAsaasClient>; customerId: string; workspaceId: string;
  paymentMethod: string; resourceId?: string;
}): Promise<string | null> {
  const candidates = resourceId
    ? [await client.getSubscription(resourceId)]
    : (await client.listSubscriptions({ customer: customerId, externalReference: workspaceId })).data;
  const matches = (candidates as Record<string, unknown>[]).filter((row) =>
    row && typeof row.id === 'string' && (!resourceId || row.id === resourceId)
    && row.customer === customerId && row.externalReference === workspaceId
    && row.value === PLAN_PRICE_BRL && row.cycle === 'MONTHLY' && row.status === 'ACTIVE'
    && row.billingType === (paymentMethod === 'pix' ? 'PIX' : 'CREDIT_CARD'));
  return matches.length === 1 ? matches[0].id as string : null;
}
