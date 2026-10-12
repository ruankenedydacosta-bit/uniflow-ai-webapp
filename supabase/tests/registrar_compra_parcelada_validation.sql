-- Validação da migration 068 (compra parcelada pela Uni, #221).
-- Roda com a migration já aplicada na mesma transação ou no banco. Tudo fica
-- dentro de um DO que termina em exceção: nenhum dado sobra, nem com commit
-- automático do cliente. Sucesso = a exceção final começa com 'OK_ROLLBACK'.
-- Uso: psql "$DB_URL" -f supabase/migrations/<068>.sql -f este arquivo
--      (ou cole os dois, nesta ordem, numa query só no SQL editor).

do $teste$
declare
  u_owner uuid := '11111111-1111-1111-1111-111111111221';
  u_viewer uuid := '33333333-3333-3333-3333-333333333221';
  v_ws uuid;
  v_outro_ws uuid;
  v_conta uuid;
  v_conta_arquivada uuid;
  v_conta_de_outro uuid;
  c_saida uuid;
  c_entrada uuid;
  v_op uuid := '44444444-4444-4444-8444-444444444221';
  v_op2 uuid := '55555555-5555-4555-8555-555555555221';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_primeira date;
  r record;
  v_n integer;
  v_soma numeric;
begin
  -- Simula a sessão do PostgREST: claims do JWT e papel authenticated.
  -- SET LOCAL volta sozinho quando o sub-bloco do caso aborta.
  create function pg_temp.como_221(p_user uuid) returns void language plpgsql as $como$
  begin
    perform set_config('request.jwt.claim.sub', p_user::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end $como$;

  -- Fixture (como superusuário).
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_owner, 'owner-221@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_viewer, 'viewer-221@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  select id into v_ws from public.workspaces where owner_user_id = u_owner and workspace_type = 'personal' limit 1;
  if v_ws is null then
    insert into public.workspaces (name, workspace_type, owner_user_id) values ('Pessoal 221', 'personal', u_owner) returning id into v_ws;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, status)
  select v_ws, u_owner, 'owner', 'active'
  where not exists (select 1 from public.workspace_members where workspace_id = v_ws and user_id = u_owner);
  insert into public.workspace_members (workspace_id, user_id, role, status) values (v_ws, u_viewer, 'viewer', 'active');
  update public.profiles set current_workspace_id = v_ws where id in (u_owner, u_viewer);
  get diagnostics v_n = row_count;
  if v_n <> 2 then raise exception 'FALHOU fixture: perfis não criados (%)', v_n; end if;

  insert into public.workspaces (name, workspace_type, owner_user_id) values ('Outro 221', 'business', u_viewer) returning id into v_outro_ws;

  insert into public.accounts (workspace_id, name, account_type, created_by) values (v_ws, 'Cartão 221', 'checking', u_owner) returning id into v_conta;
  insert into public.accounts (workspace_id, name, account_type, created_by, is_active) values (v_ws, 'Arquivada 221', 'checking', u_owner, false) returning id into v_conta_arquivada;
  insert into public.accounts (workspace_id, name, account_type, created_by) values (v_outro_ws, 'De outro 221', 'checking', u_viewer) returning id into v_conta_de_outro;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Eletrônicos 221', 'expense', u_owner) returning id into c_saida;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Salário 221', 'income', u_owner) returning id into c_entrada;

  -- 1. três parcelas a partir de 31 de janeiro de um ano no passado: datas
  -- contadas da primeira, centavos na última, status pela data.
  v_primeira := make_date(extract(year from v_hoje)::int - 1, 1, 31);
  begin
    perform pg_temp.como_221(u_owner);
    select * into r from public.registrar_compra_parcelada(v_op, v_conta, c_saida, '  TV da sala ', 1000, 3, v_primeira);
    execute 'reset role';
  end;
  if r.idempotent_replay or r.installments <> 3 or r.installment_group_id <> v_op then
    raise exception 'FALHOU 1: retorno %', r;
  end if;
  select count(*), sum(amount) into v_n, v_soma from public.transactions where metadata->>'installment_group_id' = v_op::text;
  if v_n <> 3 or v_soma <> 1000 then raise exception 'FALHOU 1: % parcelas somando %', v_n, v_soma; end if;
  if (select array_agg(amount order by installment_number) from public.transactions where metadata->>'installment_group_id' = v_op::text) <> array[333.33, 333.33, 333.34]::numeric[] then
    raise exception 'FALHOU 1: valores errados';
  end if;
  if (select array_agg(transaction_date order by installment_number) from public.transactions where metadata->>'installment_group_id' = v_op::text)
    <> array[v_primeira, (v_primeira + interval '1 month')::date, (v_primeira + interval '2 months')::date] then
    raise exception 'FALHOU 1: datas erradas';
  end if;
  -- Contada da primeira: a terceira volta ao dia 31, não fica no 28.
  if (select extract(day from transaction_date) from public.transactions where metadata->>'installment_group_id' = v_op::text and installment_number = 3) <> 31 then
    raise exception 'FALHOU 1: terceira parcela não voltou ao dia 31';
  end if;
  if exists (select 1 from public.transactions where metadata->>'installment_group_id' = v_op::text
    and (status <> 'completed' or description <> 'TV da sala' or installment_total <> 3 or account_id <> v_conta or created_by <> u_owner)) then
    raise exception 'FALHOU 1: campos errados';
  end if;
  if (select count(*) from public.transactions where client_operation_id = v_op) <> 1
    or (select installment_number from public.transactions where client_operation_id = v_op) <> 1 then
    raise exception 'FALHOU 1: chave de idempotência fora da primeira parcela';
  end if;

  -- 2. retry da mesma confirmação devolve o grupo, sem duplicar.
  begin
    perform pg_temp.como_221(u_owner);
    select * into r from public.registrar_compra_parcelada(v_op, v_conta, c_saida, 'TV da sala', 1000, 3, v_primeira);
    execute 'reset role';
  end;
  if not r.idempotent_replay then raise exception 'FALHOU 2: não reconheceu o retry'; end if;
  if (select count(*) from public.transactions where metadata->>'installment_group_id' = v_op::text) <> 3 then
    raise exception 'FALHOU 2: duplicou parcelas';
  end if;

  -- 3. mesma chave com outro conteúdo é conflito.
  begin
    perform pg_temp.como_221(u_owner);
    perform public.registrar_compra_parcelada(v_op, v_conta, c_saida, 'TV da sala', 1000, 4, v_primeira);
    raise exception 'FALHOU 3: aceitou outro número de parcelas na mesma chave';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'financial_action_idempotency_conflict' then raise exception 'FALHOU 3: %', sqlerrm; end if;
  end;

  -- 4. primeira hoje, sem conta: hoje realizada, as seguintes previstas.
  begin
    perform pg_temp.como_221(u_owner);
    select * into r from public.registrar_compra_parcelada(v_op2, null, c_saida, 'Geladeira', 2400, 12, v_hoje);
    execute 'reset role';
  end;
  if (select count(*) filter (where status = 'completed') from public.transactions where metadata->>'installment_group_id' = v_op2::text) <> 1
    or (select count(*) filter (where status = 'pending') from public.transactions where metadata->>'installment_group_id' = v_op2::text) <> 11
    or exists (select 1 from public.transactions where metadata->>'installment_group_id' = v_op2::text and account_id is not null) then
    raise exception 'FALHOU 4: status ou conta errados';
  end if;

  -- 5. recusas: cada uma não grava nada.
  for r in
    select * from (values
      ('viewer', 'financial_action_workspace_forbidden'),
      ('uma parcela', 'financial_action_installments_invalid'),
      ('361 parcelas', 'financial_action_installments_invalid'),
      ('menos de um centavo por parcela', 'financial_action_amount_invalid'),
      ('categoria de entrada', 'financial_action_category_invalid'),
      ('conta arquivada', 'financial_action_account_archived'),
      ('conta de outro espaço', 'financial_action_account_forbidden'),
      ('descrição curta', 'financial_action_description_invalid')
    ) as caso(nome, erro)
  loop
    begin
      perform pg_temp.como_221(case when r.nome = 'viewer' then u_viewer else u_owner end);
      perform public.registrar_compra_parcelada(
        gen_random_uuid(),
        case r.nome when 'conta arquivada' then v_conta_arquivada when 'conta de outro espaço' then v_conta_de_outro else v_conta end,
        case when r.nome = 'categoria de entrada' then c_entrada else c_saida end,
        case when r.nome = 'descrição curta' then ' x ' else 'Sofá' end,
        case when r.nome = 'menos de um centavo por parcela' then 0.05 else 900 end,
        case r.nome when 'uma parcela' then 1 when '361 parcelas' then 361 else 6 end,
        v_hoje
      );
      raise exception 'FALHOU 5 (%): aceitou', r.nome;
    exception when others then
      if sqlerrm like 'FALHOU%' then raise; end if;
      if sqlerrm <> r.erro then raise exception 'FALHOU 5 (%): %', r.nome, sqlerrm; end if;
    end;
  end loop;
  if exists (select 1 from public.transactions where description = 'Sofá' and workspace_id in (v_ws, v_outro_ws)) then
    raise exception 'FALHOU 5: recusa deixou parcela gravada';
  end if;

  -- 6. anon não executa.
  begin
    execute 'set local role anon';
    perform public.registrar_compra_parcelada(gen_random_uuid(), v_conta, c_saida, 'Sofá', 900, 6, v_hoje);
    raise exception 'FALHOU 6: anon executou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 6: %', sqlerrm; end if;
  end;

  raise exception 'OK_ROLLBACK: 6 casos passaram. Nada foi gravado.';
end
$teste$;
