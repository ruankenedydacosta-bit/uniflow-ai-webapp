begin;

-- #160: lembrete mensal do aporte de uma meta, por Web Push. A pessoa
-- escolhe o dia do mês (reminder_day, 1 a 28) e, nesse dia, recebe um push
-- com o nome da meta e o valor planejado para o mês. Mesmo padrão dos
-- workers de push existentes (043 agenda, 047 novidades): tabela de
-- idempotência, segredo e função de candidatos próprios, pg_cron chamando a
-- Edge Function goal-reminder-push-dispatch via pg_net.
--
-- O teto é 28 para que todo mês tenha o dia escolhido: um lembrete no dia
-- 31 sumiria em fevereiro, abril, junho, setembro e novembro.

alter table public.financial_goals
  add column if not exists reminder_day smallint;

alter table public.financial_goals
  drop constraint if exists financial_goals_reminder_day_check;

alter table public.financial_goals
  add constraint financial_goals_reminder_day_check
  check (reminder_day is null or reminder_day between 1 and 28);

comment on column public.financial_goals.reminder_day is
  'Dia do mês (1 a 28) em que a pessoa recebe o lembrete do aporte por push. NULL = sem lembrete.';

-- Grants por coluna (ver 011): sem isso o cliente não grava o dia.
grant insert (reminder_day), update (reminder_day)
  on public.financial_goals to authenticated;

-- ============================================================================
-- Idempotência: no máximo um lembrete por meta por mês. reference_month é o
-- primeiro dia do mês em America/Sao_Paulo. O worker grava a linha ANTES de
-- enviar (INSERT ... ON CONFLICT DO NOTHING): quem não criar a linha não
-- envia, mesmo com o cron rodando várias vezes no dia.
-- ============================================================================

create table if not exists public.goal_reminder_push_dispatches (
  goal_id uuid not null references public.financial_goals(id) on delete cascade,
  reference_month date not null,
  sent_at timestamptz not null default now(),
  primary key (goal_id, reference_month)
);

comment on table public.goal_reminder_push_dispatches is
  '#160: registro de que o lembrete mensal do aporte de uma meta já foi disparado no mês. Idempotência do worker goal-reminder-push-dispatch.';

-- Tabela só do backend (service_role ignora RLS), mesmo padrão de
-- uni_update_push_dispatches (047).
alter table public.goal_reminder_push_dispatches enable row level security;
revoke all on table public.goal_reminder_push_dispatches from anon, authenticated;

-- ============================================================================
-- Segredo de disparo próprio, gerado pelo Postgres e conferido só como
-- boolean (mesmo mecanismo de 043/047/060).
-- ============================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.goal_reminder_dispatch_secret (
  id boolean primary key default true,
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  constraint goal_reminder_dispatch_secret_singleton check (id)
);

insert into private.goal_reminder_dispatch_secret default values
on conflict (id) do nothing;

create or replace function public.verify_goal_reminder_dispatch_secret(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.goal_reminder_dispatch_secret where secret = candidate
  );
$$;

revoke all on function public.verify_goal_reminder_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.verify_goal_reminder_dispatch_secret(text) to service_role;

-- ============================================================================
-- Candidatos do dia. SECURITY INVOKER, EXECUTE só para service_role:
-- atravessa as metas de todos os usuários.
--
-- Uma meta recebe lembrete quando:
-- - está ativa e não arquivada (pausada, concluída e cancelada ficam de fora);
-- - ainda não atingiu o valor-alvo;
-- - o dia de hoje em America/Sao_Paulo é o reminder_day dela;
-- - não recebeu aporte neste mês. O filtro c.amount > 0 já prepara a
--   retirada da #158, que vai gravar aporte com valor negativo;
-- - ainda não recebeu o lembrete deste mês.
-- ============================================================================

create or replace function public.goal_reminder_push_candidates()
returns table (
  goal_id uuid,
  user_id uuid,
  name text,
  planned_monthly_amount numeric,
  reference_month date
)
language sql
stable
set search_path = ''
as $$
  with hoje as (
    select
      (now() at time zone 'America/Sao_Paulo')::date as dia,
      date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as mes
  )
  select
    g.id,
    g.user_id,
    g.name,
    g.planned_monthly_amount,
    hoje.mes
  from public.financial_goals g
  cross join hoje
  where g.status = 'active'
    and g.archived_at is null
    and g.reminder_day = extract(day from hoje.dia)
    and g.current_amount < g.target_amount
    and not exists (
      select 1 from public.goal_contributions c
      where c.goal_id = g.id
        and c.amount > 0
        and c.contribution_date >= hoje.mes
        and c.contribution_date < (hoje.mes + interval '1 month')::date
    )
    and not exists (
      select 1 from public.goal_reminder_push_dispatches d
      where d.goal_id = g.id
        and d.reference_month = hoje.mes
    );
$$;

-- O cron consulta os candidatos de hora em hora. O índice parcial restringe
-- a varredura às metas ativas com lembrete.
create index if not exists financial_goals_reminder_day_idx
  on public.financial_goals (reminder_day)
  where reminder_day is not null and status = 'active' and archived_at is null;

revoke all on function public.goal_reminder_push_candidates() from public, anon, authenticated;
grant execute on function public.goal_reminder_push_candidates() to service_role;

-- ============================================================================
-- Agendamento: de hora em hora entre 12h e 22h UTC (9h a 19h em
-- America/Sao_Paulo, que não tem horário de verão desde 2019). O primeiro
-- disparo do dia sai às 9h. Os seguintes pegam a meta cujo envio falhou em
-- todos os dispositivos: o worker apaga a linha de idempotência nesse caso.
-- O cron só chama a função quando há
-- candidato. A URL do projeto vem do Vault (project_url), nunca escrita
-- aqui. Sem project_url, a migration não falha, para não travar a fila de
-- migrations, e só avisa.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    raise warning 'goal-reminder-push-dispatch: cadastre project_url no Vault, senão o cron não chama a função';
  end if;
end;
$$;

select cron.schedule(
  'goal-reminder-push-dispatch',
  '0 12-22 * * *',
  $cron$
  select net.http_post(
    url := segredo.decrypted_secret || '/functions/v1/goal-reminder-push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Dispatch-Secret', (select secret from private.goal_reminder_dispatch_secret limit 1)
    ),
    body := '{}'::jsonb
  )
  from vault.decrypted_secrets as segredo
  where segredo.name = 'project_url'
    and exists (select 1 from public.goal_reminder_push_candidates());
  $cron$
);

commit;
