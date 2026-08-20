// Edge Function: uni-updates-push-dispatch
//
// UNIUPD3: worker server-side (invocado por pg_cron a cada 5 minutos, ver
// migration 047) que envia via Web Push a notificação "🚀 Nova atualização
// da Uni" para usuários que ainda não confirmaram a novidade ativa mais
// recente e ainda não receberam este push -- mesmo padrão de AGPUSH1
// (agenda-push-dispatch), worker/segredo/tabela de idempotência PRÓPRIOS
// (uni_update_push_dispatches / private.uni_updates_dispatch_secret),
// isolados do sistema de push da Agenda.
//
// Este e o registro no Centro de Notificações (sino, criado por
// useUniUpdates.js quando o usuário abre o app) são canais
// INDEPENDENTES e complementares -- nenhum dos dois substitui o outro, e
// nenhum é alterado pelo outro. A idempotência aqui (uni_update_push_
// dispatches) é PRÓPRIA, nunca confundida com user_seen_updates
// (confirmação do usuário) nem com notifications (registro do sino).
//
// Nunca aceita usuario/workspace/payload arbitrario do chamador -- os
// únicos candidatos processados vêm de uni_updates_push_candidates()
// (service role, já faz todo o filtro de elegibilidade no banco).
// Autenticação do chamador: nenhum JWT de usuário (roda sem sessão,
// disparado pelo próprio banco via pg_net) -- segredo opaco comparado via
// RPC verify_uni_updates_dispatch_secret (SECURITY DEFINER, nunca devolve
// o valor real, só um boolean). Todas as chamadas a dados usam
// SUPABASE_SERVICE_ROLE_KEY (injetado automaticamente pelo runtime da Edge
// Function).

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

interface PushCandidate {
  user_id: string;
  update_id: string;
  version: string;
  title: string;
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

// UNIUPD3: mesma trava de idempotência de claimPromptRow (AGPUSH1) --
// INSERT ... ON CONFLICT DO NOTHING na chave composta (user_id,
// update_id): só quem de fato criar a linha processa o envio, mesmo que o
// worker rode várias vezes antes de todos os candidatos serem esgotados.
async function claimDispatchRow(
  { supabaseUrl, serviceRoleKey, candidate }: {
    supabaseUrl: string; serviceRoleKey: string; candidate: PushCandidate;
  },
): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/uni_update_push_dispatches?on_conflict=user_id,update_id&select=user_id`,
    {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey, {
        Prefer: 'resolution=ignore-duplicates,return=representation',
      }),
      body: JSON.stringify([{ user_id: candidate.user_id, update_id: candidate.update_id }]),
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
    at: 'uni-updates-push-dispatch',
    subscription_id: subscriptionId,
    platform,
    outcome,
    push_service_status: pushServiceStatus,
  }));
}

// UNIUPD3: mesmo título/mensagem já usados pela notificação in-app (ver
// UPDATE_NOTIFICATION_TITLE/MESSAGE em useUniUpdates.js) -- nunca um texto
// divergente entre os dois canais. tag estável por novidade: um reenvio/
// teste repetido para a MESMA versão substitui a notificação anterior na
// bandeja em vez de empilhar uma segunda cópia.
function buildUpdatePayload(candidate: PushCandidate) {
  const url = `/app/conta/sobre?novidade=${candidate.update_id}`;

  return JSON.stringify({
    title: '🚀 Nova atualização da Uni',
    body: 'A Uni recebeu melhorias para deixar sua experiência ainda melhor.',
    url,
    tag: `uni-update-${candidate.update_id}`,
    data: { type: 'uni_update', update_id: candidate.update_id, url },
  });
}

// Envia o mesmo payload para TODAS as subscriptions ativas do usuário
// (multi-device: Android + iPhone recebem ambos) -- mesmo padrão de
// sendToUserSubscriptions (AGPUSH1).
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
  const candidates = await callRpc<PushCandidate>({ supabaseUrl, serviceRoleKey, fn: 'uni_updates_push_candidates' });
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
      payload: buildUpdatePayload(candidate),
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
  const authResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_uni_updates_dispatch_secret`, {
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
