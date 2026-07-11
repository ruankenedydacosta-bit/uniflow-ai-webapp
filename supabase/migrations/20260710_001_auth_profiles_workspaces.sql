begin;

-- Base de identidade e isolamento da Fase 2. Esta migration nao cria dados
-- financeiros nem conecta o frontend ao Supabase.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  workspace_type text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_not_blank check (length(btrim(name)) > 0),
  constraint workspaces_type_check check (
    workspace_type in ('personal', 'business')
  )
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  user_mode text not null default 'personal',
  current_workspace_id uuid references public.workspaces(id) on delete set null,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_user_mode_check check (
    user_mode in ('personal', 'business', 'both')
  )
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint workspace_members_role_check check (
    role in ('owner', 'admin', 'member', 'viewer')
  ),
  constraint workspace_members_status_check check (
    status in ('active', 'invited', 'disabled')
  ),
  constraint workspace_members_workspace_user_key unique (workspace_id, user_id)
);

create table public.plans (
  id text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint plans_id_check check (
    id in ('free', 'pro', 'business', 'enterprise')
  )
);

insert into public.plans (id, name, description)
values
  ('free', 'Free', 'Plano inicial para a experiencia financeira pessoal.'),
  ('pro', 'Pro', 'Plano pessoal com recursos e historico ampliados.'),
  ('business', 'Business', 'Plano para workspaces empresariais e modo duplo.'),
  ('enterprise', 'Enterprise', 'Plano futuro para governanca e escala avancadas.')
on conflict (id) do nothing;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id text not null references public.plans(id) on delete restrict,
  status text not null default 'active',
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (
    status in ('trialing', 'active', 'past_due', 'canceled', 'expired')
  )
);

create table public.site_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  phone text,
  source text,
  status text not null default 'lead',
  converted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_leads_email_not_blank check (length(btrim(email)) > 0),
  constraint site_leads_status_check check (
    status in ('lead', 'vip', 'invited', 'converted', 'archived')
  )
);

create index workspaces_owner_user_id_idx
  on public.workspaces (owner_user_id);

create index profiles_current_workspace_id_idx
  on public.profiles (current_workspace_id);

create index workspace_members_user_status_idx
  on public.workspace_members (user_id, status);

create index workspace_members_workspace_status_idx
  on public.workspace_members (workspace_id, status);

create index subscriptions_workspace_status_idx
  on public.subscriptions (workspace_id, status);

create index subscriptions_plan_id_idx
  on public.subscriptions (plan_id);

create unique index site_leads_email_lower_uidx
  on public.site_leads (lower(email));

create index site_leads_status_idx
  on public.site_leads (status);

create index site_leads_converted_user_id_idx
  on public.site_leads (converted_user_id)
  where converted_user_id is not null;

-- SECURITY DEFINER evita recursao nas policies de workspace_members. O usuario
-- consultado sempre vem de auth.uid(); nenhum caller escolhe outro user_id.
create or replace function public.is_workspace_member(
  target_workspace_id uuid,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = target_workspace_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and (
        allowed_roles is null
        or member.role = any(allowed_roles)
      )
  );
$$;

-- Criar um workspace e sua membership de owner e uma unica operacao. Isso nao
-- cria workspace no cadastro; apenas evita um workspace explicitamente criado
-- ficar inacessivel ao proprio dono.
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role, status)
  values (new.id, new.owner_user_id, 'owner', 'active')
  on conflict (workspace_id, user_id)
  do update set
    role = excluded.role,
    status = excluded.status;

  return new;
end;
$$;

create trigger on_workspace_created
after insert on public.workspaces
for each row execute function public.handle_new_workspace();

