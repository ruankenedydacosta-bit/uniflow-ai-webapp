// Edge Function: agenda-push-dispatch
//
// AGPUSH1: worker server-side (invocado por pg_cron a cada 5 minutos, ver
// migration 043) que processa os DOIS unicos comportamentos desta fase:
//
// 1. PERGUNTA -- para compromissos elegiveis de amanha (scheduled, horario
//    explicito, nao all-day), entre 18h-20h America/Sao_Paulo do dia
//    anterior, envia UMA pergunta "quer que eu te lembre?" por
//    compromisso. A trava de idempotencia e um INSERT...ON CONFLICT DO
//    NOTHING em agenda_push_reminders (unique em agenda_item_id): so quem
//    de fato criar a linha processa o envio, mesmo que o worker rode
//    varias vezes na janela de 2h (24 execucoes de 5 em 5 minutos).
//
// 2. LEMBRETE EFETIVO -- quando o horario escolhido (30min/1h antes)
//    chega, envia o lembrete final. Trava de idempotencia: UPDATE
//    condicional (WHERE reminder_sent_at IS NULL) via PostgREST,
//    RETURNING so confirma as linhas realmente reivindicadas por ESTA
//    chamada.
//
// Nunca aceita usuario/workspace/payload arbitrario do chamador -- os
// unicos candidatos processados vem das funcoes SQL
// agenda_push_prompt_candidates()/agenda_push_reminder_candidates()
// (service role, ja fazem todo o filtro de elegibilidade). Nenhum estado
// absoluto de horario e persistido: starts_at e sempre lido AO VIVO de
// agenda_items em cada chamada, entao editar o horario de um compromisso
// recalcula o lembrete automaticamente, e cancelar/excluir o compromisso
// interrompe qualquer push futuro sem nenhuma logica extra aqui.
//
// Autenticacao do chamador: nenhum JWT de usuario (isto roda sem sessao,
// disparado pelo proprio banco via pg_net) -- um segredo opaco gerado pelo
// Postgres (private.agenda_dispatch_secret, migration 043) e comparado via
// RPC verify_agenda_dispatch_secret (SECURITY DEFINER, nunca devolve o
// valor real, so um boolean). Todas as chamadas a dados usam
// SUPABASE_SERVICE_ROLE_KEY (injetado automaticamente pelo runtime da Edge
// Function, nunca configurado manualmente) -- necessario porque o worker
// precisa enxergar todos os workspaces, ao contrario de
// push-send-test-notification (sempre escopado ao proprio usuario
// autenticado).

import webpush from 'npm:web-push@3.6.7';

const TIMEZONE = 'America/Sao_Paulo';
const PROMPT_WINDOW_START_HOUR = 18;
const PROMPT_WINDOW_END_HOUR = 20;

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

// Hora local (America/Sao_Paulo) do instante atual -- unico fuso usado
// pelo projeto (auditoria confirmou nenhum profiles.timezone e nenhuma
// coluna equivalente; a NLU de Agenda/financeiro ja assume este mesmo
// fuso em varios pontos do codebase).
function currentSaoPauloHour(now: Date) {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    hour12: false,
  }).format(now);
  return Number.parseInt(formatted, 10);
}

function formatSaoPauloTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface PromptCandidate {
  agenda_item_id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  starts_at: string;
}

