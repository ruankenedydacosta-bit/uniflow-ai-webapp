begin;
create table public.billing_pix_automatic_account (
  provider_account_id text primary key,
  eligibility_status text not null check (eligibility_status in ('ELIGIBLE','INELIGIBLE')),
  verified_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.billing_pix_automatic_account enable row level security;
revoke all on public.billing_pix_automatic_account from public,anon,authenticated;
grant select,insert,update on public.billing_pix_automatic_account to service_role;

create table public.billing_pix_authorizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  subscription_id uuid not null references public.subscriptions(id),
  operation_attempt_id uuid not null references public.billing_operation_attempts(id),
  contract_id varchar(35) not null unique,
  asaas_customer_id text not null,
  expected_value numeric(12,2) not null check(expected_value > 0),
  asaas_authorization_id text unique,
  asaas_subscription_id text,
  status text not null default 'CREATING' check(status in ('CREATING','CREATED','ACTIVE','CANCELLED','EXPIRED','REFUSED')),
  initial_payment_confirmed boolean not null default false,
  cancel_requested boolean not null default false,
  qr_payload text,
  qr_encoded_image text,
  qr_expires_at text,
  cancellation_reason text,
  cancellation_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index billing_pix_one_open_authorization_idx on public.billing_pix_authorizations(workspace_id)
where status in ('CREATING','CREATED','ACTIVE');
create trigger billing_pix_authorizations_updated before update on public.billing_pix_authorizations
for each row execute function public.set_updated_at();
alter table public.billing_pix_authorizations enable row level security;
create policy billing_pix_authorizations_member on public.billing_pix_authorizations for select to authenticated
using(public.is_workspace_member(workspace_id));
revoke all on public.billing_pix_authorizations from public,anon,authenticated;
grant select on public.billing_pix_authorizations to authenticated;
grant select,insert,update on public.billing_pix_authorizations to service_role;

create table public.billing_pix_instructions (
  asaas_instruction_id text primary key,
  authorization_id uuid not null references public.billing_pix_authorizations(id),
  asaas_payment_id text,
  status text not null,
  refusal_reason text,
  updated_at timestamptz not null default now()
);
alter table public.billing_pix_instructions enable row level security;
revoke all on public.billing_pix_instructions from public,anon,authenticated;
grant select,insert,update on public.billing_pix_instructions to service_role;

create table public.billing_pix_payment_links (
  asaas_payment_id text primary key,
  authorization_id uuid not null references public.billing_pix_authorizations(id)
);
alter table public.billing_pix_payment_links enable row level security;
revoke all on public.billing_pix_payment_links from public,anon,authenticated;
grant select,insert,update on public.billing_pix_payment_links to service_role;

create function public.protect_pix_instruction_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if new.authorization_id <> old.authorization_id then raise exception 'PIX_INSTRUCTION_IDENTITY_CONFLICT'; end if;
  if old.status in ('DONE','CANCELLED','REFUSED') and new.status <> old.status then
    new.status=old.status; new.refusal_reason=old.refusal_reason;
  end if;
  return new;
end;
$$;
create trigger billing_pix_instruction_identity before update on public.billing_pix_instructions
for each row execute function public.protect_pix_instruction_identity();

-- Same durable subscription reservation as conventional Pix: concurrent
-- choices cannot each issue an independent provider POST.
create function public.reserve_pix_automatic(p_workspace_id uuid,p_plan_id text,p_value numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.billing_pix_authorizations%rowtype; v_attempt uuid; v_customer text; v_sub uuid;
begin
  insert into public.billing_operation_attempts(operation,workspace_id,plan_id,status)
  values ('subscription',p_workspace_id,p_plan_id,'processing') on conflict do nothing returning id into v_attempt;
  if v_attempt is null then
    select * into a from public.billing_pix_authorizations where workspace_id=p_workspace_id order by created_at desc,id desc limit 1;
    return jsonb_build_object('claimed',false,'authorization',case when a.id is null then null else to_jsonb(a) end);
  end if;
  if exists(select 1 from public.subscriptions where workspace_id=p_workspace_id and plan_id=p_plan_id
    and status in ('pending','trialing','active','past_due','suspended')) then raise exception 'SUBSCRIPTION_ALREADY_EXISTS'; end if;
  select asaas_customer_id into v_customer from public.billing_customers where workspace_id=p_workspace_id;
  if v_customer is null then raise exception 'BILLING_CUSTOMER_REQUIRED'; end if;
  insert into public.subscriptions(workspace_id,plan_id,status,asaas_customer_id,payment_method)
  values(p_workspace_id,p_plan_id,'pending',v_customer,'pix_automatico') returning id into v_sub;
  insert into public.billing_pix_authorizations(workspace_id,subscription_id,operation_attempt_id,contract_id,asaas_customer_id,expected_value)
  values(p_workspace_id,v_sub,v_attempt,replace(gen_random_uuid()::text,'-',''),v_customer,p_value) returning * into a;
  return jsonb_build_object('claimed',true,'authorization',to_jsonb(a));
end;
$$;

create function public.apply_pix_authorization(p_authorization_id uuid,p_remote jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.billing_pix_authorizations%rowtype; s public.subscriptions%rowtype; v_status text:=p_remote->>'status';
begin
  select * into a from public.billing_pix_authorizations where id=p_authorization_id for update;
  if not found then return false; end if;
  if p_remote->>'contractId' is distinct from a.contract_id or p_remote->>'customerId' is distinct from a.asaas_customer_id
    or p_remote->>'paymentCreationMode' is distinct from 'SUBSCRIPTION' or p_remote->>'frequency' is distinct from 'MONTHLY'
    or (p_remote->>'value')::numeric is distinct from a.expected_value or v_status not in ('CREATED','ACTIVE','CANCELLED','EXPIRED','REFUSED')
    or nullif(p_remote->>'id','') is null or (a.asaas_authorization_id is not null and a.asaas_authorization_id <> p_remote->>'id') then
    raise exception 'PIX_AUTHORIZATION_MISMATCH';
  end if;
  if (a.status in ('CANCELLED','EXPIRED','REFUSED') and v_status not in ('CANCELLED','EXPIRED','REFUSED'))
    or (a.status='ACTIVE' and v_status='CREATED') then return true; end if;
  select * into s from public.subscriptions where id=a.subscription_id for update;
  if nullif(p_remote->>'subscriptionId','') is not null and s.asaas_subscription_id is not null
    and s.asaas_subscription_id <> p_remote->>'subscriptionId' then raise exception 'PIX_SUBSCRIPTION_MISMATCH'; end if;
  update public.billing_pix_authorizations set asaas_authorization_id=p_remote->>'id',status=v_status,
    asaas_subscription_id=coalesce(nullif(p_remote->>'subscriptionId',''),asaas_subscription_id),
    qr_payload=coalesce(p_remote->>'payload',qr_payload),qr_encoded_image=coalesce(p_remote->>'encodedImage',qr_encoded_image),
    qr_expires_at=coalesce(p_remote->'immediateQrCode'->>'expirationDate',qr_expires_at),
    cancellation_reason=p_remote->>'cancellationReason',cancellation_date=p_remote->>'cancellationDate'
  where id=a.id;
  if nullif(p_remote->>'subscriptionId','') is not null then
    update public.subscriptions set asaas_subscription_id=p_remote->>'subscriptionId' where id=s.id;
    update public.billing_operation_attempts set status='completed',provider_resource_id=p_remote->>'subscriptionId' where id=a.operation_attempt_id;
    update public.billing_payments bp set asaas_subscription_id=p_remote->>'subscriptionId'
    from public.billing_pix_payment_links link where link.authorization_id=a.id and bp.asaas_payment_id=link.asaas_payment_id
      and bp.workspace_id=a.workspace_id and bp.asaas_subscription_id is null;
  end if;
  -- Authorization termination never erases or reverses an initial payment.
  if v_status in ('CANCELLED','EXPIRED','REFUSED') and s.current_period_ends_at is not null then
    update public.subscriptions set cancel_at_period_end=true,cancel_effective_at=current_period_ends_at where id=s.id;
  elsif v_status='ACTIVE' and not a.cancel_requested then
    update public.subscriptions set cancel_at_period_end=false,cancel_effective_at=null where id=s.id;
  end if;
  return true;
end;
$$;

create function public.apply_pix_automatic_payment(p_authorization_id uuid,p_payment jsonb,p_patch jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.billing_pix_authorizations%rowtype; s public.subscriptions%rowtype;
begin
  select * into a from public.billing_pix_authorizations where id=p_authorization_id for update;
  if not found then return false; end if;
  select * into s from public.subscriptions where id=a.subscription_id for update;
  if p_payment->>'customer' is distinct from a.asaas_customer_id or (p_payment->>'value')::numeric is distinct from a.expected_value
    or (nullif(p_payment->>'subscription','') is not null and a.asaas_subscription_id is not null
      and p_payment->>'subscription' <> a.asaas_subscription_id) then raise exception 'PIX_PAYMENT_SCOPE_MISMATCH'; end if;
  insert into public.billing_pix_payment_links(asaas_payment_id,authorization_id) values(p_payment->>'id',a.id)
  on conflict(asaas_payment_id) do update set authorization_id=excluded.authorization_id
  where public.billing_pix_payment_links.authorization_id=excluded.authorization_id;
  if not found then raise exception 'PIX_PAYMENT_ALREADY_LINKED'; end if;
  insert into public.billing_payments(workspace_id,asaas_payment_id,asaas_subscription_id,status,billing_type,value,due_date,paid_at,invoice_url)
  values(a.workspace_id,p_payment->>'id',a.asaas_subscription_id,p_payment->>'local_status','pix_automatico',
    (p_payment->>'value')::numeric,(p_payment->>'dueDate')::date,
    coalesce(p_payment->>'paymentDate',p_payment->>'clientPaymentDate')::timestamptz,p_payment->>'invoiceUrl')
  on conflict(asaas_payment_id) do update set status=excluded.status,paid_at=excluded.paid_at,billing_type='pix_automatico',
    asaas_subscription_id=coalesce(public.billing_payments.asaas_subscription_id,excluded.asaas_subscription_id)
  where public.billing_payments.workspace_id=excluded.workspace_id and
    (public.billing_payments.asaas_subscription_id is not distinct from excluded.asaas_subscription_id
      or public.billing_payments.asaas_subscription_id is null or excluded.asaas_subscription_id is null);
  if not found then raise exception 'PIX_PAYMENT_IDENTITY_CONFLICT'; end if;
  if p_payment->>'status' in ('CONFIRMED','RECEIVED') then
    update public.billing_pix_authorizations set initial_payment_confirmed=true where id=a.id;
    if p_patch->>'status'='active' and (p_patch->>'current_period_ends_at')::timestamptz > statement_timestamp() and s.status not in ('canceled','expired') then
      update public.subscriptions set status='active',
        current_period_ends_at=greatest(current_period_ends_at,(p_patch->>'current_period_ends_at')::timestamptz),
        billing_grace_ends_at=null,
        cancel_at_period_end=cancel_at_period_end or a.status <> 'ACTIVE',
        cancel_effective_at=case when cancel_at_period_end or a.status <> 'ACTIVE'
          then greatest(current_period_ends_at,(p_patch->>'current_period_ends_at')::timestamptz) else cancel_effective_at end
      where id=s.id;
    end if;
  end if;
  return true;
end;
$$;
revoke all on function public.reserve_pix_automatic(uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.apply_pix_authorization(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.apply_pix_automatic_payment(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_pix_automatic(uuid,text,numeric) to service_role;
grant execute on function public.apply_pix_authorization(uuid,jsonb) to service_role;
grant execute on function public.apply_pix_automatic_payment(uuid,jsonb,jsonb) to service_role;

-- The paid cutoff is enforced even when no provider subscription exists yet
-- (initial Pix paid, consent still pending) or when the scheduled scan lags.
create or replace function public.workspace_allows_product_access(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_workspace_member(target_workspace_id) and not coalesce((
    select status='suspended'
      or (status='past_due' and (billing_grace_ends_at is null or billing_grace_ends_at <= statement_timestamp()))
      or (cancel_at_period_end and coalesce(cancel_effective_at,current_period_ends_at) <= statement_timestamp())
    from public.subscriptions where workspace_id=target_workspace_id order by created_at desc,id desc limit 1
  ),false);
$$;
commit;