-- O Auth cria somente o profile. Workspaces serao criados pelo fluxo de
-- onboarding em uma etapa futura e explicita.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(
      btrim(
        coalesce(
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create trigger site_leads_set_updated_at
before update on public.site_leads
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.site_leads enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check (
  (select auth.uid()) = id
  and (
    current_workspace_id is null
    or public.is_workspace_member(current_workspace_id)
  )
);

create policy workspaces_select_active_member
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id));

create policy workspaces_insert_owner
on public.workspaces
for insert
to authenticated
with check (owner_user_id = (select auth.uid()));

create policy workspaces_update_owner_or_admin
on public.workspaces
for update
to authenticated
using (
  public.is_workspace_member(id, array['owner', 'admin']::text[])
)
with check (
  public.is_workspace_member(id, array['owner', 'admin']::text[])
);

create policy workspaces_delete_owner
on public.workspaces
for delete
to authenticated
using (public.is_workspace_member(id, array['owner']::text[]));

create policy workspace_members_select_active_member
on public.workspace_members
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy workspace_members_insert_owner_or_admin
on public.workspace_members
for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, array['owner']::text[])
  or (
    public.is_workspace_member(workspace_id, array['admin']::text[])
    and role <> 'owner'
  )
);

create policy workspace_members_update_owner_or_admin
on public.workspace_members
for update
to authenticated
using (
  public.is_workspace_member(workspace_id, array['owner']::text[])
  or (
    public.is_workspace_member(workspace_id, array['admin']::text[])
    and role <> 'owner'
  )
)
with check (
  public.is_workspace_member(workspace_id, array['owner']::text[])
  or (
    public.is_workspace_member(workspace_id, array['admin']::text[])
    and role <> 'owner'
  )
);

create policy workspace_members_delete_owner_or_admin
on public.workspace_members
for delete
to authenticated
using (
  public.is_workspace_member(workspace_id, array['owner']::text[])
  or (
    public.is_workspace_member(workspace_id, array['admin']::text[])
    and role <> 'owner'
  )
);

create policy plans_select_active
on public.plans
for select
to anon, authenticated
using (active = true);

create policy subscriptions_select_active_member
on public.subscriptions
for select
to authenticated
using (public.is_workspace_member(workspace_id));

-- Captura publica limitada: anon/authenticated nao escolhem status, timestamps
-- ou converted_user_id. Leitura e operacoes administrativas ficam fechadas;
-- uma API/Edge Function futura devera usar service role somente no backend.
create policy site_leads_insert_capture
on public.site_leads
for insert
to anon, authenticated
with check (
  status = 'lead'
  and converted_user_id is null
);

-- Grants por operacao/coluna complementam RLS e evitam que o cliente altere
-- ownership, timestamps, status de lead ou assinatura.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.workspaces from anon, authenticated;
revoke all on table public.workspace_members from anon, authenticated;
revoke all on table public.plans from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.site_leads from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (
  full_name,
  avatar_url,
  phone,
  user_mode,
  current_workspace_id,
  onboarding_completed
) on public.profiles to authenticated;

grant select on table public.workspaces to authenticated;
grant insert (name, workspace_type, owner_user_id)
  on public.workspaces to authenticated;
grant update (name, workspace_type)
  on public.workspaces to authenticated;
grant delete on table public.workspaces to authenticated;

grant select on table public.workspace_members to authenticated;
grant insert (workspace_id, user_id, role, status)
  on public.workspace_members to authenticated;
grant update (role, status)
  on public.workspace_members to authenticated;
grant delete on table public.workspace_members to authenticated;

grant select on table public.plans to anon, authenticated;
grant select on table public.subscriptions to authenticated;

grant insert (email, full_name, phone, source)
  on public.site_leads to anon, authenticated;

revoke all on function public.is_workspace_member(uuid, text[]) from public;
grant execute on function public.is_workspace_member(uuid, text[])
  to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_workspace() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

comment on table public.profiles is
  'Perfil do usuario autenticado; criado automaticamente a partir de auth.users.';
comment on table public.workspaces is
  'Fronteira de isolamento entre dados pessoais e empresariais.';
comment on table public.workspace_members is
  'Membership e papeis que autorizam acesso a cada workspace.';
comment on table public.subscriptions is
  'Assinaturas por workspace; escrita reservada ao backend nesta fase.';
comment on table public.site_leads is
  'Leads compartilhados entre site e app; operacoes administrativas sao backend-only.';

commit;