interface ReminderCandidate {
  reminder_id: string;
  agenda_item_id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  starts_at: string;
  reminder_offset_minutes: number;
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

async function claimPromptRow(
  { supabaseUrl, serviceRoleKey, candidate }: {
    supabaseUrl: string; serviceRoleKey: string; candidate: PromptCandidate;
  },
): Promise<{ decisionToken: string } | null> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/agenda_push_reminders?on_conflict=agenda_item_id&select=decision_token`,
    {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey, {
        Prefer: 'resolution=ignore-duplicates,return=representation',
      }),
      body: JSON.stringify([{
        agenda_item_id: candidate.agenda_item_id,
        workspace_id: candidate.workspace_id,
        user_id: candidate.user_id,
        prompt_sent_at: new Date().toISOString(),
      }]),
    },
  );
  if (!response.ok) return null;
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { decisionToken: rows[0].decision_token };
}

async function claimReminderRow(
  { supabaseUrl, serviceRoleKey, reminderId }: {
    supabaseUrl: string; serviceRoleKey: string; reminderId: string;
  },
): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/agenda_push_reminders?id=eq.${reminderId}&reminder_sent_at=is.null&select=id`,
    {
      method: 'PATCH',
      headers: serviceHeaders(serviceRoleKey, { Prefer: 'return=representation' }),
      body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
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

// AGPUSH1 (diagnostico): registra o resultado de UMA tentativa de envio --
// somente campos sanitizados (nunca endpoint/p256dh/auth/decision_token/
// VAPID). push_service_status vem do proprio retorno/erro da lib web-push
// (mesmo objeto que ja decide sent/revoked/failed, nunca uma segunda
// leitura); permite provar de verdade se o push service aceitou o envio,
// em vez de inferir isso indiretamente pelo contador.
function logPushAttempt({
  subscriptionId, platform, payloadType, outcome, pushServiceStatus,
}: {
  subscriptionId: string;
  platform: string | null;
  payloadType: 'prompt' | 'reminder';
  outcome: 'sent' | 'revoked' | 'failed';
  pushServiceStatus: number | null;
}) {
  console.log(JSON.stringify({
    at: 'agenda-push-dispatch',
    subscription_id: subscriptionId,
    platform,
    payload_type: payloadType,
    outcome,
    push_service_status: pushServiceStatus,
  }));
}

// Envia o mesmo payload para TODAS as subscriptions ativas do usuario
// (multi-device: Android + iPhone recebem ambos) -- a decisao/estado e do
// COMPROMISSO (agenda_push_reminders), nunca do dispositivo.
async function sendToUserSubscriptions(
  { supabaseUrl, serviceRoleKey, userId, payloadType, buildPayload }: {
    supabaseUrl: string;
    serviceRoleKey: string;
    userId: string;
    payloadType: 'prompt' | 'reminder';
    buildPayload: (subscription: ActiveSubscription) => string;
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
        buildPayload(subscription),
      );
      sent += 1;
      logPushAttempt({
        subscriptionId: subscription.id,
        platform: subscription.platform,
        payloadType,
        outcome: 'sent',
        pushServiceStatus: (result as { statusCode?: number })?.statusCode ?? null,
      });
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode ?? null;
      if (statusCode === 404 || statusCode === 410) {
        await revokeSubscription({ supabaseUrl, serviceRoleKey, subscriptionId: subscription.id });
        revoked += 1;
        logPushAttempt({
          subscriptionId: subscription.id, platform: subscription.platform, payloadType, outcome: 'revoked', pushServiceStatus: statusCode,
        });
      } else {
        failed += 1;
        logPushAttempt({
          subscriptionId: subscription.id, platform: subscription.platform, payloadType, outcome: 'failed', pushServiceStatus: statusCode,
        });
      }
    }
  }));

  return { sent, revoked, failed, subscriptionCount: subscriptions.length };
}

// AGPUSH1: actions so quando a plataforma suporta de forma confiavel
// (Android/Chrome) -- registradas por push_subscriptions.platform, nunca
// por sniffing no momento do envio. iOS/Safari nunca recebe `actions`;
// depende do fallback de deep link (ver push-notifications-bridge.js/
// notificationclick).
//
// Somente DUAS actions (30min/1h) -- "Nao precisa" deixou de ser um
// terceiro botao: ignorar/dispensar a notificacao ja produz o mesmo
// resultado (nenhuma decisao registrada -> nenhum lembrete enviado -> a
// pergunta nunca repete, pela mesma trava de idempotencia de sempre). O
// fallback sem actions (iPhone/deep link) continua oferecendo as tres
// opcoes no modal dentro do app -- so a notificacao nativa do Android
// muda.
function buildPromptPayload(candidate: PromptCandidate, decisionToken: string, subscription: ActiveSubscription) {
  const time = formatSaoPauloTime(candidate.starts_at);
  const isAndroid = subscription.platform === 'android';
  const url = `/app/agenda?item=${candidate.agenda_item_id}&reminderPrompt=1`;

  return JSON.stringify({
    title: 'Uni ✦',
    body: `Você tem um compromisso amanhã às ${time}.\nQuer que eu te lembre antes?`,
    url,
    // AGPUSH1 (endurecimento, nao a causa raiz investigada): tag estavel
    // por compromisso -- um reenvio/teste repetido para o MESMO item
    // substitui a notificacao anterior na bandeja em vez de empilhar uma
    // segunda copia. Elimina uma classe inteira de ambiguidade "em qual
    // notificacao o usuario realmente tocou" quando ha testes repetidos.
    tag: `agenda-reminder-prompt-${candidate.agenda_item_id}`,
    data: {
      type: 'agenda_reminder_prompt',
      agenda_item_id: candidate.agenda_item_id,
      decision_token: decisionToken,
      url,
    },
    ...(isAndroid ? {
      actions: [
        { action: 'agenda_remind_30', title: '30 min antes' },
        { action: 'agenda_remind_60', title: '1h antes' },
      ],
    } : {}),
  });
}

