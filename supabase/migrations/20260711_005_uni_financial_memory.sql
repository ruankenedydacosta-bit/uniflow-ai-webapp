begin;

-- Memória financeira explicável. Esta migration não copia histórico bruto,
-- não armazena áudio/transcrições e não conecta nenhum serviço externo.

create or replace function public.uni_memory_json_is_safe(payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item record;
begin
  if payload is null then
    return true;
  end if;

  if jsonb_typeof(payload) = 'object' then
    for item in select key, value from jsonb_each(payload)
    loop
      if lower(item.key) ~ '(token|secret|password|certificate|private_key|raw_provider_data|audio|transcript|health|religion|politic)' then
        return false;
      end if;
      if not public.uni_memory_json_is_safe(item.value) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for item in select value from jsonb_array_elements(payload)
    loop
      if not public.uni_memory_json_is_safe(item.value) then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

create table public.uni_financial_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null,
  memory_key text not null,
  memory_value jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0,
  status text not null default 'candidate',
  source text not null,
  user_confirmed boolean not null default false,
  requires_confirmation boolean not null default true,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uni_financial_memories_workspace_id_id_key unique (workspace_id, id),
  constraint uni_financial_memories_identity_key unique (workspace_id, user_id, memory_type, memory_key),
  constraint uni_financial_memories_type_check check (memory_type in (
    'category_preference', 'account_preference', 'merchant_category_mapping',
    'recurring_income', 'recurring_expense', 'spending_pattern',
    'financial_goal_context', 'conversation_preference'
  )),
  constraint uni_financial_memories_status_check check (status in (
    'candidate', 'confirmed', 'rejected', 'expired', 'superseded'
  )),
  constraint uni_financial_memories_source_check check (source in (
    'explicit_user', 'user_correction', 'transaction_pattern',
    'conversation_context', 'backend_analysis'
  )),
  constraint uni_financial_memories_key_not_blank check (length(btrim(memory_key)) between 1 and 160),
  constraint uni_financial_memories_value_object_check check (jsonb_typeof(memory_value) = 'object'),
  constraint uni_financial_memories_value_safe_check check (public.uni_memory_json_is_safe(memory_value)),
  constraint uni_financial_memories_confidence_check check (confidence between 0 and 1),
  constraint uni_financial_memories_observation_order_check check (last_observed_at >= first_observed_at),
  constraint uni_financial_memories_expiration_order_check check (expires_at is null or expires_at > last_observed_at),
  constraint uni_financial_memories_confirmation_check check (
    (status = 'confirmed' and user_confirmed = true)
    or (status <> 'confirmed' and user_confirmed = false)
  )
);

create table public.uni_memory_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  memory_id uuid not null,
  transaction_id uuid,
  account_id uuid,
  evidence_type text not null,
  evidence_summary jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint uni_memory_evidence_memory_fk foreign key (workspace_id, memory_id)
    references public.uni_financial_memories(workspace_id, id) on delete cascade,
  constraint uni_memory_evidence_transaction_fk foreign key (workspace_id, transaction_id)
    references public.transactions(workspace_id, id) on delete cascade,
  constraint uni_memory_evidence_account_fk foreign key (workspace_id, account_id)
    references public.accounts(workspace_id, id) on delete cascade,
  constraint uni_memory_evidence_type_not_blank check (length(btrim(evidence_type)) between 1 and 80),
  constraint uni_memory_evidence_reference_check check (transaction_id is not null or account_id is not null),
  constraint uni_memory_evidence_summary_object_check check (jsonb_typeof(evidence_summary) = 'object'),
  constraint uni_memory_evidence_summary_safe_check check (public.uni_memory_json_is_safe(evidence_summary))
);

create index uni_financial_memories_workspace_status_idx
  on public.uni_financial_memories (workspace_id, status, last_observed_at desc);
create index uni_financial_memories_user_type_idx
  on public.uni_financial_memories (user_id, memory_type, status);
create index uni_financial_memories_expiration_idx
  on public.uni_financial_memories (expires_at) where expires_at is not null;
create index uni_memory_evidence_workspace_memory_idx
  on public.uni_memory_evidence (workspace_id, memory_id, observed_at desc);
create index uni_memory_evidence_transaction_idx
  on public.uni_memory_evidence (transaction_id) where transaction_id is not null;

create or replace function public.protect_uni_memory_frontend_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id <> auth.uid()
      or new.status <> 'candidate'
      or new.user_confirmed
      or new.source not in ('explicit_user', 'user_correction') then
      raise exception 'Frontend may only create explicit unconfirmed candidates';
    end if;
    return new;
  end if;

  if new.workspace_id is distinct from old.workspace_id
    or new.user_id is distinct from old.user_id
    or new.memory_type is distinct from old.memory_type
    or new.memory_key is distinct from old.memory_key
    or new.memory_value is distinct from old.memory_value
    or new.confidence is distinct from old.confidence
    or new.source is distinct from old.source
    or new.first_observed_at is distinct from old.first_observed_at
    or new.last_observed_at is distinct from old.last_observed_at then
    raise exception 'Frontend may not rewrite memory evidence or identity';
  end if;

  if new.status not in ('confirmed', 'rejected')
    or new.user_confirmed <> (new.status = 'confirmed') then
    raise exception 'Frontend memory decision is invalid';
  end if;
  return new;
end;
$$;

create trigger uni_financial_memories_protect_frontend
before insert or update on public.uni_financial_memories
for each row execute function public.protect_uni_memory_frontend_write();

create trigger uni_financial_memories_set_updated_at
before update on public.uni_financial_memories
for each row execute function public.set_updated_at();

alter table public.uni_financial_memories enable row level security;
alter table public.uni_memory_evidence enable row level security;

create policy uni_financial_memories_select_active_member
on public.uni_financial_memories for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy uni_financial_memories_insert_explicit_owner
on public.uni_financial_memories for insert to authenticated
with check (
  user_id = auth.uid()
  and status = 'candidate'
  and user_confirmed = false
  and source in ('explicit_user', 'user_correction')
  and public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[])
);

create policy uni_financial_memories_update_own_decision
on public.uni_financial_memories for update to authenticated
using (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[])
)
with check (
  user_id = auth.uid()
  and status in ('confirmed', 'rejected')
  and public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[])
);

create policy uni_financial_memories_delete_own
on public.uni_financial_memories for delete to authenticated
using (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[])
);

create policy uni_memory_evidence_select_active_member
on public.uni_memory_evidence for select to authenticated
using (public.is_workspace_member(workspace_id));

revoke all on table public.uni_financial_memories from anon, authenticated;
revoke all on table public.uni_memory_evidence from anon, authenticated;

grant select on table public.uni_financial_memories to authenticated;
grant insert (
  workspace_id, user_id, memory_type, memory_key, memory_value, confidence,
  status, source, user_confirmed, requires_confirmation, first_observed_at,
  last_observed_at, expires_at
) on public.uni_financial_memories to authenticated;
grant update (status, user_confirmed)
  on public.uni_financial_memories to authenticated;
grant delete on table public.uni_financial_memories to authenticated;
grant select on table public.uni_memory_evidence to authenticated;

revoke all on function public.uni_memory_json_is_safe(jsonb) from public, anon, authenticated;
revoke all on function public.protect_uni_memory_frontend_write() from public, anon, authenticated;

comment on table public.uni_financial_memories is
  'Fatos financeiros resumidos, explicáveis e revisáveis; não substitui o histórico de transações.';
comment on table public.uni_memory_evidence is
  'Referências mínimas usadas para explicar memórias, sem payload bancário bruto.';

commit;
