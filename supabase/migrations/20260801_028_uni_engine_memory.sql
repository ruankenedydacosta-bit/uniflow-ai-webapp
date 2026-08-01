-- ============================================================================
-- 028 — Memória Inteligente Persistente do Uni Engine (Fase 3).
--
-- Migration ADITIVA e transacional. Não altera nenhuma migration histórica,
-- não apaga dados, não toca em uni_financial_memories (memória financeira
-- existente, domínio distinto). Cria duas tabelas novas:
--
--   uni_engine_memory_items     — itens de memória (contrato Fase 3);
--   uni_engine_memory_evidence  — evidências ponderadas de cada item.
--
-- Princípios:
--   - isolamento por usuário (auth.uid()) + workspace (is_workspace_member);
--   - value/metadata JSON seguro (mesmo validador da memória financeira);
--   - expiração lógica (nunca exclusão destrutiva automática);
--   - confiança 0..1 e pesos de evidência -1..1;
--   - memória NUNCA substitui dado financeiro oficial (transações, contas,
--     categorias, saldos) — apenas referencia.
--
-- APLICAÇÃO MANUAL (não rodar em remoto automaticamente):
--   supabase db push --local (após validar com supabase start)
--   ou via painel SQL com o conteúdo deste arquivo.
-- ============================================================================

begin;

-- ============================================================================
-- uni_engine_memory_items
-- ============================================================================

create table public.uni_engine_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Opcional: conversa de origem. Sem FK — IDs locais de conversa do chat não
  -- garantem existência na tabela uni_conversations.
  conversation_id uuid,
  memory_type text not null,
  subject_key text not null,
  value_json jsonb not null default '{}'::jsonb,
  normalized_value text,
  status text not null default 'candidate',
  confidence numeric(4,3) not null default 0,
  evidence_count integer not null default 0,
  source text not null default 'engine',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  confirmed_at timestamptz,
  expires_at timestamptz,
  superseded_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uni_engine_memory_items_type_check check (memory_type in (
    'user_preference', 'conversation_preference', 'account_preference',
    'category_preference', 'merchant_category_association',
    'merchant_account_association', 'user_correction', 'recurring_pattern',
    'user_declared_fact', 'episodic_context', 'procedure_preference'
  )),
  constraint uni_engine_memory_items_status_check check (status in (
    'candidate', 'confirmed', 'active', 'contested', 'superseded',
    'expired', 'deleted', 'rejected'
  )),
  constraint uni_engine_memory_items_source_check check (source in (
    'user', 'conversation', 'engine', 'financial', 'system'
  )),
  constraint uni_engine_memory_items_key_not_blank check (
    length(btrim(subject_key)) between 1 and 200
  ),
  constraint uni_engine_memory_items_key_safe_check check (
    lower(subject_key) !~ '(token|secret|password|credential|certificate|private_key|audio|transcript)'
  ),
  constraint uni_engine_memory_items_value_object_check check (
    jsonb_typeof(value_json) = 'object'
  ),
  constraint uni_engine_memory_items_value_safe_check check (
    public.uni_memory_json_is_safe(value_json)
  ),
  constraint uni_engine_memory_items_value_size_check check (
    octet_length(value_json::text) <= 16384
  ),
  constraint uni_engine_memory_items_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint uni_engine_memory_items_metadata_safe_check check (
    public.uni_memory_json_is_safe(metadata)
  ),
  constraint uni_engine_memory_items_metadata_size_check check (
    octet_length(metadata::text) <= 8192
  ),
  constraint uni_engine_memory_items_confidence_check check (
    confidence between 0 and 1
  ),
  constraint uni_engine_memory_items_evidence_count_check check (
    evidence_count between 0 and 200
  ),
  constraint uni_engine_memory_items_observation_order_check check (
    last_seen_at >= first_seen_at
  ),
  constraint uni_engine_memory_items_expiration_order_check check (
    expires_at is null or expires_at > first_seen_at
  ),
  constraint uni_engine_memory_items_expired_status_check check (
    status <> 'expired' or expires_at is not null
  ),
  constraint uni_engine_memory_items_superseded_status_check check (
    (status = 'superseded' and superseded_by is not null and superseded_by <> id)
    or (status <> 'superseded' and superseded_by is null)
  ),
  constraint uni_engine_memory_items_confirmed_status_check check (
    (status in ('confirmed', 'active') and confirmed_at is not null)
    or (status not in ('confirmed', 'active') and confirmed_at is null)
  ),
  constraint uni_engine_memory_items_superseded_fk foreign key (superseded_by)
    references public.uni_engine_memory_items(id)
    on delete set null
);