function buildReminderPayload(candidate: ReminderCandidate) {
  const time = formatSaoPauloTime(candidate.starts_at);
  const label = candidate.reminder_offset_minutes === 60 ? '1 hora' : '30 minutos';
  const url = `/app/agenda?item=${candidate.agenda_item_id}`;

  return JSON.stringify({
    title: 'Uni ✦',
    body: `Seu compromisso começa em ${label}.\n\n${candidate.title} — ${time}`,
    url,
    data: { type: 'agenda_reminder_due', agenda_item_id: candidate.agenda_item_id, url },
  });
}

async function processPrompts(
  { supabaseUrl, serviceRoleKey }: { supabaseUrl: string; serviceRoleKey: string },
) {
  const candidates = await callRpc<PromptCandidate>({ supabaseUrl, serviceRoleKey, fn: 'agenda_push_prompt_candidates' });
  let claimed = 0;
  let sent = 0;

  for (const candidate of candidates) {
    const claim = await claimPromptRow({ supabaseUrl, serviceRoleKey, candidate });
    if (!claim) continue;
    claimed += 1;

    const result = await sendToUserSubscriptions({
      supabaseUrl,
      serviceRoleKey,
      userId: candidate.user_id,
      payloadType: 'prompt',
      buildPayload: (subscription) => buildPromptPayload(candidate, claim.decisionToken, subscription),
    });
    sent += result.sent;
  }

  return { candidates: candidates.length, claimed, sent };
}

async function processReminders(
  { supabaseUrl, serviceRoleKey }: { supabaseUrl: string; serviceRoleKey: string },
) {
  const candidates = await callRpc<ReminderCandidate>({ supabaseUrl, serviceRoleKey, fn: 'agenda_push_reminder_candidates' });
  let claimed = 0;
  let sent = 0;

  for (const candidate of candidates) {
    const wasClaimed = await claimReminderRow({ supabaseUrl, serviceRoleKey, reminderId: candidate.reminder_id });
    if (!wasClaimed) continue;
    claimed += 1;

    const result = await sendToUserSubscriptions({
      supabaseUrl,
      serviceRoleKey,
      userId: candidate.user_id,
      payloadType: 'reminder',
      buildPayload: () => buildReminderPayload(candidate),
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
  const authResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_agenda_dispatch_secret`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({ candidate: dispatchSecret }),
  });
  const isAuthorized = authResponse.ok && (await authResponse.json()) === true;
  if (!isAuthorized) {
    return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Segredo de disparo invalido.' } });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // AGPUSH1: modo de teste interno -- SOMENTE acessivel a quem ja possui o
  // segredo de disparo (nunca exposto ao frontend/usuarios comuns, ver
  // migration 043). Ignora a janela de 18h-20h para permitir validar o
  // envio da pergunta sem esperar o horario real; a regra real de
  // elegibilidade (scheduled/has_explicit_time/is_all_day/"e amanha") e as
  // funcoes SQL permanecem inalteradas -- so a checagem de horario-do-dia,
  // feita aqui no worker, e pulada.
  let bypassPromptWindow = false;
  try {
    const body = await request.json();
    bypassPromptWindow = body?.test_bypass_window === true;
  } catch {
    bypassPromptWindow = false;
  }

  const now = new Date();
  const hour = currentSaoPauloHour(now);
  const withinPromptWindow = hour >= PROMPT_WINDOW_START_HOUR && hour < PROMPT_WINDOW_END_HOUR;

  const prompts = (withinPromptWindow || bypassPromptWindow)
    ? await processPrompts({ supabaseUrl, serviceRoleKey })
    : { candidates: 0, claimed: 0, sent: 0, skipped: 'outside_prompt_window' as const };

  const reminders = await processReminders({ supabaseUrl, serviceRoleKey });

  return jsonResponse(200, { prompts, reminders });
});
