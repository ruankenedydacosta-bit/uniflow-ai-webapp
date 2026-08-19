begin;

-- AGPUSH1: integracao minima de Web Push com a Agenda (Fase 1 da
-- integracao, sobre a fundacao PUSH1/migration 042). Dois comportamentos
-- apenas: (1) pergunta "quer que eu te lembre?" enviada UMA vez no dia
-- anterior para compromissos elegiveis de amanha; (2) lembrete efetivo no
-- horario escolhido (30min/1h antes). Nenhuma automacao adicional, nenhum
-- push recorrente.
--
-- Deliberadamente SEPARADA da tabela notifications/sino: a auditoria
-- confirmou que listAgendaNotificationItemIds (agendaNotificationSync.js)
-- dedupe por type='agenda' + metadata.agenda_item_id, sem filtrar por
-- dismissed_at nem por origem -- inserir aqui sob o mesmo type faria a
-- sincronizacao do sino (que notifica quando o compromisso CHEGA, starts_at
-- <= now) enxergar o item como "ja notificado" pela nossa pergunta/lembrete
-- antecipado, e nunca mais criar a notificacao real de "compromisso
-- chegou". Nao alterar notifications/dismissed_at (041) nesta fase.
--
-- Nenhum estado absoluto de "hora do lembrete" e persistido: o worker
-- sempre le agenda_items.starts_at AO VIVO no momento do envio, entao
-- editar o horario do compromisso recalcula automaticamente o lembrete
-- (starts_at - reminder_offset_minutes), e cancelar (status != 'scheduled')
-- ou excluir (cascade) o compromisso interrompe qualquer push futuro sem
-- nenhuma logica extra de recalculo/cancelamento aqui.

