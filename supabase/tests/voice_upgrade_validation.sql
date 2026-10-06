-- Validação da migration 051 (upgrade imediato, épico #116 / #114).
-- Roda numa transação e desfaz no fim. Uso:
-- psql "$DB_URL" -At < supabase/tests/voice_upgrade_validation.sql
\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email, instance_id, aud, role)
values ('33333333-3333-3333-3333-333333333333', 'teste-upgrade@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.workspaces (name, workspace_type, owner_user_id)
select 'Pessoal', 'personal', '33333333-3333-3333-3333-333333333333'
where not exists (select 1 from public.workspaces where owner_user_id = '33333333-3333-3333-3333-333333333333' and workspace_type = 'personal');
insert into public.subscriptions (workspace_id, plan_id, status, tier_id, pending_tier_id)
select public.voice_personal_workspace_id('33333333-3333-3333-3333-333333333333'), 'pro', 'active', 'essencial', 'uni_voz_plus';
select public.voice_grant_cycle((select id from public.subscriptions where workspace_id = public.voice_personal_workspace_id('33333333-3333-3333-3333-333333333333')), 'pay_up_1', current_date) is not null;
\echo '== ciclo do Essencial: 1200 s (a troca agendada valeu no crédito; zera para testar o upgrade)'
update public.subscriptions set tier_id = 'essencial', pending_tier_id = 'uni_voz_plus' where workspace_id = public.voice_personal_workspace_id('33333333-3333-3333-3333-333333333333');
update public.voice_cycles set tier_id = 'essencial', seconds_granted = 1200 where asaas_payment_id = 'pay_up_1';
\echo '== upgrade pago: nível e cota novos já no ciclo atual; agendamento igual sai'
select public.voice_apply_upgrade((select id from public.subscriptions where workspace_id = public.voice_personal_workspace_id('33333333-3333-3333-3333-333333333333')), 'uni_voz_plus', 'pay_dif_1');
select tier_id, pending_tier_id from public.subscriptions where workspace_id = public.voice_personal_workspace_id('33333333-3333-3333-3333-333333333333');
select tier_id, seconds_granted from public.voice_cycles where asaas_payment_id = 'pay_up_1';
\echo '== repetir não muda nada'
select public.voice_apply_upgrade((select id from public.subscriptions where workspace_id = public.voice_personal_workspace_id('33333333-3333-3333-3333-333333333333')), 'uni_voz_plus', 'pay_dif_1');
select seconds_granted from public.voice_cycles where asaas_payment_id = 'pay_up_1';
\echo '== authenticated não chama'
savepoint s1;
set local role authenticated;
do $$ begin
  perform public.voice_apply_upgrade(gen_random_uuid(), 'uni_voz', 'x');
  raise exception 'FALHOU: authenticated aplicou upgrade';
exception when insufficient_privilege then raise notice 'ok: sem permissão';
end $$;
rollback to savepoint s1;
rollback;
