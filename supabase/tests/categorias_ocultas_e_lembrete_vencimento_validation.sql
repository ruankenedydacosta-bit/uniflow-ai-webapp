-- Validação da migration 065 (categorias ocultas por espaço e lembrete do
-- vencimento do cartão, #184). Roda com a migration já aplicada na mesma
-- transação ou no banco. Tudo fica dentro de um DO que termina em exceção:
-- nenhum dado sobra, nem com commit automático do cliente. Sucesso = a
-- exceção final começa com 'OK_ROLLBACK'.
-- Uso: psql "$DB_URL" -f supabase/migrations/<065>.sql -f este arquivo
--      (ou cole os dois, nesta ordem, numa query só no SQL editor).

do $teste$
declare
  u_owner uuid := '11111111-1111-1111-1111-111111111184';
  u_member uuid := '22222222-2222-2222-2222-222222222184';
  u_viewer uuid := '33333333-3333-3333-3333-333333333184';
  u_fora uuid := '44444444-4444-4444-4444-444444444184';
  v_ws uuid;
  v_ws_fora uuid;
  c_sistema uuid;
  c_do_espaco uuid;
  c_de_fora uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_cartao uuid;
  v_cartao_sem_dia uuid;
  v_cartao_inativo uuid;
  v_cartao_longe uuid;
  v_n integer;
  v_data date;
begin
  -- Simula a sessão do PostgREST: claims do JWT e papel authenticated.
  create function pg_temp.como_184(p_user uuid) returns void language plpgsql as $como$
  begin
    perform set_config('request.jwt.claim.sub', p_user::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end $como$;

  -- Fixture (como superusuário).
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_owner, 'owner-184@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_member, 'member-184@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_viewer, 'viewer-184@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_fora, 'fora-184@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  select id into v_ws from public.workspaces where owner_user_id = u_owner and workspace_type = 'personal' limit 1;
  if v_ws is null then
    insert into public.workspaces (name, workspace_type, owner_user_id) values ('Pessoal 184', 'personal', u_owner) returning id into v_ws;
  end if;
  select id into v_ws_fora from public.workspaces where owner_user_id = u_fora and workspace_type = 'personal' limit 1;
  if v_ws_fora is null then
    insert into public.workspaces (name, workspace_type, owner_user_id) values ('Pessoal fora 184', 'personal', u_fora) returning id into v_ws_fora;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, status)
  select v_ws, u_owner, 'owner', 'active'
  where not exists (select 1 from public.workspace_members where workspace_id = v_ws and user_id = u_owner);
  insert into public.workspace_members (workspace_id, user_id, role, status)
  select v_ws_fora, u_fora, 'owner', 'active'
  where not exists (select 1 from public.workspace_members where workspace_id = v_ws_fora and user_id = u_fora);
  insert into public.workspace_members (workspace_id, user_id, role, status) values
    (v_ws, u_member, 'member', 'active'),
    (v_ws, u_viewer, 'viewer', 'active');

  select id into c_sistema from public.categories where is_system = true and workspace_id is null and is_active = true limit 1;
  if c_sistema is null then raise exception 'FALHOU fixture: sem categoria de sistema'; end if;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Do espaço 184', 'expense', u_owner) returning id into c_do_espaco;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws_fora, 'De fora 184', 'expense', u_fora) returning id into c_de_fora;

  -- ---------------------------------------------------------------------
  -- Parte 1: categorias ocultas
  -- ---------------------------------------------------------------------

  -- 1. member oculta categoria padrão do sistema e uma do espaço
  perform pg_temp.como_184(u_member);
  insert into public.workspace_hidden_categories (workspace_id, category_id) values (v_ws, c_sistema);
  insert into public.workspace_hidden_categories (workspace_id, category_id) values (v_ws, c_do_espaco);
  select count(*) into v_n from public.workspace_hidden_categories where workspace_id = v_ws;
  execute 'reset role';
  if v_n <> 2 then raise exception 'FALHOU 1: member vê % ocultas', v_n; end if;

  -- 2. viewer vê as ocultas, mas não oculta nem reexibe
  perform pg_temp.como_184(u_viewer);
  select count(*) into v_n from public.workspace_hidden_categories where workspace_id = v_ws;
  if v_n <> 2 then raise exception 'FALHOU 2: viewer vê % ocultas', v_n; end if;
  begin
    insert into public.workspace_hidden_categories (workspace_id, category_id) values (v_ws, c_do_espaco);
    raise exception 'FALHOU 2: viewer ocultou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 2: % (%)', sqlerrm, sqlstate; end if;
  end;
  perform pg_temp.como_184(u_viewer);
  delete from public.workspace_hidden_categories where workspace_id = v_ws and category_id = c_sistema;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 0 then raise exception 'FALHOU 2: viewer reexibiu'; end if;

  -- 3. categoria de outro espaço não pode ser ocultada aqui
  begin
    perform pg_temp.como_184(u_owner);
    insert into public.workspace_hidden_categories (workspace_id, category_id) values (v_ws, c_de_fora);
    raise exception 'FALHOU 3: ocultou categoria de outro espaço';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 3: % (%)', sqlerrm, sqlstate; end if;
  end;
  execute 'reset role';

  -- 4. quem não é do espaço não vê as ocultas dele
  perform pg_temp.como_184(u_fora);
  select count(*) into v_n from public.workspace_hidden_categories where workspace_id = v_ws;
  execute 'reset role';
  if v_n <> 0 then raise exception 'FALHOU 4: usuário de fora vê % ocultas', v_n; end if;

  -- 5. owner reexibe a padrão; excluir a categoria do espaço apaga a relação
  perform pg_temp.como_184(u_owner);
  delete from public.workspace_hidden_categories where workspace_id = v_ws and category_id = c_sistema;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FALHOU 5: owner não reexibiu'; end if;
  delete from public.categories where id = c_do_espaco;
  if exists (select 1 from public.workspace_hidden_categories where category_id = c_do_espaco) then
    raise exception 'FALHOU 5: relação sobrou após excluir a categoria';
  end if;

  -- ---------------------------------------------------------------------
  -- Parte 2: lembrete do vencimento
  -- ---------------------------------------------------------------------

  -- 6. proxima_data_de_vencimento
  if public.proxima_data_de_vencimento(5, date '2026-10-12') <> date '2026-11-05' then raise exception 'FALHOU 6a'; end if;
  if public.proxima_data_de_vencimento(12, date '2026-10-12') <> date '2026-10-12' then raise exception 'FALHOU 6b'; end if;
  if public.proxima_data_de_vencimento(20, date '2026-10-12') <> date '2026-10-20' then raise exception 'FALHOU 6c'; end if;
  if public.proxima_data_de_vencimento(31, date '2026-02-10') <> date '2026-02-28' then raise exception 'FALHOU 6d'; end if;
  if public.proxima_data_de_vencimento(31, date '2026-04-30') <> date '2026-04-30' then raise exception 'FALHOU 6e'; end if;
  if public.proxima_data_de_vencimento(1, date '2026-12-15') <> date '2027-01-01' then raise exception 'FALHOU 6f'; end if;
  if public.proxima_data_de_vencimento(null, date '2026-10-12') is not null then raise exception 'FALHOU 6g'; end if;
  if public.proxima_data_de_vencimento(40, date '2026-10-12') is not null then raise exception 'FALHOU 6h'; end if;

  -- 7. candidatos: cartão que vence em 2 dias entra para cada membro ativo;
  --    sem due_day, inativo ou longe do vencimento ficam de fora
  v_data := v_hoje + 2;
  insert into public.accounts (workspace_id, name, account_type, due_day, closing_day, created_by)
    values (v_ws, 'Cartão 184', 'credit_card', extract(day from v_data)::int, 1, u_owner) returning id into v_cartao;
  insert into public.accounts (workspace_id, name, account_type, created_by)
    values (v_ws, 'Cartão sem dia 184', 'credit_card', u_owner) returning id into v_cartao_sem_dia;
  insert into public.accounts (workspace_id, name, account_type, due_day, is_active, created_by)
    values (v_ws, 'Cartão inativo 184', 'credit_card', extract(day from v_data)::int, false, u_owner) returning id into v_cartao_inativo;
  insert into public.accounts (workspace_id, name, account_type, due_day, created_by)
    values (v_ws, 'Cartão longe 184', 'credit_card', extract(day from (v_hoje + 10))::int, u_owner) returning id into v_cartao_longe;

  select count(*) into v_n from public.card_due_push_candidates() c where c.account_id = v_cartao and c.due_date = v_data and c.days_until_due = 2;
  if v_n <> 3 then raise exception 'FALHOU 7: % candidatos para o cartão (esperava 3 membros)', v_n; end if;
  select count(*) into v_n from public.card_due_push_candidates() c where c.account_id in (v_cartao_sem_dia, v_cartao_inativo, v_cartao_longe);
  if v_n <> 0 then raise exception 'FALHOU 7: % candidatos indevidos', v_n; end if;

  -- 8. idempotência: depois da linha de disparo, o par some; os outros ficam
  insert into public.card_due_push_dispatches (account_id, user_id, due_date) values (v_cartao, u_member, v_data);
  select count(*) into v_n from public.card_due_push_candidates() c where c.account_id = v_cartao;
  if v_n <> 2 then raise exception 'FALHOU 8: % candidatos após o disparo', v_n; end if;
  if exists (select 1 from public.card_due_push_candidates() c where c.account_id = v_cartao and c.user_id = u_member) then
    raise exception 'FALHOU 8: member continua candidato';
  end if;

  -- 9. authenticated não executa as funções do worker nem lê a tabela de disparos
  begin
    perform pg_temp.como_184(u_owner);
    perform public.card_due_push_candidates();
    raise exception 'FALHOU 9: authenticated executou card_due_push_candidates';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 9: % (%)', sqlerrm, sqlstate; end if;
  end;
  begin
    perform pg_temp.como_184(u_owner);
    perform public.verify_card_due_dispatch_secret('x');
    raise exception 'FALHOU 9: authenticated executou verify_card_due_dispatch_secret';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 9: % (%)', sqlerrm, sqlstate; end if;
  end;
  begin
    perform pg_temp.como_184(u_owner);
    perform 1 from public.card_due_push_dispatches;
    raise exception 'FALHOU 9: authenticated leu card_due_push_dispatches';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 9: % (%)', sqlerrm, sqlstate; end if;
  end;
  execute 'reset role';

  -- 10. segredo e cron existem
  if not exists (select 1 from private.card_due_dispatch_secret) then raise exception 'FALHOU 10: sem segredo'; end if;
  if not exists (select 1 from cron.job where jobname = 'card-due-push-dispatch') then raise exception 'FALHOU 10: sem cron'; end if;

  raise exception 'OK_ROLLBACK: 10 casos passaram. Nada foi gravado.';
end
$teste$;
