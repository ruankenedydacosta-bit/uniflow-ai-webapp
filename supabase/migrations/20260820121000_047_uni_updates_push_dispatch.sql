begin;

-- UNIUPD3: Web Push real para a Central de Novidades -- até aqui, a
-- notificação de "nova atualização da Uni" só nascia quando o próprio
-- cliente (useUniUpdates.js) detectava a novidade pendente, o que exige o
-- usuário ter aberto o app pelo menos uma vez depois da publicação. Esta
-- migration adiciona um worker server-side (mesmo padrão de AGPUSH1/
-- migration 043) que envia a notificação via Web Push mesmo com o app
-- fechado -- o registro no Centro de Notificações (sino) continua
-- existindo exatamente como antes, sem nenhuma alteração; este é um
-- canal ADICIONAL, nunca um substituto.
--
-- Deliberadamente uma tabela/segredo/função PRÓPRIOS, nunca reaproveitando
-- agenda_push_reminders/agenda_dispatch_secret: "visto" (user_seen_updates)
-- e "pergunta/lembrete de compromisso" são conceitos de domínios
-- diferentes; e cada worker isolado limita o raio de um segredo
-- eventualmente comprometido a um único tipo de push.

-- ============================================================================
-- Idempotência do envio: "recebeu push desta novidade" é um fato próprio,
-- nunca confundido com user_seen_updates (que significa "confirmou
-- Atualização concluída" -- ver migration 044). Misturar as duas faria o
-- cliente parar de destacar/perguntar uma novidade que o usuário só
-- RECEBEU por push, mas ainda não abriu/confirmou.
-- ============================================================================

create table public.uni_update_push_dispatches (
  user_id uuid not null references auth.users(id) on delete cascade,
  update_id uuid not null references public.updates(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, update_id)
);

comment on table public.uni_update_push_dispatches is
  'UNIUPD3: registro de que o Web Push de uma novidade já foi disparado para um usuário -- idempotência do worker, nunca confundir com user_seen_updates (confirmação do usuário).';

-- Tabela 100% backend (worker via service_role, que ignora RLS) -- RLS
-- habilitado sem nenhuma policy: nenhum acesso de authenticated/anon é
-- necessário nem intencional (mesmo padrão já aceito neste projeto para
-- tabelas backend-only, ex.: billing_customers/webhook_events).
alter table public.uni_update_push_dispatches enable row level security;
revoke all on table public.uni_update_push_dispatches from anon, authenticated;

-- ============================================================================
-- Segredo de disparo do worker -- mesmo mecanismo de private.
-- agenda_dispatch_secret (migration 043): gerado pelo próprio Postgres,
-- nunca escrito literalmente aqui, validado só como boolean via função
-- SECURITY DEFINER. Segredo PRÓPRIO (não o de Agenda) -- isola o raio de
-- um comprometimento a um único worker.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table private.uni_updates_dispatch_secret (
  id boolean primary key default true,
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  constraint uni_updates_dispatch_secret_singleton check (id)
);

insert into private.uni_updates_dispatch_secret default values;

create or replace function public.verify_uni_updates_dispatch_secret(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.uni_updates_dispatch_secret where secret = candidate
  );
$$;

revoke all on function public.verify_uni_updates_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.verify_uni_updates_dispatch_secret(text) to service_role;

-- ============================================================================
-- Candidatos server-side -- SECURITY INVOKER (roda sob service_role, que
-- já enxerga tudo); EXECUTE restrito a service_role, nunca exposto a
-- authenticated/anon (atravessa auth.users de todos os usuários).
--
-- Só a novidade ATIVA mais recente importa (mesmo recorte de
-- resolvePendingUpdate em uniUpdatesData.js -- a Home só destaca "existe
-- pendente?", nunca cada versão histórica). Um usuário é candidato quando:
-- (1) já existia quando a novidade foi publicada (nunca incomoda quem se
-- cadastrou depois, mesma regra de resolvePendingUpdate); (2) ainda não
-- confirmou "Atualização concluída"; (3) ainda não recebeu este push.
-- ============================================================================

create or replace function public.uni_updates_push_candidates()
returns table (
  user_id uuid,
  update_id uuid,
  version text,
  title text
)
language sql
stable
set search_path = ''
as $$
  select
    u.id as user_id,
    latest.id as update_id,
    latest.version,
    latest.title
  from (
    select id, version, title, created_at
    from public.updates
    where active = true
    order by created_at desc
    limit 1
  ) as latest
  cross join auth.users u
  where u.created_at < latest.created_at
    and not exists (
      select 1 from public.user_seen_updates s
      where s.user_id = u.id and s.update_id = latest.id
    )
    and not exists (
      select 1 from public.uni_update_push_dispatches d
      where d.user_id = u.id and d.update_id = latest.id
    );
$$;

revoke all on function public.uni_updates_push_candidates() from public, anon, authenticated;
grant execute on function public.uni_updates_push_candidates() to service_role;

-- ============================================================================
-- Agendamento: pg_cron chama a Edge Function uni-updates-push-dispatch a
-- cada 5 minutos via pg_net (mesma cadência/infraestrutura de AGPUSH1) --
-- publicar é raro; a varredura fica vazia (candidatos = 0) na grande
-- maioria das execuções, sem custo relevante.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select
  cron.schedule(
    'uni-updates-push-dispatch',
    '*/5 * * * *',
    $$
    select net.http_post(
      url := 'https://ikulazofzufeblzrhtif.supabase.co/functions/v1/uni-updates-push-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Dispatch-Secret', (select secret from private.uni_updates_dispatch_secret limit 1)
      ),
      body := '{}'::jsonb
    );
    $$
  );

commit;
