begin;
-- Financial mirrors keep their owner and provider identity for their lifetime.
-- NULL -> subscription is allowed for the initial Automatic Pix payment.
create or replace function public.preserve_billing_payment_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.workspace_id is distinct from old.workspace_id
    or new.asaas_payment_id is distinct from old.asaas_payment_id
    or (old.asaas_subscription_id is not null and new.asaas_subscription_id is distinct from old.asaas_subscription_id) then
    raise exception 'BILLING_PAYMENT_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_billing_payment_identity() from public, anon, authenticated;
create trigger billing_payment_identity_immutable
before update on public.billing_payments
for each row execute function public.preserve_billing_payment_identity();
commit;
