begin;

-- Épico #98 (Google Agenda), issue #99. Todas as tabelas do épico nascem
-- aqui: as migrations 056 (#100) e 057 (#101) não alteram estas tabelas.
-- Contrato no comentário do épico:
-- https://github.com/jonatasoc/uniflow-ai-webapp/issues/98#issuecomment-6042251103
--
-- O refresh token do Google fica no Supabase Vault. A tabela guarda só o id
-- do segredo, e a leitura e a escrita passam pelas RPCs abaixo, que só o
-- service_role executa.

-- ---------------------------------------------------------------------------
-- calendar_connections: uma conexão por pessoa, espaço e provedor.
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'google',
  account_email text,
  granted_scopes text[] not null default '{}'::text[],
  refresh_token_secret_id uuid,
  app_calendar_id text,
  destination_calendar_id text,
  status text not null default 'active',
  last_error_code text,
  last_error_at timestamptz,
  last_synced_at timestamptz,
  exportacao_inicial_em timestamptz,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_connections_provider_check check (provider in ('google')),
  constraint calendar_connections_status_check check (status in ('active', 'error')),
  constraint calendar_connections_last_error_code_check check (
    last_error_code is null
    or last_error_code in ('token_revogado', 'escopo_insuficiente', 'destino_ausente')
  ),
  constraint calendar_connections_user_workspace_provider_key unique (user_id, workspace_id, provider)
);

create index if not exists calendar_connections_workspace_idx
  on public.calendar_connections (workspace_id);

-- O disconnect só revoga no Google se nenhuma outra conexão ativa usa o
-- mesmo e-mail.
create index if not exists calendar_connections_account_email_idx
  on public.calendar_connections (provider, account_email)
  where status = 'active';

comment on table public.calendar_connections is
  'Conexão de uma pessoa, num espaço, com a agenda de um provedor. O refresh token fica no Vault.';

-- ---------------------------------------------------------------------------
-- calendar_connection_calendars: calendários da conta conectada.
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_connection_calendars (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  external_calendar_id text not null,
  summary text,
  time_zone text,
  access_role text not null,
  is_primary boolean not null default false,
  is_app_created boolean not null default false,
  is_read boolean not null default false,
  sync_token text,
  sync_window_start timestamptz,
  sync_window_end timestamptz,
  channel_id text,
  channel_resource_id text,
  channel_token text,
  channel_expires_at timestamptz,
  last_synced_at timestamptz,
  last_full_sync_at timestamptz,
  sync_lock_until timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_connection_calendars_access_role_check check (
    access_role in ('none', 'freeBusyReader', 'reader', 'writer', 'owner')
  ),
  constraint calendar_connection_calendars_connection_calendar_key unique (connection_id, external_calendar_id)
);

create unique index if not exists calendar_connection_calendars_channel_id_key
  on public.calendar_connection_calendars (channel_id)
  where channel_id is not null;

create index if not exists calendar_connection_calendars_channel_expires_idx
  on public.calendar_connection_calendars (channel_expires_at)
  where channel_expires_at is not null;

comment on table public.calendar_connection_calendars is
  'Calendários da conta conectada. sync_token, canal e trava de sync só para o service_role.';

-- ---------------------------------------------------------------------------
-- agenda_item_links: vínculo entre um item da agenda e o evento remoto.
-- Sem connection_id: a conexão se acha por (user_id, workspace_id, provider).
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_item_links (
  id uuid primary key default gen_random_uuid(),
  agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  calendar_id text not null,
  external_id text not null,
  etag text,
  remote_updated_at timestamptz,
  remote_seen_at timestamptz,
  origin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_item_links_provider_check check (provider in ('google')),
  constraint agenda_item_links_origin_check check (origin in ('app', 'provider')),
  constraint agenda_item_links_item_provider_key unique (agenda_item_id, provider),
  constraint agenda_item_links_remote_key unique (workspace_id, provider, calendar_id, external_id)
);

create index if not exists agenda_item_links_user_workspace_idx
  on public.agenda_item_links (user_id, workspace_id, provider);

comment on table public.agenda_item_links is
  'Vínculo entre agenda_items e o evento no provedor. Escrita só pelo service_role.';

