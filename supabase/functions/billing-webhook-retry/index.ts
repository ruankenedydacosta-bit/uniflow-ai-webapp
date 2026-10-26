// Worker scheduled periodically by the Supabase project. It only redispatches
// persisted events; the billing-webhook claim RPC provides atomic idempotency.

import { WEBHOOK_PROCESSING_MAX_ATTEMPTS } from '../_shared/billingWebhookReliability.ts';

const MAX_BATCH_SIZE = 20;
const PROCESSING_LEASE_MS = 10 * 60 * 1000;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: { code: 'METHOD_NOT_ALLOWED' } });
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // Supabase Cron manda a chave secreta no header `apikey`. A validação é
  // feita aqui, pois este endpoint é exclusivamente service-to-service.
  if (!serviceRoleKey || request.headers.get('apikey') !== serviceRoleKey) {
    return jsonResponse(401, { error: { code: 'SERVICE_ROLE_REQUIRED' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';
  if (!supabaseUrl || !webhookToken) {
    return jsonResponse(503, { error: { code: 'SERVICE_UNAVAILABLE' } });
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS).toISOString();
  const params = new URLSearchParams({
    select: 'asaas_event_id,event_type,payload',
    processed_at: 'is.null',
    processing_attempts: `lt.${WEBHOOK_PROCESSING_MAX_ATTEMPTS}`,
    order: 'received_at.asc',
    limit: String(MAX_BATCH_SIZE),
  });
  params.set(
    'and',
    `(or(next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}),or(processing_started_at.is.null,processing_started_at.lt.${staleBefore}))`,
  );

  const pendingResponse = await fetch(`${supabaseUrl}/rest/v1/webhook_events?${params}`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!pendingResponse.ok) {
    return jsonResponse(503, { error: { code: 'RETRY_QUEUE_UNAVAILABLE' } });
  }

  const pendingEvents = await pendingResponse.json() as Array<{
    asaas_event_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }>;
  const webhookUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/billing-webhook`;
  let dispatched = 0;
  let failed = 0;

  for (const event of pendingEvents) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'asaas-access-token': webhookToken,
      },
      body: JSON.stringify({
        ...event.payload,
        id: event.asaas_event_id,
        event: event.event_type,
      }),
    });
    if (response.ok) dispatched += 1;
    else failed += 1;
  }

  if (failed > 0) {
    return jsonResponse(503, { scanned: pendingEvents.length, dispatched, failed });
  }
  return jsonResponse(200, { scanned: pendingEvents.length, dispatched, failed: 0 });
});
