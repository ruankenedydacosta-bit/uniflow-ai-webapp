begin;

-- Infraestrutura de dominio para Open Finance. Esta migration nao conecta
-- provedores, nao armazena credenciais e deve ser aplicada primeiro no DEV.

create table public.open_finance_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null,
  institution_id text,
  institution_name text,
  provider_consent_id text,
  status text not null default 'pending',
  purpose text not null,
  legal_basis text not null default 'consent',
  scopes text[] not null,
  terms_version text not null,
  privacy_policy_version text not null,
  requested_at timestamptz not null default now(),
  authorized_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  data_retention_until timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint open_finance_consents_id_workspace_key
    unique (id, workspace_id),
  constraint open_finance_consents_provider_not_blank
    check (length(btrim(provider)) > 0),
  constraint open_finance_consents_purpose_not_blank
    check (length(btrim(purpose)) > 0),
  constraint open_finance_consents_scopes_not_empty
    check (cardinality(scopes) > 0 and array_position(scopes, null) is null),
  constraint open_finance_consents_status_check check (
    status in (
      'pending',
      'awaiting_authorization',
      'active',
      'expired',
      'revoked',
      'rejected',
      'error'
    )
  ),
  constraint open_finance_consents_legal_basis_check
    check (legal_basis = 'consent'),
  constraint open_finance_consents_active_dates_check check (
    status <> 'active'
    or (authorized_at is not null and expires_at is not null)
  ),
  constraint open_finance_consents_revoked_at_check check (
    status <> 'revoked' or revoked_at is not null
  ),
  constraint open_finance_consents_expiration_check check (
    expires_at is null
    or authorized_at is null
    or expires_at > authorized_at
  ),
  constraint open_finance_consents_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create table public.external_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  consent_id uuid not null,
  normalized_account_id uuid,
  provider text not null,
  provider_account_id text not null,
  institution_id text,
  institution_name text,
  display_name text not null,
  account_type text not null,
  account_subtype text,
  currency_code text not null default 'BRL',
  masked_number text,
  status text not null default 'active',
  sync_status text not null default 'pending',
  current_balance numeric(18, 2),
  available_balance numeric(18, 2),
  balance_captured_at timestamptz,
  last_synced_at timestamptz,
  provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_accounts_id_workspace_key unique (id, workspace_id),
  constraint external_accounts_consent_workspace_fkey
    foreign key (consent_id, workspace_id)
    references public.open_finance_consents(id, workspace_id)
    on delete cascade,
  constraint external_accounts_normalized_workspace_fkey
    foreign key (normalized_account_id, workspace_id)
    references public.accounts(id, workspace_id)
    on delete set null (normalized_account_id),
  constraint external_accounts_provider_not_blank
    check (length(btrim(provider)) > 0),
  constraint external_accounts_provider_id_not_blank
    check (length(btrim(provider_account_id)) > 0),
  constraint external_accounts_display_name_not_blank
    check (length(btrim(display_name)) > 0),
  constraint external_accounts_currency_code_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint external_accounts_status_check check (
    status in ('active', 'inactive', 'disconnected', 'error')
  ),
  constraint external_accounts_sync_status_check check (
    sync_status in (
      'pending',
      'syncing',
      'synced',
      'partial',
      'error',
      'disconnected'
    )
  ),
  constraint external_accounts_provider_data_object_check
    check (jsonb_typeof(provider_data) = 'object')
);

create table public.external_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_account_id uuid not null,
  normalized_transaction_id uuid,
  provider text not null,
  provider_transaction_id text not null,
  transaction_direction text not null,
  description text not null,
  amount numeric(18, 2) not null,
  currency_code text not null default 'BRL',
  transaction_date date not null,
  posted_at timestamptz,
  status text not null default 'posted',
  merchant_name text,
  category_hint text,
  fingerprint text,
  provider_data jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_transactions_id_workspace_key unique (id, workspace_id),
  constraint external_transactions_account_workspace_fkey
    foreign key (external_account_id, workspace_id)
    references public.external_accounts(id, workspace_id)
    on delete cascade,
  constraint external_transactions_normalized_workspace_fkey
    foreign key (normalized_transaction_id, workspace_id)
    references public.transactions(id, workspace_id)
    on delete set null (normalized_transaction_id),
  constraint external_transactions_provider_not_blank
    check (length(btrim(provider)) > 0),
  constraint external_transactions_provider_id_not_blank
    check (length(btrim(provider_transaction_id)) > 0),
  constraint external_transactions_description_not_blank
    check (length(btrim(description)) > 0),
  constraint external_transactions_direction_check
    check (transaction_direction in ('credit', 'debit')),
  constraint external_transactions_amount_positive_check check (amount > 0),
  constraint external_transactions_currency_code_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint external_transactions_status_check
    check (status in ('pending', 'posted', 'reversed', 'canceled')),
  constraint external_transactions_provider_data_object_check
    check (jsonb_typeof(provider_data) = 'object')
);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  consent_id uuid,
  external_account_id uuid,
  provider text not null,
  job_type text not null,
  trigger_type text not null default 'system',
  status text not null default 'queued',
  idempotency_key text not null,
  webhook_event_id text,
  cursor_data jsonb not null default '{}'::jsonb,
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 3,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  records_received integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_jobs_consent_workspace_fkey
    foreign key (consent_id, workspace_id)
    references public.open_finance_consents(id, workspace_id)
    on delete set null (consent_id),
  constraint sync_jobs_account_workspace_fkey
    foreign key (external_account_id, workspace_id)
    references public.external_accounts(id, workspace_id)
    on delete set null (external_account_id),
  constraint sync_jobs_provider_not_blank
    check (length(btrim(provider)) > 0),
  constraint sync_jobs_idempotency_key_not_blank
    check (length(btrim(idempotency_key)) > 0),
  constraint sync_jobs_job_type_check check (
    job_type in (
      'accounts',
      'transactions',
      'full',
      'consent_refresh',
      'webhook_replay'
    )
  ),
  constraint sync_jobs_trigger_type_check check (
    trigger_type in ('user', 'schedule', 'webhook', 'retry', 'system')
  ),
  constraint sync_jobs_status_check check (
    status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'canceled')
  ),
  constraint sync_jobs_attempts_check check (
    attempt_count >= 0 and max_attempts between 1 and 20
  ),
  constraint sync_jobs_records_check check (
    records_received >= 0
    and records_created >= 0
    and records_updated >= 0
    and records_skipped >= 0
  ),
  constraint sync_jobs_cursor_data_object_check
    check (jsonb_typeof(cursor_data) = 'object'),
  constraint sync_jobs_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index open_finance_consents_workspace_status_idx
  on public.open_finance_consents (workspace_id, status);