create index uni_engine_memory_items_scope_status_idx
  on public.uni_engine_memory_items (user_id, workspace_id, status, last_seen_at desc);
create index uni_engine_memory_items_scope_type_idx
  on public.uni_engine_memory_items (user_id, workspace_id, memory_type, status);
create index uni_engine_memory_items_scope_subject_idx
  on public.uni_engine_memory_items (user_id, workspace_id, subject_key);
create index uni_engine_memory_items_expiration_idx
  on public.uni_engine_memory_items (expires_at) where expires_at is not null;
-- Uma única identidade ativa por (usuário, workspace, tipo, sujeito).
create unique index uni_engine_memory_items_active_identity_uidx
  on public.uni_engine_memory_items (user_id, workspace_id, memory_type, subject_key)
  where status in ('candidate', 'confirmed', 'active');

-- ============================================================================
-- uni_engine_memory_evidence
-- ============================================================================

create table public.uni_engine_memory_evidence (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  evidence_type text not null,
  source_message_id text,
  source_conversation_id uuid,
  observed_value jsonb,
  normalized_value text,
  weight numeric(4,3) not null default 0,
  occurred_at timestamptz not null default now(),
  evidence_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint uni_engine_memory_evidence_memory_fk foreign key (memory_id)
    references public.uni_engine_memory_items(id)
    on delete cascade,
  constraint uni_engine_memory_evidence_type_check check (evidence_type in (
    'explicit_user_statement', 'user_confirmation', 'user_correction',
    'repeated_selection', 'accepted_suggestion', 'rejected_suggestion',
    'behavior_pattern', 'system_observation'
  )),
  constraint uni_engine_memory_evidence_key_not_blank check (
    length(btrim(evidence_key)) between 1 and 300
  ),
  constraint uni_engine_memory_evidence_weight_check check (
    weight between -1 and 1
  ),
  constraint uni_engine_memory_evidence_value_safe_check check (
    observed_value is null or public.uni_memory_json_is_safe(observed_value)
  ),
  constraint uni_engine_memory_evidence_value_size_check check (
    observed_value is null or octet_length(observed_value::text) <= 8192
  ),
  constraint uni_engine_memory_evidence_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint uni_engine_memory_evidence_metadata_safe_check check (
    public.uni_memory_json_is_safe(metadata)
  ),
  constraint uni_engine_memory_evidence_metadata_size_check check (
    octet_length(metadata::text) <= 8192
  )
);

create index uni_engine_memory_evidence_memory_idx
  on public.uni_engine_memory_evidence (memory_id, occurred_at desc);
create index uni_engine_memory_evidence_scope_idx
  on public.uni_engine_memory_evidence (user_id, workspace_id, memory_id);
-- Idempotência determinística da evidência (mesma chave nunca duplica).
create unique index uni_engine_memory_evidence_key_uidx
  on public.uni_engine_memory_evidence (memory_id, evidence_key);

-- ============================================================================
-- Proteção de escrita do frontend
-- ============================================================================

-- O frontend só pode inserir memória para o próprio usuário autenticado.
create or replace function public.protect_uni_engine_memory_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() <> 'authenticated' then
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'Frontend may only create memory for the authenticated user';
  end if;

  new.first_seen_at := statement_timestamp();
  new.last_seen_at := statement_timestamp();
  return new;
end;
$$;

