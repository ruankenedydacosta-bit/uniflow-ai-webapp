-- Validação da migration 068 (saldo do banco e proteção do Open Finance).
-- Roda com a migration já aplicada na mesma transação ou no banco. Tudo fica
-- dentro de um DO que termina em exceção: nenhum dado sobra, nem com commit
-- automático do cliente. Sucesso = a exceção final começa com 'OK_ROLLBACK'.
-- Uso: psql "$DB_URL" -f supabase/migrations/<068>.sql -f este arquivo
--      (ou cole os dois, nesta ordem, numa query só no SQL editor).

do $teste$
declare
  u_owner uuid := '11111111-1111-1111-1111-111111111068';
  u_member uuid := '22222222-2222-2222-2222-222222222068';
  v_ws uuid;
  v_consent uuid;
  a_manual uuid;
  a_banco uuid;
  a_cartao uuid;
  a_sem_saldo uuid;
  t_banco uuid;
  t_manual uuid;
  c_cat uuid;
  v_saldo numeric;
  v_n integer;
begin
  -- Simula a sessão do PostgREST: claims do JWT e papel authenticated.
  create function pg_temp.como_068(p_user uuid) returns void language plpgsql as $como$
  begin
    perform set_config('request.jwt.claim.sub', p_user::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end $como$;

  -- Fixture (como superusuário, no papel do backend).
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_owner, 'owner-068@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_member, 'member-068@exemplo.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  select id into v_ws from public.workspaces where owner_user_id = u_owner and workspace_type = 'personal' limit 1;
  if v_ws is null then
    insert into public.workspaces (name, workspace_type, owner_user_id) values ('Pessoal 068', 'personal', u_owner) returning id into v_ws;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, status)
  select v_ws, u_owner, 'owner', 'active'
  where not exists (select 1 from public.workspace_members where workspace_id = v_ws and user_id = u_owner);
  insert into public.workspace_members (workspace_id, user_id, role, status) values (v_ws, u_member, 'member', 'active');
  insert into public.profiles (id, current_workspace_id) values (u_owner, v_ws), (u_member, v_ws)
  on conflict (id) do update set current_workspace_id = excluded.current_workspace_id;

  insert into public.open_finance_consents (workspace_id, user_id, provider, purpose, purpose_version, scopes, scopes_version, terms_version, privacy_policy_version)
  values (v_ws, u_owner, 'teste', 'Organizar finanças', 'v1', array['accounts'], 'v1', 'v1', 'v1')
  returning id into v_consent;

  insert into public.accounts (workspace_id, name, account_type, initial_balance, created_by)
  values (v_ws, 'Alfa 068', 'checking', 50, u_owner) returning id into a_manual;
  insert into public.accounts (workspace_id, name, account_type, initial_balance, current_balance, source_type, external_provider, external_account_id, created_by)
  values (v_ws, 'Beta 068', 'checking', 0, 1234.56, 'open_finance', 'teste', 'conta-1', u_owner) returning id into a_banco;
  update public.accounts set last_synced_at = now() where id = a_banco;
  insert into public.accounts (workspace_id, name, account_type, initial_balance, current_balance, source_type, external_provider, external_account_id, created_by)
  values (v_ws, 'Gama 068', 'credit_card', 0, -999, 'open_finance', 'teste', 'cartao-1', u_owner) returning id into a_cartao;
  update public.accounts set last_synced_at = now() where id = a_cartao;
  -- Conta do banco que ainda não recebeu o primeiro saldo.
  insert into public.accounts (workspace_id, name, account_type, initial_balance, source_type, external_provider, external_account_id, created_by)
  values (v_ws, 'Delta 068', 'savings', 0, 'open_finance', 'teste', 'conta-2', u_owner) returning id into a_sem_saldo;
  insert into public.external_accounts (workspace_id, consent_id, normalized_account_id, provider, provider_account_id, display_name, account_type)
  values (v_ws, v_consent, a_banco, 'teste', 'conta-1', 'Beta 068', 'checking');

  insert into public.categories (workspace_id, name, category_type, created_by)
  values (v_ws, 'Mercado 068', 'expense', u_owner) returning id into c_cat;

  insert into public.transactions (workspace_id, account_id, transaction_type, description, amount, transaction_date, source_type, external_provider, external_transaction_id, external_account_id, created_by)
  values (v_ws, a_banco, 'expense', 'Compra no banco', 100, current_date, 'open_finance', 'teste', 'tx-1', 'conta-1', u_owner)
  returning id into t_banco;
  insert into public.transactions (workspace_id, account_id, transaction_type, description, amount, transaction_date, source_type, external_provider, external_transaction_id, external_account_id, created_by)
  values (v_ws, a_cartao, 'expense', 'Compra no cartão', 30, current_date, 'open_finance', 'teste', 'tx-2', 'cartao-1', u_owner);
  insert into public.transactions (workspace_id, account_id, transaction_type, description, amount, transaction_date, source_type, external_provider, external_transaction_id, external_account_id, created_by)
  values (v_ws, a_sem_saldo, 'income', 'Rendimento', 5, current_date, 'open_finance', 'teste', 'tx-3', 'conta-2', u_owner);
  insert into public.transactions (workspace_id, account_id, transaction_type, description, amount, transaction_date, created_by)
  values (v_ws, a_manual, 'income', 'Entrada manual', 10, current_date, u_owner)
  returning id into t_manual;

  -- 1. Saldo: conta do banco sincronizada usa current_balance (cartão
  --    incluído); manual e conta ainda sem saldo seguem derivadas.
  perform pg_temp.como_068(u_member);
  select derived_balance into v_saldo from public.get_derived_account_balances() where account_id = a_banco;
  if v_saldo is distinct from 1234.56 then raise exception 'FALHOU 1a: saldo do banco = %', v_saldo; end if;
  select derived_balance into v_saldo from public.get_derived_account_balances() where account_id = a_manual;
  if v_saldo is distinct from 60 then raise exception 'FALHOU 1b: saldo manual = %', v_saldo; end if;
  select derived_balance into v_saldo from public.get_derived_account_balances() where account_id = a_cartao;
  if v_saldo is distinct from -999 then raise exception 'FALHOU 1c: saldo do cartão = %', v_saldo; end if;
  select derived_balance into v_saldo from public.get_derived_account_balances() where account_id = a_sem_saldo;
  if v_saldo is distinct from 5 then raise exception 'FALHOU 1d: saldo sem sincronizar = %', v_saldo; end if;
  select derived_balance into v_saldo from public.get_derived_workspace_balance();
  if v_saldo is distinct from 300.56 then raise exception 'FALHOU 1e: saldo do espaço = %', v_saldo; end if;
  execute 'reset role';

  -- 2. App não renomeia nem muda saldo de conta do banco.
  begin
    perform pg_temp.como_068(u_member);
    update public.accounts set name = 'Renomeada' where id = a_banco;
    raise exception 'FALHOU 2a: renomeou conta do banco';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'conta_do_open_finance_protegida' then raise exception 'FALHOU 2a: %', sqlerrm; end if;
  end;
  begin
    perform pg_temp.como_068(u_member);
    update public.accounts set current_balance = 1 where id = a_banco;
    raise exception 'FALHOU 2b: mudou saldo da conta do banco';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'conta_do_open_finance_protegida' then raise exception 'FALHOU 2b: %', sqlerrm; end if;
  end;

  -- 3. Metadata da conta do banco segue editável.
  perform pg_temp.como_068(u_member);
  update public.accounts set metadata = '{"cor": "verde"}'::jsonb where id = a_banco;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FALHOU 3: metadata não gravou'; end if;

  -- 4. Owner não exclui conta do banco.
  begin
    perform pg_temp.como_068(u_owner);
    delete from public.accounts where id = a_cartao;
    raise exception 'FALHOU 4: excluiu conta do banco';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'conta_do_open_finance_protegida' then raise exception 'FALHOU 4: %', sqlerrm; end if;
  end;

  -- 5. Recategorizar e anotar lançamento do banco: liberado.
  perform pg_temp.como_068(u_member);
  update public.transactions set category_id = c_cat, notes = 'feira', competence_date = current_date - 1 where id = t_banco;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FALHOU 5: recategorizar não gravou'; end if;

  -- 6. Valor, data e descrição do lançamento do banco: travados.
  begin
    perform pg_temp.como_068(u_member);
    update public.transactions set amount = 1 where id = t_banco;
    raise exception 'FALHOU 6a: mudou valor';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'lancamento_do_open_finance_protegido' then raise exception 'FALHOU 6a: %', sqlerrm; end if;
  end;
  begin
    perform pg_temp.como_068(u_member);
    update public.transactions set transaction_date = current_date - 10, description = 'outra' where id = t_banco;
    raise exception 'FALHOU 6b: mudou data e descrição';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'lancamento_do_open_finance_protegido' then raise exception 'FALHOU 6b: %', sqlerrm; end if;
  end;

  -- 7. Owner não exclui lançamento do banco.
  begin
    perform pg_temp.como_068(u_owner);
    delete from public.transactions where id = t_banco;
    raise exception 'FALHOU 7: excluiu lançamento do banco';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'lancamento_do_open_finance_protegido' then raise exception 'FALHOU 7: %', sqlerrm; end if;
  end;

  -- 8. Lançamento e conta manuais seguem como antes.
  perform pg_temp.como_068(u_member);
  update public.transactions set amount = 15, description = 'Entrada corrigida' where id = t_manual;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FALHOU 8a: manual não editou'; end if;
  update public.accounts set name = 'Alfa renomeada' where id = a_manual;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FALHOU 8b: conta manual não editou'; end if;

  -- 9. Backend (JWT service_role) atualiza o que vem do banco.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  update public.transactions set amount = 101, status = 'completed' where id = t_banco;
  update public.accounts set current_balance = 2000, name = 'Beta renomeada' where id = a_banco;
  execute 'reset role';
  select amount into v_saldo from public.transactions where id = t_banco;
  if v_saldo <> 101 then raise exception 'FALHOU 9: backend não atualizou'; end if;

  -- 10. A coluna de payload saiu de transactions.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'raw_provider_data'
  ) then
    raise exception 'FALHOU 10: raw_provider_data ainda existe';
  end if;

  -- 12. RPC security definer chamada pelo app: roda como postgres, mas o JWT
  --     é do app. Não reativa conta do banco.
  perform pg_temp.como_068(u_member);
  execute 'reset role';
  begin
    update public.accounts set is_active = false where id = a_banco;
    raise exception 'FALHOU 12: caminho definer alterou conta do banco';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'conta_do_open_finance_protegida' then raise exception 'FALHOU 12: %', sqlerrm; end if;
  end;

  -- 13. Ajuste de saldo em conta do banco: recusado por qualquer caminho.
  begin
    insert into public.transactions (workspace_id, account_id, transaction_type, description, amount, adjustment_delta, transaction_date, created_by)
    values (v_ws, a_banco, 'adjustment', 'Ajuste', 10, 10, current_date, u_owner);
    raise exception 'FALHOU 13: aceitou ajuste em conta do banco';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'conta_do_open_finance_protegida' then raise exception 'FALHOU 13: %', sqlerrm; end if;
  end;

  -- 14. App não liga auto_confirm em lançamento do banco.
  begin
    perform pg_temp.como_068(u_member);
    update public.transactions set metadata = metadata || '{"auto_confirm": true}'::jsonb where id = t_banco;
    raise exception 'FALHOU 14: ligou auto_confirm';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'lancamento_do_open_finance_protegido' then raise exception 'FALHOU 14: %', sqlerrm; end if;
  end;

  -- 11. Excluir o espaço apaga em cascata o que veio do banco.
  perform pg_temp.como_068(u_owner);
  delete from public.workspaces where id = v_ws;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FALHOU 11: espaço não foi excluído (%)', v_n; end if;
  if exists (select 1 from public.accounts where id = a_banco) then raise exception 'FALHOU 11: conta do banco sobrou'; end if;

  raise exception 'OK_ROLLBACK: 14 casos passaram. Nada foi gravado.';
end
$teste$;
