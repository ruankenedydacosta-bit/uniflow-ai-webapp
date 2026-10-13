-- Validação da migration 071 (lançamento recorrente, #222).
-- Roda com a migration já aplicada na mesma transação ou no banco. Tudo fica
-- dentro de um DO que termina em exceção: nenhum dado sobra, nem com commit
-- automático do cliente. Sucesso = a exceção final começa com 'OK_ROLLBACK'.
-- Uso: psql "$DB_URL" -f supabase/migrations/<071>.sql -f este arquivo
--      (ou cole os dois, nesta ordem, numa query só no SQL editor).

do $teste$
declare
  u_owner uuid := '11111111-1111-1111-1111-111111111222';
  u_member uuid := '22222222-2222-2222-2222-222222222222';
  u_viewer uuid := '33333333-3333-3333-3333-333333333222';
  u_outro uuid := '66666666-6666-6666-6666-666666666222';
  v_ws uuid;
  v_ws_outro uuid;
  v_conta uuid;
  c_saida uuid;
  c_saida_outro uuid;
  c_entrada uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_serie uuid;
  v_serie2 uuid;
  v_alvo uuid;
  v_alvo_data date;
  r record;
  v_n integer;
  v_datas date[];
begin
  create function pg_temp.como_222(p_user uuid) returns void language plpgsql as $como$
  begin
    perform set_config('request.jwt.claim.sub', p_user::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end $como$;

  -- Fixture (como superusuário).
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_owner, 'owner-222@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_member, 'member-222@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_viewer, 'viewer-222@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_outro, 'outro-222@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  select id into v_ws from public.workspaces where owner_user_id = u_owner and workspace_type = 'personal' limit 1;
  if v_ws is null then
    insert into public.workspaces (name, workspace_type, owner_user_id) values ('Pessoal 222', 'personal', u_owner) returning id into v_ws;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, status)
  select v_ws, u_owner, 'owner', 'active'
  where not exists (select 1 from public.workspace_members where workspace_id = v_ws and user_id = u_owner);
  insert into public.workspace_members (workspace_id, user_id, role, status) values
    (v_ws, u_member, 'member', 'active'),
    (v_ws, u_viewer, 'viewer', 'active');

  select id into v_ws_outro from public.workspaces where owner_user_id = u_outro and workspace_type = 'personal' limit 1;
  if v_ws_outro is null then
    insert into public.workspaces (name, workspace_type, owner_user_id) values ('Outro 222', 'personal', u_outro) returning id into v_ws_outro;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, status)
  select v_ws_outro, u_outro, 'owner', 'active'
  where not exists (select 1 from public.workspace_members where workspace_id = v_ws_outro and user_id = u_outro);

  update public.profiles set current_workspace_id = v_ws where id in (u_owner, u_member, u_viewer);
  update public.profiles set current_workspace_id = v_ws_outro where id = u_outro;

  insert into public.accounts (workspace_id, name, account_type, created_by) values (v_ws, 'Conta 222', 'checking', u_owner) returning id into v_conta;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Moradia 222', 'expense', u_owner) returning id into c_saida;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws, 'Salário 222', 'income', u_owner) returning id into c_entrada;
  insert into public.categories (workspace_id, name, category_type, created_by) values (v_ws_outro, 'Casa 222', 'expense', u_outro) returning id into c_saida_outro;

  -- 1. mensal a partir de hoje: hoje realizada e 3 meses previstos.
  begin
    perform pg_temp.como_222(u_member);
    select * into r from public.criar_serie_recorrente(
      v_ws, '77777777-7777-4777-8777-777777777222', 'expense', v_conta, c_saida, ' Aluguel ', 1500, 'monthly', 1, v_hoje, null, false
    );
    execute 'reset role';
  end;
  v_serie := r.series_id;
  if r.idempotent_replay or r.occurrences <> 4 or r.pending_occurrences <> 3 then raise exception 'FALHOU 1: retorno %', r; end if;
  if exists (select 1 from public.transactions where recurring_series_id = v_serie
    and (description <> 'Aluguel' or amount <> 1500 or not is_recurring or recurrence_rule->>'frequency' <> 'monthly'
      or created_by <> u_member or metadata ? 'auto_confirm' or metadata->>'recurring_series_id' <> v_serie::text)) then
    raise exception 'FALHOU 1: campos errados';
  end if;
  if (select status from public.transactions where id = r.first_transaction_id) <> 'completed'
    or (select transaction_date from public.transactions where id = r.first_transaction_id) <> v_hoje then
    raise exception 'FALHOU 1: primeira ocorrência';
  end if;

  -- 2. retry da mesma confirmação não duplica.
  begin
    perform pg_temp.como_222(u_member);
    select * into r from public.criar_serie_recorrente(
      v_ws, '77777777-7777-4777-8777-777777777222', 'expense', v_conta, c_saida, 'Aluguel', 1500, 'monthly', 1, v_hoje, null, false
    );
    execute 'reset role';
  end;
  if not r.idempotent_replay or r.series_id <> v_serie or r.occurrences <> 4 then raise exception 'FALHOU 2: %', r; end if;
  begin
    perform pg_temp.como_222(u_member);
    perform public.criar_serie_recorrente(
      v_ws, '77777777-7777-4777-8777-777777777222', 'expense', v_conta, c_saida, 'Aluguel', 1700, 'monthly', 1, v_hoje, null, false
    );
    raise exception 'FALHOU 2: mesma chave com outro valor devolveu a série antiga';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'financial_action_idempotency_conflict' then raise exception 'FALHOU 2b: %', sqlerrm; end if;
  end;
  -- Sem categoria, como o formulário permite; e o espaço vem do parâmetro,
  -- não do perfil (o do u_outro aponta para o espaço dele).
  update public.profiles set current_workspace_id = v_ws_outro where id = u_owner;
  begin
    perform pg_temp.como_222(u_owner);
    select * into r from public.criar_serie_recorrente(v_ws, null, 'expense', null, null, 'Diarista', 200, 'weekly', 1, v_hoje, null, false);
    execute 'reset role';
  end;
  update public.profiles set current_workspace_id = v_ws where id = u_owner;
  if (select workspace_id from public.recurring_series where id = r.series_id) <> v_ws
    or exists (select 1 from public.transactions where recurring_series_id = r.series_id and (category_id is not null or workspace_id <> v_ws)) then
    raise exception 'FALHOU 2c: série sem categoria ou espaço errado';
  end if;
  begin
    perform pg_temp.como_222(u_owner);
    perform public.criar_serie_recorrente(v_ws_outro, null, 'expense', null, null, 'Invasão', 200, 'weekly', 1, v_hoje, null, false);
    raise exception 'FALHOU 2d: criou em espaço alheio';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'financial_action_workspace_forbidden' then raise exception 'FALHOU 2d: %', sqlerrm; end if;
  end;

  -- 3. job em dia não gera nada; janela adiante gera mais 3.
  if public.estender_series_recorrentes() <> 0 then raise exception 'FALHOU 3: job gerou com a janela em dia'; end if;
  if public.gerar_ocorrencias_da_serie(v_serie, (v_hoje + interval '6 months')::date) <> 3 then raise exception 'FALHOU 3: janela adiante'; end if;

  -- 4. contada da primeira: 31/01 mensal passa por 28 ou 29/02 e volta a 31/03.
  begin
    perform pg_temp.como_222(u_owner);
    select * into r from public.criar_serie_recorrente(
      v_ws, null, 'income', null, c_entrada, 'Salário', 5000, 'monthly', 1, make_date(extract(year from v_hoje)::int - 1, 1, 31), make_date(extract(year from v_hoje)::int - 1, 3, 31), true
    );
    execute 'reset role';
  end;
  select array_agg(transaction_date order by transaction_date) into v_datas from public.transactions where recurring_series_id = r.series_id;
  if array_length(v_datas, 1) <> 3 or extract(day from v_datas[2]) not in (28, 29) or extract(day from v_datas[3]) <> 31 then
    raise exception 'FALHOU 4: datas %', v_datas;
  end if;
  if (select ended_at from public.recurring_series where id = r.series_id) is null then raise exception 'FALHOU 4: série com fim não encerrou'; end if;
  -- Ocorrências passadas nascem realizadas, sem auto_confirm.
  if exists (select 1 from public.transactions where recurring_series_id = r.series_id and (status <> 'completed' or metadata ? 'auto_confirm')) then
    raise exception 'FALHOU 4: status das passadas';
  end if;

  -- 5. semanal com confirmação automática: as previstas levam auto_confirm.
  begin
    perform pg_temp.como_222(u_owner);
    select * into r from public.criar_serie_recorrente(
      v_ws, null, 'expense', null, c_saida, 'Feira', 80, 'weekly', 2, v_hoje, (v_hoje + 28), true
    );
    execute 'reset role';
  end;
  v_serie2 := r.series_id;
  if r.occurrences <> 3 then raise exception 'FALHOU 5: % ocorrências', r.occurrences; end if;
  if exists (select 1 from public.transactions where recurring_series_id = v_serie2 and status = 'pending' and not coalesce((metadata->>'auto_confirm')::boolean, false)) then
    raise exception 'FALHOU 5: prevista sem auto_confirm';
  end if;

  -- 6. alterar "esta e as próximas" a partir da 2ª: a 1ª fica, a série muda.
  select id, transaction_date into v_alvo, v_alvo_data from public.transactions where recurring_series_id = v_serie order by transaction_date offset 1 limit 1;
  begin
    perform pg_temp.como_222(u_member);
    v_n := public.alterar_lancamentos_da_serie(v_alvo, 'forward', v_conta, c_saida, 'Aluguel novo', 1600, true);
    execute 'reset role';
  end;
  if v_n <> 6 then raise exception 'FALHOU 6: alterou %', v_n; end if;
  if (select amount from public.transactions where recurring_series_id = v_serie order by transaction_date limit 1) <> 1500 then
    raise exception 'FALHOU 6: mexeu na anterior';
  end if;
  if (select amount <> 1600 or not auto_confirm from public.recurring_series where id = v_serie) then raise exception 'FALHOU 6: série não mudou'; end if;
  if exists (select 1 from public.transactions where recurring_series_id = v_serie and transaction_date >= v_alvo_data
    and status = 'pending' and not coalesce((metadata->>'auto_confirm')::boolean, false)) then
    raise exception 'FALHOU 6: auto_confirm não chegou aos previstos';
  end if;
  -- Sem p_auto_confirm, a opção da série não muda.
  begin
    perform pg_temp.como_222(u_member);
    perform public.alterar_lancamentos_da_serie(v_alvo, 'forward', v_conta, c_saida, 'Aluguel novo', 1600, null);
    execute 'reset role';
  end;
  if not (select auto_confirm from public.recurring_series where id = v_serie) then raise exception 'FALHOU 6: nulo desligou a confirmação automática'; end if;
  if exists (select 1 from public.transactions where recurring_series_id = v_serie and metadata->>'recurring_series_id' <> v_serie::text) then
    raise exception 'FALHOU 6: metadata perdeu a série';
  end if;
  perform public.gerar_ocorrencias_da_serie(v_serie, (v_hoje + interval '7 months')::date);
  if (select amount from public.transactions where recurring_series_id = v_serie order by transaction_date desc limit 1) <> 1600 then
    raise exception 'FALHOU 6: ocorrência nova veio com o valor antigo';
  end if;

  -- 7. alterar "todas" com categoria de outro tipo é recusado.
  begin
    perform pg_temp.como_222(u_member);
    perform public.alterar_lancamentos_da_serie(v_alvo, 'all', v_conta, c_entrada, 'Aluguel', 1600, false);
    raise exception 'FALHOU 7: aceitou categoria de entrada';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'financial_action_category_invalid' then raise exception 'FALHOU 7: %', sqlerrm; end if;
  end;

  -- 8. viewer não exclui; member que não criou a série 2 também não.
  begin
    perform pg_temp.como_222(u_viewer);
    perform public.excluir_lancamentos_da_serie(v_alvo, 'all');
    raise exception 'FALHOU 8: viewer excluiu';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'recurring_series_not_found' then raise exception 'FALHOU 8: %', sqlerrm; end if;
  end;
  begin
    perform pg_temp.como_222(u_member);
    perform public.excluir_lancamentos_da_serie((select id from public.transactions where recurring_series_id = v_serie2 limit 1), 'all');
    raise exception 'FALHOU 8: member excluiu série de outra pessoa';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'financial_action_workspace_forbidden' then raise exception 'FALHOU 8b: %', sqlerrm; end if;
  end;

  -- 9. excluir "esta e as próximas" a partir da 3ª: ficam 2, série encerrada.
  select id, transaction_date into v_alvo, v_alvo_data from public.transactions where recurring_series_id = v_serie order by transaction_date offset 2 limit 1;
  begin
    perform pg_temp.como_222(u_member);
    v_n := public.excluir_lancamentos_da_serie(v_alvo, 'forward');
    execute 'reset role';
  end;
  if (select count(*) from public.transactions where recurring_series_id = v_serie) <> 2 then raise exception 'FALHOU 9: sobraram %', (select count(*) from public.transactions where recurring_series_id = v_serie); end if;
  if (select ended_at is null or end_date <> v_alvo_data - 1 from public.recurring_series where id = v_serie) then raise exception 'FALHOU 9: série não encerrou'; end if;
  if public.gerar_ocorrencias_da_serie(v_serie, (v_hoje + interval '12 months')::date) <> 0 then raise exception 'FALHOU 9: série encerrada gerou'; end if;

  -- 10. owner exclui todas da série 2.
  begin
    perform pg_temp.como_222(u_owner);
    v_n := public.excluir_lancamentos_da_serie((select id from public.transactions where recurring_series_id = v_serie2 limit 1), 'all');
    execute 'reset role';
  end;
  if v_n <> 3 or exists (select 1 from public.transactions where recurring_series_id = v_serie2) then raise exception 'FALHOU 10'; end if;

  -- 11. outro espaço: não liga lançamento à série alheia, e uma ligação
  -- forjada não abre caminho para excluir as ocorrências da série.
  begin
    perform pg_temp.como_222(u_outro);
    insert into public.transactions (workspace_id, category_id, transaction_type, description, amount, transaction_date, source_type, created_by, recurring_series_id)
    values (v_ws_outro, c_saida_outro, 'expense', 'Forjado', 10, v_hoje, 'manual', u_outro, v_serie);
    raise exception 'FALHOU 11: ligou lançamento à série de outro espaço';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 11: %', sqlerrm; end if;
  end;
  insert into public.transactions (workspace_id, category_id, transaction_type, description, amount, transaction_date, source_type, created_by, recurring_series_id)
  values (v_ws_outro, c_saida_outro, 'expense', 'Forjado', 10, v_hoje, 'manual', u_outro, v_serie)
  returning id into v_alvo;
  begin
    perform pg_temp.como_222(u_outro);
    perform public.excluir_lancamentos_da_serie(v_alvo, 'all');
    raise exception 'FALHOU 11: excluiu pela ligação forjada';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'recurring_series_not_found' then raise exception 'FALHOU 11b: %', sqlerrm; end if;
  end;
  if (select count(*) from public.transactions where recurring_series_id = v_serie and workspace_id = v_ws) <> 2 then raise exception 'FALHOU 11: série alheia perdeu ocorrências'; end if;
  -- update direto também não muda a ligação.
  begin
    perform pg_temp.como_222(u_member);
    update public.transactions set recurring_series_id = null where recurring_series_id = v_serie;
    raise exception 'FALHOU 11: update direto desligou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 11c: %', sqlerrm; end if;
  end;

  -- 12. recusas na criação.
  for r in
    select * from (values
      ('viewer', 'financial_action_workspace_forbidden'),
      ('intervalo zero', 'recurring_series_rule_invalid'),
      ('fim antes do início', 'recurring_series_rule_invalid'),
      ('categoria de entrada', 'financial_action_category_invalid'),
      ('categoria de outro espaço', 'financial_action_category_invalid'),
      ('diária desde muito antes', 'recurring_series_too_many')
    ) as caso(nome, erro)
  loop
    begin
      perform pg_temp.como_222(case when r.nome = 'viewer' then u_viewer else u_owner end);
      perform public.criar_serie_recorrente(
        v_ws, null, 'expense', null,
        case r.nome when 'categoria de entrada' then c_entrada when 'categoria de outro espaço' then c_saida_outro else c_saida end,
        'Academia', 120,
        case when r.nome = 'diária desde muito antes' then 'daily' else 'monthly' end,
        case when r.nome = 'intervalo zero' then 0 else 1 end,
        case when r.nome = 'diária desde muito antes' then v_hoje - 1000 else v_hoje end,
        case when r.nome = 'fim antes do início' then v_hoje - 1 else null end,
        false
      );
      raise exception 'FALHOU 12 (%): aceitou', r.nome;
    exception when others then
      if sqlerrm like 'FALHOU%' then raise; end if;
      if sqlerrm <> r.erro then raise exception 'FALHOU 12 (%): %', r.nome, sqlerrm; end if;
    end;
  end loop;
  if exists (select 1 from public.recurring_series where description = 'Academia') then raise exception 'FALHOU 12: recusa deixou série'; end if;

  -- 13. anon não executa; authenticated não chama a geração direto.
  begin
    execute 'set local role anon';
    perform public.criar_serie_recorrente(v_ws, null, 'expense', null, c_saida, 'Academia', 120, 'monthly', 1, v_hoje, null, false);
    raise exception 'FALHOU 13: anon executou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 13: %', sqlerrm; end if;
  end;
  begin
    perform pg_temp.como_222(u_owner);
    perform public.gerar_ocorrencias_da_serie(v_serie, v_hoje + 400);
    raise exception 'FALHOU 13: authenticated gerou direto';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU 13b: %', sqlerrm; end if;
  end;

  raise exception 'OK_ROLLBACK: 13 casos passaram. Nada foi gravado.';
end
$teste$;
