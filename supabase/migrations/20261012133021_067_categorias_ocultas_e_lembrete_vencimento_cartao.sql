begin;

-- #184: ocultar categoria por espaço e lembrete do vencimento do cartão.
--
-- Parte 1. Categoria oculta. A pessoa esconde uma categoria que não usa
-- (inclusive as padrão do UniFlow, que ela não pode editar nem excluir). A
-- categoria some da lista de Organizar, dos seletores e das sugestões da
-- Uni, e fica num grupo "Ocultas" no fim da lista, de onde volta. Como vale
-- também para categoria de sistema (workspace_id nulo, compartilhada por
-- todos os espaços), ocultar é uma relação (espaço, categoria) e não uma
-- coluna em categories.
--
-- Parte 2. Lembrete do vencimento do cartão por Web Push, 2 dias antes do
-- due_day, no mesmo mecanismo do lembrete mensal de metas (063): tabela de
-- idempotência, segredo e função de candidatos próprios, pg_cron chamando a
-- Edge Function card-due-push-dispatch via pg_net.

-- ============================================================================
-- Parte 1: categorias ocultas por espaço
-- ============================================================================

create table if not exists public.workspace_hidden_categories (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  hidden_by uuid default auth.uid() references auth.users(id) on delete set null,
  hidden_at timestamptz not null default now(),
  primary key (workspace_id, category_id)
);

comment on table public.workspace_hidden_categories is
  '#184: categorias que um espaço escondeu da lista, dos seletores e das sugestões da Uni. Vale para categoria do espaço e para categoria padrão do sistema. Apagar a linha reexibe a categoria.';

alter table public.workspace_hidden_categories enable row level security;

revoke all on table public.workspace_hidden_categories from anon, authenticated;
grant all on table public.workspace_hidden_categories to service_role;
grant select on public.workspace_hidden_categories to authenticated;
grant insert (workspace_id, category_id) on public.workspace_hidden_categories to authenticated;
grant delete on public.workspace_hidden_categories to authenticated;

drop policy if exists workspace_hidden_categories_select_member on public.workspace_hidden_categories;
create policy workspace_hidden_categories_select_member
on public.workspace_hidden_categories
for select
to authenticated
using (public.is_workspace_member(workspace_id));

-- A categoria precisa ser visível no espaço: do próprio espaço ou de
-- sistema. Mesma checagem de category_budgets (060). As padrão de último
-- recurso (Outras despesas, Outras entradas, Transferência) não podem ser
-- ocultadas: a Uni conta com elas quando nada mais serve. O cliente aplica
-- a mesma regra em podeOcultarCategoria (categoryUtils.js).
drop policy if exists workspace_hidden_categories_insert_contributor on public.workspace_hidden_categories;
create policy workspace_hidden_categories_insert_contributor
on public.workspace_hidden_categories
for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[])
  and exists (
    select 1
    from public.categories as c
    where c.id = category_id
      and (c.workspace_id is null or c.workspace_id = workspace_hidden_categories.workspace_id)
      and not (
        c.is_system = true
        and lower(c.name) in ('outras despesas', 'outras entradas', 'transferência')
      )
  )
);

drop policy if exists workspace_hidden_categories_delete_contributor on public.workspace_hidden_categories;
create policy workspace_hidden_categories_delete_contributor
on public.workspace_hidden_categories
for delete
to authenticated
using (public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[]));

-- ============================================================================
-- Parte 2: lembrete do vencimento do cartão
-- ============================================================================