create table public.agenda_push_reminders (
  id uuid primary key default gen_random_uuid(),
  agenda_item_id uuid not null unique references public.agenda_items(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Destinatario resolvido e CONGELADO no momento do envio da pergunta
  -- (assigned_user_id ?? created_by) -- assigned_user_id e editavel em
  -- agenda_items, mas re-mirar o destinatario de uma pergunta ja enviada
  -- criaria confusao (quem respondeu o que); a proxima pergunta so existe
  -- para um NOVO compromisso, nunca para este mesmo item.
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Credencial de posse para a acao de notificacao processada em
  -- background pelo Service Worker (sem sessao de usuario disponivel ali
  -- -- ver agenda-push-decision). Nunca exposto via SELECT ao cliente
  -- (fora da lista de colunas do GRANT abaixo); viaja so dentro do payload
  -- de push, criptografado ponta-a-ponta pelo proprio protocolo Web Push.
  decision_token uuid not null default gen_random_uuid(),
  prompt_sent_at timestamptz,
  reminder_offset_minutes integer,
  reminder_decision_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agenda_push_reminders_offset_check check (
    reminder_offset_minutes is null or reminder_offset_minutes in (30, 60)
  )
);

comment on table public.agenda_push_reminders is
  'AGPUSH1: estado de pergunta/lembrete de push por compromisso -- no maximo 1 pergunta e 1 lembrete efetivo por item. Nunca reutiliza notifications/sino (ver comentario acima).';
comment on column public.agenda_push_reminders.prompt_sent_at is
  'Preenchido quando a pergunta "quer que eu te lembre?" e enviada. NULL = ainda nao perguntado. A propria existencia da linha (INSERT ... ON CONFLICT DO NOTHING) e a trava de idempotencia contra o worker rodar mais de uma vez na janela.';
comment on column public.agenda_push_reminders.reminder_offset_minutes is
  'NULL enquanto reminder_decision_at tambem for NULL = ainda sem resposta (nunca reperguntar). NULL com reminder_decision_at preenchido = usuario escolheu "Nao precisa". 30 ou 60 = antecedencia escolhida.';
comment on column public.agenda_push_reminders.reminder_sent_at is
  'Preenchido quando o lembrete efetivo e enviado -- no maximo uma vez (UPDATE condicional WHERE reminder_sent_at IS NULL usado como trava de idempotencia).';
comment on column public.agenda_push_reminders.decision_token is
  'Token de posse opaco enviado dentro do payload de push (nunca legivel via API por outro meio) -- permite ao Service Worker registrar a decisao do botao de acao (30min/1h/Nao precisa) sem uma sessao de usuario ativa, mesmo com o app fechado.';

create index agenda_push_reminders_pending_prompt_idx
  on public.agenda_push_reminders (workspace_id)
  where prompt_sent_at is null;

create index agenda_push_reminders_pending_reminder_idx
  on public.agenda_push_reminders (workspace_id)
  where reminder_offset_minutes is not null and reminder_sent_at is null;

create trigger agenda_push_reminders_set_updated_at
before update on public.agenda_push_reminders
for each row execute function public.set_updated_at();

alter table public.agenda_push_reminders enable row level security;

-- Leitura: dono do item pode ver se ja foi perguntado/decidido (usada pelo
-- fallback iPhone/deep link para nao reperguntar quando outro dispositivo
-- ja respondeu). decision_token fica de fora do GRANT de SELECT abaixo.
create policy agenda_push_reminders_select_own
on public.agenda_push_reminders
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Escrita do cliente restrita ao caminho autenticado (modal de escolha
-- dentro do app, iPhone/fallback sem actions): so as duas colunas de
-- decisao, nunca prompt_sent_at/reminder_sent_at/decision_token/user_id/
-- workspace_id/agenda_item_id. O caminho de acao em background (Android,
-- sem sessao) usa a Edge Function agenda-push-decision com service role +
-- decision_token, nunca esta policy.
create policy agenda_push_reminders_update_own
on public.agenda_push_reminders
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.agenda_push_reminders from anon, authenticated;

grant select (
  id, agenda_item_id, workspace_id, user_id,
  prompt_sent_at, reminder_offset_minutes, reminder_decision_at, reminder_sent_at,
  created_at, updated_at
) on table public.agenda_push_reminders to authenticated;

grant update (reminder_offset_minutes, reminder_decision_at)
  on table public.agenda_push_reminders to authenticated;

-- Nenhum INSERT/DELETE para authenticated/anon: linhas nascem so pelo
-- worker (service role) e morrem so por cascade (compromisso excluido).

-- ============================================================================
-- Segredo de disparo do worker: gerado pelo proprio Postgres
-- (gen_random_bytes), nunca escrito literalmente nesta migration nem visto
-- fora do banco -- pg_cron le direto da tabela ao montar a chamada HTTP;
-- a Edge Function valida via a funcao verify_agenda_dispatch_secret abaixo
-- (SECURITY DEFINER, EXECUTE restrito a service_role), que tambem nunca
-- devolve o valor real, so um boolean. Isola o worker de chamadas externas
-- sem depender de nenhuma configuracao manual de secret (nem service_role
-- key, nem VAPID, precisam transitar por aqui).
-- ============================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table private.agenda_dispatch_secret (
  id boolean primary key default true,
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  constraint agenda_dispatch_secret_singleton check (id)
);

insert into private.agenda_dispatch_secret default values;

create or replace function public.verify_agenda_dispatch_secret(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.agenda_dispatch_secret where secret = candidate
  );
$$;

revoke all on function public.verify_agenda_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.verify_agenda_dispatch_secret(text) to service_role;

-- ============================================================================
-- Candidatos server-side. SECURITY INVOKER (rodam sob service_role, que ja
-- enxerga tudo) -- EXECUTE restrito a service_role: nunca expostos a
-- authenticated/anon, atravessam dados de todos os workspaces.
-- ============================================================================

-- Pass 1 -- compromissos elegiveis para a PERGUNTA: scheduled, com horario
-- explicito, nao all-day, cujo starts_at (convertido para America/Sao_Paulo,
-- unico fuso usado no projeto -- ver auditoria) cai amanha em relacao a
-- hoje local, e ainda sem linha em agenda_push_reminders (pergunta nunca
-- enviada). A janela de horario (18h-20h local) e responsabilidade do
-- CHAMADOR (Edge Function), nao desta funcao -- mantem a funcao pura/
-- testavel por si so.
create or replace function public.agenda_push_prompt_candidates()
returns table (
  agenda_item_id uuid,
  workspace_id uuid,
  user_id uuid,
  title text,
  starts_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    ai.id,
    ai.workspace_id,
    coalesce(ai.assigned_user_id, ai.created_by) as user_id,
    ai.title,
    ai.starts_at
  from public.agenda_items ai
  where ai.status = 'scheduled'
    and ai.has_explicit_time = true
    and ai.is_all_day = false
    and coalesce(ai.assigned_user_id, ai.created_by) is not null
    and (ai.starts_at at time zone 'America/Sao_Paulo')::date
      = ((now() at time zone 'America/Sao_Paulo')::date + 1)
    and not exists (
      select 1 from public.agenda_push_reminders r where r.agenda_item_id = ai.id
    );
$$;

revoke all on function public.agenda_push_prompt_candidates() from public, anon, authenticated;
grant execute on function public.agenda_push_prompt_candidates() to service_role;

-- Pass 2 -- lembretes efetivos vencidos: decisao tomada (offset 30/60),
-- ainda nao enviado, compromisso ainda scheduled (cancelamento interrompe
-- automaticamente), e o horario-alvo (starts_at ao vivo - offset) ja
-- chegou. starts_at sempre lido da linha atual de agenda_items -- editar o
-- horario do compromisso recalcula o alvo sem nenhuma acao adicional.
create or replace function public.agenda_push_reminder_candidates()
returns table (
  reminder_id uuid,
  agenda_item_id uuid,
  workspace_id uuid,
  user_id uuid,
  title text,
  starts_at timestamptz,
  reminder_offset_minutes integer
)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    ai.id,
    ai.workspace_id,
    r.user_id,
    ai.title,
    ai.starts_at,
    r.reminder_offset_minutes
  from public.agenda_push_reminders r
  join public.agenda_items ai on ai.id = r.agenda_item_id
  where ai.status = 'scheduled'
    and r.reminder_offset_minutes is not null
    and r.reminder_sent_at is null
    and now() >= (ai.starts_at - (r.reminder_offset_minutes || ' minutes')::interval);
$$;

revoke all on function public.agenda_push_reminder_candidates() from public, anon, authenticated;
grant execute on function public.agenda_push_reminder_candidates() to service_role;

-- ============================================================================
-- Agendamento: pg_cron chama a Edge Function a cada 5 minutos via pg_net
-- (async HTTP). Reaproveita infraestrutura ja disponivel no projeto
-- (extensoes pg_cron/pg_net existiam, so nao estavam habilitadas) -- nenhum
-- provedor novo introduzido.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select
  cron.schedule(
    'agenda-push-dispatch',
    '*/5 * * * *',
    $$
    select net.http_post(
      url := 'https://ikulazofzufeblzrhtif.supabase.co/functions/v1/agenda-push-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Dispatch-Secret', (select secret from private.agenda_dispatch_secret limit 1)
      ),
      body := '{}'::jsonb
    );
    $$
  );

commit;
