begin;

-- UNIUPD1: Central de Novidades da Uni -- changelog oficial da aplicação.
-- Conteúdo curado (versão/título/descrição), o mesmo para todos os
-- usuários; NUNCA editável pelo cliente (só leitura via RLS -- publicar
-- uma novidade é uma operação de conteúdo, feita por migração/service
-- role, o mesmo modelo já usado para dados de referência). "Visto" é
-- por usuário (user_seen_updates), nunca uma coluna na própria linha.

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  icon text not null default '✨',
  title text not null,
  description text not null default '',
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint updates_version_format_check check (
    version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  )
);

create index updates_active_created_idx
  on public.updates (created_at desc)
  where active = true;

alter table public.updates enable row level security;

-- Qualquer usuário autenticado lê o changelog ativo -- nunca insere,
-- atualiza ou apaga (conteúdo é publicado fora do app).
create policy updates_select_active
  on public.updates
  for select
  to authenticated
  using (active = true);

revoke all on table public.updates from anon, authenticated;
grant select on table public.updates to authenticated;

comment on table public.updates is
  'UNIUPD1: changelog oficial da Uni (Central de Novidades) -- conteúdo curado, somente leitura pelo cliente.';
comment on column public.updates.version is
  'Versionamento semântico (MAJOR.MINOR.PATCH) -- ver appIdentity.js (APP_VERSION) no frontend.';
comment on column public.updates.features is
  'Lista opcional de destaques curtos (array de strings) exibidos como bullets sob a descrição.';

-- UNIUPD1: quais novidades cada usuário já marcou como vistas ("Atualização
-- concluída"). Mesmo padrão de isolamento por dono já usado em
-- notifications (NOTIF1) -- nunca leitura/escrita cruzada entre usuários.
-- Chave composta (user_id, update_id): "visto" é um fato binário por par,
-- nunca precisa de um id próprio nem de múltiplas linhas.

create table public.user_seen_updates (
  user_id uuid not null references auth.users(id) on delete cascade,
  update_id uuid not null references public.updates(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, update_id)
);

create index user_seen_updates_user_idx
  on public.user_seen_updates (user_id);

alter table public.user_seen_updates enable row level security;

create policy user_seen_updates_select_own
  on public.user_seen_updates
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- UNIUPD1: marcar como visto é sempre idempotente do lado do cliente
-- (upsert com ON CONFLICT DO NOTHING, ver uniUpdatesService.js) -- a
-- policy só garante que cada usuário só grava a própria marca, nunca em
-- nome de outro.
create policy user_seen_updates_insert_own
  on public.user_seen_updates
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_seen_updates from anon, authenticated;
grant select on table public.user_seen_updates to authenticated;
grant insert (user_id, update_id) on table public.user_seen_updates to authenticated;

comment on table public.user_seen_updates is
  'UNIUPD1: marca de "visto" por usuário para cada novidade -- nunca uma coluna em updates (o changelog é o mesmo para todos).';

commit;
