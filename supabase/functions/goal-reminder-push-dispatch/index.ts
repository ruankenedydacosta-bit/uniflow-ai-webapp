// Edge Function: goal-reminder-push-dispatch
//
// #160: worker server-side (invocado por pg_cron de hora em hora, das 9h às
// 19h em America/Sao_Paulo, ver migration 063) que envia por Web Push o
// lembrete mensal do aporte de uma meta, no reminder_day escolhido pela
// pessoa. Mesmo padrão de uni-updates-push-dispatch: tabela de
// idempotência (goal_reminder_push_dispatches) e segredo
// (private.goal_reminder_dispatch_secret) próprios.
//
// Nunca aceita usuário/meta/payload do chamador: os candidatos vêm só de
// goal_reminder_push_candidates(), que faz todo o filtro no banco (meta
// ativa, dia de hoje, sem aporte no mês, sem lembrete no mês). O chamador
// se autentica pelo segredo, conferido via RPC
// verify_goal_reminder_dispatch_secret (SECURITY DEFINER, devolve só um
// boolean).

import webpush from 'npm:web-push@3.6.7';

function getEnv(name: string) {
  return Deno.env.get(name) ?? '';
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function serviceHeaders(serviceRoleKey: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
    ...extra,
  };
}

interface GoalReminderCandidate {
  goal_id: string;
  user_id: string;
  name: string;
  planned_monthly_amount: number | string | null;
  reference_month: string;
}

interface ActiveSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: string | null;
}

async function callRpc<T>(
  { supabaseUrl, serviceRoleKey, fn }: { supabaseUrl: string; serviceRoleKey: string; fn: string },
): Promise<T[]> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: '{}',
  });
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

// Trava de idempotência: INSERT ... ON CONFLICT DO NOTHING na chave
// (goal_id, reference_month). Só quem cria a linha envia o lembrete do mês.
async function claimDispatchRow(
  { supabaseUrl, serviceRoleKey, candidate }: {
    supabaseUrl: string; serviceRoleKey: string; candidate: GoalReminderCandidate;
  },
): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/goal_reminder_push_dispatches?on_conflict=goal_id,reference_month&select=goal_id`,
    {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey, {
        Prefer: 'resolution=ignore-duplicates,return=representation',
      }),
      body: JSON.stringify([{ goal_id: candidate.goal_id, reference_month: candidate.reference_month }]),
    },
  );
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function listActiveSubscriptionsForUser(
  { supabaseUrl, serviceRoleKey, userId }: {
    supabaseUrl: string; serviceRoleKey: string; userId: string;
  },
): Promise<ActiveSubscription[]> {
  const params = new URLSearchParams({
    select: 'id,endpoint,p256dh,auth,platform',
    user_id: `eq.${userId}`,
    revoked_at: 'is.null',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?${params}`, {
    headers: serviceHeaders(serviceRoleKey),
  });
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function revokeSubscription(
  { supabaseUrl, serviceRoleKey, subscriptionId }: {
    supabaseUrl: string; serviceRoleKey: string; subscriptionId: string;
  },
) {
  await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${subscriptionId}`, {
    method: 'PATCH',
    headers: serviceHeaders(serviceRoleKey, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
}

function logPushAttempt({
  subscriptionId, platform, outcome, pushServiceStatus,
}: {
  subscriptionId: string;
  platform: string | null;
  outcome: 'sent' | 'revoked' | 'failed';
  pushServiceStatus: number | null;
}) {
  console.log(JSON.stringify({
    at: 'goal-reminder-push-dispatch',
    subscription_id: subscriptionId,
    platform,
    outcome,
    push_service_status: pushServiceStatus,
  }));
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Com valor planejado, o corpo diz quanto guardar. Sem ele, só pede o
// registro do aporte. tag estável por meta e mês: um reenvio substitui a
// notificação na bandeja em vez de empilhar.
function buildGoalReminderPayload(candidate: GoalReminderCandidate) {
  const url = '/app/metas';
  const monthlyAmount = Number(candidate.planned_monthly_amount);
  const body = Number.isFinite(monthlyAmount) && monthlyAmount > 0
    ? `Guarde ${BRL.format(monthlyAmount)} este mês e registre o aporte na meta.`
    : 'Registre o aporte deste mês na meta.';

  return JSON.stringify({
    title: `Aporte da meta ${candidate.name}`,
    body,
    url,
    tag: `goal-reminder-${candidate.goal_id}-${candidate.reference_month}`,
    data: { type: 'goal_reminder', goal_id: candidate.goal_id, url },
  });
}

// Envia para todas as subscriptions ativas da pessoa (celular e computador
// recebem). 404/410 do push service revoga a subscription morta.
async function sendToUserSubscriptions(
  { supabaseUrl, serviceRoleKey, userId, payload }: {
    supabaseUrl: string; serviceRoleKey: string; userId: string; payload: string;
  },
) {
  const subscriptions = await listActiveSubscriptionsForUser({ supabaseUrl, serviceRoleKey, userId });
  let sent = 0;
  let revoked = 0;
  let failed = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      const result = await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
      );
      sent += 1;
      logPushAttempt({
        subscriptionId: subscription.id,
        platform: subscription.platform,
        outcome: 'sent',
        pushServiceStatus: (result as { statusCode?: number })?.statusCode ?? null,
      });
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode ?? null;
      if (statusCode === 404 || statusCode === 410) {
        await revokeSubscription({ supabaseUrl, serviceRoleKey, subscriptionId: subscription.id });
        revoked += 1;
        logPushAttempt({
          subscriptionId: subscription.id, platform: subscription.platform, outcome: 'revoked', pushServiceStatus: statusCode,
        });
      } else {
        failed += 1;
        logPushAttempt({
          subscriptionId: subscription.id, platform: subscription.platform, outcome: 'failed', pushServiceStatus: statusCode,
        });
      }
    }
  }));

  return { sent, revoked, failed, subscriptionCount: subscriptions.length };
}

async function processCandidates(
  { supabaseUrl, serviceRoleKey }: { supabaseUrl: string; serviceRoleKey: string },
) {
  const candidates = await callRpc<GoalReminderCandidate>({
    supabaseUrl, serviceRoleKey, fn: 'goal_reminder_push_candidates',
  });
  let claimed = 0;
  let sent = 0;

  for (const candidate of candidates) {
    const wasClaimed = await claimDispatchRow({ supabaseUrl, serviceRoleKey, candidate });
    if (!wasClaimed) continue;
    claimed += 1;

    const result = await sendToUserSubscriptions({
      supabaseUrl,
      serviceRoleKey,
      userId: candidate.user_id,
      payload: buildGoalReminderPayload(candidate),
    });
    sent += result.sent;
  }

  return { candidates: candidates.length, claimed, sent };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo nao permitido.' } });
  }

  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = getEnv('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = getEnv('VAPID_PRIVATE_KEY');
  const vapidSubject = getEnv('VAPID_SUBJECT');
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return jsonResponse(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Servico de push nao esta configurado.' } });
  }

  const dispatchSecret = request.headers.get('X-Dispatch-Secret') ?? '';
  const authResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_goal_reminder_dispatch_secret`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({ candidate: dispatchSecret }),
  });
  const isAuthorized = authResponse.ok && (await authResponse.json()) === true;
  if (!isAuthorized) {
    return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Segredo de disparo invalido.' } });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const result = await processCandidates({ supabaseUrl, serviceRoleKey });

  return jsonResponse(200, { result });
});
