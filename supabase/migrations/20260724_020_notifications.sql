begin;

-- NOTIF1: central de notificações internas da aplicação. Uma notificação
-- pertence sempre a um único usuário; workspace_id é opcional (nulo =
-- notificação "global", visível em qualquer espaço PF/PJ do usuário).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null default '',
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (
    type in ('financeiro', 'metas', 'agenda', 'crm', 'sistema', 'uni')
  ),
  -- Defesa em profundidade (a validação real fica no app -- ver
  -- notificationFormatting.js isSafeInternalUrl): mesmo se um valor
  -- inválido chegasse aqui, nunca é uma URL absoluta http(s) nem
  -- protocol-relative ("//").
  constraint notifications_action_url_internal_check check (
    action_url is null
    or (action_url like '/%' and action_url not like '//%')
  )
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

create index notifications_workspace_idx
  on public.notifications (workspace_id)
  where workspace_id is not null;

alter table public.notifications enable row level security;

-- Usuário só lê e atualiza as próprias notificações -- sem acesso entre
-- usuários. Inserção também restrita a user_id = auth.uid(): permite seeds
-- locais controlados (ex.: notificação de boas-vindas ao concluir o
-- onboarding) sem exigir um backend/service-role, sem nunca permitir que um
-- usuário crie notificações para outro.
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy notifications_insert_own
  on public.notifications
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Grants
revoke all on table public.notifications from anon, authenticated;

grant select on table public.notifications to authenticated;
grant insert (user_id, workspace_id, type, title, message, action_url, metadata)
  on public.notifications to authenticated;
-- Update restrito a read_at: marcar como lida é a única mutação permitida
-- pelo cliente; título/mensagem/tipo de uma notificação nunca são
-- editáveis depois de criada.
grant update (read_at)
  on public.notifications to authenticated;

comment on table public.notifications is
  'Notificações internas da aplicação (NOTIF1); sempre isoladas por usuário, opcionalmente por workspace.';
comment on column public.notifications.workspace_id is
  'Nulo = notificação global, visível em qualquer espaço PF/PJ do usuário.';
comment on column public.notifications.action_url is
  'Rota interna opcional (sempre começa com uma única barra); nunca uma URL externa.';

commit;