-- Evidência só pode ser criada para memória do próprio usuário.
create or replace function public.protect_uni_engine_memory_evidence_insert()
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
    or not exists (
      select 1
      from public.uni_engine_memory_items as item
      where item.id = new.memory_id
        and item.user_id = auth.uid()
        and item.workspace_id = new.workspace_id
    ) then
    raise exception 'Evidence must reference the own memory';
  end if;

  return new;
end;
$$;

create trigger uni_engine_memory_items_protect_frontend
  before insert on public.uni_engine_memory_items
  for each row execute function public.protect_uni_engine_memory_insert();

create trigger uni_engine_memory_evidence_protect_frontend
  before insert on public.uni_engine_memory_evidence
  for each row execute function public.protect_uni_engine_memory_evidence_insert();

create trigger uni_engine_memory_items_set_updated_at
  before update on public.uni_engine_memory_items
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.uni_engine_memory_items enable row level security;
alter table public.uni_engine_memory_evidence enable row level security;

create policy uni_engine_memory_items_select_own_active_member
  on public.uni_engine_memory_items for select to authenticated
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy uni_engine_memory_items_insert_own_active_member
  on public.uni_engine_memory_items for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[])
  );

create policy uni_engine_memory_items_update_own_active_member
  on public.uni_engine_memory_items for update to authenticated
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy uni_engine_memory_items_delete_own_active_member
  on public.uni_engine_memory_items for delete to authenticated
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy uni_engine_memory_evidence_select_own_active_member
  on public.uni_engine_memory_evidence for select to authenticated
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy uni_engine_memory_evidence_insert_own_active_member
  on public.uni_engine_memory_evidence for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[])
  );

create policy uni_engine_memory_evidence_delete_own_active_member
  on public.uni_engine_memory_evidence for delete to authenticated
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

-- ============================================================================
-- Grants mínimos
-- ============================================================================

revoke all on table public.uni_engine_memory_items from anon, authenticated;
revoke all on table public.uni_engine_memory_evidence from anon, authenticated;

grant select on table public.uni_engine_memory_items to authenticated;
grant insert (
  user_id, workspace_id, conversation_id, memory_type, subject_key, value_json,
  normalized_value, status, confidence, evidence_count, source, first_seen_at,
  last_seen_at, confirmed_at, expires_at, superseded_by, metadata
) on public.uni_engine_memory_items to authenticated;
grant update (
  status, confidence, evidence_count, last_seen_at, confirmed_at, expires_at,
  superseded_by, metadata, value_json, normalized_value
) on public.uni_engine_memory_items to authenticated;
grant delete on table public.uni_engine_memory_items to authenticated;

grant select on table public.uni_engine_memory_evidence to authenticated;
grant insert (
  memory_id, user_id, workspace_id, evidence_type, source_message_id,
  source_conversation_id, observed_value, normalized_value, weight,
  occurred_at, evidence_key, metadata
) on public.uni_engine_memory_evidence to authenticated;
grant delete on table public.uni_engine_memory_evidence to authenticated;

revoke all on function public.protect_uni_engine_memory_insert()
  from public, anon, authenticated;
revoke all on function public.protect_uni_engine_memory_evidence_insert()
  from public, anon, authenticated;

-- ============================================================================
-- Comentários
-- ============================================================================

comment on table public.uni_engine_memory_items is
  'MEMORY3: memórias seletivas, auditáveis e reversíveis do Uni Engine; nunca substituem dados financeiros oficiais.';
comment on table public.uni_engine_memory_evidence is
  'MEMORY3: evidências ponderadas que explicam cada promoção de memória, sem payload bancário bruto.';
comment on column public.uni_engine_memory_items.subject_key is
  'MEMORY3: identidade canônica do sujeito (kind::entidade), normalizada e sem dados sensíveis.';
comment on column public.uni_engine_memory_items.confidence is
  'MEMORY3: 0..1; nesta fase define apenas ranking — nunca autoriza execução.';
comment on column public.uni_engine_memory_items.status is
  'MEMORY3: candidate/confirmed/active/contested/superseded/expired/deleted/rejected.';

commit;
