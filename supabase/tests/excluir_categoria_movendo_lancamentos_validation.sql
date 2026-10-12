-- Validação da migration 064 (excluir categoria movendo os lançamentos, #181).
-- Roda com a migration já aplicada na mesma transação ou no banco. Tudo fica
-- dentro de um DO que termina em exceção: nenhum dado sobra, nem com commit
-- automático do cliente. Sucesso = a exceção final começa com 'OK_ROLLBACK'.
-- Uso: psql "$DB_URL" -f supabase/migrations/<064>.sql -f este arquivo
--      (ou cole os dois, nesta ordem, numa query só no SQL editor).

do $teste$
declare
  u_owner uuid := '11111111-1111-1111-1111-111111111181';
  u_member uuid := '22222222-2222-2222-2222-222222222181';
  u_viewer uuid := '33333333-3333-3333-3333-333333333181';
  v_ws uuid;
  v_conta uuid;
  c_origem uuid;
  c_destino uuid;
  c_entrada uuid;
  c_inativa uuid;
  c_do_owner uuid;
  c_sistema uuid;
  c_sistema_pj uuid;
  v_ret integer;
  v_n integer;
  v_msg text;
begin
  -- Simula a sessão do PostgREST: claims do JWT e papel authenticated.
  -- SET LOCAL volta sozinho quando o sub-bloco do caso aborta.
  create function pg_temp.como_181(p_user uuid) returns void language plpgsql as $como$
  begin
    perform set_config('request.jwt.claim.sub', p_user::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end $como$;

  -- Fixture (como superusuário).
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_owner, 'owner-181@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_member, 'member-181@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_viewer, 'viewer-181@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  select id into v_ws from public.workspaces where owner_user_id = u_owner and workspace_type = 'personal' limit 1;
  if v_ws is null then
    insert into public.workspaces (name, workspace_type, owner_user_id) values ('Pessoal 181', 'personal', u_owner) returning id into v_ws;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, status)
  select v_ws, u_owner, 'owner', 'active'
  where not exists (select 1 from public.workspace_members where workspace_id = v_ws and user_id = u_owner);
  insert into public.workspace_members (workspace_id, user_id, role, status) values
    (v_ws, u_member, 'member', 'active'),
    (v_ws, u_viewer, 'viewer', 'active');

  insert into public.accounts (workspace_id, name, account_type, created_by) values (v_ws, 'Conta 181', 'checking', u_owner) returning id into v_conta;

  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Origem 181', 'expense', u_member) returning id into c_origem;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Destino 181', 'expense', u_owner) returning id into c_destino;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Entrada 181', 'income', u_owner) returning id into c_entrada;
  insert into public.categories (workspace_id, name, category_type, created_by, is_active) values (v_ws, 'Inativa 181', 'expense', u_owner, false) returning id into c_inativa;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Do owner 181', 'expense', u_owner) returning id into c_do_owner;
  select id into c_sistema from public.categories where is_system = true and workspace_id is null and category_type = 'expense' and is_active = true and applies_to in ('both', 'personal') limit 1;
  select id into c_sistema_pj from public.categories where is_system = true and workspace_id is null and category_type = 'expense' and is_active = true and applies_to = 'business' limit 1;

  insert into public.transactions (workspace_id, account_id, category_id, transaction_type, description, amount, transaction_date, created_by) values
    (v_ws, v_conta, c_origem, 'expense', 'gasto 1', 10, current_date, u_owner),
    (v_ws, v_conta, c_origem, 'expense', 'gasto 2', 20, current_date, u_member),
    (v_ws, v_conta, c_origem, 'expense', 'gasto 3', 30, current_date, u_owner),
    (v_ws, v_conta, c_destino, 'expense', 'gasto 4', 40, current_date, u_owner),
    (v_ws, v_conta, c_do_owner, 'expense', 'gasto 5', 50, current_date, u_owner);
  insert into public.category_budgets (workspace_id, category_id, monthly_limit, created_by) values (v_ws, c_origem, 100, u_owner);

  -- 1. destino de outro tipo
  begin
    perform pg_temp.como_181(u_owner);
    perform public.excluir_categoria_movendo_lancamentos(v_ws, c_origem, c_entrada);
    raise exception 'FALHOU 1: aceitou destino de outro tipo';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'categoria_destino_invalida' then raise exception 'FALHOU 1: %', sqlerrm; end if;
  end;

  -- 2. destino inativo
  begin
    perform pg_temp.como_181(u_owner);
    perform public.excluir_categoria_movendo_lancamentos(v_ws, c_origem, c_inativa);
    raise exception 'FALHOU 2: aceitou destino inativo';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'categoria_destino_invalida' then raise exception 'FALHOU 2: %', sqlerrm; end if;
  end;

  -- 3. destino igual à origem
  begin
    perform pg_temp.como_181(u_owner);
    perform public.excluir_categoria_movendo_lancamentos(v_ws, c_origem, c_origem);
    raise exception 'FALHOU 3: aceitou destino igual';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'categoria_destino_igual' then raise exception 'FALHOU 3: %', sqlerrm; end if;
  end;

  -- 4. viewer não move nem exclui
  begin
    perform pg_temp.como_181(u_viewer);
    perform public.excluir_categoria_movendo_lancamentos(v_ws, c_origem, c_destino);
    raise exception 'FALHOU 4: viewer excluiu';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'categoria_lancamentos_nao_movidos' then raise exception 'FALHOU 4: %', sqlerrm; end if;
  end;
  execute 'reset role';
  select count(*) into v_n from public.transactions where category_id = c_origem;
  if v_n <> 3 then raise exception 'FALHOU 4: lançamentos mudaram (%)', v_n; end if;

  -- 5. member que não criou: move, mas o delete devolve 0 e tudo volta
  begin
    perform pg_temp.como_181(u_member);
    perform public.excluir_categoria_movendo_lancamentos(v_ws, c_do_owner, c_destino);
    raise exception 'FALHOU 5: member excluiu categoria de outro';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'categoria_sem_permissao' then raise exception 'FALHOU 5: %', sqlerrm; end if;
  end;
  execute 'reset role';
  select count(*) into v_n from public.transactions where category_id = c_do_owner;
  if v_n <> 1 then raise exception 'FALHOU 5: update não foi desfeito (%)', v_n; end if;

  -- 6. member que criou: move 3 e exclui; teto some
  perform pg_temp.como_181(u_member);
  select public.excluir_categoria_movendo_lancamentos(v_ws, c_origem, c_destino) into v_ret;
  execute 'reset role';
  if v_ret <> 3 then raise exception 'FALHOU 6: retornou %', v_ret; end if;
  select count(*) into v_n from public.transactions where category_id = c_destino;
  if v_n <> 4 then raise exception 'FALHOU 6: destino com % lançamentos', v_n; end if;
  if exists (select 1 from public.categories where id = c_origem) then raise exception 'FALHOU 6: categoria não foi excluída'; end if;
  if exists (select 1 from public.category_budgets where category_id = c_origem) then raise exception 'FALHOU 6: teto sobrou'; end if;

  -- 7. owner move para categoria padrão do sistema
  if c_sistema is null then
    v_msg := 'sem categoria de sistema para o caso 7';
  else
    perform pg_temp.como_181(u_owner);
    select public.excluir_categoria_movendo_lancamentos(v_ws, c_do_owner, c_sistema) into v_ret;
    execute 'reset role';
    if v_ret <> 1 then raise exception 'FALHOU 7: retornou %', v_ret; end if;
    select count(*) into v_n from public.transactions where workspace_id = v_ws and category_id = c_sistema;
    if v_n <> 1 then raise exception 'FALHOU 7: lançamento não foi para a padrão'; end if;
    v_msg := 'caso 7 ok';
  end if;

  -- 9. padrão só de Empresa não serve de destino num espaço pessoal
  if c_sistema_pj is not null then
    insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Outra 181', 'expense', u_owner) returning id into c_do_owner;
    begin
      perform pg_temp.como_181(u_owner);
      perform public.excluir_categoria_movendo_lancamentos(v_ws, c_do_owner, c_sistema_pj);
      raise exception 'FALHOU 9: aceitou padrão de outro contexto';
    exception when others then
      if sqlerrm like 'FALHOU%' then raise; end if;
      if sqlerrm <> 'categoria_destino_invalida' then raise exception 'FALHOU 9: %', sqlerrm; end if;
    end;
    v_msg := v_msg || ', caso 9 ok';
  end if;

  -- 8. categoria inexistente
  begin
    perform pg_temp.como_181(u_owner);
    perform public.excluir_categoria_movendo_lancamentos(v_ws, c_origem, c_destino);
    raise exception 'FALHOU 8: aceitou categoria já excluída';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'categoria_nao_encontrada' then raise exception 'FALHOU 8: %', sqlerrm; end if;
  end;
  execute 'reset role';

  raise exception 'OK_ROLLBACK: casos passaram (%). Nada foi gravado.', v_msg;
end
$teste$;
