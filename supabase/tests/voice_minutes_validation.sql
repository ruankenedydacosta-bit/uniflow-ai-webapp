-- Validação da migration 050 (minutos de voz, épico #116 / #113).
-- Roda tudo numa transação e desfaz no fim: não deixa dado nenhum.
-- Uso: psql "$DB_URL" -At < supabase/tests/voice_minutes_validation.sql
-- Cada bloco imprime 'ok' ou o valor esperado; 'FALHOU' aborta.

\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email, instance_id, aud, role)
values ('11111111-1111-1111-1111-111111111111', 'teste-voz@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
-- workspace pessoal (pode ter sido criado pelo trigger)
insert into public.workspaces (name, workspace_type, owner_user_id)
select 'Pessoal', 'personal', '11111111-1111-1111-1111-111111111111'
where not exists (select 1 from public.workspaces where owner_user_id = '11111111-1111-1111-1111-111111111111' and workspace_type = 'personal');
\echo '== sem assinatura: reserva recusa com voz_sem_assinatura'
savepoint s1;
do $$ begin
  perform public.voice_reserve_block('11111111-1111-1111-1111-111111111111');
  raise exception 'FALHOU: reservou sem assinatura';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: %', sqlerrm;
end $$;
rollback to savepoint s1;

insert into public.subscriptions (workspace_id, plan_id, status, tier_id)
select id, 'pro', 'active', 'essencial' from public.workspaces
where owner_user_id = '11111111-1111-1111-1111-111111111111' and workspace_type = 'personal';

\echo '== cobrança paga abre ciclo; repetir não duplica'
select public.voice_grant_cycle((select id from public.subscriptions where tier_id='essencial' and status='active' order by created_at desc limit 1), 'pay_1', current_date) is not null as ciclo;
select public.voice_grant_cycle((select id from public.subscriptions where tier_id='essencial' and status='active' order by created_at desc limit 1), 'pay_1', current_date) is not null as repetido;
select count(*) as ciclos_pay_1, max(seconds_granted) as segundos from public.voice_cycles where asaas_payment_id = 'pay_1';

\echo '== reserva de bloco: 300 s de 1200'
create temp table r1 as select * from public.voice_reserve_block('11111111-1111-1111-1111-111111111111');
select reserved_seconds, remaining_seconds from r1;

\echo '== segunda reserva fecha a primeira (cobrada pelo tempo corrido ~0) e reserva outro bloco'
create temp table r2 as select * from public.voice_reserve_block('11111111-1111-1111-1111-111111111111');
select (select status from public.voice_sessions where id = (select session_id from r1)) as primeira, (select charged_seconds from public.voice_sessions where id = (select session_id from r1)) as cobrado, reserved_seconds, remaining_seconds from r2;

grant select on r1, r2 to authenticated;
\echo '== app renova e encerra a própria sessão como authenticated'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select reserved_seconds, added_seconds, remaining_seconds from public.voice_renew_block((select session_id from r2));
select * from public.get_my_voice_balance();
select charged_seconds from public.voice_close((select session_id from r2));
select charged_seconds from public.voice_close((select session_id from r2)) as repetido;

\echo '== authenticated não lê nem escreve as tabelas e não chama a reserva'
savepoint s2;
do $$ begin
  perform 1 from public.voice_sessions;
  raise exception 'FALHOU: leu voice_sessions';
exception when insufficient_privilege then raise notice 'ok: sem leitura';
end $$;
rollback to savepoint s2;
savepoint s3;
do $$ begin
  perform public.voice_reserve_block('11111111-1111-1111-1111-111111111111');
  raise exception 'FALHOU: authenticated reservou';
exception when insufficient_privilege then raise notice 'ok: sem reserva pelo app';
end $$;
rollback to savepoint s3;
reset role;

\echo '== outro usuário não renova sessão alheia'
savepoint s4;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
do $$ begin
  perform public.voice_renew_block((select session_id from r2));
  raise exception 'FALHOU: renovou sessão alheia';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: %', sqlerrm;
end $$;
rollback to savepoint s4;
reset role;

\echo '== saldo acaba: trigger barra inserção direta além da cota (service_role)'
savepoint s5;
do $$ begin
  insert into public.voice_sessions (cycle_id, workspace_id, user_id, reserved_seconds, expires_at)
  select c.id, c.workspace_id, '11111111-1111-1111-1111-111111111111', 5000, now() + interval '1 hour'
  from public.voice_cycles c where c.asaas_payment_id = 'pay_1';
  raise exception 'FALHOU: trigger deixou passar';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok trigger: % (hint voz_sem_saldo)', sqlerrm;
end $$;
rollback to savepoint s5;

\echo '== sessão abandonada é cobrada pelo bloco inteiro: 1200 - 300 (abandonada) - 300 (nova) = 600'
create temp table r3 as select * from public.voice_reserve_block('11111111-1111-1111-1111-111111111111');
update public.voice_sessions set expires_at = now() - interval '1 second', started_at = now() - interval '10 minutes'
where id = (select session_id from r3);
create temp table r4 as select * from public.voice_reserve_block('11111111-1111-1111-1111-111111111111');
select (select status || '/' || charged_seconds from public.voice_sessions where id = (select session_id from r3)) as abandonada, remaining_seconds from r4;

\echo '== falha da OpenAI devolve a reserva'
select public.voice_release_failed((select session_id from r4));
select status, charged_seconds from public.voice_sessions where id = (select session_id from r4);
select remaining_seconds from public.get_my_voice_balance();

\echo '== troca agendada aplica no próximo ciclo e avança current_period_ends_at'
update public.subscriptions set pending_tier_id = 'uni_voz_plus' where tier_id = 'essencial' and status='active'
  and workspace_id = (select public.voice_personal_workspace_id('11111111-1111-1111-1111-111111111111'));
select public.voice_grant_cycle((select id from public.subscriptions where workspace_id = public.voice_personal_workspace_id('11111111-1111-1111-1111-111111111111')), 'pay_2', (current_date + interval '1 month')::date) is not null;
select tier_id, pending_tier_id, current_period_ends_at::date = (current_date + interval '2 month')::date as periodo_avancou from public.subscriptions where workspace_id = public.voice_personal_workspace_id('11111111-1111-1111-1111-111111111111');
select seconds_granted, starts_at::date = (current_date + interval '1 month')::date as comeca_no_vencimento from public.voice_cycles where asaas_payment_id = 'pay_2';
rollback;
