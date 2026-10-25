begin;

alter table public.webhook_events
  add column processing_attempts smallint not null default 0,
  add column max_processing_attempts smallint not null default 8,
  add column processing_started_at timestamptz,
  add column next_attempt_at timestamptz;

alter table public.webhook_events
  add constraint webhook_events_processing_attempts_check
    check (processing_attempts between 0 and max_processing_attempts),
  add constraint webhook_events_max_processing_attempts_check
    check (max_processing_attempts between 1 and 20);

-- Registros antigos que marcaram processed_at apesar de um erro devem voltar
-- a ser elegíveis para recuperação; o payload e a identidade do evento ficam.
update public.webhook_events
set processed_at = null
where processing_error is not null;

create index webhook_events_retry_queue_idx
  on public.webhook_events (received_at, next_attempt_at)
  where processed_at is null;

create or replace function public.claim_billing_webhook_event(target_event_id uuid)
returns setof public.webhook_events
language sql
security definer
set search_path = ''
as $$
  with candidate as (
    select event.id
    from public.webhook_events as event
    where event.id = target_event_id
      and (event.processed_at is null or event.processing_error is not null)
      and event.processing_attempts < event.max_processing_attempts
      and (event.next_attempt_at is null or event.next_attempt_at <= statement_timestamp())
      and (
        event.processing_started_at is null
        or event.processing_started_at < statement_timestamp() - interval '10 minutes'
      )
    for update skip locked
  ), claimed as (
    update public.webhook_events as event
    set processing_attempts = event.processing_attempts + 1,
        processing_started_at = statement_timestamp(),
        processed_at = null,
        processing_error = null,
        next_attempt_at = null
    from candidate
    where event.id = candidate.id
    returning event.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_billing_webhook_event(uuid) from public, anon, authenticated;
grant execute on function public.claim_billing_webhook_event(uuid) to service_role;

comment on function public.claim_billing_webhook_event(uuid) is
  'Claims one persisted Asaas event atomically; SKIP LOCKED prevents concurrent workers from processing the same delivery.';
comment on column public.webhook_events.processing_attempts is
  'Durable attempt count for the internal webhook retry queue.';

commit;
