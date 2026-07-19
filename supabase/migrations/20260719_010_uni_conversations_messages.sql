begin;

-- Uni Chat conversations and messages.
-- Conversations belong to a user and are scoped to a workspace for separation.
-- Messages cascade-delete with their parent conversation.

create table public.uni_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workspace_type text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint uni_conversations_workspace_type_check check (
    workspace_type in ('personal', 'business')
  )
);

create table public.uni_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.uni_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  message_type text not null default 'text',
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  client_message_id text,
  created_at timestamptz not null default now(),
  constraint uni_messages_role_check check (
    role in ('user', 'assistant', 'system')
  ),
  constraint uni_messages_message_type_check check (
    message_type in ('text', 'confirmation', 'alert', 'suggestion')
  )
);

create index uni_conversations_user_workspace_idx
  on public.uni_conversations (user_id, workspace_id, updated_at desc);

create index uni_conversations_workspace_idx
  on public.uni_conversations (workspace_id, updated_at desc);

create index uni_conversations_archived_idx
  on public.uni_conversations (archived_at)
  where archived_at is null;

create index uni_messages_conversation_idx
  on public.uni_messages (conversation_id, created_at);

create unique index uni_messages_client_id_uidx
  on public.uni_messages (conversation_id, client_message_id)
  where client_message_id is not null;

create index uni_messages_user_idx
  on public.uni_messages (user_id);

alter table public.uni_conversations enable row level security;
alter table public.uni_messages enable row level security;

-- Conversations: user can only access their own conversations.
create policy uni_conversations_select_own
  on public.uni_conversations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy uni_conversations_insert_own
  on public.uni_conversations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy uni_conversations_update_own
  on public.uni_conversations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy uni_conversations_delete_own
  on public.uni_conversations
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Messages: user can only access messages from their own conversations.
create policy uni_messages_select_own
  on public.uni_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.uni_conversations as conv
      where conv.id = conversation_id
        and conv.user_id = (select auth.uid())
    )
  );

create policy uni_messages_insert_own
  on public.uni_messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.uni_conversations as conv
      where conv.id = conversation_id
        and conv.user_id = (select auth.uid())
    )
  );

create policy uni_messages_update_own
  on public.uni_messages
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.uni_conversations as conv
      where conv.id = conversation_id
        and conv.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.uni_conversations as conv
      where conv.id = conversation_id
        and conv.user_id = (select auth.uid())
    )
  );

create policy uni_messages_delete_own
  on public.uni_messages
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.uni_conversations as conv
      where conv.id = conversation_id
        and conv.user_id = (select auth.uid())
    )
  );

-- Triggers for updated_at
create trigger uni_conversations_set_updated_at
  before update on public.uni_conversations
  for each row execute function public.set_updated_at();

-- Grants
revoke all on table public.uni_conversations from anon, authenticated;
revoke all on table public.uni_messages from anon, authenticated;

grant select on table public.uni_conversations to authenticated;
grant insert (user_id, workspace_id, workspace_type, title)
  on public.uni_conversations to authenticated;
grant update (title, archived_at)
  on public.uni_conversations to authenticated;
grant delete on table public.uni_conversations to authenticated;

grant select on table public.uni_messages to authenticated;
grant insert (conversation_id, user_id, role, message_type, content, metadata, client_message_id)
  on public.uni_messages to authenticated;
grant update (message_type, content, metadata)
  on public.uni_messages to authenticated;
grant delete on table public.uni_messages to authenticated;

comment on table public.uni_conversations is
  'Conversas do Uni Chat; pertencem ao usuario e sao isoladas por workspace.';
comment on table public.uni_messages is
  'Mensagens de cada conversa; metadata carrega highlight, confirmation e displayTime.';
comment on column public.uni_messages.client_message_id is
  'Identificador estavel do front-end para idempotencia ao salvar mensagens.';

commit;