-- ---------------------------------------------------------------------------
-- calendar_oauth_states: state do OAuth, uso único, expira em 10 minutos.
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'google',
  code_verifier text not null,
  return_path text not null,
  origin text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  constraint calendar_oauth_states_provider_check check (provider in ('google')),
  constraint calendar_oauth_states_state_hash_key unique (state_hash),
  constraint calendar_oauth_states_expires_check check (expires_at <= created_at + interval '10 minutes')
);

create index if not exists calendar_oauth_states_expires_idx
  on public.calendar_oauth_states (expires_at);

comment on table public.calendar_oauth_states is
  'State e PKCE do OAuth do Google Agenda. Só service_role. Consumido com DELETE ... RETURNING.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists calendar_connections_set_updated_at on public.calendar_connections;
create trigger calendar_connections_set_updated_at
before update on public.calendar_connections
for each row execute function public.set_updated_at();

drop trigger if exists calendar_connection_calendars_set_updated_at on public.calendar_connection_calendars;
create trigger calendar_connection_calendars_set_updated_at
before update on public.calendar_connection_calendars
for each row execute function public.set_updated_at();

drop trigger if exists agenda_item_links_set_updated_at on public.agenda_item_links;
create trigger agenda_item_links_set_updated_at
before update on public.agenda_item_links
for each row execute function public.set_updated_at();

-- user_id, workspace_id e provider não mudam. O destino precisa ser um
-- calendário da própria conexão com access_role = 'owner'.
create or replace function public.calendar_connections_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.workspace_id is distinct from old.workspace_id
    or new.provider is distinct from old.provider then
    raise exception 'calendar_connections: user_id, workspace_id e provider são imutáveis'
      using errcode = '42501';
  end if;

  if new.destination_calendar_id is not null
    and new.destination_calendar_id is distinct from old.destination_calendar_id
    and not exists (
      select 1
      from public.calendar_connection_calendars as calendar
      where calendar.connection_id = new.id
        and calendar.external_calendar_id = new.destination_calendar_id
        and calendar.access_role = 'owner'
    ) then
    raise exception 'calendar_connections: o destino precisa ser um calendário próprio da conexão'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists calendar_connections_guard_update on public.calendar_connections;
create trigger calendar_connections_guard_update
before update on public.calendar_connections
for each row execute function public.calendar_connections_guard_update();

-- Só calendário próprio (access_role = 'owner') pode ser lido.
create or replace function public.calendar_connection_calendars_guard_read()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_read and new.access_role <> 'owner' then
    raise exception 'calendar_connection_calendars: só calendário próprio pode ser lido'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_connection_calendars_guard_read on public.calendar_connection_calendars;
create trigger calendar_connection_calendars_guard_read
before insert or update on public.calendar_connection_calendars
for each row execute function public.calendar_connection_calendars_guard_read();

-- Apagar a conexão (disconnect, saída da conta) apaga o segredo do Vault.
create or replace function public.calendar_connections_delete_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.refresh_token_secret_id is not null then
    delete from vault.secrets where id = old.refresh_token_secret_id;
  end if;
  return old;
end;
$$;

drop trigger if exists calendar_connections_delete_secret on public.calendar_connections;
create trigger calendar_connections_delete_secret
after delete on public.calendar_connections
for each row execute function public.calendar_connections_delete_secret();

revoke execute on function public.calendar_connections_guard_update() from public, anon, authenticated;
revoke execute on function public.calendar_connection_calendars_guard_read() from public, anon, authenticated;
revoke execute on function public.calendar_connections_delete_secret() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS e grants por coluna
-- ---------------------------------------------------------------------------

alter table public.calendar_connections enable row level security;
alter table public.calendar_connection_calendars enable row level security;
alter table public.agenda_item_links enable row level security;
alter table public.calendar_oauth_states enable row level security;

revoke all on table public.calendar_connections from anon, authenticated;
revoke all on table public.calendar_connection_calendars from anon, authenticated;
revoke all on table public.agenda_item_links from anon, authenticated;
revoke all on table public.calendar_oauth_states from anon, authenticated;

grant all on table public.calendar_connections to service_role;
grant all on table public.calendar_connection_calendars to service_role;
grant all on table public.agenda_item_links to service_role;
grant all on table public.calendar_oauth_states to service_role;

