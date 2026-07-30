begin;

-- Memória financeira explicável. Esta migration não copia histórico bruto,
-- não armazena áudio/transcrições e não conecta nenhum serviço externo.

create or replace function public.uni_memory_json_is_safe(
  payload jsonb,
  current_depth integer default 0
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item record;
  container_size integer;
begin
  if payload is null then
    return true;
  end if;

  if current_depth > 8 or octet_length(payload::text) > 16384 then
    return false;
  end if;

  if jsonb_typeof(payload) = 'object' then
    select count(*) into container_size from jsonb_object_keys(payload);
    if container_size > 64 then
      return false;
    end if;
    for item in select key, value from jsonb_each(payload)
    loop
      if lower(item.key) ~ '(token|secret|password|credential|certificate|private_key|raw_provider_data|audio|transcript|health|religion|politic)' then
        return false;
      end if;
      if not public.uni_memory_json_is_safe(item.value, current_depth + 1) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    if jsonb_array_length(payload) > 50 then
      return false;
    end if;
    for item in select value from jsonb_array_elements(payload)
    loop
      if not public.uni_memory_json_is_safe(item.value, current_depth + 1) then
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
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memory_type text not null,
  memory_key text not null,
  memory_value jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 1,
  status text not null default 'candidate',
  source text not null,
  user_confirmed boolean not null default false,
  requires_confirmation boolean not null default false,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  expires_at timestamptz,
  superseded_by_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uni_financial_memories_workspace_id_id_key unique (workspace_id, id),
  constraint uni_financial_memories_superseded_by_fk foreign key (workspace_id, superseded_by_id)
    references public.uni_financial_memories(workspace_id, id)
    on delete cascade,
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
  constraint uni_financial_memories_key_safe_check check (
    lower(memory_key) !~ '(token|secret|password|credential|certificate|private_key|raw_provider|audio|transcript)'
  ),
  constraint uni_financial_memories_value_object_check check (jsonb_typeof(memory_value) = 'object'),
  constraint uni_financial_memories_value_safe_check check (public.uni_memory_json_is_safe(memory_value)),
  constraint uni_financial_memories_value_size_check check (octet_length(memory_value::text) <= 16384),
  constraint uni_financial_memories_confidence_check check (confidence between 0 and 1),
  constraint uni_financial_memories_observation_order_check check (last_observed_at >= first_observed_at),
  constraint uni_financial_memories_expiration_order_check check (expires_at is null or expires_at > last_observed_at),
  constraint uni_financial_memories_expired_status_check check (
    status <> 'expired' or expires_at is not null
  ),
  constraint uni_financial_memories_superseded_status_check check (
    (status = 'superseded' and superseded_by_id is not null and superseded_by_id <> id)
    or (status <> 'superseded' and superseded_by_id is null)
  ),
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
  source text not null,
  evidence_summary jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint uni_memory_evidence_memory_fk foreign key (workspace_id, memory_id)
    references public.uni_financial_memories(workspace_id, id) on delete cascade,
  constraint uni_memory_evidence_transaction_fk foreign key (workspace_id, transaction_id)
    references public.transactions(workspace_id, id) on delete set null (transaction_id),
  constraint uni_memory_evidence_account_fk foreign key (workspace_id, account_id)
    references public.accounts(workspace_id, id) on delete set null (account_id),
  constraint uni_memory_evidence_type_not_blank check (length(btrim(evidence_type)) between 1 and 80),
  constraint uni_memory_evidence_source_check check (source in (
    'transaction', 'account', 'user_correction',
    'conversation_context', 'backend_analysis'
  )),
  constraint uni_memory_evidence_summary_object_check check (jsonb_typeof(evidence_summary) = 'object'),
  constraint uni_memory_evidence_summary_safe_check check (public.uni_memory_json_is_safe(evidence_summary)),
  constraint uni_memory_evidence_summary_size_check check (octet_length(evidence_summary::text) <= 8192)
);

create index uni_financial_memories_workspace_status_idx
  on public.uni_financial_memories (workspace_id, status, last_observed_at desc);
create index uni_financial_memories_user_type_idx
  on public.uni_financial_memories (user_id, memory_type, status);
create index uni_financial_memories_expiration_idx
  on public.uni_financial_memories (expires_at) where expires_at is not null;
create unique index uni_financial_memories_active_identity_uidx
  on public.uni_financial_memories (workspace_id, user_id, memory_type, memory_key)
  where status in ('candidate', 'confirmed');
create index uni_memory_evidence_workspace_memory_idx
  on public.uni_memory_evidence (workspace_id, memory_id, observed_at desc);
create index uni_memory_evidence_transaction_idx
  on public.uni_memory_evidence (transaction_id) where transaction_id is not null;

create or replace function public.protect_uni_memory_frontend_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() <> 'authenticated' then
    return new;
  end if;

  if new.user_id <> auth.uid()
    or new.memory_type not in (
      'category_preference', 'account_preference', 'merchant_category_mapping',
      'financial_goal_context', 'conversation_preference'
    )
    or new.status <> 'candidate'
    or new.user_confirmed
    or new.confidence <> 1
    or new.requires_confirmation
    or new.expires_at is not null
    or new.superseded_by_id is not null
    or new.source not in ('explicit_user', 'user_correction')
    or (new.source = 'user_correction' and new.memory_type <> 'merchant_category_mapping') then
    raise exception 'Frontend may only create its own explicit memory candidates';
  end if;

  new.first_observed_at := statement_timestamp();
  new.last_observed_at := statement_timestamp();
  return new;
