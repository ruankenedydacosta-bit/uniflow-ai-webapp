import { BILLING_PLAN_ID } from '../_shared/planCatalog.js';
import { ASAAS_SANDBOX_BASE_URL } from '../_shared/asaasClient.ts';
import { PLAN_PRICE_BRL } from '../_shared/billingSubscriptionRules.ts';
import { buildPixAutomaticPayload, pixAutomaticView } from '../_shared/pixAutomaticRules.ts';
import { cancelPixAuthorization, findPixAuthorization, pixClient, pixRest, recoverPixAuthorization, savePixAuthorization } from '../_shared/pixAutomaticService.ts';

export async function handlePixAutomatic(request: Request): Promise<Response> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim());
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
  if (!origin || (!allowed.includes(origin) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) return json(403, { error: { code: 'ORIGIN_NOT_ALLOWED' } });
  if (request.method === 'OPTIONS') return json(200, {});
  if (request.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED' } });
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json(401, { error: { code: 'AUTH_REQUIRED' } });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !key || !anon) return json(503, { error: { code: 'SERVICE_UNAVAILABLE' } });
  try {
    const body = await request.json().catch(() => null);
    if (!body || !['availability','status','create','cancel','reconcile'].includes(body.action)
      || (body.action !== 'availability' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.workspace_id ?? ''))) return json(400, { error: { code: 'INVALID_REQUEST' } });
    const headers = { Authorization: authorization, apikey: anon };
    const auth = await fetch(`${url}/auth/v1/user`, { headers });
    if (!auth.ok) return json(401, { error: { code: 'AUTH_REQUIRED' } });
    const user = await auth.json();
    if (body.action === 'availability') {
      if (Deno.env.get('UNIFLOW_PIX_AUTOMATIC_ENABLED') !== 'true'
        || Deno.env.get('ASAAS_BASE_URL') !== ASAAS_SANDBOX_BASE_URL) return json(200, { available: false });
      const accountId = Deno.env.get('ASAAS_ACCOUNT_ID') ?? '';
      const rows = accountId ? await pixRest({ url, key }, `billing_pix_automatic_account?${new URLSearchParams({ provider_account_id: `eq.${accountId}`, limit: '1' })}`) : [];
      return json(200, { available: rows?.[0]?.eligibility_status === 'ELIGIBLE' });
    }
    const params = new URLSearchParams({ select: 'workspace_id', workspace_id: `eq.${body.workspace_id}`, user_id: `eq.${user.id}`, status: 'eq.active', limit: '1' });
    const membership = await fetch(`${url}/rest/v1/workspace_members?${params}`, { headers });
    if (!membership.ok || (await membership.json())?.length !== 1) return json(403, { error: { code: 'WORKSPACE_NOT_AUTHORIZED' } });
    const enabled = Deno.env.get('UNIFLOW_PIX_AUTOMATIC_ENABLED') === 'true';
    const processing = enabled || Deno.env.get('UNIFLOW_PIX_AUTOMATIC_PROCESSING_ENABLED') === 'true';
    if (!processing) return json(body.action === 'status' ? 200 : 409, { available: false,
      authorization: null, ...(body.action === 'status' ? {} : { error: { code: 'PIX_AUTOMATIC_DISABLED' } }) });
    const db = { url, key };
    let local = await findPixAuthorization(db, 'workspace_id', body.workspace_id);
    const accountId = Deno.env.get('ASAAS_ACCOUNT_ID') ?? '';
    const eligibilityRows = accountId ? await pixRest(db, `billing_pix_automatic_account?${new URLSearchParams({ provider_account_id: `eq.${accountId}`, limit: '1' })}`) : [];
    const available = enabled && Deno.env.get('ASAAS_BASE_URL') === ASAAS_SANDBOX_BASE_URL
      && eligibilityRows?.[0]?.eligibility_status === 'ELIGIBLE';
    if (body.action === 'status') return json(200, { available, authorization: pixAutomaticView(local) });
    if (body.action === 'create') {
      if (!available) return json(409, { available: false, error: { code: 'PIX_AUTOMATIC_ELIGIBILITY_UNVERIFIED', message: 'Pix Automático ainda não está disponível nesta conta. Use Pix ou cartão.' } });
      const reservation = await pixRest(db, 'rpc/reserve_pix_automatic', 'POST', {
        p_workspace_id: body.workspace_id, p_plan_id: BILLING_PLAN_ID, p_value: PLAN_PRICE_BRL,
      });
      local = reservation.authorization;
      if (!local) return json(409, { error: { code: 'SUBSCRIPTION_RECONCILIATION_REQUIRED', message: 'Já existe uma assinatura ou tentativa em andamento. Verifique seu plano.' } });
      if (reservation.claimed) {
        const remote = await pixClient().createPixAutomaticAuthorization(buildPixAutomaticPayload({ contractId: local.contract_id,
          customerId: local.asaas_customer_id, now: new Date().toISOString() })) as Record<string, unknown>;
        local = await savePixAuthorization(db, local, remote);
      }
    }
    if (!local) return json(200, { available, authorization: null });
    const client = pixClient();
    if (!local.asaas_authorization_id) {
      // Lost POST response: only GETs can recover it. Zero matches never
      // authorize another POST, because provider visibility may be delayed.
      try { local = await recoverPixAuthorization(db, local); }
      catch { return json(409, { error: { code: 'PIX_AUTOMATIC_RECONCILIATION_REQUIRED', message: 'Sua tentativa está em verificação. Não gere outro pagamento; tente consultar novamente.' } }); }
    }
    if (body.action === 'cancel') {
      local = await cancelPixAuthorization(db, local);
      return json(200, { available, authorization: pixAutomaticView(local) });
    }
    const remote = await client.getPixAutomaticAuthorization(local.asaas_authorization_id) as Record<string, unknown>;
    if (local.cancel_requested && remote.status === 'ACTIVE') {
      local = await cancelPixAuthorization(db, local);
      return json(200, { available, authorization: pixAutomaticView(local) });
    }
    local = await savePixAuthorization(db, local, remote);
    if (['CANCELLED','EXPIRED','REFUSED'].includes(String(remote.status)) && typeof remote.subscriptionId === 'string') {
      await client.deactivateSubscription(remote.subscriptionId);
    }
    return json(200, { available, authorization: pixAutomaticView(local) });
  } catch {
    return json(503, { error: { code: 'PIX_AUTOMATIC_RECONCILIATION_REQUIRED', message: 'Não foi possível confirmar o estado do Pix Automático. Consulte novamente antes de gerar outro pagamento.' } });
  }
}
Deno.serve(handlePixAutomatic);