-- Sem refresh_token_secret_id.
grant select (
  id, user_id, workspace_id, provider, account_email, granted_scopes,
  app_calendar_id, destination_calendar_id, status, last_error_code,
  last_error_at, last_synced_at, exportacao_inicial_em, connected_at,
  created_at, updated_at
) on public.calendar_connections to authenticated;
grant update (destination_calendar_id) on public.calendar_connections to authenticated;

-- Sem sync_token, channel_id, channel_resource_id, channel_token e sync_lock_until.
grant select (
  id, connection_id, external_calendar_id, summary, time_zone, access_role,
  is_primary, is_app_created, is_read, sync_window_start, sync_window_end,
  channel_expires_at, last_synced_at, last_full_sync_at, last_sync_error,
  created_at, updated_at
) on public.calendar_connection_calendars to authenticated;
grant update (is_read) on public.calendar_connection_calendars to authenticated;

grant select on public.agenda_item_links to authenticated;

drop policy if exists calendar_connections_select_own on public.calendar_connections;
create policy calendar_connections_select_own
on public.calendar_connections
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists calendar_connections_update_own on public.calendar_connections;
create policy calendar_connections_update_own
on public.calendar_connections
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists calendar_connection_calendars_select_own on public.calendar_connection_calendars;
create policy calendar_connection_calendars_select_own
on public.calendar_connection_calendars
for select
to authenticated
using (
  exists (
    select 1
    from public.calendar_connections as connection
    where connection.id = calendar_connection_calendars.connection_id
      and connection.user_id = (select auth.uid())
  )
);

drop policy if exists calendar_connection_calendars_update_own on public.calendar_connection_calendars;
create policy calendar_connection_calendars_update_own
on public.calendar_connection_calendars
for update
to authenticated
using (
  exists (
    select 1
    from public.calendar_connections as connection
    where connection.id = calendar_connection_calendars.connection_id
      and connection.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.calendar_connections as connection
    where connection.id = calendar_connection_calendars.connection_id
      and connection.user_id = (select auth.uid())
  )
);

drop policy if exists agenda_item_links_select_own on public.agenda_item_links;
create policy agenda_item_links_select_own
on public.agenda_item_links
for select
to authenticated
using (user_id = (select auth.uid()));

-- calendar_oauth_states: RLS ligada e nenhuma policy. Só service_role.

-- ---------------------------------------------------------------------------
-- RPCs do Vault (só service_role)
-- ---------------------------------------------------------------------------

create or replace function public.calendar_connection_set_refresh_token(
  p_connection_id uuid,
  p_refresh_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if p_connection_id is null or coalesce(btrim(p_refresh_token), '') = '' then
    raise exception 'calendar_connection_set_refresh_token: parâmetros inválidos';
  end if;

  select connection.refresh_token_secret_id
  into v_secret_id
  from public.calendar_connections as connection
  where connection.id = p_connection_id
  for update;

  if not found then
    raise exception 'calendar_connection_set_refresh_token: conexão inexistente';
  end if;

  if v_secret_id is not null and exists (select 1 from vault.secrets where id = v_secret_id) then
    perform vault.update_secret(v_secret_id, p_refresh_token);
    return;
  end if;

  v_secret_id := vault.create_secret(
    p_refresh_token,
    null,
    'Refresh token do Google Agenda da conexão ' || p_connection_id::text
  );

  update public.calendar_connections
  set refresh_token_secret_id = v_secret_id
  where id = p_connection_id;
end;
$$;

create or replace function public.calendar_connection_get_refresh_token(p_connection_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select secret.decrypted_secret
  from public.calendar_connections as connection
  join vault.decrypted_secrets as secret on secret.id = connection.refresh_token_secret_id
  where connection.id = p_connection_id;
$$;

revoke execute on function public.calendar_connection_set_refresh_token(uuid, text) from public, anon, authenticated;
revoke execute on function public.calendar_connection_get_refresh_token(uuid) from public, anon, authenticated;
grant execute on function public.calendar_connection_set_refresh_token(uuid, text) to service_role;
grant execute on function public.calendar_connection_get_refresh_token(uuid) to service_role;

commit;
