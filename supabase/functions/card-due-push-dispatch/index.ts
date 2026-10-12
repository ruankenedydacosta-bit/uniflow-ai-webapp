// Edge Function: card-due-push-dispatch
//
// #184: worker server-side (invocado por pg_cron de hora em hora, das 9h às
// 19h em America/Sao_Paulo, ver migration 067) que envia por Web Push o
// lembrete do vencimento da fatura do cartão de crédito, 2 dias antes do
// due_day. Mesmo padrão de goal-reminder-push-dispatch (063): tabela de
// idempotência (card_due_push_dispatches) e segredo
// (private.card_due_dispatch_secret) próprios.
//
// Nunca aceita usuário/cartão/payload do chamador: os candidatos vêm só de
// card_due_push_candidates(), que faz todo o filtro no banco (cartão ativo
// com due_day, vencimento em até 2 dias, membro ativo do espaço, sem
// lembrete deste vencimento). O chamador se autentica pelo segredo,
// conferido via RPC verify_card_due_dispatch_secret (SECURITY DEFINER,
// devolve só um boolean).

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

interface CardDueCandidate {
  account_id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  due_date: string;
  days_until_due: number;
}

interface ActiveSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: string | null;
}

// Falha ao ler os candidatos vira erro visível (log e 502), em vez de uma
// rodada "sem candidatos" que esconderia o problema todo dia.
async function listCandidates(
  { supabaseUrl, serviceRoleKey }: { supabaseUrl: string; serviceRoleKey: string },
): Promise<CardDueCandidate[] | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/card_due_push_candidates`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: '{}',
  });
  if (!response.ok) {
    console.error(JSON.stringify({
      at: 'card-due-push-dispatch',
      error: 'candidates_rpc_failed',
      status: response.status,
      body: (await response.text()).slice(0, 500),
    }));
    return null;
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

// Trava de idempotência: INSERT ... ON CONFLICT DO NOTHING na chave
// (account_id, user_id, due_date). Só quem cria a linha envia o lembrete.
async function claimDispatchRow(
  { supabaseUrl, serviceRoleKey, candidate }: {
    supabaseUrl: string; serviceRoleKey: string; candidate: CardDueCandidate;
  },
): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/card_due_push_dispatches?on_conflict=account_id,user_id,due_date&select=account_id`,
    {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey, {
        Prefer: 'resolution=ignore-duplicates,return=representation',
      }),
      body: JSON.stringify([{
        account_id: candidate.account_id,
        user_id: candidate.user_id,
        due_date: candidate.due_date,
      }]),
    },
  );
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

// Envio que falhou em todos os dispositivos (erro do push service ou de rede)
// devolve o par para a rodada da hora seguinte.
async function releaseDispatchRow(
  { supabaseUrl, serviceRoleKey, candidate }: {
    supabaseUrl: string; serviceRoleKey: string; candidate: CardDueCandidate;
  },
) {
  const params = new URLSearchParams({
    account_id: `eq.${candidate.account_id}`,
    user_id: `eq.${candidate.user_id}`,
    due_date: `eq.${candidate.due_date}`,
  });
  await fetch(`${supabaseUrl}/rest/v1/card_due_push_dispatches?${params}`, {
    method: 'DELETE',
    headers: serviceHeaders(serviceRoleKey, { Prefer: 'return=minimal' }),
  });
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
    at: 'card-due-push-dispatch',
    subscription_id: subscriptionId,
    platform,
    outcome,
    push_service_status: pushServiceStatus,
  }));
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// "2026-11-05" vira "5 nov", como formatarDiaCurto em contasOrganizar.js.
function formatarDiaCurto(data: string) {
  const [, mes, dia] = String(data).split('-');
  return `${Number(dia)} ${MESES_CURTOS[Number(mes) - 1] ?? ''}`.trim();
}

// O corpo diz quando vence e o que fazer. tag estável por cartão e
// vencimento: um reenvio substitui a notificação na bandeja em vez de
// empilhar. O toque abre o detalhe do cartão.
function buildCardDuePayload(candidate: CardDueCandidate) {
  const url = `/app/organizar/contas/${encodeURIComponent(candidate.account_id)}`;
  const dia = formatarDiaCurto(candidate.due_date);
  const quando = candidate.days_until_due <= 0
    ? `vence hoje (${dia})`
    : candidate.days_until_due === 1
      ? `vence amanhã (${dia})`
      : `vence em ${candidate.days_until_due} dias (${dia})`;

  return JSON.stringify({
    title: `Fatura do cartão ${candidate.name}`,
    body: `A fatura ${quando}. Confira o valor e programe o pagamento.`,
    url,
    tag: `card-due-${candidate.account_id}-${candidate.due_date}`,
    data: { type: 'card_due', account_id: candidate.account_id, url },
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
  { supabaseUrl, serviceRoleKey, candidates }: {
    supabaseUrl: string; serviceRoleKey: string; candidates: CardDueCandidate[];
  },
) {
  let claimed = 0;
  let sent = 0;
  let released = 0;

  for (const candidate of candidates) {
    const wasClaimed = await claimDispatchRow({ supabaseUrl, serviceRoleKey, candidate });
    if (!wasClaimed) continue;
    claimed += 1;

    const result = await sendToUserSubscriptions({
      supabaseUrl,
      serviceRoleKey,
      userId: candidate.user_id,
      payload: buildCardDuePayload(candidate),
    });
    sent += result.sent;

    if (result.sent === 0 && result.failed > 0) {
      await releaseDispatchRow({ supabaseUrl, serviceRoleKey, candidate });
      released += 1;
    }
  }

  return { candidates: candidates.length, claimed, sent, released };
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
  const authResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_card_due_dispatch_secret`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({ candidate: dispatchSecret }),
  });
  const isAuthorized = authResponse.ok && (await authResponse.json()) === true;
  if (!isAuthorized) {
    return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Segredo de disparo invalido.' } });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const candidates = await listCandidates({ supabaseUrl, serviceRoleKey });
  if (candidates === null) {
    return jsonResponse(502, { error: { code: 'CANDIDATES_FAILED', message: 'Nao foi possivel ler os cartoes com vencimento.' } });
  }

  const result = await processCandidates({ supabaseUrl, serviceRoleKey, candidates });

  return jsonResponse(200, { result });
});