end;
$$;

create or replace function public.decide_uni_financial_memory(
  target_workspace_id uuid,
  target_memory_id uuid,
  target_decision text
)
returns public.uni_financial_memories
language plpgsql
security definer
set search_path = ''
as $$
declare
  decided_memory public.uni_financial_memories;
begin
  if auth.uid() is null
    or target_decision not in ('confirmed', 'rejected')
    or not public.is_workspace_member(
      target_workspace_id,
      array['owner', 'admin', 'member']::text[]
    ) then
    raise exception 'Memory decision is not allowed';
  end if;

  update public.uni_financial_memories
  set
    status = target_decision,
    user_confirmed = (target_decision = 'confirmed'),
    requires_confirmation = false
  where id = target_memory_id
    and workspace_id = target_workspace_id
    and user_id = auth.uid()
    and status in ('candidate', 'confirmed')
  returning * into decided_memory;

  if decided_memory.id is null then
    raise exception 'Memory is unavailable for this decision';
  end if;

  return decided_memory;
end;
$$;

create or replace function public.correct_uni_explicit_memory(
  target_workspace_id uuid,
  target_memory_id uuid,
  corrected_value jsonb
)
returns public.uni_financial_memories
language plpgsql
security definer
set search_path = ''
as $$
declare
  corrected_memory public.uni_financial_memories;
begin
  if auth.uid() is null
    or jsonb_typeof(corrected_value) <> 'object'
    or not public.uni_memory_json_is_safe(corrected_value)
    or octet_length(corrected_value::text) > 16384
    or not public.is_workspace_member(
      target_workspace_id,
      array['owner', 'admin', 'member']::text[]
    ) then
    raise exception 'Memory correction is not allowed';
  end if;

  update public.uni_financial_memories
  set
    memory_value = corrected_value,
    confidence = 1,
    status = 'candidate',
    user_confirmed = false,
    requires_confirmation = false,
    last_observed_at = statement_timestamp(),
    expires_at = null
  where id = target_memory_id
    and workspace_id = target_workspace_id
    and user_id = auth.uid()
    and source in ('explicit_user', 'user_correction')
    and memory_type in (
      'category_preference', 'account_preference', 'merchant_category_mapping',
      'financial_goal_context', 'conversation_preference'
    )
    and status in ('candidate', 'confirmed')
  returning * into corrected_memory;

  if corrected_memory.id is null then
    raise exception 'Memory is unavailable for correction';
  end if;

  return corrected_memory;
end;
$$;

create trigger uni_financial_memories_protect_frontend
before insert on public.uni_financial_memories
for each row execute function public.protect_uni_memory_frontend_insert();

create trigger uni_financial_memories_set_updated_at
before update on public.uni_financial_memories
for each row execute function public.set_updated_at();

alter table public.uni_financial_memories enable row level security;
alter table public.uni_memory_evidence enable row level security;

create policy uni_financial_memories_select_own_active_member
on public.uni_financial_memories for select to authenticated
using (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);

create policy uni_financial_memories_insert_own_explicit
on public.uni_financial_memories for insert to authenticated
with check (
  user_id = auth.uid()
  and memory_type in (
    'category_preference', 'account_preference', 'merchant_category_mapping',
    'financial_goal_context', 'conversation_preference'
  )
  and status = 'candidate'
  and user_confirmed = false
  and confidence = 1
  and requires_confirmation = false
  and expires_at is null
  and superseded_by_id is null
  and source in ('explicit_user', 'user_correction')
  and (source <> 'user_correction' or memory_type = 'merchant_category_mapping')
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
using (
  public.is_workspace_member(workspace_id)
  and exists (
    select 1
    from public.uni_financial_memories as memory
    where memory.id = uni_memory_evidence.memory_id
      and memory.workspace_id = uni_memory_evidence.workspace_id
      and memory.user_id = auth.uid()
  )
);

revoke all on table public.uni_financial_memories from anon, authenticated;
revoke all on table public.uni_memory_evidence from anon, authenticated;

grant select on table public.uni_financial_memories to authenticated;
grant insert (
  workspace_id, memory_type, memory_key, memory_value, source
) on public.uni_financial_memories to authenticated;
grant delete on table public.uni_financial_memories to authenticated;
grant select on table public.uni_memory_evidence to authenticated;

revoke all on function public.uni_memory_json_is_safe(jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.uni_memory_json_is_safe(jsonb, integer)
  to authenticated, service_role;
revoke all on function public.protect_uni_memory_frontend_insert()
  from public, anon, authenticated;
revoke all on function public.decide_uni_financial_memory(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.decide_uni_financial_memory(uuid, uuid, text)
  to authenticated;
revoke all on function public.correct_uni_explicit_memory(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.correct_uni_explicit_memory(uuid, uuid, jsonb)
  to authenticated;

comment on table public.uni_financial_memories is
  'Fatos financeiros resumidos, explicáveis e revisáveis; não substitui o histórico de transações.';
comment on table public.uni_memory_evidence is
  'Referências mínimas usadas para explicar memórias, sem payload bancário bruto.';

commit;
