begin;

-- =============================================================================
-- Migration 013: Garantia idempotente de RLS para o fluxo de sessao.
--
-- Objetivo: Assegurar que profiles, workspaces e subscriptions tenham RLS
-- ativo, policies minimas e grants corretos para o fluxo synchronizeSession
-- (SELECT apenas). Reaplicavel sem efeitos colaterais.
--
-- Nao desabilita RLS, nao usa service_role e nao altera migrations anteriores.
-- =============================================================================

-- RLS ativo (idempotente) ------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.subscriptions enable row level security;

-- Profiles ---------------------------------------------------------------
-- Policy: usuario ve apenas o proprio perfil.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

-- Policy: usuario altera apenas o proprio perfil, com validacao de workspace
-- ativo via membership.
drop policy if exists profiles_update_own on public.profiles;
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

-- Grants de profiles: authenticated tem SELECT e UPDATE limitado a colunas
-- de autogerenciamento. anon nao tem acesso.
grant select on table public.profiles to authenticated;
grant update (
  full_name,
  avatar_url,
  phone,
  user_mode,
  current_workspace_id,
  onboarding_completed
) on public.profiles to authenticated;

-- Workspaces -------------------------------------------------------------
-- Policy de SELECT: permite leitura por owner_user_id OU membership ativa.
-- Substitui a policy legada `workspaces_select_active_member` que exigia
-- membership mesmo para o proprio dono (corrige INSERT ... RETURNING).
drop policy if exists workspaces_select_active_member on public.workspaces;
drop policy if exists workspaces_select_owner_or_active_member on public.workspaces;
create policy workspaces_select_owner_or_active_member
on public.workspaces
for select
to authenticated
using (
  owner_user_id = (select auth.uid())
  or public.is_workspace_member(id)
);

-- Policy de INSERT: usuario cria workspace como owner.
drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner
on public.workspaces
for insert
to authenticated
with check (owner_user_id = (select auth.uid()));

-- Policy de UPDATE: owner e admin podem alterar dados do workspace.
drop policy if exists workspaces_update_owner_or_admin on public.workspaces;
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

-- Policy de DELETE: apenas owner pode remover o workspace.
drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner
on public.workspaces
for delete
to authenticated
using (public.is_workspace_member(id, array['owner']::text[]));

-- Grants de workspaces: authenticated tem CRUD completo com colunas
-- controladas. anon nao tem acesso.
grant select on table public.workspaces to authenticated;
grant insert (name, workspace_type, owner_user_id)
  on public.workspaces to authenticated;
grant update (name, workspace_type)
  on public.workspaces to authenticated;
grant delete on table public.workspaces to authenticated;

-- Subscriptions ----------------------------------------------------------
-- Policy de SELECT: usuario ve assinaturas apenas de workspaces onde e
-- membro ativo. Escrita e exclusivamente backend/Edge Function.
drop policy if exists subscriptions_select_active_member on public.subscriptions;
create policy subscriptions_select_active_member
on public.subscriptions
for select
to authenticated
using (public.is_workspace_member(workspace_id));

-- Grants de subscriptions: apenas SELECT para authenticated.
grant select on table public.subscriptions to authenticated;

commit;