create index open_finance_consents_user_id_idx
  on public.open_finance_consents (user_id);

create unique index open_finance_consents_provider_id_uidx
  on public.open_finance_consents (
    workspace_id,
    provider,
    provider_consent_id
  )
  where provider_consent_id is not null;

create index external_accounts_consent_status_idx
  on public.external_accounts (consent_id, status);

create index external_accounts_workspace_sync_idx
  on public.external_accounts (workspace_id, sync_status);

create unique index external_accounts_provider_identity_uidx
  on public.external_accounts (workspace_id, provider, provider_account_id);

create index external_transactions_account_date_idx
  on public.external_transactions (external_account_id, transaction_date desc);

create index external_transactions_workspace_date_idx
  on public.external_transactions (workspace_id, transaction_date desc);

create index external_transactions_normalized_id_idx
  on public.external_transactions (normalized_transaction_id)
  where normalized_transaction_id is not null;

create unique index external_transactions_provider_identity_uidx
  on public.external_transactions (
    workspace_id,
    provider,
    provider_transaction_id
  );

create unique index external_transactions_fingerprint_uidx
  on public.external_transactions (workspace_id, provider, fingerprint)
  where fingerprint is not null;

create index sync_jobs_workspace_status_idx
  on public.sync_jobs (workspace_id, status, requested_at desc);

create index sync_jobs_consent_id_idx
  on public.sync_jobs (consent_id)
  where consent_id is not null;

create unique index sync_jobs_idempotency_uidx
  on public.sync_jobs (workspace_id, provider, idempotency_key);

create unique index sync_jobs_webhook_event_uidx
  on public.sync_jobs (provider, webhook_event_id)
  where webhook_event_id is not null;

create trigger open_finance_consents_set_updated_at
before update on public.open_finance_consents
for each row execute function public.set_updated_at();

create trigger external_accounts_set_updated_at
before update on public.external_accounts
for each row execute function public.set_updated_at();

create trigger external_transactions_set_updated_at
before update on public.external_transactions
for each row execute function public.set_updated_at();

create trigger sync_jobs_set_updated_at
before update on public.sync_jobs
for each row execute function public.set_updated_at();

alter table public.open_finance_consents enable row level security;
alter table public.external_accounts enable row level security;
alter table public.external_transactions enable row level security;
alter table public.sync_jobs enable row level security;

create policy open_finance_consents_select_active_member
on public.open_finance_consents
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_workspace_member(
    workspace_id,
    array['owner', 'admin']::text[]
  )
);

create policy external_accounts_select_active_member
on public.external_accounts
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy external_transactions_select_active_member
on public.external_transactions
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy sync_jobs_select_active_member
on public.sync_jobs
for select
to authenticated
using (public.is_workspace_member(workspace_id));

-- O frontend autenticado pode apenas ler seu workspace. Consentimentos,
-- callbacks, webhooks e sincronizacoes serao escritos por backend seguro.
revoke all on table public.open_finance_consents from anon, authenticated;
revoke all on table public.external_accounts from anon, authenticated;
revoke all on table public.external_transactions from anon, authenticated;
revoke all on table public.sync_jobs from anon, authenticated;

grant select on table public.open_finance_consents to authenticated;
grant select on table public.external_accounts to authenticated;
grant select on table public.external_transactions to authenticated;
grant select on table public.sync_jobs to authenticated;

comment on table public.open_finance_consents is
  'Consentimentos LGPD/Open Finance por workspace, usuario, instituicao e provedor; nunca armazena tokens ou credenciais.';
comment on table public.external_accounts is
  'Contas bancarias externas sanitizadas antes da conciliacao com accounts.';
comment on table public.external_transactions is
  'Transacoes externas idempotentes e sanitizadas antes da conciliacao com transactions.';
comment on table public.sync_jobs is
  'Jobs auditaveis de sincronizacao, retry e webhook; execucao reservada ao backend seguro.';

comment on column public.open_finance_consents.metadata is
  'Metadados sem tokens, authorization codes, certificados ou credenciais.';
comment on column public.external_accounts.masked_number is
  'Identificador mascarado para exibicao; nunca guardar agencia/conta completa ou credencial.';
comment on column public.external_accounts.provider_data is
  'Payload sanitizado e minimizado; segredos e tokens sao proibidos.';
comment on column public.external_transactions.provider_data is
  'Payload sanitizado e minimizado; nao expor dados desnecessarios ao frontend.';
comment on column public.sync_jobs.webhook_event_id is
  'Identificador externo para deduplicar webhooks antes do processamento.';
comment on column public.sync_jobs.error_message is
  'Mensagem operacional sanitizada; nao deve conter segredo, token ou payload sensivel.';

commit;