-- Próximo vencimento a partir de uma data: o due_day deste mês se ainda não
-- passou, senão o do mês seguinte. Dia maior que o mês cai no último dia
-- (31 em abril vira 30), como cicloDoCartao em contasOrganizar.js.
create or replace function public.proxima_data_de_vencimento(p_due_day integer, p_hoje date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_mes date;
  v_data date;
begin
  if p_due_day is null or p_hoje is null or p_due_day < 1 or p_due_day > 31 then
    return null;
  end if;

  v_mes := date_trunc('month', p_hoje)::date;
  v_data := least(v_mes + (p_due_day - 1), (v_mes + interval '1 month')::date - 1);
  if v_data >= p_hoje then
    return v_data;
  end if;

  v_mes := (v_mes + interval '1 month')::date;
  return least(v_mes + (p_due_day - 1), (v_mes + interval '1 month')::date - 1);
end;
$$;

comment on function public.proxima_data_de_vencimento(integer, date) is
  '#184: primeira data de vencimento (due_day) igual ou posterior a p_hoje. Dia maior que o mês cai no último dia do mês.';

revoke all on function public.proxima_data_de_vencimento(integer, date) from public, anon;
grant execute on function public.proxima_data_de_vencimento(integer, date) to authenticated, service_role;

-- Idempotência: no máximo um lembrete por cartão, pessoa e vencimento. O
-- worker grava a linha ANTES de enviar (INSERT ... ON CONFLICT DO NOTHING):
-- quem não criar a linha não envia, mesmo com o cron rodando várias vezes.
create table if not exists public.card_due_push_dispatches (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_date date not null,
  sent_at timestamptz not null default now(),
  primary key (account_id, user_id, due_date)
);

comment on table public.card_due_push_dispatches is
  '#184: registro de que o lembrete do vencimento do cartão já foi disparado para a pessoa naquele vencimento. Idempotência do worker card-due-push-dispatch.';

-- Tabela só do backend (service_role ignora RLS), mesmo padrão de
-- goal_reminder_push_dispatches (063).
alter table public.card_due_push_dispatches enable row level security;
revoke all on table public.card_due_push_dispatches from anon, authenticated;

-- Segredo de disparo próprio, gerado pelo Postgres e conferido só como
-- boolean (mesmo mecanismo de 043/047/063).
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.card_due_dispatch_secret (
  id boolean primary key default true,
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  constraint card_due_dispatch_secret_singleton check (id)
);

insert into private.card_due_dispatch_secret default values
on conflict (id) do nothing;

create or replace function public.verify_card_due_dispatch_secret(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.card_due_dispatch_secret where secret = candidate
  );
$$;

revoke all on function public.verify_card_due_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.verify_card_due_dispatch_secret(text) to service_role;

-- Candidatos do dia. SECURITY INVOKER, EXECUTE só para service_role:
-- atravessa os cartões de todos os espaços.
--
-- Um par (cartão, pessoa) recebe lembrete quando:
-- - o cartão está ativo, é credit_card e tem due_day;
-- - o próximo vencimento está a 2 dias ou menos (0 a 2). O primeiro envio
--   sai 2 dias antes; os dias 1 e 0 cobrem cartão cadastrado em cima da
--   hora e rodada que falhou em todos os dispositivos;
-- - a pessoa é membro ativo do espaço do cartão com papel que registra
--   lançamento (owner, admin, member). Viewer não paga a fatura pelo app e
--   não recebe o aviso;
-- - esse par ainda não recebeu o lembrete deste vencimento.
--
-- Cartão sem due_day nunca entra.
create or replace function public.card_due_push_candidates()
returns table (
  account_id uuid,
  user_id uuid,
  workspace_id uuid,
  name text,
  due_date date,
  days_until_due integer
)
language sql
stable
set search_path = ''
as $$
  with hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as dia
  ),
  cartoes as (
    select
      a.id,
      a.workspace_id,
      a.name,
      hoje.dia,
      public.proxima_data_de_vencimento(a.due_day, hoje.dia) as due_date
    from public.accounts a
    cross join hoje
    where a.account_type = 'credit_card'
      and a.is_active = true
      and a.due_day between 1 and 31
  )
  select
    c.id,
    m.user_id,
    c.workspace_id,
    c.name,
    c.due_date,
    (c.due_date - c.dia)::integer
  from cartoes c
  join public.workspace_members m
    on m.workspace_id = c.workspace_id
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'member')
  where c.due_date - c.dia between 0 and 2
    and not exists (
      select 1 from public.card_due_push_dispatches d
      where d.account_id = c.id
        and d.user_id = m.user_id
        and d.due_date = c.due_date
    );
$$;

comment on function public.card_due_push_candidates() is
  '#184: pares (cartão, membro) que recebem o lembrete do vencimento hoje. Só service_role executa.';

-- O cron consulta os candidatos de hora em hora. O índice parcial restringe
-- a varredura aos cartões ativos com vencimento.
create index if not exists accounts_credit_card_due_day_idx
  on public.accounts (due_day)
  where account_type = 'credit_card' and is_active = true and due_day is not null;

revoke all on function public.card_due_push_candidates() from public, anon, authenticated;
grant execute on function public.card_due_push_candidates() to service_role;

-- Agendamento: de hora em hora entre 12h e 22h UTC (9h a 19h em
-- America/Sao_Paulo). O primeiro disparo do dia sai às 9h. O cron só chama
-- a função quando há candidato. A URL do projeto vem do Vault
-- (project_url). Sem project_url, a migration não falha, para não travar a
-- fila de migrations, e só avisa.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    raise warning 'card-due-push-dispatch: cadastre project_url no Vault, senão o cron não chama a função';
  end if;
end;
$$;

select cron.schedule(
  'card-due-push-dispatch',
  '0 12-22 * * *',
  $cron$
  select net.http_post(
    url := segredo.decrypted_secret || '/functions/v1/card-due-push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Dispatch-Secret', (select secret from private.card_due_dispatch_secret limit 1)
    ),
    body := '{}'::jsonb
  )
  from vault.decrypted_secrets as segredo
  where segredo.name = 'project_url'
    and exists (select 1 from public.card_due_push_candidates());
  $cron$
);

commit;
